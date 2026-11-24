import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listResources, subscribeAnnouncements } from '../lib/repository.js';
import Resources from './Resources.jsx';

vi.mock('../lib/repository.js', () => ({
  listResources: vi.fn(),
  subscribeAnnouncements: vi.fn(),
}));

let callbacks;

function page(rows, cursor = null, hasMore = false) {
  return { rows, cursor, hasMore };
}

function renderResources() {
  return render(
    <MemoryRouter>
      <Resources />
    </MemoryRouter>,
  );
}

describe('Resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callbacks = {};
    vi.mocked(listResources).mockResolvedValue(page([]));
    vi.mocked(subscribeAnnouncements).mockImplementation((onData, onError) => {
      callbacks.onData = onData;
      callbacks.onError = onError;
      return () => {};
    });
  });

  it('turns a relative resource link into an absolute link', async () => {
    vi.mocked(listResources).mockResolvedValue(page([
      { id: 'r1', title: 'Notes', link: '/notes/unit-1' },
    ]));
    renderResources();

    await waitFor(() => expect(screen.getByText('Notes')).toBeTruthy());
    const expected = new URL('/notes/unit-1', window.location.href).href;
    const link = [...document.querySelectorAll('a')].find((node) => node.textContent.includes('Open'));
    expect(link.getAttribute('href')).toBe(expected);
  });

  it('rejects a javascript: resource link', async () => {
    vi.mocked(listResources).mockResolvedValue(page([
      { id: 'r2', title: 'Unsafe', link: 'javascript:alert(1)' },
    ]));
    renderResources();

    await waitFor(() => expect(screen.getByText('Unsafe')).toBeTruthy());
    expect(screen.getByText('Link unavailable')).toBeTruthy();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('clears an announcement error when later data arrives', async () => {
    renderResources();

    act(() => callbacks.onError());
    expect(screen.getByText('Announcements are unavailable right now.')).toBeTruthy();

    act(() => callbacks.onData([{ id: 'a1', title: 'Exam date announced' }]));
    expect(screen.getByText('Exam date announced')).toBeTruthy();
    expect(screen.queryByText('Announcements are unavailable right now.')).toBeNull();
  });

  it('appends rows when loading more', async () => {
    const user = userEvent.setup();
    vi.mocked(listResources)
      .mockResolvedValueOnce(page([{ id: 'r1', title: 'First link', link: '/one' }], 'next', true))
      .mockResolvedValueOnce(page([{ id: 'r2', title: 'Second link', link: '/two' }]));
    renderResources();

    await waitFor(() => expect(screen.getByText('First link')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(screen.getByText('Second link')).toBeTruthy());
    expect(screen.getByText('First link')).toBeTruthy();
    expect(listResources).toHaveBeenCalledTimes(2);
    expect(listResources).toHaveBeenCalledWith({ cursor: 'next' });
    expect(screen.getByText('You’ve reached the end of the list.')).toBeTruthy();
  });

  it('retries after a resource load error', async () => {
    const user = userEvent.setup();
    vi.mocked(listResources)
      .mockRejectedValueOnce(new Error('resources down'))
      .mockResolvedValueOnce(page([{ id: 'r3', title: 'Recovered link', link: '/recovered' }]));
    renderResources();

    await waitFor(() => expect(screen.getByText('resources down')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText('Recovered link')).toBeTruthy());
    expect(listResources).toHaveBeenCalledTimes(2);
  });
});
