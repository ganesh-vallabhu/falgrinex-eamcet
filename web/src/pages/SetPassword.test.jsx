import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../config/firebase.js';
import SetPassword from './SetPassword.jsx';

vi.mock('firebase/auth', () => ({
  confirmPasswordReset: vi.fn(),
  verifyPasswordResetCode: vi.fn(),
}));

vi.mock('../config/firebase.js', () => ({
  auth: { name: 'test-auth' },
}));

function LocationDisplay() {
  const location = useLocation();
  const message = location.state?.message;
  return <div data-testid="location">{message ? `${location.pathname} - ${message}` : location.pathname}</div>;
}

function renderSetPassword(entry = '/set-password?oobCode=abc123&mode=resetPassword') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/login" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function readyForm() {
  await waitFor(() => expect(screen.getByText('aria@example.com')).toBeTruthy());
  return {
    password: screen.getByLabelText('New password'),
    confirm: screen.getByLabelText('Confirm password'),
    submit: screen.getByRole('button', { name: 'Update password' }),
  };
}

describe('SetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
    vi.mocked(verifyPasswordResetCode).mockResolvedValue('aria@example.com');
    vi.mocked(confirmPasswordReset).mockResolvedValue(undefined);
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('shows an invalid state for a missing code', () => {
    renderSetPassword('/set-password');
    expect(screen.getByText('This reset link is missing its code. Request a new one from the login page.')).toBeTruthy();
    expect(verifyPasswordResetCode).not.toHaveBeenCalled();
  });

  it('shows the verification failure message', async () => {
    vi.mocked(verifyPasswordResetCode).mockRejectedValue({ code: 'auth/expired-action-code' });
    renderSetPassword();

    await waitFor(() => expect(screen.getByText('This link has expired. Request a new reset link from the login page.')).toBeTruthy());
    expect(verifyPasswordResetCode).toHaveBeenCalledWith(auth, 'abc123');
  });

  it('shows the ready state for a verified email', async () => {
    renderSetPassword();
    const form = await readyForm();

    expect(form.password).toBeTruthy();
    expect(form.confirm).toBeTruthy();
    expect(form.submit).toBeTruthy();
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('validates password length', async () => {
    const user = userEvent.setup();
    renderSetPassword();
    const form = await readyForm();

    await user.type(form.password, '12345');
    await user.click(form.submit);

    expect(screen.getByText('Password must be at least 6 characters.')).toBeTruthy();
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('validates password confirmation', async () => {
    const user = userEvent.setup();
    renderSetPassword();
    const form = await readyForm();

    await user.type(form.password, 'secret123');
    await user.type(form.confirm, 'secret456');
    await user.click(form.submit);

    expect(screen.getByText('Passwords do not match.')).toBeTruthy();
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('navigates to /login with a message after success', async () => {
    const user = userEvent.setup();
    renderSetPassword();
    const form = await readyForm();

    await user.type(form.password, 'secret123');
    await user.type(form.confirm, 'secret123');
    await user.click(form.submit);

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login - Password updated. Sign in with your new password.'));
    expect(confirmPasswordReset).toHaveBeenCalledWith(auth, 'abc123', 'secret123');
  });

  it('handles a wrong link mode', () => {
    renderSetPassword('/set-password?oobCode=abc123&mode=signIn');
    expect(screen.getByText('This link is not a password reset link.')).toBeTruthy();
    expect(verifyPasswordResetCode).not.toHaveBeenCalled();
  });
});
