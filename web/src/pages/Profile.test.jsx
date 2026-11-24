import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthProvider.jsx';
import Profile from './Profile.jsx';

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: vi.fn(),
}));

let profile;

function renderProfile() {
  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
}

describe('Profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profile = {
      id: 'profile-1',
      name: 'Arya',
      username: 'arya',
      email: 'arya@example.com',
      institute: 'Example Institute',
      totalScore: 12345,
      testsTaken: 2,
      accuracySum: 170,
      streak: 3,
      subjectTotals: {
        Mathematics: { correct: 8, total: 10 },
        Physics: { correct: 1, total: 4 },
      },
      weakTopics: ['Trigonometry', 'Optics'],
      testBestScores: {
        'Mock A': { lastAttemptId: 'last-1', score: 85, accuracy: 85, attempts: 2 },
      },
    };
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      profile,
      user: { uid: 'u1', email: 'arya@example.com' },
      isAdmin: true,
    });
  });

  it('renders stats and account details', () => {
    renderProfile();

    expect(screen.getByText('12,345')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('85%')).toBeTruthy();
    expect(screen.getByText('3 days')).toBeTruthy();
    expect(screen.getAllByText('@arya').length).toBeGreaterThan(0);
    expect(screen.getByText('arya@example.com')).toBeTruthy();
    expect(screen.getByText('Example Institute')).toBeTruthy();
    expect(screen.getByText('Account details')).toBeTruthy();
  });

  it('renders mastery bars from subject totals', () => {
    renderProfile();

    expect(screen.getByText('8 / 10 · 80%')).toBeTruthy();
    expect(screen.getByText('1 / 4 · 25%')).toBeTruthy();
    expect(document.querySelector('[style*="width: 80%"]')).toBeTruthy();
    expect(document.querySelector('[style*="width: 25%"]')).toBeTruthy();
  });

  it('renders weak topics', () => {
    renderProfile();

    expect(screen.getByText('Trigonometry')).toBeTruthy();
    expect(screen.getByText('Optics')).toBeTruthy();
  });

  it('shows the admin console link for admins', () => {
    renderProfile();

    const link = [...document.querySelectorAll('a')].find((node) => node.getAttribute('href') === '/app/admin');
    expect(link.textContent).toContain('Open admin console');
  });

  it('links a best score to its last attempt result', () => {
    renderProfile();

    const link = screen.getByRole('link', { name: 'Result' });
    expect(link.getAttribute('href')).toBe('/app/result/u1/last-1');
    expect(screen.getByText('Mock A')).toBeTruthy();
    expect(screen.getByText('85% accuracy · 2 attempt(s)')).toBeTruthy();
  });

  it('shows a profile-not-found state', () => {
    vi.mocked(useAuth).mockReturnValue({ loading: false, profile: null, user: null, isAdmin: false });
    renderProfile();

    expect(screen.getByText('Profile not found')).toBeTruthy();
    const link = [...document.querySelectorAll('a')].find((node) => node.getAttribute('href') === '/app/subjects');
    expect(link.textContent).toContain('Browse subjects');
  });
});
