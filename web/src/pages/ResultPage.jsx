import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, PageLoader } from '../components/Feedback.jsx';
import { NEGATIVE_MARK } from '../config/constants.js';
import { errorMessage } from '../lib/errors.js';
import { getResultById } from '../lib/repository.js';

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value ?? ''));
  } catch {
    return String(value ?? '');
  }
}

function formatTime(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function optionText(options, index) {
  if (index === null || index === undefined || Number.isNaN(Number(index)) || Number(index) < 0) return 'Not answered';
  const value = Array.isArray(options) ? options[Number(index)] : undefined;
  const label = `${String.fromCharCode(65 + Number(index))}.`;
  return value === undefined ? `${label} Option ${Number(index) + 1}` : `${label} ${value}`;
}

function statusClass(status) {
  if (status === 'Correct') return 'border-emerald-400/30 text-emerald-200';
  if (status === 'Wrong') return 'border-rose-400/30 text-rose-200';
  return 'border-slate-400/30 text-slate-300';
}

function retryLink(result) {
  if (typeof result?.retryTo === 'string' && result.retryTo.startsWith('/app/')) return result.retryTo;
  const bank = String(result?.bank || '');
  if (bank === 'P') {
    const parts = String(result?.title || '').split(' · ');
    const subjects = Object.keys(result?.subjectTotals || {}).filter((subject) => subject !== 'Other');
    const subject = result?.subject || subjects[0];
    if (subject && parts.length === 2 && parts[0] && parts[1]) {
      return `/app/practice/${encodeURIComponent(subject)}/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
    }
    return '/app/tests';
  }
  if ((bank === 'M' || bank === 'G') && result?.title) {
    return `/app/test/${bank === 'G' ? 'grand' : 'mock'}/${encodeURIComponent(result.title)}`;
  }
  if (bank === 'D') return `/app/test/daily/${encodeURIComponent('Daily Challenge')}`;
  return '/app/tests';
}

export default function ResultPage() {
  const params = useParams();
  const uid = safeDecode(params.uid);
  const attemptId = safeDecode(params.attemptId);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [shareMessage, setShareMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      setResult(null);
      try {
        const data = await getResultById(uid, attemptId);
        if (!active) return;
        if (!data) {
          setError('This result could not be found.');
          return;
        }
        setResult(data);
      } catch (caught) {
        if (active) setError(errorMessage(caught, 'Could not load this result.'));
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [uid, attemptId, reloadToken]);

  if (loading) return <PageLoader label="Loading result" />;
  if (error || !result) {
    return (
      <ErrorState
        title="Result unavailable"
        message={error || 'This result could not be found.'}
        onRetry={() => setReloadToken((value) => value + 1)}
      />
    );
  }

  const review = Array.isArray(result.review) ? result.review : [];
  const weakTopics = Array.isArray(result.wrongTopics) ? result.wrongTopics : [];
  const subjectRows = Object.entries(result.subjectTotals || {});
  const fallbackTime = Number(result.completedAt) && Number(result.startedAt)
    ? Math.max(0, Math.floor((Number(result.completedAt) - Number(result.startedAt)) / 1000))
    : 0;
  const timeSec = Number(result.timeSec) || fallbackTime;
  const stats = [
    { label: 'Score', value: result.score ?? 0, accent: 'text-cyan-300' },
    { label: 'Correct', value: result.correct ?? 0, accent: 'text-emerald-300' },
    { label: 'Wrong', value: result.wrong ?? 0, accent: 'text-rose-300' },
    { label: 'Skipped', value: result.skipped ?? 0, accent: 'text-slate-200' },
    { label: 'Accuracy', value: `${result.accuracy ?? 0}%`, accent: 'text-violet-300' },
    { label: 'Time taken', value: formatTime(timeSec), accent: 'text-amber-300' },
  ];

  async function handleShare() {
    const text = `Falgrinex EAMCET · ${result.title || 'Quiz'}\nScore: ${result.score ?? 0}\nAccuracy: ${result.accuracy ?? 0}%\nCorrect: ${result.correct ?? 0} · Wrong: ${result.wrong ?? 0} · Skipped: ${result.skipped ?? 0}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setShareMessage('Result copied to clipboard.');
      } else {
        setShareMessage(`Clipboard unavailable. Copy this result: ${text}`);
      }
    } catch {
      setShareMessage(`Clipboard unavailable. Copy this result: ${text}`);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="card animate-rise">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400/80">Result</p>
            <h1 className="page-title mt-1">{result.title || 'Quiz attempt'}</h1>
            <p className="muted mt-2">Attempt {result.attemptId || attemptId} · {result.bank || '—'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.negativeMarking && <span className="badge border-amber-400/30 text-amber-200">Negative marking {NEGATIVE_MARK}</span>}
            {result.isNewHigh && <span className="badge border-emerald-400/30 text-emerald-200">New high score</span>}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <span className="block text-xs text-slate-400">{stat.label}</span>
              <strong className={`mt-1 block text-xl ${stat.accent}`}>{stat.value}</strong>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link className="btn-ghost" to="/app">Back to app</Link>
          <Link className="btn-primary" to={retryLink(result)}>Retry</Link>
          <button type="button" className="btn-ghost" onClick={handleShare}>Share</button>
        </div>
        {shareMessage && <p className="mt-4 whitespace-pre-line rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100">{shareMessage}</p>}
      </section>

      <section className="card">
        <h2 className="text-lg font-bold text-white">Subject breakdown</h2>
        {subjectRows.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {subjectRows.map(([subject, totals]) => {
              const total = Number(totals?.total) || 0;
              const correct = Number(totals?.correct) || 0;
              const percent = total ? Math.round((correct / total) * 100) : 0;
              return (
                <div key={subject} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-white">{subject}</span>
                    <span className="text-slate-400">{correct}/{total} · {percent}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="muted mt-3">No subject breakdown recorded.</p>}
      </section>

      <section className="card">
        <h2 className="text-lg font-bold text-white">Weak topics</h2>
        {weakTopics.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {weakTopics.map((topic, topicIndex) => <span key={`${topic}-${topicIndex}`} className="badge border-rose-400/25 text-rose-200">{topic}</span>)}
          </div>
        ) : <p className="muted mt-3">No weak topics from this attempt.</p>}
      </section>

      <section className="card">
        <h2 className="text-lg font-bold text-white">Full review</h2>
        {review.length ? (
          <div className="mt-4 space-y-4">
            {review.map((item, itemIndex) => (
              <article key={item.questionId || itemIndex} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <span className="badge">Q{itemIndex + 1}</span>
                    <span className="badge">{item.topic || 'General'}</span>
                  </div>
                  <span className={`badge ${statusClass(item.status)}`}>{item.status || 'Skipped'}</span>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-relaxed text-white">{item.question}</p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <p className="rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2">
                    <span className="text-slate-400">Your answer: </span>
                    <span className={item.status === 'Wrong' ? 'text-rose-200' : 'text-slate-100'}>{optionText(item.options, item.selectedIndex)}</span>
                  </p>
                  <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2">
                    <span className="text-emerald-200/80">Correct answer: </span>
                    <span className="text-emerald-100">{optionText(item.options, item.correctIndex)}</span>
                  </p>
                </div>
                {item.explanation && <p className="mt-3 whitespace-pre-line rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm leading-relaxed text-slate-300">{item.explanation}</p>}
              </article>
            ))}
          </div>
        ) : <p className="muted mt-3">No review details were saved for this attempt.</p>}
      </section>
    </div>
  );
}
