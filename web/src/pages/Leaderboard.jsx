import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EmptyState, ErrorState, PageLoader } from '../components/Feedback.jsx';
import { LEADERBOARD_LIMIT, weekStartKey } from '../config/constants.js';
import { invalidate } from '../lib/cache.js';
import { errorMessage } from '../lib/errors.js';
import { cachedLeaderboard, getWeeklyLeaderboard, listTopStudents } from '../lib/repository.js';

const medals = [
  'border-amber-300/30 bg-amber-400/10 text-amber-300',
  'border-slate-200/20 bg-slate-300/10 text-slate-200',
  'border-orange-400/25 bg-orange-500/10 text-orange-300',
];

function displayName(row) {
  return row.name || row.studentName || row.username || 'Student';
}

function scoreOf(row, tab) {
  return Number(tab === 'week' ? row.score : row.totalScore) || 0;
}

function testsOf(row, tab) {
  const value = tab === 'week' ? (row.tests ?? row.testsTaken) : row.testsTaken;
  return Number(value || 0);
}

function accuracyOf(row, tab) {
  if (tab === 'week') return row.accuracy == null ? null : Number(row.accuracy);
  const tests = Number(row.testsTaken || 0);
  return tests ? Math.round((Number(row.accuracySum || 0) / tests) * 10) / 10 : 0;
}

export default function Leaderboard() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState('overall');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const weekly = tab === 'week';
    const key = weekly ? `week:${weekStartKey()}` : 'overall';
    const loader = weekly ? () => getWeeklyLeaderboard(weekStartKey()) : () => listTopStudents();
    cachedLeaderboard(key, user?.uid, loader)
      .then((data) => { if (active) setRows(Array.isArray(data) ? data : []); })
      .catch((caught) => { if (active) setError(errorMessage(caught, 'Could not load the leaderboard.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tab, user?.uid, reload]);

  function isMe(row) {
    const uid = user?.uid || profile?.id;
    if (uid && [row.id, row.uid, row.studentId].some((value) => value === uid)) return true;
    const mine = String(profile?.username || user?.email?.split('@')[0] || '').trim().toLowerCase();
    const theirs = String(row.username || '').trim().toLowerCase();
    return Boolean(mine && theirs && mine === theirs);
  }

  function handleRetry() {
    invalidate('leaderboard:');
    setReload((value) => value + 1);
  }

  const podiumIndexes = [1, 0, 2].filter((index) => rows[index]);
  const rest = rows.slice(3);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="badge border-amber-400/25 text-amber-300">Rankings</p>
          <h2 className="page-title mt-3">Leaderboard</h2>
          <p className="muted mt-2">Consistency wins. See how your scores stack up this week and overall.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={tab === 'overall' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('overall')}>Overall</button>
          <button type="button" className={tab === 'week' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('week')}>This week</button>
        </div>
      </section>

      <p className="muted">
        Overall shows the top {LEADERBOARD_LIMIT} students from the top 100 scanned because of free-tier read limits. This week is aggregated from weeklyStats.
      </p>

      {loading ? (
        <PageLoader label="Loading rankings" />
      ) : error ? (
        <ErrorState title="Leaderboard unavailable" message={error} onRetry={handleRetry} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No rankings yet"
          message={tab === 'week' ? 'No one has scored this week yet.' : 'No students have been ranked yet.'}
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            {podiumIndexes.map((index) => {
              const row = rows[index];
              const place = index + 1;
              return (
                <div key={row.id || row.username || place} className={`card border-2 ${medals[place - 1]} ${isMe(row) ? 'ring-2 ring-blue-400/50' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest">#{row.rank || place}</span>
                    {isMe(row) && <span className="badge border-blue-400/30 bg-blue-500/20 text-blue-200">You</span>}
                  </div>
                  <p className="mt-3 truncate text-lg font-extrabold">{displayName(row)}</p>
                  {row.username && <p className="mt-0.5 truncate text-xs opacity-70">@{row.username}</p>}
                  <p className="mt-4 text-2xl font-extrabold">{scoreOf(row, tab).toLocaleString('en-IN')}</p>
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider opacity-70">points · {testsOf(row, tab)} tests</p>
                </div>
              );
            })}
          </section>

          {rest.length > 0 && (
            <section className="card overflow-x-auto p-0">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Rank</th>
                    <th className="px-5 py-3">Student</th>
                    <th className="px-5 py-3">Score</th>
                    <th className="px-5 py-3">Tests</th>
                    <th className="px-5 py-3">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((row) => {
                    const accuracy = accuracyOf(row, tab);
                    return (
                      <tr key={row.id || row.username || displayName(row)} className={`border-b border-white/5 last:border-0 ${isMe(row) ? 'bg-blue-500/10' : ''}`}>
                        <td className="px-5 py-3 font-semibold text-slate-300">#{row.rank}</td>
                        <td className="px-5 py-3">
                          <span className="font-semibold text-white">{displayName(row)}</span>
                          {row.username && <span className="muted ml-2 text-xs">@{row.username}</span>}
                          {isMe(row) && <span className="badge ml-2 border-blue-400/30 bg-blue-500/15 text-blue-300">You</span>}
                        </td>
                        <td className="px-5 py-3 font-semibold text-cyan-300">{scoreOf(row, tab).toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-slate-300">{testsOf(row, tab)}</td>
                        <td className="px-5 py-3 text-slate-300">{accuracy == null ? '—' : `${accuracy}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
