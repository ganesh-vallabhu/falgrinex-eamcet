import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { errorMessage } from '../lib/errors.js';

const navItems = [
  {
    to: '/app',
    label: 'Dashboard',
    short: 'Home',
    paths: ['M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  },
  {
    to: '/app/subjects',
    label: 'Subjects',
    short: 'Subjects',
    paths: ['M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4z', 'M20 4h-3a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h3z'],
  },
  {
    to: '/app/tests',
    label: 'Tests',
    short: 'Tests',
    paths: ['M9 4h6v2H9z', 'M7 4H5v16h14V4h-2', 'M9 10h6', 'M9 14h4'],
  },
  {
    to: '/app/resources',
    label: 'Resources',
    short: 'Resources',
    paths: ['M3 6h6l2 2h10v11H3z'],
  },
  {
    to: '/app/leaderboard',
    label: 'Leaderboard',
    short: 'Ranks',
    paths: ['M8 4h8v4a4 4 0 0 1-8 0z', 'M8 6H5v2a3 3 0 0 0 3 3', 'M16 6h3v2a3 3 0 0 1-3 3', 'M12 12v4', 'M9 20h6', 'M10 16h4'],
  },
  {
    to: '/app/profile',
    label: 'Profile',
    short: 'Profile',
    paths: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
  },
];

function Icon({ paths, className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

function titleFor(pathname) {
  if (pathname.startsWith('/app/subjects')) return 'Subjects';
  if (pathname.startsWith('/app/tests')) return 'Tests';
  if (pathname.startsWith('/app/practice')) return 'Practice';
  if (pathname.startsWith('/app/test/')) return 'Test';
  if (pathname.startsWith('/app/result/')) return 'Result';
  if (pathname.startsWith('/app/resources')) return 'Resources';
  if (pathname.startsWith('/app/leaderboard')) return 'Leaderboard';
  if (pathname.startsWith('/app/profile')) return 'Profile';
  if (pathname.startsWith('/app/admin')) return 'Admin';
  return 'Dashboard';
}

export default function AppShell() {
  const { user, profile, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoutError, setLogoutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const username = profile?.username || user?.email?.split('@')[0] || 'Student';
  const streak = Number(profile?.streak || 0);
  const totalScore = Number(profile?.totalScore || 0);

  async function handleLogout() {
    setLogoutError('');
    setSigningOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      setLogoutError(errorMessage(error, 'Could not sign out. Please try again.'));
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-slate-950/85 px-4 py-5 backdrop-blur lg:flex">
        <NavLink to="/app" className="flex items-center gap-3 rounded-xl px-2 py-1">
          <img src="/assets/brand.png" alt="" className="h-10 w-10 shrink-0 rounded-xl object-contain" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold tracking-tight text-white">Falgrinex EAMCET</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400/80">AP EAMCET Prep</span>
          </span>
        </NavLink>

        <p className="muted mt-8 px-3 text-[10px] font-bold uppercase tracking-[0.2em]">Workspace</p>
        <nav className="mt-3 flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/app'}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-blue-500/15 text-blue-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon paths={item.paths} className="h-[18px] w-[18px] shrink-0" />
              {item.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/app/admin"
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-violet-500/20 text-violet-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon paths={['M12 3l8 3v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z', 'M9 12l2 2 4-4']} className="h-[18px] w-[18px] shrink-0" />
              Admin
            </NavLink>
          )}
        </nav>

        <div className="card mt-auto p-4">
          <p className="text-xs font-semibold text-white">Keep the streak alive</p>
          <p className="muted mt-1 text-xs leading-relaxed">A few focused questions each day beat a last-minute rush.</p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <NavLink to="/app" className="shrink-0 lg:hidden" aria-label="Falgrinex home">
            <img src="/assets/brand.png" alt="" className="h-9 w-9 rounded-xl object-contain" />
          </NavLink>
          <div className="min-w-0">
            <h1 className="page-title truncate text-lg sm:text-2xl">{titleFor(location.pathname)}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="badge hidden sm:inline-flex" title="Current streak">Streak {streak}d</span>
            <span className="badge hidden sm:inline-flex" title="Total score">{totalScore.toLocaleString('en-IN')} pts</span>
            <span className="hidden max-w-28 truncate text-sm font-semibold text-slate-200 md:block">{username}</span>
            {isAdmin && <span className="badge border-violet-400/30 bg-violet-500/15 text-violet-300">Admin</span>}
            <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={handleLogout} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Logout'}
            </button>
          </div>
        </div>
        {logoutError && <p className="mx-auto max-w-6xl px-4 pb-2 text-xs text-rose-300 sm:px-6">{logoutError}</p>}
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Primary navigation">
        <div className={`mx-auto grid max-w-2xl ${isAdmin ? 'grid-cols-7' : 'grid-cols-6'}`}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/app'}
              className={({ isActive }) => `flex flex-col items-center gap-1 px-0.5 py-2.5 text-[10px] font-semibold transition ${isActive ? 'text-blue-300' : 'text-slate-400'}`}
            >
              <Icon paths={item.paths} className="h-5 w-5" />
              <span className="truncate">{item.short}</span>
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/app/admin"
              className={({ isActive }) => `flex flex-col items-center gap-1 px-0.5 py-2.5 text-[10px] font-semibold transition ${isActive ? 'text-violet-300' : 'text-slate-400'}`}
            >
              <Icon paths={['M12 3l8 3v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z', 'M9 12l2 2 4-4']} className="h-5 w-5" />
              <span className="truncate">Admin</span>
            </NavLink>
          )}
        </div>
      </nav>
    </div>
  );
}
