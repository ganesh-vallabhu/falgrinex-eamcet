import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/Feedback.jsx';
import { todayKey } from '../config/constants.js';
import { errorMessage } from '../lib/errors.js';
import { getAutoDailyChallenge } from '../lib/questionBank.js';
import { getDailyChallenge, subscribeAnnouncements } from '../lib/repository.js';

const quickActions = [
  { to: '/app/subjects', title: 'Subjects', text: 'Practice chapter by chapter with instant feedback.' },
  { to: '/app/tests', title: 'Tests', text: 'Timed mocks, grand tests and the daily challenge.' },
  { to: '/app/leaderboard', title: 'Leaderboard', text: 'See where you stand this week and overall.' },
  { to: '/app/resources', title: 'Resources', text: 'Notes and updates shared by your mentors.' },
];

function formatWhen(value) {
  if (!value) return '';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const { loading: authLoading, profile, user } = useAuth();
  const [challenge, setChallenge] = useState(null);
  const [challengeLoading, setChallengeLoading] = useState(true);
  const [challengeError, setChallengeError] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [announcementError, setAnnouncementError] = useState('');

  useEffect(() => {
    let active = true;
    const key = todayKey();
    (async () => {
      try {
        let data = await getDailyChallenge(key);
        if (!data) data = await getAutoDailyChallenge(key);
        if (active) setChallenge(data || null);
      } catch (error) {
        if (active) setChallengeError(errorMessage(error, 'Could not load today’s challenge.'));
      } finally {
        if (active) setChallengeLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => subscribeAnnouncements(
    (rows) => setAnnouncements(Array.isArray(rows) ? rows : []),
    () => setAnnouncementError('Announcements are unavailable right now.'),
  ), []);

  if (authLoading) return <PageLoader label="Loading your dashboard" />;

  if (!profile) return (
    <EmptyState
      title="Profile not found"
      message="We could not load your student profile. Sign out and sign in again to refresh it."
      action={<Link to="/app/profile" className="btn-primary">View profile</Link>}
    />
  );

  const testsTaken = Number(profile.testsTaken || 0);
  const accuracy = testsTaken ? Math.round((Number(profile.accuracySum || 0) / testsTaken) * 10) / 10 : 0;
  const stats = [
    { label: 'Total score', value: Number(profile.totalScore || 0).toLocaleString('en-IN') },
    { label: 'Tests taken', value: String(testsTaken) },
    { label: 'Accuracy', value: `${accuracy}%` },
    { label: 'Streak', value: `${Number(profile.streak || 0)}d` },
  ];
  const weakTopics = Array.isArray(profile.weakTopics) ? profile.weakTopics.filter(Boolean).slice(0, 10) : [];
  const bestScores = Object.entries(profile.testBestScores || {})
    .map(([title, record]) => ({ title, ...record }))
    .sort((a, b) => Number(b.updatedAt || b.lastAttemptAt || 0) - Number(a.updatedAt || a.lastAttemptAt || 0))
    .slice(0, 5);
  const challengeTopic = challenge?.topic || challenge?.chapter || 'Daily challenge';
  const challengeQuestion = challenge?.question ? String(challenge.question) : '';
  const uid = encodeURIComponent(user?.uid || profile.id || '');

  return (
    <div className="flex flex-col gap-6">
      <section className="animate-rise">
        <p className="badge border-cyan-400/25 text-cyan-300">Your workspace</p>
        <h2 className="page-title mt-3">Welcome back, {profile.name || 'Student'}</h2>
        <p className="muted mt-2">Small, steady sessions add up. Pick a chapter, take a test, and keep your streak alive.</p>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
            <p className="mt-2 text-xl font-extrabold tracking-tight text-white sm:text-2xl">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="card relative overflow-hidden border-cyan-400/20">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="badge border-cyan-400/25 text-cyan-300">Daily challenge</p>
                <h3 className="mt-3 text-lg font-bold text-white">{challengeTopic}</h3>
              </div>
              <span className="badge">{todayKey()}</span>
            </div>
            <p className="muted mt-3 min-h-[2.5rem]">
              {challengeLoading
                ? 'Finding today’s question…'
                : challengeQuestion
                  ? `${challengeQuestion.slice(0, 180)}${challengeQuestion.length > 180 ? '…' : ''}`
                  : 'A fresh question will be ready for you today.'}
            </p>
            {challengeError && <p className="mt-2 text-xs text-amber-300">{challengeError}</p>}
            <div className="mt-5">
              {challengeLoading ? (
                <span className="muted inline-flex items-center gap-2"><Spinner className="h-4 w-4" /> Loading challenge…</span>
              ) : challenge ? (
                <Link to="/app/test/daily/today" className="btn-primary">Start today’s challenge</Link>
              ) : (
                <button type="button" className="btn-ghost" disabled>No challenge available</button>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-white">Announcements</h3>
            <span className="badge border-emerald-400/25 bg-emerald-500/10 text-emerald-300">Live</span>
          </div>
          {announcementError ? (
            <p className="muted mt-4">{announcementError}</p>
          ) : announcements.length === 0 ? (
            <p className="muted mt-4">No announcements yet. Check back soon.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {announcements.slice(0, 5).map((item) => (
                <li key={item.id} className="rounded-xl border border-white/5 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{item.title || 'Update'}</p>
                    <span className="muted shrink-0 text-[11px]">{formatWhen(item.createdAt)}</span>
                  </div>
                  {item.message && <p className="muted mt-1 whitespace-pre-line text-xs">{item.message}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-base font-bold text-white">Quick actions</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.to} to={action.to} className="card transition hover:border-cyan-400/30 hover:bg-slate-900/90">
              <h4 className="text-sm font-bold text-white">{action.title}</h4>
              <p className="muted mt-1 text-xs leading-relaxed">{action.text}</p>
              <span className="mt-3 inline-block text-xs font-semibold text-cyan-300">Open →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <h3 className="text-base font-bold text-white">Weak topics</h3>
          {weakTopics.length === 0 ? (
            <p className="muted mt-3">Nothing flagged yet. Keep practising and we’ll track it here.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {weakTopics.map((topic) => <span key={topic} className="badge border-amber-400/25 bg-amber-500/10 text-amber-200">{topic}</span>)}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="text-base font-bold text-white">Recent activity</h3>
          <p className="muted mt-1 text-xs">Quiz answers are scored on this device, so recent attempts appear on each result page. Your best scores are shown here.</p>
          {bestScores.length === 0 ? (
            <p className="muted mt-4">No best scores yet. Take your first test to get started.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {bestScores.map((entry) => {
                const attemptId = entry.attemptId || entry.lastAttemptId;
                return (
                  <li key={entry.title} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate text-sm text-slate-200">{entry.title}</span>
                    {attemptId ? (
                      <Link to={`/app/result/${uid}/${encodeURIComponent(attemptId)}`} className="shrink-0 text-xs font-semibold text-cyan-300">View result</Link>
                    ) : (
                      <span className="badge shrink-0">{Number(entry.score || 0)} pts</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
