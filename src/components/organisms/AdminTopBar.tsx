import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeft, ChevronRight, Search, Bell, X, IndianRupee, ShoppingCart, Users, Clock, AlertTriangle, Package } from 'lucide-react';
import { useAdminStore } from '@/store/admin.ts';
import { useAuthStore, useCan } from '@/store/auth.ts';
import { adminNavItems } from '@/config/admin-navigation.ts';
import { ThemeToggle } from '@/components/atoms/ThemeToggle.tsx';
import { Avatar } from '@/components/atoms/Avatar.tsx';
import { cn } from '@/lib/utils.ts';

function getBreadcrumb(pathname: string): string {
  const item = adminNavItems.find((n) =>
    n.end ? pathname === n.href : pathname.startsWith(n.href) && n.href !== '/admin',
  );
  if (pathname === '/admin') return 'Dashboard';
  if (pathname === '/admin/profile') return 'Profile';
  if (pathname === '/admin/billing') return 'Billing';
  if (pathname === '/admin/bills') return 'Bills';
  if (item) return item.label;
  if (pathname.includes('/products/new')) return 'New Product';
  if (pathname.includes('/products/') && pathname.includes('/edit')) return 'Edit Product';
  if (pathname.includes('/categories/new')) return 'New Category';
  if (pathname.includes('/categories/') && pathname.includes('/edit')) return 'Edit Category';
  if (pathname === '/admin/analytics/products') return 'Products Analytics';
  if (pathname.includes('/orders/')) return 'Order Details';
  if (pathname.includes('/users/') && pathname.includes('/edit')) return 'Edit User';
  if (pathname.includes('/users/')) return 'User Details';
  return 'Admin';
}

interface QuickStat {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}

