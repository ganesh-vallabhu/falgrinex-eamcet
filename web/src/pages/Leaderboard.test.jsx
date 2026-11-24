import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthProvider.jsx';
import { cachedLeaderboard, getWeeklyLeaderboard, listTopStudents } from '../lib/repository.js';
import Leaderboard from './Leaderboard.jsx';

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../lib/repository.js', () => ({
  cachedLeaderboard: vi.fn(),
  getWeeklyLeaderboard: vi.fn(),
  listTopStudents: vi.fn(),
}));

function renderLeaderboard() {
  return render(
    <MemoryRouter>
      <Leaderboard />
    </MemoryRouter>,
  );
}

describe('Leaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'current-user', email: 'me@example.com' },
      profile: { id: 'profile-1', username: 'me' },
    });
    vi.mocked(cachedLeaderboard).mockImplementation((key, uid, loader) => loader());
    vi.mocked(listTopStudents).mockResolvedValue([]);
    vi.mocked(getWeeklyLeaderboard).mockResolvedValue([]);
  });

  it('switches between overall and weekly tabs', async () => {
    const user = userEvent.setup();
    vi.mocked(listTopStudents).mockResolvedValue([
      { rank: 1, id: 'o1', studentName: 'Overall Star', totalScore: 900, testsTaken: 9, accuracySum: 810 },
    ]);
    vi.mocked(getWeeklyLeaderboard).mockResolvedValue([
      { rank: 1, id: 'w1', name: 'Weekly Star', score: 700, tests: 7, accuracySum: 630 },
    ]);
    renderLeaderboard();

    await waitFor(() => expect(screen.getByText('Overall Star')).toBeTruthy());
    expect(screen.getByText('900')).toBeTruthy();
    expect(listTopStudents).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'This week' }));

    await waitFor(() => expect(screen.getByText('Weekly Star')).toBeTruthy());
    expect(screen.getByText('700')).toBeTruthy();
    expect(getWeeklyLeaderboard).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('computes weekly accuracy from accuracySum and tests', async () => {
    const user = userEvent.setup();
    vi.mocked(getWeeklyLeaderboard).mockResolvedValue([
      { rank: 1, id: 'w1', name: 'One', score: 100, tests: 1 },
      { rank: 2, id: 'w2', name: 'Two', score: 90, tests: 1 },
      { rank: 3, id: 'w3', name: 'Three', score: 80, tests: 1 },
      { rank: 4, id: 'w4', name: 'Dana', username: 'dana', score: 400, tests: 4, accuracySum: 300 },
    ]);
    renderLeaderboard();

    await waitFor(() => expect(screen.getByText(/No students have been ranked yet/)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'This week' }));

    await waitFor(() => expect(screen.getByText('Dana')).toBeTruthy());
    const row = screen.getByText('Dana').closest('tr');
    expect(within(row).getByText('75%')).toBeTruthy();
    expect(within(row).getByText('4')).toBeTruthy();
  });

  it('highlights the row for the current user by identity', async () => {
    vi.mocked(listTopStudents).mockResolvedValue([
      { rank: 1, id: 'o1', name: 'One', totalScore: 900, testsTaken: 9, accuracySum: 810 },
      { rank: 2, id: 'o2', name: 'Two', totalScore: 800, testsTaken: 8, accuracySum: 700 },
      { rank: 3, id: 'o3', name: 'Three', totalScore: 700, testsTaken: 7, accuracySum: 600 },
      { rank: 4, id: 'o4', name: 'Four', totalScore: 600, testsTaken: 6, accuracySum: 500 },
      { rank: 5, id: 'current-user', name: 'Current User', username: 'me', totalScore: 100, testsTaken: 1, accuracySum: 100 },
    ]);
    renderLeaderboard();

    await waitFor(() => expect(screen.getByText('Current User')).toBeTruthy());
    const row = screen.getByText('Current User').closest('tr');
    expect(row.className).toContain('bg-blue-500/10');
    expect(within(row).getByText('You')).toBeTruthy();
  });

  it('shows an empty state', async () => {
    renderLeaderboard();

    await waitFor(() => expect(screen.getByText('No rankings yet')).toBeTruthy());
    expect(screen.getByText('No students have been ranked yet.')).toBeTruthy();
  });

  it('shows an error state and retries', async () => {
    const user = userEvent.setup();
    vi.mocked(listTopStudents)
      .mockRejectedValueOnce(new Error('rankings down'))
      .mockResolvedValueOnce([{ rank: 1, id: 'o1', name: 'Recovered', totalScore: 100, testsTaken: 1 }]);
    renderLeaderboard();

    await waitFor(() => expect(screen.getByText('rankings down')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText('Recovered')).toBeTruthy());
    expect(listTopStudents).toHaveBeenCalledTimes(2);
  });
});
