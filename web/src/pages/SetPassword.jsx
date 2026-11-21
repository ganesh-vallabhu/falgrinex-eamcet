import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../config/firebase.js';
import { errorMessage } from '../lib/errors.js';
import { Spinner } from '../components/Feedback.jsx';

function collectParams(searchParams) {
  const values = new URLSearchParams();
  if (typeof window !== 'undefined') {
    const current = new URLSearchParams(window.location.search);
    for (const [key, value] of current.entries()) values.set(key, value);
    const hashQuery = window.location.hash.split('?')[1];
    if (hashQuery) {
      for (const [key, value] of new URLSearchParams(hashQuery).entries()) values.set(key, value);
    }
  }
  for (const [key, value] of searchParams.entries()) values.set(key, value);
  return values;
}

function resetErrorMessage(error, fallback) {
  const code = String(error?.code || '');
  if (code === 'auth/expired-action-code') return 'This link has expired. Request a new reset link from the login page.';
  if (code === 'auth/invalid-action-code') return 'This link is invalid or has already been used. Request a new one.';
  if (code === 'auth/user-disabled') return 'This account is disabled. Contact your mentor or institute admin.';
  return errorMessage(error, fallback);
}

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const params = collectParams(searchParams);
  const oobCode = params.get('oobCode') || '';
  const mode = params.get('mode') || '';
  const wrongMode = Boolean(mode) && mode !== 'resetPassword';
  const [status, setStatus] = useState(!oobCode || wrongMode ? 'invalid' : 'verifying');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    !oobCode ? 'This reset link is missing its code. Request a new one from the login page.'
      : wrongMode ? 'This link is not a password reset link.' : '',
  );

  useEffect(() => {
    if (!oobCode || wrongMode) {
      setStatus('invalid');
      return undefined;
    }
    let active = true;
    setStatus('verifying');
    setError('');
    verifyPasswordResetCode(auth, oobCode)
      .then((verifiedEmail) => {
        if (!active) return;
        setEmail(verifiedEmail);
        setStatus('ready');
      })
      .catch((caught) => {
        if (!active) return;
        setError(resetErrorMessage(caught, 'This reset link is invalid. Request a new one from the login page.'));
        setStatus('invalid');
      });
    return () => { active = false; };
  }, [oobCode, wrongMode]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      navigate('/login', { replace: true, state: { message: 'Password updated. Sign in with your new password.' } });
    } catch (caught) {
      setError(resetErrorMessage(caught, 'Could not update your password. Please request a new link.'));
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-violet-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-cyan-500/15 blur-[120px]" />

      <div className="card relative w-full max-w-md animate-rise">
        <Link to="/" className="flex items-center gap-3">
          <img src="/assets/brand.png" alt="" className="h-11 w-11 rounded-xl object-contain" />
          <span>
            <span className="block text-sm font-extrabold text-white">Falgrinex EAMCET</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400/80">AP EAMCET Prep</span>
          </span>
        </Link>

        <h1 className="page-title mt-7 text-xl sm:text-2xl">Set a new password</h1>
        <p className="muted mt-2">Choose a strong password for your Falgrinex account.</p>

        {status === 'verifying' && (
          <div className="mt-8 flex flex-col items-center gap-3 py-6 text-slate-400">
            <Spinner className="h-8 w-8" />
            <p className="text-sm">Checking your reset link…</p>
          </div>
        )}

        {status === 'invalid' && (
          <div className="mt-6">
            <p className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>
            <Link to="/login" className="btn-primary mt-5 w-full">Back to login</Link>
          </div>
        )}

        {status === 'ready' && (
          <>
            <p className="mt-5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
              Resetting password for <span className="font-semibold text-white">{email}</span>
            </p>
            {error && <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="label" htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  className="field"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                />
              </div>
              <div>
                <label className="label" htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  className="field"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat your new password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  disabled={busy}
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy ? <><Spinner /> Updating…</> : 'Update password'}
              </button>
            </form>
          </>
        )}

        <p className="muted mt-6 border-t border-white/10 pt-5 text-center text-xs">
          Need a new link? <Link to="/login" className="font-semibold text-cyan-300 hover:text-cyan-200">Request one here</Link>.
        </p>
      </div>
    </div>
  );
}