export function AdminTopBar() {
  const sidebarPinned = useAdminStore((s) => s.sidebarPinned);
  const toggleSidebarPinned = useAdminStore((s) => s.toggleSidebarPinned);
  const setMobileSidebarOpen = useAdminStore((s) => s.setMobileSidebarOpen);
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const breadcrumb = getBreadcrumb(pathname);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickStats, setQuickStats] = useState<QuickStat[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; icon: React.ElementType; iconColor: string; iconBg: string; title: string; description: string; href: string; }[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  /** Guards the refetch below against firing twice for one return to the tab. */
  const lastStatsLoad = useRef(0);

  /**
   * Revenue, order count and the stock warnings behind the bell.
   *
   * Reloaded as the admin moves around, not once when the shell mounts. This
   * bar outlives every route change, so a count read at login was still on
   * screen hours later: stock corrected on the Inventory sheet, then Billing
   * opened, and the bell still said three products were low. Nothing was wrong
   * with the save — the bar had simply never asked again.
   *
   * The throttle guards the focus listener, which fires on any click back into
   * the window. Opening a screen is not throttled: correcting stock and going
   * straight to Billing is the exact sequence that has to show new figures, and
   * it happens well inside any sensible interval.
   */
  const loadStats = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastStatsLoad.current < 15_000) return;
    lastStatsLoad.current = now;
    {
      try {
        const { getDashboardStats, getProductStats } = await import('@/services/admin.ts');
        const [stats, prodStats] = await Promise.all([
          getDashboardStats(),
          getProductStats(),
        ]);
        setQuickStats([
          {
            label: 'Revenue',
            value: `₹${stats.totalRevenue >= 1000 ? `${(stats.totalRevenue / 1000).toFixed(1)}k` : stats.totalRevenue}`,
            icon: IndianRupee,
            color: 'text-green-500',
          },
          {
            label: 'Orders',
            value: String(stats.totalOrders),
            icon: ShoppingCart,
            color: 'text-blue-500',
          },
          {
            label: 'Users',
            value: String(stats.totalCustomers),
            icon: Users,
            color: 'text-purple-500',
          },
        ]);

        // Build notification items from server-side counts (not page-sized lists).
        const items: typeof notifications = [];
        const pending = stats.statusBreakdown?.pending ?? 0;
        if (pending > 0) {
          items.push({
            id: 'pending-orders',
            icon: Clock,
            iconColor: 'text-amber-600',
            iconBg: 'bg-amber-500/20',
            title: `${pending} Pending Order${pending > 1 ? 's' : ''}`,
            description: 'Review and confirm these orders',
            href: '/admin/orders',
          });
        }
        if (prodStats.lowStock > 0) {
          items.push({
            id: 'low-stock',
            icon: AlertTriangle,
            iconColor: 'text-red-600',
            iconBg: 'bg-red-500/20',
            title: `${prodStats.lowStock} Product${prodStats.lowStock > 1 ? 's' : ''} Low on Stock`,
            description: 'Check inventory and restock',
            href: '/admin/products',
          });
        }
        if (prodStats.outOfStock > 0) {
          items.push({
            id: 'out-of-stock',
            icon: Package,
            iconColor: 'text-red-600',
            iconBg: 'bg-red-500/20',
            title: `${prodStats.outOfStock} Product${prodStats.outOfStock > 1 ? 's' : ''} Out of Stock`,
            description: 'These products are unavailable',
            href: '/admin/products',
          });
        }
        setNotifications(items);
      } catch { /* ignore */ }
    }
  }, []);

  /*
   * Reload as the admin moves around — but not on every single step.
   *
   * Forced only when leaving a screen that can have changed the numbers, which
   * is the case this exists for: correct stock on the Inventory sheet, open
   * Billing, see the new figures. Every other navigation takes the throttle, so
   * clicking through six screens is one refresh and not six. Two aggregate
   * queries per click adds up fast on a shop where four people are working.
   */
  const previousPath = useRef(pathname);
  useEffect(() => {
    const cameFrom = previousPath.current;
    previousPath.current = pathname;
    const changedStock = /\/admin\/(inventory|products|combos)/.test(cameFrom);
    void loadStats(changedStock);
  }, [loadStats, pathname]);

  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState !== 'visible') return;
      void loadStats();
    };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, [loadStats]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    if (profileOpen || notifOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [profileOpen, notifOpen]);

  // Focus search input on open
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Quick search navigation
  // Filtered by permission as well as by text — an unreachable result would
  // otherwise tell an employee which screens exist and then refuse them.
  const searchResults = searchQuery
    ? adminNavItems.filter(
        (item) =>
          can(item.screen) && item.label.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : [];

  const handleSearchSelect = (href: string) => {
    navigate(href);
    setSearchOpen(false);
    setSearchQuery('');
  };

  return (
    <header className="h-14 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 flex items-center px-4 gap-3 flex-shrink-0">
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="lg:hidden p-2 rounded-xl text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Desktop sidebar pin toggle — pinned = open & static, unpinned = hover-to-expand rail */}
      <button
        onClick={toggleSidebarPinned}
        title={sidebarPinned ? 'Unpin sidebar (hover to expand)' : 'Pin sidebar open'}
        aria-label={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
        aria-pressed={sidebarPinned}
        className="hidden lg:flex p-2 rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
      >
        {sidebarPinned ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-body-sm">
        <span className="text-surface-400 hidden sm:inline">Admin</span>
        <ChevronRight size={14} className="text-surface-300 hidden sm:inline" />
        <span className="font-medium text-surface-700 dark:text-surface-200">{breadcrumb}</span>
      </div>

      <div className="flex-1" />

      {/* Quick Stats — centered */}
      {quickStats.length > 0 && (
        <div className="hidden md:flex items-center gap-4">
          {quickStats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-1.5">
              <stat.icon size={14} className={stat.color} />
              <span className="text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">{stat.value}</span>
              <span className="text-caption text-surface-400">{stat.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {/* Global Search */}
      <div className="relative">
        {searchOpen ? (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search pages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
                  if (e.key === 'Enter' && searchResults.length > 0) handleSearchSelect(searchResults[0].href);
                }}
                className="pl-9 pr-3 py-1.5 w-48 sm:w-64 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow"
              />
              {searchQuery && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 shadow-lg overflow-hidden z-50">
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSearchSelect(item.href)}
                      className="w-full text-left px-4 py-2.5 text-body-sm text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600">
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            title="Search (Ctrl+K)"
          >
            <Search size={18} />
          </button>
        )}
      </div>

      {/* Notification Bell + Dropdown */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
          className="relative p-2 rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          title="Notifications"
        >
          <Bell size={18} />
          {notifications.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white dark:ring-surface-900">
              {notifications.length}
            </span>
          )}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 shadow-lg overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
              <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">Notifications</p>
            </div>
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={24} className="mx-auto text-surface-300 mb-2" />
                <p className="text-body-sm text-surface-400">All clear! No alerts right now.</p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {notifications.map((notif) => (
                  <Link
                    key={notif.id}
                    to={notif.href}
                    onClick={() => setNotifOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors border-b border-surface-50 dark:border-surface-850 last:border-0"
                  >
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', notif.iconBg)}>
                      <notif.icon size={16} className={notif.iconColor} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100">{notif.title}</p>
                      <p className="text-caption text-surface-400">{notif.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ThemeToggle />

      {/* Profile Dropdown */}
      <div className="relative" ref={profileRef}>
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className="flex items-center gap-2 p-1 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        >
          <Avatar src={user?.photoURL} name={user?.displayName || 'Admin'} size="xs" />
          <span className="text-body-sm font-medium text-surface-700 dark:text-surface-200 hidden sm:inline max-w-[100px] truncate">
            {user?.displayName?.split(' ')[0] || 'Admin'}
          </span>
        </button>

        {profileOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 shadow-lg overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
              <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 truncate">{user?.displayName}</p>
              <p className="text-caption text-surface-400 truncate">{user?.email}</p>
            </div>
            <div className="p-1.5">
              <Link
                to="/admin/profile"
                onClick={() => setProfileOpen(false)}
                className="block px-3 py-2 rounded-lg text-body-sm text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
              >
                My Profile
              </Link>
              {/* Gated like every other entry point — a shortcut to a screen the
                  role cannot open is just a link to "Screen not available". */}
              {can('settings') && (
                <Link
                  to="/admin/settings"
                  onClick={() => setProfileOpen(false)}
                  className="block px-3 py-2 rounded-lg text-body-sm text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
                >
                  Settings
                </Link>
              )}
              <Link
                to="/"
                onClick={() => setProfileOpen(false)}
                className="block px-3 py-2 rounded-lg text-body-sm text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
              >
                Back to Store
              </Link>
            </div>
            <div className="border-t border-surface-100 dark:border-surface-800 p-1.5">
              <button
                onClick={async () => {
                  setProfileOpen(false);
                  try {
                    const { signOutUser } = await import('@/services/auth.ts');
                    await signOutUser();
                  } catch { /* handled by auth listener */ }
                }}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg text-body-sm text-red-500 hover:bg-red-500/10 transition-colors',
                )}
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
