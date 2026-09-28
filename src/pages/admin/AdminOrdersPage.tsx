import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, Search, Package, IndianRupee, Clock, CheckCircle2, RefreshCw, Loader2, X, Printer, Download } from 'lucide-react';
import { formatPrice, cn } from '@/lib/utils.ts';
import { printOrderCopy, downloadOrderCopy } from '@/lib/orderPdf.ts';
import { StatusBadge } from '@/components/admin/StatusBadge.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { ExportButton } from '@/components/admin/ExportButton.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { exportToExcel } from '@/lib/exportExcel.ts';
import type { AdminOrder } from '@/types/admin.ts';
import type { OrderStatus } from '@/types/index.ts';
import { orderRef } from '@/lib/orderRef.ts';
import { ApiRequestError } from '@/lib/api.ts';

const ORDER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

/** `?status=` deep link (the dashboard's queue links here); anything unknown falls back to All. */
function statusFromUrl(raw: string | null): OrderStatus | 'all' {
  return ORDER_STATUSES.includes(raw as OrderStatus) ? (raw as OrderStatus) : 'all';
}
const statusDot: Record<OrderStatus, string> = {
  pending: 'bg-amber-500',
  confirmed: 'bg-blue-500',
  processing: 'bg-indigo-500',
  shipped: 'bg-purple-500',
  delivered: 'bg-green-500',
  cancelled: 'bg-red-500',
};
const statusSelectOptions = ORDER_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
  icon: <span className={cn('w-2 h-2 rounded-full', statusDot[s])} />,
}));

const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Processing', value: 'processing' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Cancelled', value: 'cancelled' },
];

const paymentStatusOptions = [
  { label: 'All Payments', value: 'all' },
  { label: 'Paid', value: 'paid' },
  { label: 'Awaiting Verification', value: 'awaiting_verification' },
  { label: 'Pending', value: 'pending' },
  { label: 'Failed', value: 'failed' },
  // A paid order that was cancelled: the money is still to go back by hand.
  { label: 'Refund Due', value: 'refund_due' },
  { label: 'Refunded', value: 'refunded' },
];

/** Paid, or paid and waiting on the proof check — either way money came in. */
function customerHasPaid(paymentStatus: string | undefined): boolean {
  return paymentStatus === 'paid' || paymentStatus === 'awaiting_verification';
}

/**
 * What the admin is told before an order is cancelled or closed.
 *
 * Both are final — the server refuses to move an order out of either — and a
 * cancel restocks, releases the coupon and tells the customer. Nothing is paid
 * back automatically: a paid order becomes "Refund due" until someone returns
 * the money and marks it refunded.
 */
function terminalStatusWarning(order: { total: number; paymentStatus?: string }, next: OrderStatus): string {
  if (next === 'delivered') {
    return 'A delivered order is closed for good — its status cannot be changed again afterwards.';
  }
  const refund = customerHasPaid(order.paymentStatus)
    ? ` The customer has paid ${formatPrice(order.total)}: nothing is refunded automatically. Pay it back by hand, then use "Mark as refunded" on the order — until then it shows "Refund due".`
    : '';
  return `Its items go back into stock, any coupon is released and the customer is told. This cannot be undone.${refund}`;
}

const dateRangeOptions = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 90 Days', value: '90d' },
];

function getDateRangeStart(range: string): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(now.getTime() - days * 86400000);
}

