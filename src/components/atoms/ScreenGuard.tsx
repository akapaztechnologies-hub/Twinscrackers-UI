import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { adminNavItems } from '@/config/admin-navigation.ts';
import { screenForPath } from '@/config/admin-screens.ts';
import { useAuthStore, useCan } from '@/store/auth.ts';
import { AccessDenied } from '@/components/admin/AccessDenied.tsx';

/**
 * Per-screen route guard for the whole admin subtree.
 *
 * It sits as a layout route between `AdminRoute` and `AdminLayout` and resolves
 * the current URL to a screen key, so all 35 admin routes stay exactly as they
 * are — one place to reason about instead of a permission prop on each. Detail
 * and form routes inherit their parent screen through prefix matching.
 *
 * This is convenience, not enforcement. Every request the page then makes is
 * re-checked by the backend, so a stale permission here shows a 403, never data.
 */
export function ScreenGuard() {
  const location = useLocation();
  const can = useCan();
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin);
  const permissions = useAuthStore((s) => s.permissions);

  const screen = screenForPath(location.pathname);

  // Unguarded path (own profile, a redirect stub, or an unknown URL that should
  // fall through to the app's own not-found handling).
  if (!screen) return <Outlet />;

  if (can(screen)) return <Outlet />;

  /*
   * The dashboard is the portal's landing page, so an employee without it would
   * be met by "Access Denied" the moment they signed in. Send them to the first
   * screen they *can* open instead, in sidebar order so it matches what they see.
   */
  if (screen === 'dashboard' && !isSuperAdmin) {
    const firstAllowed = adminNavItems.find(
      (item) => item.href !== '/admin' && (permissions[item.screen]?.length ?? 0) > 0,
    );
    if (firstAllowed) return <Navigate to={firstAllowed.href} replace />;
  }

  return (
    <AccessDenied
      title="Screen not available"
      description="Your role doesn't include this screen. Ask an administrator if you need access to it."
      actionHref="/admin"
      actionLabel="Back to Admin"
    />
  );
}
