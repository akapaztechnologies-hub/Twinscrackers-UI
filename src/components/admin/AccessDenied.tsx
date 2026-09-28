import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

interface AccessDeniedProps {
  title?: string;
  description?: string;
  /** Where the "way out" button goes. Staff bounce back into the portal. */
  actionHref?: string;
  actionLabel?: string;
}

/**
 * Shared refusal screen for both admin guards, so being turned away at the
 * portal door and being turned away at a screen look like the same product.
 */
export function AccessDenied({
  title = 'Access Denied',
  description = "You don't have admin privileges to access this area. Contact the store administrator if you believe this is an error.",
  actionHref = '/',
  actionLabel = 'Go to Homepage',
}: AccessDeniedProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950 px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={32} className="text-red-500" />
        </div>
        <h1 className="font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">
          {title}
        </h1>
        <p className="text-body-sm text-surface-500 mt-2 mb-6">{description}</p>
        <Link
          to={actionHref}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 transition-colors"
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
