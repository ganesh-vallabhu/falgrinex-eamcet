import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { ErrorState, PageLoader, Spinner } from '../components/Feedback.jsx';
import { NEGATIVE_MARK, todayKey } from '../config/constants.js';
import { errorMessage, isPermissionDenied } from '../lib/errors.js';
import {
  getAutoDailyChallenge,
  loadPracticeChapter,
  loadTestQuestions,
  normalizeSubject,
  practiceTitle,
  selectPracticeQuestions,
  testById,
} from '../lib/questionBank.js';
import { getDailyChallenge, getResultById, saveQuizAttempt } from '../lib/repository.js';
import { scoreSubmission } from '../lib/scoring.js';

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value ?? ''));
  } catch {
    return String(value ?? '');
  }
}

function makeAttemptId() {
  const candidate = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return String(candidate).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
}

function readSession(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function fitArray(value, length, fill) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length }, (_, index) => source[index] ?? fill);
}

function formatTime(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function QuizRunner({ mode = 'practice' }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const dateKey = todayKey();
  const decodedSubject = safeDecode(params.subject);
  const decodedChapter = safeDecode(params.chapter);
  const decodedDifficulty = safeDecode(params.difficulty);
  const decodedBank = safeDecode(params.bank);
  const decodedTitle = safeDecode(params.title);
  const sessionKey = useMemo(() => {
    if (mode === 'practice') return `${normalizeSubject(decodedSubject)}/${decodedChapter}/${decodedDifficulty}`;
    if (mode === 'test' && decodedBank === 'daily') return `daily/${dateKey}`;
    return `${decodedBank}/${decodedTitle}`;
  }, [mode, decodedSubject, decodedChapter, decodedDifficulty, decodedBank, decodedTitle, dateKey]);
  const storageKey = user?.uid ? `falgrinex_quiz_${user.uid}_${mode}_${sessionKey}` : '';
  const [restored] = useState(() => readSession(storageKey));
  const restoredSeconds = restored?.secondsLeft;
  const [attemptId] = useState(() => restored?.attemptId || makeAttemptId());
  const [startedAt] = useState(() => Number(restored?.startedAt) || Date.now());
  const [answers, setAnswers] = useState(() => (Array.isArray(restored?.answers) ? restored.answers : []));
  const [bookmarks, setBookmarks] = useState(() => (Array.isArray(restored?.bookmarks) ? restored.bookmarks : []));
  const [index, setIndex] = useState(() => Math.max(0, Number(restored?.index) || 0));
  const [clock, setClock] = useState(() => (
    restoredSeconds === null || restoredSeconds === undefined || restoredSeconds === '' ? null : Number(restoredSeconds)
  ));
  const [questions, setQuestions] = useState([]);
  const [meta, setMeta] = useState({
    title: '',
    bank: 'P',
    negativeMarking: false,
    durationSec: 0,
    subject: '',
    retryTo: '/app',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const submitRef = useRef(() => {});
  const submittingRef = useRef(false);
  const submittedRef = useRef(false);

  const isCountdown = meta.durationSec > 0;
  const remaining = isCountdown ? Math.max(0, clock === null || !Number.isFinite(clock) ? meta.durationSec : clock) : 0;
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const displaySeconds = isCountdown ? remaining : elapsed;

  useEffect(() => {
    let active = true;

    async function prepare() {
      setLoading(true);
      setError('');
      try {
        if (!user?.uid) {
          setError('Your session is not ready. Please sign in again.');
          return;
        }
        if (mode === 'practice') {
          let pool = await loadPracticeChapter(decodedSubject, decodedChapter);
          const normalized = normalizeSubject(decodedSubject);
          if (!pool.length && normalized !== 'Other' && normalized !== decodedSubject) {
            pool = await loadPracticeChapter(normalized, decodedChapter);
          }
          const selected = selectPracticeQuestions(pool, decodedDifficulty);
          if (!selected.length) {
            setError('No questions are available for this chapter and difficulty.');
            return;
          }
          if (!active) return;
          setQuestions(selected);
          setMeta({
            title: practiceTitle(decodedChapter, decodedDifficulty),
            bank: 'P',
            negativeMarking: false,
            durationSec: 0,
            subject: normalized === 'Other' ? decodedSubject : normalized,
            retryTo: `/app/practice/${encodeURIComponent(decodedSubject)}/${encodeURIComponent(decodedChapter)}/${encodeURIComponent(decodedDifficulty)}`,
          });
          setAnswers((value) => fitArray(value, selected.length, null));
          setBookmarks((value) => fitArray(value, selected.length, false));
          setIndex((value) => Math.min(Math.max(0, value), selected.length - 1));
          return;
        }
        if (mode === 'test' && decodedBank === 'daily') {
          const stored = await getDailyChallenge(dateKey);
          const source = stored || await getAutoDailyChallenge(dateKey);
          if (!source?.question) {
            setError('Today’s challenge is not available yet.');
            return;
          }
          const item = {
            subject: 'Daily Challenge',
            chapter: 'Daily',
            topic: source.topic || 'Daily',
            question: source.question,
            options: Array.isArray(source.options) ? source.options : [],
            correctIndex: Number(source.correctIndex),
            explanation: source.explanation || '',
          };
          if (!active) return;
          setQuestions([item]);
          setMeta({
            title: `Daily Challenge · ${dateKey}`,
            bank: 'D',
            negativeMarking: false,
            durationSec: 0,
            subject: 'Daily Challenge',
            retryTo: `/app/test/daily/${encodeURIComponent('Daily Challenge')}`,
          });
          setAnswers([null]);
          setBookmarks([false]);
          setIndex(0);
          return;
        }
        if (mode === 'test') {
          const test = testById(decodedTitle);
          if (!test) {
            setError('We could not find that test.');
            return;
          }
          const loaded = await loadTestQuestions(test);
          if (!loaded.length) {
            setError('This test has no questions available.');
            return;
          }
          const durationSec = Number(test.durationSec) > 0
            ? Number(test.durationSec)
            : (Number(test.durationMinutes) || 0) * 60;
          if (!active) return;
          setQuestions(loaded);
          setMeta({
            title: test.title,
            bank: test.bank || (decodedBank === 'grand' ? 'G' : 'M'),
            negativeMarking: Boolean(test.negativeMarking),
            durationSec,
            subject: 'Mixed',
            retryTo: `/app/test/${encodeURIComponent(decodedBank)}/${encodeURIComponent(decodedTitle)}`,
          });
          if (durationSec > 0) {
            setClock((value) => (value === null || !Number.isFinite(value) ? durationSec : value));
          }
          setAnswers((value) => fitArray(value, loaded.length, null));
          setBookmarks((value) => fitArray(value, loaded.length, false));
          setIndex((value) => Math.min(Math.max(0, value), loaded.length - 1));
          return;
        }
        setError('Unknown quiz mode.');
      } catch (caught) {
        if (active) setError(errorMessage(caught, 'Could not load this quiz.'));
      } finally {
        if (active) setLoading(false);
      }
    }

    prepare();
    return () => { active = false; };
  }, [mode, decodedSubject, decodedChapter, decodedDifficulty, decodedBank, decodedTitle, dateKey, user?.uid, reloadToken]);

  useEffect(() => {
    if (loading || !questions.length) return undefined;
    const timer = setInterval(() => {
      if (submittedRef.current) return;
      setNow(Date.now());
      if (isCountdown) {
        setClock((value) => Math.max(0, (value === null || !Number.isFinite(value) ? meta.durationSec : value) - 1));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [loading, questions.length, isCountdown, meta.durationSec]);

  useEffect(() => {
    if (!storageKey || !questions.length || submittedRef.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        answers: fitArray(answers, questions.length, null),
        bookmarks: fitArray(bookmarks, questions.length, false),
        index,
        secondsLeft: isCountdown ? remaining : null,
        attemptId,
        startedAt,
      }));
    } catch {
      return;
    }
  }, [storageKey, questions.length, answers, bookmarks, index, remaining, isCountdown, attemptId, startedAt]);

  function chooseOption(optionIndex) {
    setAnswers((value) => {
      const next = [...fitArray(value, questions.length, null)];
      next[index] = optionIndex;
      return next;
    });
  }

  function toggleBookmark() {
    setBookmarks((value) => {
      const next = [...fitArray(value, questions.length, false)];
      next[index] = !next[index];
      return next;
    });
  }

  function goTo(nextIndex) {
    setIndex(Math.min(Math.max(0, nextIndex), Math.max(0, questions.length - 1)));
  }

  function openSubmit() {
    if (!submitting) setConfirmOpen(true);
  }

  async function handleSubmit() {
    if (submittingRef.current || submittedRef.current || !questions.length || !user?.uid) return;
    submittingRef.current = true;
    setSubmitting(true);
    setConfirmOpen(false);
    setError('');
    const activeAnswers = fitArray(answers, questions.length, null);
    const usedSeconds = isCountdown
      ? Math.max(0, meta.durationSec - remaining)
      : Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    try {
      const result = {
        ...scoreSubmission({
          questions,
          answers: activeAnswers,
          negativeMarking: meta.negativeMarking,
          bank: meta.bank,
          title: meta.title,
        }),
        timeSec: usedSeconds,
        startedAt,
        completedAt: Date.now(),
        subject: meta.subject,
        retryTo: meta.retryTo,
      };
      let saved;
      try {
        saved = await saveQuizAttempt({ uid: user.uid, profile, result, attemptId });
      } catch (caught) {
        if (!isPermissionDenied(caught)) throw caught;
        const existing = await getResultById(user.uid, attemptId);
        if (!existing) throw caught;
        saved = { duplicate: true, result: existing };
      }
      submittedRef.current = true;
      try {
        localStorage.removeItem(storageKey);
      } catch {
        submittedRef.current = true;
      }
      navigate(`/app/result/${user.uid}/${saved?.result?.attemptId || attemptId}`, { replace: true });
    } catch (caught) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(errorMessage(caught, 'Could not save your result. Please try again.'));
    }
  }

  submitRef.current = () => handleSubmit();

  useEffect(() => {
    if (!isCountdown || !questions.length || loading || submittedRef.current || displaySeconds > 0) return;
    submitRef.current();
  }, [isCountdown, questions.length, loading, displaySeconds]);

  if (loading) return <PageLoader label="Loading quiz" />;
  if (error || !questions.length) {
    return (
      <ErrorState
        title={error ? 'Quiz unavailable' : 'No questions found'}
        message={error || 'This quiz has no questions to display.'}
        onRetry={() => setReloadToken((value) => value + 1)}
      />
    );
  }

  const question = questions[index] || questions[0];
  const attemptedCount = answers.filter((value) => value !== null && value !== undefined).length;
  const skippedCount = questions.length - attemptedCount;
  const bookmarkCount = bookmarks.filter(Boolean).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400/80">Quiz in progress</p>
          <h1 className="mt-1 text-xl font-bold text-white">{meta.title}</h1>
          <p className="muted mt-1">{meta.bank} · {questions.length} questions</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`badge ${isCountdown && displaySeconds <= 30 ? 'border-rose-400/40 text-rose-200' : ''}`}>
            {isCountdown ? 'Time left' : 'Time'} {formatTime(displaySeconds)}
          </span>
          {meta.negativeMarking && <span className="badge border-amber-400/30 text-amber-200">Negative marking {NEGATIVE_MARK}</span>}
          <button type="button" className="btn-danger" onClick={openSubmit} disabled={submitting}>Submit quiz</button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="card animate-rise">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex flex-wrap gap-2">
              <span className="badge">{question.subject || 'General'}</span>
              <span className="badge">{question.topic || question.chapter || 'General'}</span>
              <span className="badge">Question {index + 1} of {questions.length}</span>
              {bookmarks[index] && <span className="badge border-amber-400/30 text-amber-200">Marked for review</span>}
            </div>
            <button
              type="button"
              className={`btn-ghost px-3 py-2 ${bookmarks[index] ? 'border-amber-400/40 text-amber-200' : ''}`}
              onClick={toggleBookmark}
            >
              {bookmarks[index] ? 'Remove bookmark' : 'Mark for review'}
            </button>
          </div>

          <h2 className="mt-5 whitespace-pre-line text-lg font-semibold leading-relaxed text-white">{question.question}</h2>

          <div className="mt-5 space-y-3">
            {(question.options || []).map((option, optionIndex) => (
              <label
                key={optionIndex}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                  answers[index] === optionIndex ? 'border-blue-400/60 bg-blue-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <input
                  type="radio"
                  name={`question-${index}`}
                  className="mt-1 accent-blue-400"
                  checked={answers[index] === optionIndex}
                  onChange={() => chooseOption(optionIndex)}
                />
                <span className="text-sm leading-relaxed text-slate-100">
                  <span className="mr-2 font-semibold text-cyan-300">{String.fromCharCode(65 + optionIndex)}.</span>
                  {option}
                </span>
              </label>
            ))}
          </div>

          {error && <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <button type="button" className="btn-ghost" onClick={() => goTo(index - 1)} disabled={index === 0}>Previous</button>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" onClick={() => goTo(index + 1)} disabled={index >= questions.length - 1}>Next</button>
              <button type="button" className="btn-primary" onClick={() => goTo(index + 1)} disabled={index >= questions.length - 1}>Save & Next</button>
            </div>
          </div>
        </section>

        <aside className="card h-fit lg:sticky lg:top-4">
          <h3 className="text-sm font-semibold text-white">Question palette</h3>
          <p className="muted mt-1">{attemptedCount} answered · {skippedCount} skipped · {bookmarkCount} bookmarked</p>
          <div className="mt-4 grid grid-cols-8 gap-2 sm:grid-cols-10 lg:grid-cols-6">
            {questions.map((_, questionIndex) => {
              const answered = answers[questionIndex] !== null && answers[questionIndex] !== undefined;
              const bookmarked = Boolean(bookmarks[questionIndex]);
              let classes = 'h-9 w-9 rounded-lg border text-xs font-semibold transition';
              if (questionIndex === index) classes += ' border-cyan-300 bg-cyan-500/25 text-white ring-2 ring-cyan-400/40';
              else if (bookmarked) classes += ' border-amber-300/60 bg-amber-400/15 text-amber-100';
              else if (answered) classes += ' border-emerald-400/50 bg-emerald-500/20 text-emerald-100';
              else classes += ' border-white/10 bg-white/5 text-slate-400 hover:bg-white/10';
              return (
                <button
                  type="button"
                  key={questionIndex}
                  className={classes}
                  onClick={() => goTo(questionIndex)}
                  aria-label={`Question ${questionIndex + 1}${answered ? ', answered' : ''}${bookmarked ? ', bookmarked' : ''}`}
                >
                  {questionIndex + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-5 space-y-2 border-t border-white/10 pt-4 text-xs text-slate-400">
            <p className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-cyan-300 bg-cyan-500/25" /> Current question</p>
            <p className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-emerald-400/50 bg-emerald-500/20" /> Answered</p>
            <p className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-amber-300/60 bg-amber-400/15" /> Bookmarked</p>
            <p className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-white/10 bg-white/5" /> Not visited</p>
          </div>
          <button type="button" className="btn-danger mt-5 w-full" onClick={openSubmit} disabled={submitting}>Submit quiz</button>
        </aside>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
          onClick={(event) => { if (event.target === event.currentTarget) setConfirmOpen(false); }}
        >
          <div className="card w-full max-w-md animate-rise" role="dialog" aria-modal="true" aria-labelledby="submit-title">
            <h2 id="submit-title" className="text-lg font-bold text-white">Submit this quiz?</h2>
            <p className="muted mt-2">Review your progress before you finish.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                <span className="block text-xs text-emerald-200/80">Attempted</span>
                <strong className="text-lg text-white">{attemptedCount}</strong>
              </div>
              <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3">
                <span className="block text-xs text-rose-200/80">Skipped</span>
                <strong className="text-lg text-white">{skippedCount}</strong>
              </div>
            </div>
            {meta.negativeMarking && <p className="mt-3 text-xs text-amber-200">Each wrong answer carries a {NEGATIVE_MARK} mark penalty.</p>}
            <div className="mt-6 flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setConfirmOpen(false)}>Keep working</button>
              <button type="button" className="btn-danger flex-1" onClick={() => handleSubmit()} disabled={submitting}>
                {submitting ? <><Spinner /> Submitting…</> : 'Submit now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
