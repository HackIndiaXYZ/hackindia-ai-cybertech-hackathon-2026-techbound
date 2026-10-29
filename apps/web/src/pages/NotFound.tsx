import { Link } from 'react-router-dom';
import { Button } from '../components/ui/index.js';

/** Accessible 404 page with a clear recovery path (§29 Error). */
export function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <p className="text-6xl font-bold text-clay-primary" aria-hidden="true">
        404
      </p>
      <h1 className="text-2xl font-semibold text-clay-ink">Page not found</h1>
      <p className="text-clay-muted">The page you were looking for doesn&apos;t exist or may have moved.</p>
      <Link to="/">
        <Button>Go to home</Button>
      </Link>
    </div>
  );
}
