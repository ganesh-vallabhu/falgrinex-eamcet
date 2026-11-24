import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
import { useAuth } from './auth/AuthProvider.jsx';
import { useRouteSeo } from './lib/seo.js';

const state = vi.hoisted(() => ({ quizMounts: 0 }));

vi.mock('./auth/AuthProvider.jsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('./lib/seo.js', () => ({
  useRouteSeo: vi.fn(),
}));

vi.mock('./pages/Landing.jsx', () => ({
  default: () => <div>Landing page</div>,
}));

vi.mock('./pages/Login.jsx', () => ({
  default: () => <div>Login page</div>,
}));

vi.mock('./pages/SetPassword.jsx', () => ({
  default: () => <div>Set password page</div>,
}));

vi.mock('./pages/Dashboard.jsx', () => ({
  default: () => <div>Dashboard page</div>,
}));

vi.mock('./pages/Subjects.jsx', () => ({
  default: () => <div>Subjects page</div>,
}));

vi.mock('./pages/Tests.jsx', () => ({
  default: () => <div>Tests page</div>,
}));

vi.mock('./pages/QuizRunner.jsx', async () => {
  const { useState } = await import('react');
  return {
    default: ({ mode }) => {
      const [mountId] = useState(() => {
        state.quizMounts += 1;
        return state.quizMounts;
      });
      return <div>QuizRunner {mode} #{mountId}</div>;
    },
  };
});

vi.mock('./pages/ResultPage.jsx', () => ({
  default: () => <div>Result page</div>,
}));

vi.mock('./pages/Resources.jsx', () => ({
  default: () => <div>Resources page</div>,
}));

vi.mock('./pages/Leaderboard.jsx', () => ({
  default: () => <div>Leaderboard page</div>,
}));

vi.mock('./pages/Profile.jsx', () => ({
  default: () => <div>Profile page</div>,
}));

vi.mock('./pages/Admin.jsx', () => ({
  default: () => <div>Admin page</div>,
}));

vi.mock('./pages/NotFound.jsx', () => ({
  default: () => <div>Not found page</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function QuizNavigator() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/app/practice/Maths/Functions/Medium')}>Go medium</button>
  );
}

function renderApp(path, extra = null) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {extra}
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function authValue(overrides = {}) {
  return {
    loading: false,
    isAuthenticated: true,
    isAdmin: false,
    user: { uid: 'u1', email: 'student@example.com' },
    profile: { username: 'student', streak: 0, totalScore: 0 },
    logout: vi.fn(),
    ...overrides,
  };
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.quizMounts = 0;
    vi.mocked(useAuth).mockReturnValue(authValue());
  });

  it('renders public routes', async () => {
    const routes = [
      ['/', 'Landing page'],
      ['/login', 'Login page'],
      ['/set-password', 'Set password page'],
    ];

    for (const [path, label] of routes) {
      const view = renderApp(path);
      await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
      expect(useRouteSeo).toHaveBeenCalled();
      view.unmount();
    }
  });

  it('redirects an unauthenticated protected route to /login', async () => {
    vi.mocked(useAuth).mockReturnValue(authValue({ isAuthenticated: false, user: null }));

    renderApp('/app/subjects');

    await waitFor(() => expect(screen.getByText('Login page')).toBeTruthy());
    expect(screen.getByTestId('location').textContent).toBe('/login');
    expect(screen.queryByText('Subjects page')).toBeNull();
  });

  it('shows a loader while auth is loading', () => {
    vi.mocked(useAuth).mockReturnValue(authValue({ loading: true }));

    renderApp('/app/subjects');

    expect(screen.getByText(/Checking your session/)).toBeTruthy();
    expect(screen.queryByText('Subjects page')).toBeNull();
  });

  it('redirects non-admins away from the admin route', async () => {
    vi.mocked(useAuth).mockReturnValue(authValue({ isAdmin: false }));

    renderApp('/app/admin');

    await waitFor(() => expect(screen.getByText('Dashboard page')).toBeTruthy());
    expect(screen.getByTestId('location').textContent).toBe('/app');
    expect(screen.queryByText('Admin page')).toBeNull();
  });

  it('renders NotFound for unmatched routes', async () => {
    renderApp('/unexpected');

    await waitFor(() => expect(screen.getByText('Not found page')).toBeTruthy());
    expect(screen.getByTestId('location').textContent).toBe('/unexpected');
  });

  it('remounts QuizRunner when the path changes', async () => {
    const user = userEvent.setup();

    renderApp('/app/practice/Maths/Functions/Easy', <QuizNavigator />);

    await waitFor(() => expect(screen.getByText('QuizRunner practice #1')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Go medium' }));

    await waitFor(() => expect(screen.getByText('QuizRunner practice #2')).toBeTruthy());
    expect(state.quizMounts).toBe(2);
    expect(screen.queryByText('QuizRunner practice #1')).toBeNull();
  });
});
