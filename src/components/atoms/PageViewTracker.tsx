import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '@/lib/track.ts';

/**
 * Records one anonymous page view per storefront navigation.
 *
 * Mounted at the app root rather than inside MainLayout so it also covers the
 * auth and account routes, which use their own layouts. Admin routes are
 * filtered out inside `trackPageView` — staff clicking around the dashboard is
 * not website traffic.
 */
export function PageViewTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
