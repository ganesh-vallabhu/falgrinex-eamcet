import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EmptyState, ErrorState, PageLoader } from '../components/Feedback.jsx';
import { DIFFICULTIES, SUBJECTS } from '../config/constants.js';
import { errorMessage } from '../lib/errors.js';
import { chapterCountForSubject, chapterStatsFor, loadCatalog, subjectQuestionCount } from '../lib/questionBank.js';

export default function Subjects() {
  const { loading: authLoading, profile } = useAuth();
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    loadCatalog()
      .then((data) => { if (active) setCatalog(data); })
      .catch((caught) => { if (active) setError(errorMessage(caught, 'Could not load the chapter catalog.')); });
    return () => { active = false; };
  }, [reload]);

  const practiceMap = useMemo(() => {
    const map = new Map();
    for (const entry of catalog?.practice || []) map.set(entry.key || `${entry.subject}::${entry.chapter}`, entry);
    return map;
  }, [catalog]);

  if (authLoading || (!catalog && !error)) return <PageLoader label="Loading subjects" />;
  if (error) return <ErrorState title="Subjects unavailable" message={error} onRetry={() => setReload((value) => value + 1)} />;

  const term = query.trim().toLowerCase();
  const sections = SUBJECTS.map((subject) => {
    const years = (catalog.subjects?.[subject] || []).map((year) => ({
      year,
      chapters: (catalog.chapterOrder?.[subject]?.[year] || []).filter((chapter) => !term || String(chapter).toLowerCase().includes(term)),
    })).filter((group) => group.chapters.length > 0);
    return { subject, years };
  }).filter((section) => section.years.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <p className="badge border-violet-400/25 text-violet-300">Chapter library</p>
        <h2 className="page-title mt-3">Pick a subject and start practising</h2>
        <p className="muted mt-2">Every chapter is split into Easy, Medium and Hard sets. Your best score per level is saved automatically.</p>
        <div className="mt-5 max-w-md">
          <label className="label" htmlFor="chapter-search">Filter chapters</label>
          <input
            id="chapter-search"
            className="field"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by chapter name"
          />
        </div>
      </section>

      {sections.length === 0 ? (
        <EmptyState
          title="No chapters found"
          message={`Nothing matches “${query.trim()}”. Try a different chapter name.`}
          action={<button type="button" className="btn-ghost" onClick={() => setQuery('')}>Clear filter</button>}
        />
      ) : (
        sections.map((section) => (
          <section key={section.subject} className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">{section.subject}</h3>
                <p className="muted mt-1 text-xs">Grouped by year and paper as in the syllabus.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="badge border-violet-400/25 bg-violet-500/10 text-violet-300">{chapterCountForSubject(section.subject)} chapters</span>
                <span className="badge border-cyan-400/25 bg-cyan-500/10 text-cyan-300">{subjectQuestionCount(section.subject).toLocaleString('en-IN')} questions</span>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-6">
              {section.years.map((group) => (
                <div key={group.year}>
                  <div className="mb-3 flex items-center gap-3">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-300">{group.year}</h4>
                    <span className="h-px flex-1 bg-white/10" />
                    <span className="muted text-xs">{group.chapters.length} chapters</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {group.chapters.map((chapter) => {
                      const entry = practiceMap.get(`${section.subject}::${chapter}`);
                      const count = Number(entry?.count || 0);
                      return (
                        <div key={chapter} className="flex flex-col gap-3 rounded-xl border border-white/5 bg-slate-950/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">{chapter}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="badge">{count} questions</span>
                              {DIFFICULTIES.map((difficulty) => {
                                const stats = chapterStatsFor(profile, chapter, difficulty);
                                if (stats.best === null || stats.best === undefined) return null;
                                return (
                                  <span key={difficulty} className="badge border-emerald-400/25 bg-emerald-500/10 text-emerald-300" title={`${stats.attempts} attempt(s) · ${stats.accuracy ?? 0}% accuracy`}>
                                    {difficulty} {stats.best}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            {DIFFICULTIES.map((difficulty) => (
                              <Link
                                key={difficulty}
                                to={`/app/practice/${encodeURIComponent(section.subject)}/${encodeURIComponent(chapter)}/${encodeURIComponent(difficulty)}`}
                                className="btn-ghost px-3 py-1.5 text-xs"
                              >
                                {difficulty}
                              </Link>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
