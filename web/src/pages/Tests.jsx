import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, PageLoader } from '../components/Feedback.jsx';
import { NEGATIVE_MARK } from '../config/constants.js';
import { errorMessage } from '../lib/errors.js';
import { loadCatalog } from '../lib/questionBank.js';
import { subscribeMockLocks } from '../lib/repository.js';

function entryLocked(value, now) {
  const locked = value === true || value === 1 || value?.locked === true || value?.locked === 1;
  if (!locked) return false;
  const rawUnlock = value?.unlockAt?.toDate ? value.unlockAt.toDate() : value?.unlockAt;
  if (rawUnlock === null || rawUnlock === undefined || rawUnlock === '') return true;
  const unlockAt = rawUnlock instanceof Date ? rawUnlock.getTime() : typeof rawUnlock === 'number' ? rawUnlock : Date.parse(rawUnlock);
  return !Number.isFinite(unlockAt) || unlockAt > now;
}

function isMockLocked(locks, title, now = Date.now()) {
  if (!locks) return false;
  if (Array.isArray(locks)) return locks.includes(title);
  if (Array.isArray(locks.locked)) return locks.locked.includes(title);
  if (Array.isArray(locks.titles)) return locks.titles.includes(title);
  const number = String(title).match(/\d+/)?.[0] || '';
  const values = [
    locks[title],
    locks.locked?.[title],
    locks.mock?.[title],
    locks.mockTests?.[title],
    number && locks[number],
    number && locks.locked?.[number],
    number && locks.mock?.[number],
  ];
  return values.some((value) => entryLocked(value, now));
}

function TestCard({ test, bank, locked }) {
  const classes = `card transition ${locked ? 'opacity-75' : 'hover:border-cyan-400/30 hover:bg-slate-900/90'}`;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-white">{test.title}</h3>
        <span className={`badge shrink-0 ${locked ? 'border-rose-400/25 bg-rose-500/10 text-rose-300' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'}`}>
          {locked ? 'Locked' : 'Open'}
        </span>
      </div>
      <p className="muted mt-1 text-xs">{test.type || 'Full-Length'} · {test.subjectScope || 'Mixed'}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="badge">{Number(test.totalQuestions || test.count || 0)} questions</span>
        <span className="badge">{Number(test.durationMinutes || 0)} min</span>
        <span className={`badge ${test.negativeMarking ? 'border-amber-400/25 bg-amber-500/10 text-amber-300' : ''}`}>
          {test.negativeMarking ? `-${NEGATIVE_MARK} / wrong` : 'No negative marking'}
        </span>
      </div>
      {locked ? (
        <p className="muted mt-4 text-xs">Ask your admin to unlock this test.</p>
      ) : (
        <p className="mt-4 text-xs font-semibold text-cyan-300">Start test →</p>
      )}
    </>
  );
  if (locked) return <div className={classes}>{body}</div>;
  return <Link to={`/app/test/${bank}/${encodeURIComponent(test.title)}`} className={classes}>{body}</Link>;
}

export default function Tests() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  const [locks, setLocks] = useState({});
  const [lockError, setLockError] = useState('');
  const [locksReady, setLocksReady] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    loadCatalog()
      .then((data) => { if (active) setCatalog(data); })
      .catch((caught) => { if (active) setError(errorMessage(caught, 'Could not load the test catalog.')); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => subscribeMockLocks(
    (data) => { setLocks(data || {}); setLockError(''); setLocksReady(true); },
    () => { setLockError('Mock test locks could not be loaded. Tests are shown as locked until they can be checked.'); setLocksReady(true); },
  ), []);

  if (!catalog && !error) return <PageLoader label="Loading tests" />;
  if (error) return <ErrorState title="Tests unavailable" message={error} onRetry={() => setReload((value) => value + 1)} />;

  const tests = Array.isArray(catalog.tests) ? catalog.tests : [];
  const mocks = tests.filter((test) => !test.isGrand);
  const grand = tests.filter((test) => test.isGrand);

  return (
    <div className="flex flex-col gap-6">
      <section className="card relative overflow-hidden border-cyan-400/20">
        <div className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="badge border-cyan-400/25 text-cyan-300">Every day, one question</p>
            <h2 className="page-title mt-3">Daily Challenge</h2>
            <p className="muted mt-2 max-w-xl">Sharpen one concept a day and keep your streak going. It takes less than a minute.</p>
            <p className="muted mt-2 text-xs">When no admin challenge is scheduled, today’s question is generated locally from the practice bank.</p>
          </div>
          <Link to="/app/test/daily/today" className="btn-primary shrink-0">Start challenge</Link>
        </div>
      </section>

      {lockError && <p className="card border-amber-400/20 text-xs text-amber-300">{lockError}</p>}

      {tests.length === 0 ? (
        <EmptyState title="No tests available" message="Tests will appear here once they are published." />
      ) : (
        <>
          <section>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-lg font-bold text-white">Mock Tests</h2>
              <span className="badge border-cyan-400/25 bg-cyan-500/10 text-cyan-300">{mocks.length} tests</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mocks.map((test) => (
                <TestCard key={test.title} test={test} bank="mock" locked={!locksReady || Boolean(lockError) || isMockLocked(locks, test.title)} />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-lg font-bold text-white">Grand Tests</h2>
              <span className="badge border-violet-400/25 bg-violet-500/10 text-violet-300">{grand.length} tests</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grand.map((test) => (
                <TestCard key={test.title} test={test} bank="grand" locked={false} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
