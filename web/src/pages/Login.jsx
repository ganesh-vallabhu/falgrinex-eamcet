import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { sendPasswordReset } from '../lib/repository.js';
import { errorMessage } from '../lib/errors.js';
import { Spinner } from '../components/Feedback.jsx';

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [mode, setMode] = useState('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.message || '');

  if (isAuthenticated) return <Navigate to="/app" replace />;

  async function handleSignIn(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!identifier.trim() || !password) {
      setError('Enter your email or username and password.');
      return;
    }
    setBusy(true);
    try {
      await login(identifier.trim(), password);
      navigate(location.state?.from || '/app', { replace: true });
    } catch (caught) {
      setError(errorMessage(caught, 'Could not sign in. Please try again.'));
      setBusy(false);
    }
  }

  async function handleReset(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    const email = (resetEmail || identifier).trim();
    if (!email) {
      setError('Enter your email address to receive a reset link.');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setNotice('If that email is registered, a password reset link is on its way.');
      setMode('signin');
    } catch (caught) {
      setError(errorMessage(caught, 'Could not send the reset link. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  function openReset() {
    setError('');
    setNotice('');
    setResetEmail(identifier.includes('@') ? identifier : '');
    setMode('reset');
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-cyan-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-violet-500/15 blur-[120px]" />

      <div className="card relative w-full max-w-md animate-rise">
        <Link to="/" className="flex items-center gap-3">
          <img src="/assets/brand.png" alt="" className="h-11 w-11 rounded-xl object-contain" />
          <span>
            <span className="block text-sm font-extrabold text-white">Falgrinex EAMCET</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400/80">AP EAMCET Prep</span>
          </span>
        </Link>

        <h1 className="page-title mt-7 text-xl sm:text-2xl">{mode === 'signin' ? 'Welcome back' : 'Reset your password'}</h1>
        <p className="muted mt-2">
          {mode === 'signin' ? 'Sign in to continue your preparation.' : 'We will send a secure link to your registered email.'}
        </p>

        {notice && <p className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>}
        {error && <p className="mt-5 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

        {mode === 'signin' ? (
          <form className="mt-6 space-y-4" onSubmit={handleSignIn}>
            <div>
              <label className="label" htmlFor="identifier">Email or username</label>
              <input
                id="identifier"
                className="field"
                type="text"
                autoComplete="username"
                placeholder="you@example.com or your username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                className="field"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex justify-end">
              <button type="button" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200" onClick={openReset}>Forgot password?</button>
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? <><Spinner /> Signing in…</> : 'Login to dashboard'}
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleReset}>
            <div>
              <label className="label" htmlFor="reset-email">Registered email</label>
              <input
                id="reset-email"
                className="field"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                disabled={busy}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? <><Spinner /> Sending…</> : 'Send reset link'}
            </button>
            <button type="button" className="btn-ghost w-full" onClick={() => { setMode('signin'); setError(''); }} disabled={busy}>
              Back to sign in
            </button>
          </form>
        )}

        <p className="muted mt-6 border-t border-white/10 pt-5 text-center text-xs leading-relaxed">
          Don't have login details? Contact your mentor or institute admin. Admin accounts use the same form.
        </p>
      </div>
    </div>
  );
}
