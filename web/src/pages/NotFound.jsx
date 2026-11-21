import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="card w-full max-w-md animate-rise text-center">
        <p className="text-5xl font-extrabold tracking-tight text-white/10">404</p>
        <h1 className="page-title mt-2 text-xl sm:text-2xl">Page not found</h1>
        <p className="muted mt-3">That page does not exist or has moved. Let's get you back to your practice.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to="/app" className="btn-primary">Back to dashboard</Link>
          <Link to="/" className="btn-ghost">Go home</Link>
        </div>
      </div>
    </div>
  );
}
