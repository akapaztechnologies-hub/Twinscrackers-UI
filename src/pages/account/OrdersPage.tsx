import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Package, ChevronRight, Clock, RefreshCw, Loader2, CheckCircle } from 'lucide-react';
import { EmptyState } from '@/components/atoms/EmptyState.tsx';
import { AddPastOrderForm } from '@/components/account/AddPastOrderForm.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { useAuthStore } from '@/store/auth.ts';
import { getOrdersPaged, refreshOrderTracking } from '@/services/firestore.ts';
import { formatPrice, cn } from '@/lib/utils.ts';
import type { Order, OrderStatus } from '@/types/index.ts';
import { orderRef } from '@/lib/orderRef.ts';

const statusConfig: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  confirmed: { label: 'Confirmed', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  processing: { label: 'Processing', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
  shipped: { label: 'Shipped', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  delivered: { label: 'Delivered', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
};

const tabs: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Active' },
  { value: 'delivered', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Each tab maps to a set of statuses filtered server-side, so pagination and the
// "Load more" button stay accurate per tab (no client-side page-window filtering).
const tabStatuses: Record<string, OrderStatus[] | undefined> = {
  all: undefined,
  pending: ['pending', 'confirmed', 'processing', 'shipped'],
  delivered: ['delivered'],
  cancelled: ['cancelled'],
};

export function OrdersPage() {
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [checkingId, setCheckingId] = useState<string | null>(null);
  /** Bumped to re-read the list from page 1 — after a past order is added. */
  const [reloadKey, setReloadKey] = useState(0);
  const [addedNote, setAddedNote] = useState('');

  // Keyed on the account id rather than the user object: the object is
  // replaced whenever the profile is saved or refreshed, and re-running this
  // with page > 1 appended that page a second time.
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    // Ignore a response that lands after the tab or page has moved on. Without
    // this a slow "All" answer arriving after a tap on "Cancelled" replaced the
    // cancelled list, and a "Load more" still in flight appended the old tab's
    // orders to the new one.
    let cancelled = false;
    const replace = page === 1;
    if (replace) setIsLoading(true); else setIsLoadingMore(true);
    getOrdersPaged(uid, page, 10, tabStatuses[activeTab])
      .then((res) => {
        if (cancelled) return;
        setOrders((prev) => (replace ? res.data : [...prev, ...res.data]));
        setHasMore(res.hasMore);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) { setIsLoading(false); setIsLoadingMore(false); }
      });
    return () => { cancelled = true; };
  }, [uid, page, activeTab, reloadKey]);

  const handlePastOrderAdded = () => {
    setAddedNote('Order added to your account');
    setPage(1);
    setReloadKey((k) => k + 1);
  };

  const checkStatus = async (e: React.MouseEvent, order: Order) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || checkingId) return;
    setCheckingId(order.id);
    try {
      const res = await refreshOrderTracking(user.uid, order.id);
      setOrders((os) =>
        os.map((o) =>
          o.id === order.id ? { ...o, status: res.status, trackingEvents: res.events, lastTrackedAt: res.lastTrackedAt } : o,
        ),
      );
      /* no auto-open here — the order detail page exposes the courier deep-link */
    } catch {
      /* silently ignore — detail page surfaces errors */
    } finally {
      setCheckingId(null);
    }
  };

  const selectTab = (value: string) => {
    if (value === activeTab) return;
    setActiveTab(value);
    setPage(1);
    setOrders([]);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50 mb-6">
        Order History
      </h2>

      {/* Real accounts only: a guest is signed in to this device's orders
          alone, and adding more is what creating an account is for. */}
      {user && !user.isGuest && <AddPastOrderForm onAdded={handlePastOrderAdded} />}

      {addedNote && (
        <div className="mb-6 flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-body-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle size={16} className="flex-shrink-0" />
          {addedNote}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => selectTab(tab.value)}
            className={cn(
              'px-4 py-2 rounded-xl text-body-sm font-medium transition-colors',
              activeTab === tab.value
                ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<Package size={36} className="text-surface-400" />}
          title={activeTab === 'all' ? 'No orders yet' : 'No orders here'}
          description={
            activeTab === 'all'
              ? 'Your order history will appear here once you make a purchase.'
              : 'You have no orders in this category.'
          }
          action={<Link to="/shop"><Button>Browse Products</Button></Link>}
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const status = statusConfig[order.status] ?? statusConfig.pending;
            return (
              <Link
                key={order.id}
                to={`/account/orders/${order.id}`}
                className="block bg-white dark:bg-surface-900 rounded-2xl p-5 border border-surface-200 dark:border-surface-800 hover:border-brand-500/30 transition-all group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="font-display font-bold text-body-lg text-surface-900 dark:text-surface-50">
                        {orderRef(order)}
                      </p>
                      <span className={cn('px-2.5 py-1 rounded-lg text-caption font-bold uppercase', status.color)}>
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-body-sm text-surface-500">
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {new Date(order.createdAt).toLocaleDateString('en-IN')}
                      </span>
                      <span>{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
                      <span className="font-semibold text-surface-700 dark:text-surface-300">{formatPrice(order.total)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {order.trackingId && (
                      <button
                        onClick={(e) => checkStatus(e, order)}
                        disabled={checkingId === order.id}
                        title="Check delivery status"
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 text-caption font-semibold hover:bg-brand-500/20 disabled:opacity-50 transition-colors"
                      >
                        {checkingId === order.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        Check status
                      </button>
                    )}
                    <ChevronRight size={20} className="text-surface-400 group-hover:text-brand-500 transition-colors" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!isLoading && hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={isLoadingMore}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-semibold text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-60 transition-colors"
          >
            {isLoadingMore ? <Loader2 size={15} className="animate-spin" /> : null}
            {isLoadingMore ? 'Loading…' : 'Load more orders'}
          </button>
        </div>
      )}
    </motion.div>
  );
}
