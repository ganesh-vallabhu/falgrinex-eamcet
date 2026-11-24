import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthProvider.jsx';
import { todayKey } from '../config/constants.js';
import { getAutoDailyChallenge } from '../lib/questionBank.js';
import { getDailyChallenge, subscribeAnnouncements } from '../lib/repository.js';
import Dashboard from './Dashboard.jsx';

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../lib/repository.js', () => ({
  getDailyChallenge: vi.fn(),
  subscribeAnnouncements: vi.fn(),
}));

vi.mock('../lib/questionBank.js', () => ({
  getAutoDailyChallenge: vi.fn(),
}));

let callbacks;
let profile;

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callbacks = {};
    profile = {
      id: 'profile-1',
      name: 'Arya',
      totalScore: 12345,
      testsTaken: 4,
      accuracySum: 360,
      streak: 7,
      weakTopics: ['Algebra', 'Optics'],
      testBestScores: {
        'Mock One': { attemptId: 'attempt-42', score: 90 },
      },
    };
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      profile,
      user: { uid: 'u-123', email: 'arya@example.com' },
      isAdmin: false,
    });
    vi.mocked(getDailyChallenge).mockResolvedValue(null);
    vi.mocked(getAutoDailyChallenge).mockResolvedValue({ topic: 'Algebra', question: 'What is 2 + 2?' });
    vi.mocked(subscribeAnnouncements).mockImplementation((onData, onError) => {
      callbacks.onData = onData;
      callbacks.onError = onError;
      return () => {};
    });
  });

  it('renders quick-action links and profile stats', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Welcome back, Arya')).toBeTruthy());

    const expected = {
      '/app/subjects': 'Subjects',
      '/app/tests': 'Tests',
      '/app/leaderboard': 'Leaderboard',
      '/app/resources': 'Resources',
    };
    for (const [href, name] of Object.entries(expected)) {
      const link = [...document.querySelectorAll('a')].find((node) => node.getAttribute('href') === href);
      expect(link.textContent).toContain(name);
    }
    expect(screen.getByText('12,345')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();
    expect(screen.getByText('7d')).toBeTruthy();
  });

  it('falls back to the auto daily challenge', async () => {
    renderDashboard();

    await waitFor(() => expect(screen.getByText('What is 2 + 2?')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Algebra' })).toBeTruthy();
    expect(getDailyChallenge).toHaveBeenCalledWith(todayKey());
    expect(getAutoDailyChallenge).toHaveBeenCalledWith(todayKey());
    const link = [...document.querySelectorAll('a')].find((node) => node.getAttribute('href') === '/app/test/daily/today');
    expect(link.textContent).toContain('Start today’s challenge');
  });

  it('shows a challenge error', async () => {
    vi.mocked(getDailyChallenge).mockRejectedValue(new Error('challenge offline'));
    renderDashboard();

    await waitFor(() => expect(screen.getByText('challenge offline')).toBeTruthy());
    expect(getAutoDailyChallenge).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'No challenge available' }).disabled).toBe(true);
  });

  it('clears an announcements error when later data arrives', async () => {
    renderDashboard();

    act(() => callbacks.onError());
    expect(screen.getByText('Announcements are unavailable right now.')).toBeTruthy();

    act(() => callbacks.onData([{ id: 'a1', title: 'Live update' }]));
    expect(screen.getByText('Live update')).toBeTruthy();
    expect(screen.queryByText('Announcements are unavailable right now.')).toBeNull();
  });

  it('links recent activity to the attempt result', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Mock One')).toBeTruthy());

    const link = screen.getByRole('link', { name: 'View result' });
    expect(link.getAttribute('href')).toBe('/app/result/u-123/attempt-42');
  });

  it('shows a profile-not-found state', async () => {
    vi.mocked(useAuth).mockReturnValue({ loading: false, profile: null, user: null, isAdmin: false });
    renderDashboard();

    expect(screen.getByText('Profile not found')).toBeTruthy();
    const link = [...document.querySelectorAll('a')].find((node) => node.getAttribute('href') === '/app/profile');
    expect(link.textContent).toContain('View profile');
    expect(getDailyChallenge).toHaveBeenCalledTimes(1);
  });

  it('waits for auth before rendering the dashboard', () => {
    vi.mocked(useAuth).mockReturnValue({ loading: true, profile: null, user: null, isAdmin: false });
    renderDashboard();

    expect(screen.getByText(/Loading your dashboard/)).toBeTruthy();
    expect(screen.queryByText('Quick actions')).toBeNull();
  });
});
