import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { isChunkLoadError, reloadOnceForNewBuild } from '@/lib/chunkReload.ts';

interface BoundaryProps {
  children: ReactNode;
  /** When this changes the boundary clears, so navigating away from a broken page recovers. */
  resetKey?: string;
  /** Where the fallback's "go back" link points. */
  homeHref?: string;
}

interface BoundaryState {
  error: Error | null;
}

/**
 * The last line between a thrown render error and a blank white page.
 *
 * Without one, any error while rendering — a malformed record, a chunk that
 * vanished in a deploy — unmounts the whole app. A stale chunk starts one
 * guarded reload onto the new build and says so meanwhile; if that reload is
 * stopped (the billing screen asks before leaving with a bill open), the same
 * message stays with a Reload button for when the work is saved. Anything else
 * gets a plain message and a way out instead of an empty screen.
 */
export class AppErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isChunkLoadError(error)) {
      // Once only (guarded), and possibly already started by main.tsx.
      reloadOnceForNewBuild();
      return;
    }
    console.error('[ui] render error', error, info.componentStack);
  }

  componentDidUpdate(prev: BoundaryProps): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkLoadError(error);
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <h1 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
            {stale ? 'A new version is available' : 'Something went wrong on this page'}
          </h1>
          <p className="mt-3 text-body-md text-surface-500 dark:text-surface-400">
            {stale
              ? 'The site was updated while this page was open. Save your work, then reload to continue.'
              : 'Please reload and try again. If it keeps happening, let us know what you were doing.'}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-brand-500 text-brand-on font-semibold hover:bg-brand-600 transition-colors"
            >
              Reload
            </button>
            <a
              href={this.props.homeHref ?? '/'}
              className="px-5 py-2.5 rounded-xl border border-surface-300 dark:border-surface-700 text-surface-700 dark:text-surface-200 font-semibold hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            >
              Go back
            </a>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * A boundary around one route's content, inside its layout: a broken page keeps
 * the header, sidebar and navigation around it, and clears on navigation.
 */
export function RouteErrorBoundary({ children, homeHref }: { children: ReactNode; homeHref?: string }) {
  const { pathname } = useLocation();
  return (
    <AppErrorBoundary resetKey={pathname} homeHref={homeHref}>
      {children}
    </AppErrorBoundary>
  );
}
