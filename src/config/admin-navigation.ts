import type { ScreenKey } from './admin-screens.ts';

/**
 * The admin sidebar.
 *
 * Grouped by the job being done, not by what the code calls things. The whole
 * menu used to be one "Commerce" heading holding thirteen of the twenty-five
 * entries — half the sidebar under a word that separated nothing, so the only
 * way to find a screen was to read every line. The groups below are small
 * enough to scan, and each answers a different question: am I serving someone
 * at the counter, working through web orders, editing what we sell, chasing
 * money, or changing how the shop itself works.
 *
 * The heading order is the order these items appear in, and the backend mirrors
 * these groups in `rbac/screens.ts` so the role editor reads the same way.
 */

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  group: AdminNavGroup;
  /** The permission that reveals this item. The sidebar renders nothing without it. */
  screen: ScreenKey;
  end?: boolean;
  badge?: 'pending-orders' | 'low-stock';
}

export type AdminNavGroup =
  | 'main'
  | 'counter'
  | 'orders'
  | 'catalogue'
  | 'marketing'
  | 'finance'
  | 'reports'
  | 'people'
  | 'manage'
  | 'access';

export const adminNavGroups: Record<string, string> = {
  main: 'Main',
  counter: 'Counter Sales',
  orders: 'Online Orders',
  catalogue: 'Catalogue',
  marketing: 'Marketing',
  finance: 'Finance',
  reports: 'Reports',
  people: 'Customers',
  manage: 'Store Settings',
  access: 'Access Control',
};

export const adminNavItems: AdminNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/admin', icon: 'LayoutDashboard', screen: 'dashboard', group: 'main', end: true },

  // Serving someone standing in the shop: ring it up, and the paperwork that
  // comes out of it.
  { id: 'billing', label: 'Billing', href: '/admin/billing', icon: 'Receipt', screen: 'billing', group: 'counter', end: true },
  { id: 'bills', label: 'Bills', href: '/admin/bills', icon: 'FileText', screen: 'bills', group: 'counter' },
  { id: 'quotations', label: 'Quotations', href: '/admin/quotations', icon: 'ScrollText', screen: 'quotations', group: 'counter' },

  // The factory is a separate firm billing its own traders: its products carry
  // no stock and its invoice run is its own, so neither touches the shop above.
  { id: 'factory-bill', label: 'Factory Billing', href: '/admin/factory', icon: 'Factory', screen: 'factory-bills', group: 'counter', end: true },
  { id: 'factory-bills', label: 'Factory Bills', href: '/admin/factory/bills', icon: 'FileText', screen: 'factory-bills', group: 'counter' },
  { id: 'factory-products', label: 'Factory Products', href: '/admin/factory/products', icon: 'Boxes', screen: 'factory-products', group: 'counter' },

  // Everything that arrives from the website, in the order it is dealt with:
  // the order comes in, the payment is checked, then it is packed and sent.
  { id: 'orders', label: 'Orders', href: '/admin/orders', icon: 'Package', screen: 'orders', group: 'orders', badge: 'pending-orders' },
  { id: 'payment-verification', label: 'Payment Verification', href: '/admin/payment-verification', icon: 'ShieldCheck', screen: 'payment-verification', group: 'orders' },
  { id: 'bulk-orders', label: 'Bulk Orders', href: '/admin/bulk-orders', icon: 'PackageSearch', screen: 'bulk-orders', group: 'orders' },
  { id: 'delivery-points', label: 'Delivery Points', href: '/admin/delivery-points', icon: 'MapPin', screen: 'delivery-points', group: 'orders' },

  // What the shop sells, and what it has left.
  { id: 'products', label: 'Products', href: '/admin/products', icon: 'ShoppingBag', screen: 'products', group: 'catalogue', badge: 'low-stock' },
  { id: 'combos', label: 'Combos', href: '/admin/combos', icon: 'Gift', screen: 'combos', group: 'catalogue' },
  { id: 'categories', label: 'Categories', href: '/admin/categories', icon: 'Layers', screen: 'categories', group: 'catalogue' },
  { id: 'inventory', label: 'Inventory', href: '/admin/inventory', icon: 'Boxes', screen: 'inventory', group: 'catalogue', badge: 'low-stock' },
  { id: 'reviews', label: 'Reviews', href: '/admin/reviews', icon: 'Star', screen: 'reviews', group: 'catalogue' },
  { id: 'price-list', label: 'Price List', href: '/admin/price-list', icon: 'FileDown', screen: 'price-list', group: 'catalogue' },

  // Ways of bringing people in. Coupons sit with influencers because that is
  // who most of the codes are cut for.
  { id: 'coupons', label: 'Coupons', href: '/admin/coupons', icon: 'Ticket', screen: 'coupons', group: 'marketing' },
  { id: 'influencers', label: 'Influencers', href: '/admin/influencers', icon: 'Megaphone', screen: 'influencers', group: 'marketing' },
  { id: 'newsletter', label: 'Newsletter', href: '/admin/newsletter', icon: 'Mail', screen: 'newsletter', group: 'marketing' },

  // Money out and money owed.
  { id: 'suppliers', label: 'Suppliers', href: '/admin/suppliers', icon: 'Factory', screen: 'suppliers', group: 'finance' },
  { id: 'expenses', label: 'Expenses', href: '/admin/expenses', icon: 'Wallet', screen: 'expenses', group: 'finance' },
  // Money owed TO the shop, read the same way as Expenses — a total, and who
  // it is with.
  { id: 'credit', label: 'Credit', href: '/admin/credit', icon: 'HandCoins', screen: 'customers', group: 'finance' },

  { id: 'analytics', label: 'Analytics', href: '/admin/analytics', icon: 'BarChart3', screen: 'analytics', group: 'reports' },
  { id: 'monthly-report', label: 'Monthly Report', href: '/admin/reports/monthly', icon: 'CalendarRange', screen: 'monthly-report', group: 'reports' },

  { id: 'customers', label: 'Customers', href: '/admin/customers', icon: 'Contact', screen: 'customers', group: 'people' },
  { id: 'contact-messages', label: 'Contact Messages', href: '/admin/contact-messages', icon: 'MessageSquare', screen: 'contact-messages', group: 'people' },

  { id: 'content', label: 'Content', href: '/admin/content', icon: 'FileImage', screen: 'content', group: 'manage' },
  { id: 'settings', label: 'Settings', href: '/admin/settings', icon: 'Settings', screen: 'settings', group: 'manage' },

  { id: 'employees', label: 'Employees', href: '/admin/employees', icon: 'UserCog', screen: 'employees', group: 'access' },
  { id: 'roles', label: 'Roles & Access', href: '/admin/roles', icon: 'ShieldHalf', screen: 'roles', group: 'access' },
];
