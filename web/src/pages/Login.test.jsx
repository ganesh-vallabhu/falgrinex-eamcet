import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { sendPasswordReset } from '../lib/repository.js';

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../lib/repository.js', () => ({
  sendPasswordReset: vi.fn(),
}));

function LocationDisplay() {
  const location = useLocation();
  const message = location.state?.message;
  return <div data-testid="location">{message ? `${location.pathname} - ${message}` : location.pathname}</div>;
}

function renderLogin(state) {
  return render(
    <MemoryRouter initialEntries={[state ? { pathname: '/login', state } : '/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<LocationDisplay />} />
        <Route path="/app/tests" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  );
}

let login;

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    login = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({ isAuthenticated: false, login });
    vi.mocked(sendPasswordReset).mockResolvedValue(undefined);
  });

  it('validates empty sign-in fields', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole('button', { name: 'Login to dashboard' }));

    expect(screen.getByText('Enter your email or username and password.')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('signs in and navigates to state.from', async () => {
    const user = userEvent.setup();
    renderLogin({ from: '/app/tests' });

    await user.type(screen.getByLabelText('Email or username'), 'aria');
    await user.type(screen.getByLabelText('Password'), 'Secret123');
    await user.click(screen.getByRole('button', { name: 'Login to dashboard' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/app/tests'));
    expect(login).toHaveBeenCalledWith('aria', 'Secret123');
  });

  it('shows the sign-in error message', async () => {
    const user = userEvent.setup();
    login.mockRejectedValue({ code: 'auth/invalid-credential' });
    renderLogin();

    await user.type(screen.getByLabelText('Email or username'), 'aria@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Login to dashboard' }));

    await waitFor(() => expect(screen.getByText('Wrong email or password.')).toBeTruthy());
  });

  it('prefills an email identifier in forgot-password mode', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email or username'), 'aria@example.com');
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(screen.getByLabelText('Registered email').value).toBe('aria@example.com');
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeTruthy();
  });

  it('does not prefill a username identifier in forgot-password mode', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email or username'), 'aria');
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(screen.getByLabelText('Registered email').value).toBe('');
  });

  it('validates the reset email', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(screen.getByText('Enter your email address to receive a reset link.')).toBeTruthy();
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it('shows a notice after a successful reset request', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText('Registered email'), 'aria@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(screen.getByText('If that email is registered, a password reset link is on its way.')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(sendPasswordReset).toHaveBeenCalledWith('aria@example.com');
  });

  it('shows the reset error message', async () => {
    const user = userEvent.setup();
    vi.mocked(sendPasswordReset).mockRejectedValue({ code: 'auth/network-request-failed' });
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText('Registered email'), 'aria@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(screen.getByText('Internet issue. Check your connection and try again.')).toBeTruthy());
  });
});
