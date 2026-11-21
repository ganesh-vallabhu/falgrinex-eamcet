import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, PageLoader, Spinner } from '../components/Feedback.jsx';
import { errorMessage } from '../lib/errors.js';
import { listResources, subscribeAnnouncements } from '../lib/repository.js';

function safeLink(link) {
  try {
    const url = new URL(String(link || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function formatWhen(value) {
  if (!value) return '';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function Resources() {
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementError, setAnnouncementError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listResources()
      .then((page) => {
        if (!active) return;
        setRows(Array.isArray(page.rows) ? page.rows : []);
        setCursor(page.cursor || null);
        setHasMore(Boolean(page.hasMore));
      })
      .catch((caught) => { if (active) setError(errorMessage(caught, 'Could not load resources.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => subscribeAnnouncements(
    (data) => setAnnouncements(Array.isArray(data) ? data : []),
    () => setAnnouncementError('Announcements are unavailable right now.'),
  ), []);

  async function handleLoadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await listResources({ cursor });
      setRows((previous) => [...previous, ...(Array.isArray(page.rows) ? page.rows : [])]);
      setCursor(page.cursor || null);
      setHasMore(Boolean(page.hasMore));
    } catch (caught) {
      setError(errorMessage(caught, 'Could not load more resources.'));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <p className="badge border-emerald-400/25 text-emerald-300">Study material</p>
        <h2 className="page-title mt-3">Resources &amp; updates</h2>
        <p className="muted mt-2">Helpful links from your mentors, along with the latest announcements.</p>
      </section>

      <section className="card">
        <h3 className="text-base font-bold text-white">Announcements</h3>
        {announcementError ? (
          <p className="muted mt-3">{announcementError}</p>
        ) : announcements.length === 0 ? (
          <p className="muted mt-3">No announcements at the moment.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {announcements.map((item) => (
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
      </section>

      <section>
        <h3 className="mb-3 text-base font-bold text-white">All resources</h3>
        {loading ? (
          <PageLoader label="Loading resources" />
        ) : error && rows.length === 0 ? (
          <ErrorState title="Resources unavailable" message={error} onRetry={() => setReload((value) => value + 1)} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No resources yet"
            message="Your mentors have not shared any links yet."
            action={<Link to="/app/subjects" className="btn-primary">Explore subjects</Link>}
          />
        ) : (
          <>
            {error && <p className="card mb-3 text-xs text-amber-300">{error}</p>}
            <ul className="grid gap-3 sm:grid-cols-2">
              {rows.map((item) => {
                const href = safeLink(item.link);
                return (
                  <li key={item.id} className="card flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{item.title || 'Untitled resource'}</p>
                      <p className="muted mt-1 text-xs">{formatWhen(item.createdAt) || 'Shared resource'}</p>
                    </div>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="btn-ghost shrink-0 px-3 py-1.5 text-xs">Open ↗</a>
                    ) : (
                      <span className="badge shrink-0">Link unavailable</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 flex justify-center">
              {hasMore ? (
                <button type="button" className="btn-ghost" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? <><Spinner className="h-4 w-4" /> Loading…</> : 'Load more'}
                </button>
              ) : (
                <p className="muted text-xs">You’ve reached the end of the list.</p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
