import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCatalog } from '../lib/questionBank.js';
import { subscribeMockLocks } from '../lib/repository.js';
import Tests from './Tests.jsx';

vi.mock('../lib/questionBank.js', () => ({
  loadCatalog: vi.fn(),
}));

vi.mock('../lib/repository.js', () => ({
  subscribeMockLocks: vi.fn(),
}));

let callbacks;

function catalogWith(tests) {
  return { tests };
}

function findLink(href) {
  return [...document.querySelectorAll('a')].find((node) => node.getAttribute('href') === href);
}

function renderTests() {
  return render(
    <MemoryRouter>
      <Tests />
    </MemoryRouter>,
  );
}

describe('Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callbacks = {};
    vi.mocked(subscribeMockLocks).mockImplementation((onData, onError) => {
      callbacks.onData = onData;
      callbacks.onError = onError;
      return () => {};
    });
    vi.mocked(loadCatalog).mockResolvedValue(catalogWith([
      { title: 'Mock Alpha', type: 'Mock', subjectScope: 'Mixed' },
      { title: 'Grand Final', isGrand: true },
    ]));
  });

  it('opens a mock whose unlock time has passed', async () => {
    renderTests();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mock Tests' })).toBeTruthy());

    act(() => callbacks.onData({
      'Mock Alpha': { locked: true, unlockAt: new Date(Date.now() - 60_000) },
    }));

    await waitFor(() => expect(findLink('/app/test/mock/Mock%20Alpha')).toBeTruthy());
    expect(screen.queryByText('Ask your admin to unlock this test.')).toBeNull();
  });

  it('keeps a mock locked when its unlock time is in the future', async () => {
    renderTests();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mock Tests' })).toBeTruthy());

    act(() => callbacks.onData({
      'Mock Alpha': { locked: true, unlockAt: new Date(Date.now() + 60_000) },
    }));

    expect(findLink('/app/test/mock/Mock%20Alpha')).toBeUndefined();
    expect(screen.getByText('Ask your admin to unlock this test.')).toBeTruthy();
  });

  it('opens mocks when the subscription delivers no lock data', async () => {
    renderTests();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mock Tests' })).toBeTruthy());

    act(() => callbacks.onData(undefined));

    await waitFor(() => expect(findLink('/app/test/mock/Mock%20Alpha')).toBeTruthy());
  });

  it('fails closed when the lock subscription reports an error', async () => {
    renderTests();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mock Tests' })).toBeTruthy());

    act(() => callbacks.onError());

    expect(screen.getByText(/Mock test locks could not be loaded/)).toBeTruthy();
    expect(findLink('/app/test/mock/Mock%20Alpha')).toBeUndefined();
    expect(findLink('/app/test/grand/Grand%20Final')).toBeTruthy();
  });

  it('always opens grand tests even with a lock subscription error', async () => {
    renderTests();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Grand Tests' })).toBeTruthy());

    act(() => callbacks.onError());

    expect(findLink('/app/test/grand/Grand%20Final')).toBeTruthy();
    expect(screen.getByText('Start test →')).toBeTruthy();
  });

  it('links to the daily challenge', async () => {
    renderTests();
    await waitFor(() => expect(screen.getByText('Daily Challenge')).toBeTruthy());

    expect(findLink('/app/test/daily/today')).toBeTruthy();
  });

  it('retries after a catalog error', async () => {
    const user = userEvent.setup();
    vi.mocked(loadCatalog)
      .mockRejectedValueOnce(new Error('catalog down'))
      .mockResolvedValueOnce(catalogWith([{ title: 'Grand Final', isGrand: true }]));
    renderTests();

    await waitFor(() => expect(screen.getByText('catalog down')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Grand Tests' })).toBeTruthy());
    expect(loadCatalog).toHaveBeenCalledTimes(2);
  });
});
