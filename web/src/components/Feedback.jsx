export function Spinner({ className = 'h-5 w-5' }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-white/20 border-t-blue-400 ${className}`} aria-hidden="true" />;
}

export function PageLoader({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <Spinner className="h-8 w-8" />
        <p className="text-sm">{label}…</p>
      </div>
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div className="card mx-auto max-w-lg text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/15 text-xl text-rose-300">!</div>
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <p className="muted mt-2 whitespace-pre-line">{message || 'Please try again in a moment.'}</p>
      {onRetry && <button type="button" className="btn-ghost mt-5" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', message, action }) {
  return (
    <div className="card text-center">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="muted mt-1">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
