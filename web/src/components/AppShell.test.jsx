import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from './AppShell.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: vi.fn(),
}));

function LocationDisplay() {
  const location = useLocation();
  const message = location.state?.message;
  return <div data-testid="location">{message ? `${location.pathname} - ${message}` : location.pathname}</div>;
}

function renderShell(path = '/app') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationDisplay />
      <Routes>
        <Route path="/app/*" element={<AppShell />} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

let logout;

describe('AppShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logout = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'aria@example.com' },
      profile: { username: 'aria', streak: 7, totalScore: 12345 },
      isAdmin: false,
      logout,
    });
  });

  it('renders the desktop navigation links', () => {
    const { container } = renderShell();
    const desktopNav = within(container.querySelector('aside'));

    expect(desktopNav.getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/app');
    expect(desktopNav.getByRole('link', { name: 'Subjects' }).getAttribute('href')).toBe('/app/subjects');
    expect(desktopNav.getByRole('link', { name: 'Tests' }).getAttribute('href')).toBe('/app/tests');
    expect(desktopNav.getByRole('link', { name: 'Resources' }).getAttribute('href')).toBe('/app/resources');
    expect(desktopNav.getByRole('link', { name: 'Leaderboard' }).getAttribute('href')).toBe('/app/leaderboard');
    expect(desktopNav.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/app/profile');
  });

  it('shows the desktop admin link only for admins', () => {
    const { container, unmount } = renderShell();
    expect(within(container.querySelector('aside')).queryByRole('link', { name: 'Admin' })).toBeNull();
    unmount();

    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'aria@example.com' },
      profile: { username: 'aria', streak: 7, totalScore: 12345 },
      isAdmin: true,
      logout,
    });
    const admin = renderShell();
    expect(within(admin.container.querySelector('aside')).getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('/app/admin');
  });

  it('shows the mobile admin link for admins', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'aria@example.com' },
      profile: { username: 'aria', streak: 7, totalScore: 12345 },
      isAdmin: true,
      logout,
    });
    renderShell();
    const mobileNav = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(within(mobileNav).getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('/app/admin');
  });

  it('navigates to /login after a successful logout', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('shows the logout error message when sign out fails', async () => {
    const user = userEvent.setup();
    logout.mockRejectedValue(new Error('Session expired'));
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(screen.getByText('Session expired')).toBeTruthy());
    expect(screen.getByTestId('location').textContent).toBe('/app');
  });

  it.each([
    ['/app', 'Dashboard'],
    ['/app/subjects', 'Subjects'],
    ['/app/tests', 'Tests'],
    ['/app/practice/p1', 'Practice'],
    ['/app/test/t1', 'Test'],
    ['/app/result/r1', 'Result'],
    ['/app/resources', 'Resources'],
    ['/app/leaderboard', 'Leaderboard'],
    ['/app/profile', 'Profile'],
    ['/app/admin', 'Admin'],
    ['/app/unknown', 'Dashboard'],
  ])('shows the title %s as %s', (path, title) => {
    renderShell(path);
    expect(screen.getByRole('heading', { name: title, level: 1 }).textContent).toBe(title);
  });

  it('renders streak and score badges', () => {
    renderShell();
    expect(screen.getByTitle('Current streak').textContent).toBe('Streak 7d');
    expect(screen.getByTitle('Total score').textContent).toBe('12,345 pts');
  });
});