export function AdminOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ totalOrders: 0, totalRevenue: 0, pending: 0, delivered: 0 });
  const [searchParams] = useSearchParams();
  // Seeded once, not synced: after landing, the Select owns the filter.
  const [filter, setFilter] = useState<OrderStatus | 'all'>(() => statusFromUrl(searchParams.get('status')));
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateRange, setDateRange] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<{ id: string; mode: 'print' | 'download' } | null>(null);
  const [bulkChecking, setBulkChecking] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /**
   * A cancel or a delivery waiting on the admin's yes.
   *
   * Both are final, and the dropdown sits in the row: one slip of the mouse used
   * to cancel an order outright — restocked, customer told, no way back.
   */
  const [pendingStatus, setPendingStatus] = useState<{ order: AdminOrder; next: OrderStatus } | null>(null);

  // Change an order's status straight from the list (optimistic + rollback).
  const applyStatus = async (order: AdminOrder, next: OrderStatus) => {
    if (next === order.status || statusBusy) return;
    const prev = order.status;
    setStatusBusy(order.id);
    setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
    try {
      const { updateOrderStatus, getAdminOrderById } = await import('@/services/admin.ts');
      await updateOrderStatus(order.id, order.userId, next);
      // The server's version of the row, not the guess: a status change also
      // moves the payment (cancel → refund due / failed, COD delivered → paid).
      const fresh = await getAdminOrderById(order.id).catch(() => null);
      if (fresh) setOrders((os) => os.map((o) => (o.id === order.id ? fresh : o)));
      setToast({ msg: `Order ${orderRef(order)} → ${next}`, kind: 'ok' });
    } catch (e) {
      setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, status: prev } : o)));
      setToast({ msg: e instanceof Error && e.message ? e.message : 'Failed to update status', kind: 'err' });
      // Someone changed this order first (the server's 409). Rolling back to
      // what this row said before would still be stale — show the server's copy.
      if (e instanceof ApiRequestError && e.status === 409) {
        const { getAdminOrderById } = await import('@/services/admin.ts');
        const fresh = await getAdminOrderById(order.id);
        if (fresh) setOrders((os) => os.map((o) => (o.id === order.id ? fresh : o)));
      }
    } finally {
      setStatusBusy(null);
    }
  };

  const changeStatus = (order: AdminOrder, next: OrderStatus) => {
    if (next === order.status || statusBusy) return;
    if (next === 'cancelled' || next === 'delivered') {
      setPendingStatus({ order, next });
      return;
    }
    void applyStatus(order, next);
  };

  // Print / download the order copy (packing slip) straight from the list row.
  const handleRowPdf = async (order: AdminOrder, mode: 'print' | 'download') => {
    if (pdfBusy) return;
    setPdfBusy({ id: order.id, mode });
    try {
      if (mode === 'print') await printOrderCopy(order);
      else await downloadOrderCopy(order);
    } catch {
      setToast({ msg: 'Could not generate the order copy.', kind: 'err' });
    } finally {
      setPdfBusy(null);
    }
  };

  // "Check status": scrape the courier and auto-update the delivery status.
  const checkStatus = async (order: AdminOrder) => {
    if (checkingId) return;
    if (!order.trackingId || !order.courier) {
      setToast({ msg: 'Add a courier & tracking number on the order first.', kind: 'err' });
      return;
    }
    setCheckingId(order.id);
    try {
      const { refreshOrderTracking } = await import('@/services/admin.ts');
      const res = await refreshOrderTracking(order.id);
      setOrders((os) =>
        os.map((o) =>
          o.id === order.id ? { ...o, status: res.status, trackingEvents: res.events, lastTrackedAt: res.lastTrackedAt } : o,
        ),
      );
      if (res.scraped) {
        setToast({ msg: `Tracking updated — ${res.status}${res.statusChanged ? ' (status changed)' : ''}`, kind: 'ok' });
      } else {
        setToast({ msg: 'No live courier updates — open the order to track on the courier site.', kind: 'err' });
      }
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Tracking check failed', kind: 'err' });
    } finally {
      setCheckingId(null);
    }
  };

  // Bulk "Check all": refresh every eligible order in the CURRENT view
  // (respects the status/payment/date filters + search) — paid, not yet
  // delivered/cancelled, and with a courier + tracking number saved.
  const checkAllStatus = async () => {
    if (bulkChecking) return;
    // Operates on the orders currently on screen (this page of the filtered view).
    const eligible = orders.filter(
      (o) => o.paymentStatus === 'paid' && !['delivered', 'cancelled'].includes(o.status) && !!o.trackingId && !!o.courier,
    );
    if (eligible.length === 0) {
      setToast({ msg: 'No paid, undelivered orders with tracking in the current view.', kind: 'err' });
      return;
    }
    setBulkChecking(true);
    setBulkProgress({ done: 0, total: eligible.length });
    const { refreshOrderTracking } = await import('@/services/admin.ts');
    let changed = 0;
    for (const o of eligible) {
      try {
        const res = await refreshOrderTracking(o.id);
        setOrders((os) =>
          os.map((x) =>
            x.id === o.id ? { ...x, status: res.status, trackingEvents: res.events, lastTrackedAt: res.lastTrackedAt } : x,
          ),
        );
        if (res.statusChanged) changed += 1;
      } catch {
        /* skip this order, keep going */
      }
      setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setBulkChecking(false);
    setToast({
      msg: `Checked ${eligible.length} order${eligible.length !== 1 ? 's' : ''} — ${changed} status change${changed !== 1 ? 's' : ''}.`,
      kind: 'ok',
    });
  };

  // Debounce the search box so keystrokes don't hit the API on every character.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch a single server-side page whenever any filter / search / page changes.
  useEffect(() => {
    // A slow answer for the filters before must not land over the answer for
    // the filters now.
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const { getAllOrders } = await import('@/services/admin.ts');
        const rangeStart = getDateRangeStart(dateRange);
        const result = await getAllOrders({
          status: filter === 'all' ? undefined : filter,
          paymentStatus: paymentFilter === 'all' ? undefined : paymentFilter,
          search: debouncedSearch || undefined,
          dateFrom: rangeStart ? rangeStart.toISOString() : undefined,
          page: currentPage,
          limit: itemsPerPage,
        });
        if (cancelled) return;
        setOrders(result.data);
        setTotal(result.total);
      } catch {
        if (cancelled) return;
        setOrders([]);
        setTotal(0);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, paymentFilter, debouncedSearch, dateRange, currentPage, itemsPerPage]);

  // Store-wide KPI stats (server aggregation, not derived from the visible page).
  useEffect(() => {
    (async () => {
      try {
        const { getDashboardStats } = await import('@/services/admin.ts');
        const s = await getDashboardStats();
        setStats({
          totalOrders: s.totalOrders,
          totalRevenue: s.totalRevenue,
          pending: s.statusBreakdown?.pending ?? 0,
          delivered: s.statusBreakdown?.delivered ?? 0,
        });
      } catch {
        /* keep last stats */
      }
    })();
  }, []);

  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, filter, dateRange, paymentFilter]);

  const handleExport = async () => {
    try {
      const { getAllOrders } = await import('@/services/admin.ts');
      const rangeStart = getDateRangeStart(dateRange);
      // Every matching order, a page at a time — the server caps a page at 100,
      // and stopping at the first page exported a truncated list without saying.
      const PAGE = 100;
      const rows: AdminOrder[] = [];
      for (let page = 1; ; page += 1) {
        const res = await getAllOrders({
          status: filter === 'all' ? undefined : filter,
          paymentStatus: paymentFilter === 'all' ? undefined : paymentFilter,
          search: debouncedSearch || undefined,
          dateFrom: rangeStart ? rangeStart.toISOString() : undefined,
          page,
          limit: PAGE,
        });
        rows.push(...res.data);
        const pages = res.totalPages ?? Math.ceil(res.total / PAGE);
        if (res.data.length === 0 || page >= pages) break;
      }
      void exportToExcel(
        rows.map((o) => ({
          'Order ID': o.id,
          Customer: o.customerName,
          Email: o.customerEmail,
          Items: o.items.length,
          Total: o.total,
          Status: o.status,
          Payment: o.paymentStatus || o.paymentMethod || 'N/A',
          Date: o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN') : '',
        })),
        'orders',
      );
    } catch {
      /* ignore */
    }
  };

  return (
    <ListPageShell
      header={
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard label="Total Orders" value={String(stats.totalOrders)} icon={Package} color="text-blue-600 bg-blue-500/10" isLoading={isLoading} />
            <KPICard label="Revenue" value={formatPrice(stats.totalRevenue)} icon={IndianRupee} color="text-green-600 bg-green-500/10" isLoading={isLoading} />
            <KPICard label="Pending" value={String(stats.pending)} icon={Clock} color="text-amber-600 bg-amber-500/10" isLoading={isLoading} />
            <KPICard label="Delivered" value={String(stats.delivered)} icon={CheckCircle2} color="text-green-600 bg-green-500/10" isLoading={isLoading} />
          </div>

          {/* Toolbar: Search + Filter toggle + Export */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search orders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={checkAllStatus}
                disabled={bulkChecking}
                title="Check delivery status for all paid, undelivered orders in this view"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] font-semibold text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-750 disabled:opacity-60 transition-colors"
              >
                {bulkChecking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                {bulkChecking ? `Checking ${bulkProgress.done}/${bulkProgress.total}…` : 'Check all'}
              </button>
              <FilterButton
                activeCount={[filter, paymentFilter, dateRange].filter((v) => v !== 'all').length}
                open={showFilters}
                onClick={() => setShowFilters(!showFilters)}
              />
              <ExportButton onExport={handleExport} />
            </div>
          </div>

          {/* Expandable filter panel — full width */}
          <FilterPanel
            open={showFilters}
            onClearAll={() => { setFilter('all'); setPaymentFilter('all'); setDateRange('all'); }}
            filters={[
              { id: 'status', label: 'Order Status', value: filter, options: statusOptions, onChange: (v) => setFilter(v as OrderStatus | 'all') },
              { id: 'payment', label: 'Payment Status', value: paymentFilter, options: paymentStatusOptions, onChange: setPaymentFilter },
              { id: 'date', label: 'Date Range', value: dateRange, options: dateRangeOptions, onChange: setDateRange },
            ]}
          />
        </>
      }
    >

      {/* Table */}
      <DataTable
        columns={[
          { key: 'id', label: 'Order' },
          { key: 'customer', label: 'Customer' },
          { key: 'items', label: 'Items' },
          { key: 'total', label: 'Total' },
          { key: 'status', label: 'Status' },
          { key: 'payment', label: 'Payment' },
          { key: 'date', label: 'Date' },
          { key: 'actions', label: '', className: 'w-36' },
        ]}
        isLoading={isLoading}
        isEmpty={orders.length === 0}
        emptyIcon={<Package size={24} className="text-surface-400" />}
        emptyTitle="No orders found"
        emptyDescription={debouncedSearch ? 'Try adjusting your search' : 'Orders will appear here once customers start purchasing'}
        pagination={{
          currentPage,
          totalItems: total,
          itemsPerPage,
          onPageChange: setCurrentPage,
          onItemsPerPageChange: (size) => { setItemsPerPage(size); setCurrentPage(1); },
        }}
      >
        {orders.map((order) => (
          <tr
            key={order.id}
            onClick={() => navigate(`/admin/orders/${order.id}`)}
            className="border-b border-surface-50 dark:border-surface-850 last:border-0 hover:bg-surface-50/50 dark:hover:bg-surface-850/50 cursor-pointer transition-colors"
          >
            <td className="px-5 py-3.5 text-body-sm font-medium text-surface-900 dark:text-surface-100">
              {orderRef(order)}
            </td>
            <td className="px-5 py-3.5">
              <p className="text-body-sm text-surface-900 dark:text-surface-100">
                {order.customerName || 'Unknown'}
              </p>
              <p className="text-caption text-surface-400">{order.customerEmail}</p>
            </td>
            <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400">
              {order.items.length} items
            </td>
            <td className="px-5 py-3.5 text-body-sm font-medium text-surface-900 dark:text-surface-100 tabular-nums">
              {formatPrice(order.total)}
            </td>
            <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
              <Select
                value={order.status}
                onChange={(next) => changeStatus(order, next)}
                options={statusSelectOptions}
                size="sm"
                fullWidth={false}
                disabled={statusBusy !== null}
                aria-label="Order status"
                className="min-w-[132px]"
              />
            </td>
            <td className="px-5 py-3.5">
              <StatusBadge status={order.paymentStatus || 'pending'} type="payment" />
            </td>
            <td className="px-5 py-3.5 text-body-sm text-surface-500">
              {order.createdAt
                ? new Date(order.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
                : '—'}
            </td>
            <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => handleRowPdf(order, 'print')}
                  disabled={pdfBusy !== null}
                  title="Print packing slip"
                  className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors inline-flex disabled:opacity-50"
                >
                  {pdfBusy?.id === order.id && pdfBusy.mode === 'print' ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                </button>
                <button
                  onClick={() => handleRowPdf(order, 'download')}
                  disabled={pdfBusy !== null}
                  title="Download order copy (PDF)"
                  className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors inline-flex disabled:opacity-50"
                >
                  {pdfBusy?.id === order.id && pdfBusy.mode === 'download' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                </button>
                <button
                  onClick={() => checkStatus(order)}
                  disabled={checkingId !== null}
                  title={order.trackingId ? 'Check delivery status' : 'Add courier & tracking first'}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors inline-flex disabled:opacity-50"
                >
                  {checkingId === order.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                </button>
                <Link
                  to={`/admin/orders/${order.id}`}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors inline-flex"
                >
                  <Eye size={16} />
                </Link>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <ConfirmDialog
        open={pendingStatus !== null}
        variant={pendingStatus?.next === 'cancelled' ? 'danger' : 'warning'}
        title={
          pendingStatus
            ? `${pendingStatus.next === 'cancelled' ? 'Cancel' : 'Mark as delivered:'} order ${orderRef(pendingStatus.order)}?`
            : ''
        }
        description={pendingStatus ? terminalStatusWarning(pendingStatus.order, pendingStatus.next) : ''}
        confirmLabel={pendingStatus?.next === 'cancelled' ? 'Cancel order' : 'Mark delivered'}
        cancelLabel="Keep as is"
        isLoading={statusBusy !== null}
        onConfirm={() => {
          if (!pendingStatus) return;
          const { order, next } = pendingStatus;
          setPendingStatus(null);
          void applyStatus(order, next);
        }}
        onCancel={() => setPendingStatus(null)}
      />

      {toast && (
        <div
          className={cn(
            'fixed bottom-5 right-5 z-[300] flex items-center gap-2.5 pl-4 pr-3 py-2.5 rounded-xl shadow-lg text-body-sm font-medium max-w-sm',
            toast.kind === 'ok'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white',
          )}
        >
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="p-0.5 rounded hover:bg-white/20 transition-colors">
            <X size={15} />
          </button>
        </div>
      )}
    </ListPageShell>
  );
}
