import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EmptyState, PageLoader } from '../components/Feedback.jsx';
import { SUBJECTS } from '../config/constants.js';

export default function Profile() {
  const { loading, profile, user, isAdmin } = useAuth();

  if (loading) return <PageLoader label="Loading profile" />;

  if (!profile) return (
    <EmptyState
      title="Profile not found"
      message="We could not load your student profile. Sign out and sign in again to refresh it."
      action={<Link to="/app/subjects" className="btn-primary">Browse subjects</Link>}
    />
  );

  const testsTaken = Number(profile.testsTaken || 0);
  const accuracy = testsTaken ? Math.round((Number(profile.accuracySum || 0) / testsTaken) * 10) / 10 : 0;
  const stats = [
    { label: 'Total score', value: Number(profile.totalScore || 0).toLocaleString('en-IN') },
    { label: 'Tests taken', value: String(testsTaken) },
    { label: 'Average accuracy', value: `${accuracy}%` },
    { label: 'Current streak', value: `${Number(profile.streak || 0)} days` },
  ];
  const details = [
    { label: 'Name', value: profile.name || user?.email?.split('@')[0] || 'Student' },
    { label: 'Username', value: profile.username ? `@${profile.username}` : '—' },
    { label: 'Email', value: profile.email || user?.email || '—' },
    { label: 'Institute', value: profile.institute || '—' },
  ];
  const mastery = SUBJECTS.map((subject) => {
    const total = Number(profile.subjectTotals?.[subject]?.total || 0);
    const correct = Number(profile.subjectTotals?.[subject]?.correct || 0);
    return { subject, total, correct, percent: total ? Math.round((correct / total) * 100) : 0 };
  });
  const weakTopics = Array.isArray(profile.weakTopics) ? profile.weakTopics.filter(Boolean) : [];
  const bestScores = Object.entries(profile.testBestScores || {})
    .map(([title, record]) => ({ title, ...record }))
    .sort((a, b) => Number(b.updatedAt || b.lastAttemptAt || 0) - Number(a.updatedAt || a.lastAttemptAt || 0));
  const uid = encodeURIComponent(user?.uid || profile.id || '');

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-lg font-extrabold text-cyan-200">
            {String(profile.name || 'S').trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="page-title truncate text-xl sm:text-2xl">{profile.name || 'Student'}</h2>
            <p className="muted mt-1">{profile.username ? `@${profile.username}` : user?.email || 'Student account'}</p>
          </div>
        </div>
        {isAdmin && <Link to="/app/admin" className="btn-ghost shrink-0">Open admin console</Link>}
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
            <p className="mt-2 text-xl font-extrabold tracking-tight text-white">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <h3 className="text-base font-bold text-white">Account details</h3>
        <p className="muted mt-1 text-xs">These details are managed by your institute admin and are read-only here.</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {details.map((detail) => (
            <div key={detail.label} className="rounded-xl border border-white/5 bg-slate-950/40 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{detail.label}</dt>
              <dd className="mt-1 truncate text-sm font-semibold text-white">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card">
        <h3 className="text-base font-bold text-white">Subject mastery</h3>
        <p className="muted mt-1 text-xs">Share of answered questions marked correct in each subject.</p>
        <div className="mt-5 flex flex-col gap-5">
          {mastery.map((item) => (
            <div key={item.subject}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">{item.subject}</span>
                <span className="muted text-xs">{item.correct} / {item.total} · {item.percent}%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${item.percent}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <h3 className="text-base font-bold text-white">Weak topics</h3>
          {weakTopics.length === 0 ? (
            <p className="muted mt-3">No weak topics recorded yet. Keep practising!</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {weakTopics.map((topic) => <span key={topic} className="badge border-amber-400/25 bg-amber-500/10 text-amber-200">{topic}</span>)}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="text-base font-bold text-white">Test best scores</h3>
          {bestScores.length === 0 ? (
            <p className="muted mt-3">No tests attempted yet. <Link to="/app/tests" className="font-semibold text-cyan-300">Browse tests</Link></p>
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {bestScores.map((entry) => {
                const attemptId = entry.attemptId || entry.lastAttemptId;
                return (
                  <li key={entry.title} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{entry.title}</p>
                      <p className="muted text-xs">{entry.accuracy == null ? '—' : `${entry.accuracy}% accuracy`} · {Number(entry.attempts || 0)} attempt(s)</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="badge">{Number(entry.score || 0)} pts</span>
                      {attemptId && <Link to={`/app/result/${uid}/${encodeURIComponent(attemptId)}`} className="text-xs font-semibold text-cyan-300">Result</Link>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="card border-white/5 bg-slate-950/40">
        <h3 className="text-sm font-bold text-white">Data &amp; scoring</h3>
        <p className="muted mt-2 text-xs leading-relaxed">
          Quizzes are scored in your browser because Cloud Functions require a billing account on Firebase’s free tier. Your score, accuracy and subject totals are saved to your profile, while answer reviews stay with each attempt. Results are marked as unverified client scores.
        </p>
      </section>
    </div>
  );
}
