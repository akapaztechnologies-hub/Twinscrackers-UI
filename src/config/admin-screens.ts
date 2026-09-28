/**
 * The Admin Portal screens a role can be granted, mirroring
 * `src/modules/rbac/screens.ts` in the backend. Keys must match exactly — the
 * backend is the authority, this copy only lets the UI decide what to render
 * before a request is made.
 *
 * The second half of this file maps a URL to the screen that owns it, so route
 * guarding is one lookup instead of a permission prop on all 35 admin routes.
 */

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export interface RolePermission {
  screen: string;
  actions: PermissionAction[];
}

export const SCREEN_KEYS = [
  'dashboard',
  'billing',
  'bills',
  'quotations',
  'factory-bills',
  'factory-products',
  'delivery-points',
  'orders',
  'payment-verification',
  'bulk-orders',
  'contact-messages',
  'products',
  'combos',
  'categories',
  'inventory',
  'reviews',
  'price-list',
  'coupons',
  'influencers',
  'newsletter',
  'suppliers',
  'expenses',
  'monthly-report',
  'customers',
  'analytics',
  'content',
  'settings',
  'employees',
  'roles',
] as const;

export type ScreenKey = (typeof SCREEN_KEYS)[number];

/**
 * URL prefix -> the screen that owns it.
 *
 * Detail and form routes inherit their parent, so granting "Orders" also grants
 * `/admin/orders/:orderId`. Matching is longest-prefix-first, which is what lets
 * `/admin/analytics/products` resolve to Analytics rather than colliding with
 * `/admin/products`, and `/admin/reports/monthly` reach the Monthly Report.
 */
const ROUTE_SCREENS: { prefix: string; screen: ScreenKey }[] = [
  { prefix: '/admin/analytics/products', screen: 'analytics' },
  { prefix: '/admin/reports/monthly', screen: 'monthly-report' },
  { prefix: '/admin/payment-verification', screen: 'payment-verification' },
  { prefix: '/admin/contact-messages', screen: 'contact-messages' },
  { prefix: '/admin/bulk-orders', screen: 'bulk-orders' },
  { prefix: '/admin/delivery-points', screen: 'delivery-points' },
  { prefix: '/admin/quotations', screen: 'quotations' },
  { prefix: '/admin/influencers', screen: 'influencers' },
  { prefix: '/admin/newsletter', screen: 'newsletter' },
  { prefix: '/admin/categories', screen: 'categories' },
  { prefix: '/admin/price-list', screen: 'price-list' },
  { prefix: '/admin/inventory', screen: 'inventory' },
  { prefix: '/admin/reviews', screen: 'reviews' },
  { prefix: '/admin/suppliers', screen: 'suppliers' },
  { prefix: '/admin/credit', screen: 'customers' },
  { prefix: '/admin/customers', screen: 'customers' },
  { prefix: '/admin/employees', screen: 'employees' },
  { prefix: '/admin/analytics', screen: 'analytics' },
  { prefix: '/admin/expenses', screen: 'expenses' },
  { prefix: '/admin/products', screen: 'products' },
  { prefix: '/admin/settings', screen: 'settings' },
  { prefix: '/admin/factory/products', screen: 'factory-products' },
  { prefix: '/admin/factory', screen: 'factory-bills' },
  { prefix: '/admin/billing', screen: 'billing' },
  { prefix: '/admin/coupons', screen: 'coupons' },
  { prefix: '/admin/content', screen: 'content' },
  { prefix: '/admin/combos', screen: 'combos' },
  { prefix: '/admin/orders', screen: 'orders' },
  { prefix: '/admin/bills', screen: 'bills' },
  { prefix: '/admin/roles', screen: 'roles' },
];

/**
 * Paths every signed-in staff member may open regardless of their role. Their
 * own profile is not somebody else's data, and `/admin/users*` only ever
 * redirects into Customers, which is guarded on arrival.
 */
const ALWAYS_ALLOWED = ['/admin/profile', '/admin/users'];

/**
 * The screen that owns `pathname`, or `null` when the path is unguarded.
 * Unknown admin paths return `null` and are allowed through — a mistyped URL
 * should land on the app's own not-found handling, not on "Access Denied".
 */
export function screenForPath(pathname: string): ScreenKey | null {
  const path = pathname.replace(/\/+$/, '') || '/admin';

  if (ALWAYS_ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  // The dashboard is the only exact-match route; everything else is a prefix.
  if (path === '/admin') return 'dashboard';

  const match = ROUTE_SCREENS.filter(
    ({ prefix }) => path === prefix || path.startsWith(`${prefix}/`),
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return match ? match.screen : null;
}
