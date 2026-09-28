import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  Package,
  MapPin,
  ArrowLeft,
  Phone,
  Mail,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  Loader2,
  X,
  Calendar,
  Printer,
  Download,
  Check,
} from 'lucide-react';
import { formatPrice, cn } from '@/lib/utils.ts';
import { printOrderCopy, downloadOrderCopy } from '@/lib/orderPdf.ts';
import { StatusBadge } from '@/components/admin/StatusBadge.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { Avatar } from '@/components/atoms/Avatar.tsx';
import { TrackingTimeline } from '@/components/order/TrackingTimeline.tsx';
import {
  COURIERS,
  courierDisplayName,
  buildTrackingUrl,
  courierOption,
  trackingModeOf,
  type TrackingMode,
} from '@/lib/couriers.ts';
import type { AdminOrder } from '@/types/admin.ts';
import type { OrderStatus } from '@/types/index.ts';
import { orderRef } from '@/lib/orderRef.ts';
import { ApiRequestError } from '@/lib/api.ts';
import { useCan } from '@/store/auth.ts';

/**
 * Someone else changed this order first — the server claims every status
 * change, payment decision and refund atomically and refuses the loser with a
 * 409. The screen is then stale, so it is re-read rather than trusted.
 */
function isConflict(err: unknown): boolean {
  return err instanceof ApiRequestError && err.status === 409;
}

type StatusHistoryEntry = NonNullable<AdminOrder['statusHistory']>[number];
type Tab = 'items' | 'tracking' | 'history';

const allStatuses: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

const statusIcons: Record<OrderStatus, React.ElementType> = {
  pending: Clock,
  confirmed: CheckCircle2,
  processing: Clock,
  shipped: Truck,
  delivered: Package,
  cancelled: XCircle,
};

const statusIconColors: Record<OrderStatus, string> = {
  pending: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10',
  confirmed: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10',
  processing: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-500/10',
  shipped: 'text-purple-600 bg-purple-50 dark:bg-purple-500/10',
  delivered: 'text-green-600 bg-green-50 dark:bg-green-500/10',
  cancelled: 'text-red-600 bg-red-50 dark:bg-red-500/10',
};

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const digits = (p?: string) => (p || '').replace(/\D/g, '');

function DetailShell({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-4 lg:-m-6 xl:-m-8 bg-surface-50 dark:bg-surface-950">{children}</div>;
}

function CenterSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
      <h3 className="text-label uppercase tracking-wider text-surface-400 font-semibold mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex items-start gap-2 text-caption text-surface-700 dark:text-surface-300">
      <span className="text-surface-400 mt-0.5 flex-shrink-0">{icon}</span>
      <span className="break-words">{value}</span>
    </div>
  );
}

function TabBtn({ icon, label, count, active, onClick }: { icon: ReactNode; label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-caption font-medium whitespace-nowrap border-b-2 -mb-px transition-colors', active ? 'text-brand-600 dark:text-brand-400 border-brand-500' : 'text-surface-500 border-transparent hover:text-surface-700 dark:hover:text-surface-300')}>
      {icon}{label}
      {count !== undefined && count > 0 && <span className={cn('inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-bold', active ? 'bg-brand-500 text-white' : 'bg-surface-100 dark:bg-surface-800 text-surface-500')}>{count}</span>}
    </button>
  );
}

function EmptyRegion({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-2.5">{icon}</div>
      <p className="text-caption text-surface-400 max-w-xs">{text}</p>
    </div>
  );
}

export function AdminOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('items');

  const [newStatus, setNewStatus] = useState<OrderStatus>('pending');
  const [statusNote, setStatusNote] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const [trackingId, setTrackingId] = useState('');
  const [courier, setCourier] = useState('');
  const [savingTracking, setSavingTracking] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<'print' | 'download' | null>(null);

  /*
   * Verifying the payment from this screen — see decidePayment.
   *
   * The endpoint is gated on the payment-verification screen, not on orders, so
   * a clerk who can see orders but not approve money would otherwise be shown
   * two buttons that answer 403. They keep the link to the queue, which tells
   * them the same thing in a way they can act on.
   */
  const can = useCan();
  const canVerifyPayments = can('payment-verification', 'edit');
  const [paymentBusy, setPaymentBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  /** A cancel or a delivery waiting on the admin's yes — both are final. */
  const [confirmTerminal, setConfirmTerminal] = useState(false);
  /** The "Mark as refunded" confirmation, for a cancelled order that was paid. */
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [refundNote, setRefundNote] = useState('');
  const [savingRefund, setSavingRefund] = useState(false);

  /**
   * Re-read the order after an action and show what the server stored.
   *
   * Each action has side effects the screen cannot predict — a cancel turns a
   * paid order "Refund due", a delivery marks cash-on-delivery paid, approving a
   * proof confirms the order — so the page shows the server's copy rather than
   * patching in its own guess. Only the saved fields are taken; what the admin
   * is typing into the tracking boxes is left alone.
   */
  const reloadOrder = async () => {
    if (!orderId) return;
    const { getAdminOrderById } = await import('@/services/admin.ts');
    const fresh = await getAdminOrderById(orderId);
    if (fresh) {
      setOrder(fresh);
      setNewStatus(fresh.status);
    }
  };

  const handlePackingSlip = async (mode: 'print' | 'download') => {
    if (!order || pdfBusy) return;
    setPdfBusy(mode);
    try {
      if (mode === 'print') await printOrderCopy(order);
      else await downloadOrderCopy(order);
    } catch {
      setToast({ msg: 'Could not generate the packing slip.', kind: 'err' });
    } finally {
      setPdfBusy(null);
    }
  };

  /**
   * Approve or reject the payment without leaving the order.
   *
   * The same decision the Payment Verification queue makes, put where the admin
   * already is: they open the order to see what was bought and who it is for,
   * and the proof is on this screen — sending them to a queue to find the same
   * row again was the whole journey. The queue stays, for working a backlog.
   */
  const decidePayment = async (approve: boolean) => {
    if (!orderId) return;
    const trimmed = rejectReason.trim();
    if (!approve && trimmed.length < 3) {
      setPaymentError('Give the customer a reason so they can correct it.');
      return;
    }
    setPaymentError(null);
    setPaymentBusy(approve ? 'approve' : 'reject');
    try {
      const { reviewManualPayment } = await import('@/services/payments.ts');
      await reviewManualPayment(orderId, { approve, reason: approve ? undefined : trimmed });
      // The server's own record, not a guess at it. The guess said 'failed' for
      // a rejection the server had put back to 'pending' (so the customer can
      // resubmit), and missed that approving moves a pending order to confirmed.
      await reloadOrder();
      setRejecting(false);
      setRejectReason('');
      setToast({
        msg: approve ? 'Payment approved' : 'Payment rejected — the customer has been told why',
        kind: 'ok',
      });
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : 'Could not record that decision.');
      if (isConflict(e)) {
        setRejecting(false);
        await reloadOrder();
      }
    } finally {
      setPaymentBusy(null);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      try {
        const { getAdminOrderById } = await import('@/services/admin.ts');
        const result = await getAdminOrderById(orderId);
        if (result) {
          setOrder(result);
          setNewStatus(result.status);
          setTrackingId(result.trackingId ?? '');
          /*
           * Fall back to the line the CUSTOMER chose at checkout.
           *
           * They already picked an A1 office; making the admin choose A1 again
           * from a list of twenty is asking them to re-enter something the
           * order already knows, and getting it wrong sends the parcel to a
           * line that has no booking for it. The saved `courier` still wins —
           * the shop can always overrule the choice when it books differently.
           */
          setCourier(result.courier ?? result.deliveryPoint?.parcelServiceSlug ?? '');
        }
      } catch {
        /* handled by not-found UI */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [orderId]);

  const handleStatusUpdate = async () => {
    if (!order || !orderId || newStatus === order.status || savingStatus) return;
    setSavingStatus(true);
    try {
      const { updateOrderStatus } = await import('@/services/admin.ts');
      await updateOrderStatus(orderId, order.userId, newStatus, statusNote);
      await reloadOrder();
      setStatusNote('');
      setToast({ msg: `Status updated to ${newStatus}`, kind: 'ok' });
    } catch (e) {
      // The server's reason — e.g. a delivered order cannot be reopened.
      setToast({ msg: e instanceof Error && e.message ? e.message : 'Failed to update status', kind: 'err' });
      if (isConflict(e)) await reloadOrder();
    } finally {
      setSavingStatus(false);
    }
  };

  /** Cancelling and delivering are final, so both ask first; the rest go straight through. */
  const requestStatusUpdate = () => {
    if (newStatus === 'cancelled' || newStatus === 'delivered') setConfirmTerminal(true);
    else void handleStatusUpdate();
  };

  const handleMarkRefunded = async () => {
    if (!orderId || savingRefund) return;
    setSavingRefund(true);
    try {
      const { markOrderRefunded } = await import('@/services/admin.ts');
      setOrder(await markOrderRefunded(orderId, refundNote.trim() || undefined));
      setConfirmRefund(false);
      setRefundNote('');
      setToast({ msg: 'Refund recorded', kind: 'ok' });
    } catch (e) {
      setToast({ msg: e instanceof Error && e.message ? e.message : 'Could not record the refund', kind: 'err' });
      if (isConflict(e)) {
        setConfirmRefund(false);
        await reloadOrder();
      }
    } finally {
      setSavingRefund(false);
    }
  };

  const handleTrackingSave = async () => {
    if (!order || !orderId || !trackingId.trim()) return;
    setSavingTracking(true);
    try {
      const { updateOrderTracking } = await import('@/services/admin.ts');
      const courierName = courierDisplayName(courier);
      await updateOrderTracking(orderId, order.userId, trackingId.trim(), courier || undefined, courierName || undefined);
      // The server decides whether saving tracking ships the order; show its answer.
      await reloadOrder();
      setToast({ msg: 'Tracking saved', kind: 'ok' });
    } catch {
      setToast({ msg: 'Failed to save tracking', kind: 'err' });
    } finally {
      setSavingTracking(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!order || !orderId) return;
    if (!order.trackingId || !order.courier) {
      setToast({ msg: 'Save a courier & tracking number first.', kind: 'err' });
      return;
    }
    setChecking(true);
    try {
      const { refreshOrderTracking } = await import('@/services/admin.ts');
      const res = await refreshOrderTracking(orderId);
      setOrder((o) =>
        o ? { ...o, status: res.status, trackingEvents: res.events, lastTrackedAt: res.lastTrackedAt } : o,
      );
      setNewStatus(res.status);
      if (res.scraped) {
        setToast({ msg: `Tracking updated${res.statusChanged ? ` — now ${res.status}` : ''}`, kind: 'ok' });
      } else {
        setToast({ msg: 'No live courier updates found. Use “Track on courier site”.', kind: 'err' });
      }
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Tracking check failed', kind: 'err' });
    } finally {
      setChecking(false);
    }
  };

  if (isLoading) return <DetailShell><CenterSpinner /></DetailShell>;

  if (!order) {
    return (
      <DetailShell>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
            <Package size={26} className="text-surface-400" />
          </div>
          <p className="text-body-md font-medium text-surface-700 dark:text-surface-300">Order not found</p>
          <p className="text-body-sm text-surface-500 -mt-2">This order may have been removed or the ID is incorrect.</p>
          <Link to="/admin/orders" className="text-caption text-brand-600 dark:text-brand-400 hover:underline">
            ← Back to Orders
          </Link>
        </div>
      </DetailShell>
    );
  }

  const phone = digits(order.shippingAddress.phone);
  const trackingUrl = order.courier && order.trackingId ? buildTrackingUrl(order.courier, order.trackingId) : null;
  const itemQty = order.items.reduce((s, it) => s + it.quantity, 0);

  // Some history rows log an activity (payment proof submitted, rejected, …)
  // without the order's status actually changing, so it's tagged with
  // whatever status was already current. Flagging those as non-transitions
  // lets the timeline show them as a note under the still-current status
  // instead of a second "Pending" (or whatever) that looks like a repeat.
  const statusHistoryWithFlags = (order.statusHistory ?? []).map((entry, i, arr) => ({
    entry,
    isTransition: i === 0 || entry.status !== arr[i - 1].status,
  }));

  return (
    <DetailShell>
      {/* Header — icon back-button + title/badges/date on the left, actions on the right */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/admin/orders" className="p-1.5 rounded-lg text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 flex-shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50 truncate">
                Order {orderRef(order)}
              </h1>
              <StatusBadge status={order.status} type="order" />
              <StatusBadge status={order.paymentStatus || 'pending'} type="payment" />
            </div>
            <p className="text-caption text-surface-400 inline-flex items-center gap-1.5 truncate">
              <Calendar size={12} />
              {order.createdAt
                ? new Date(order.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '—'}
              {' · '}
              {order.items.length} item{order.items.length !== 1 ? 's' : ''} · {itemQty} qty
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => handlePackingSlip('print')}
            disabled={pdfBusy !== null}
            title="Print packing slip with tick boxes"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 text-caption font-semibold hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50"
          >
            {pdfBusy === 'print' ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            Packing slip
          </button>
          <button
            onClick={() => handlePackingSlip('download')}
            disabled={pdfBusy !== null}
            title="Download order copy (PDF)"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 text-caption font-semibold hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50"
          >
            {pdfBusy === 'download' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download
          </button>
          {trackingUrl && (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 text-caption font-semibold hover:bg-surface-50 dark:hover:bg-surface-800"
            >
              <ExternalLink size={14} /> Track on courier site
            </a>
          )}
          {/* Offered only where it can actually do something. It used to be
              shown for every courier and fetch nothing for all but two of
              them, which is what made tracking look broken — a button that
              answers with silence reads as a bug, not as "this courier has no
              online tracking". */}
          {trackingModeOf(order.courier) === 'auto' && (
            <button
              onClick={handleCheckStatus}
              disabled={checking || !order.trackingId}
              title={order.trackingId ? undefined : 'Save a tracking number first'}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-brand-500 text-white text-caption font-semibold hover:bg-brand-600 disabled:opacity-50 shadow-sm shadow-brand-500/20"
            >
              {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Check status
            </button>
          )}
        </div>
      </header>

      {/* Body — left pane (tabbed) and the fixed-width right sidebar each scroll independently */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0 border-r border-surface-200 dark:border-surface-800">
          <div className="flex items-center gap-1 px-3 pt-2 border-b border-surface-200 dark:border-surface-800 overflow-x-auto no-scrollbar bg-white dark:bg-surface-900">
            <TabBtn icon={<Package size={13} />} label="Items" count={order.items.length} active={tab === 'items'} onClick={() => setTab('items')} />
            <TabBtn icon={<Truck size={13} />} label="Tracking" active={tab === 'tracking'} onClick={() => setTab('tracking')} />
            <TabBtn icon={<Clock size={13} />} label="History" count={order.statusHistory?.length} active={tab === 'history'} onClick={() => setTab('history')} />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            {tab === 'items' && <ItemsTab order={order} />}

            {tab === 'tracking' && (
              <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
                  <div>
                    <label className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">Courier</label>
                    <Select
                      value={courier}
                      onChange={setCourier}
                      // The label says what the shop will be able to find out,
                      // at the moment of choosing — which is when it matters.
                      options={COURIERS.map((c) => ({
                        value: c.slug,
                        label: `${c.name}${c.mode === 'auto' ? '  ·  live tracking' : c.mode === 'manual' ? '  ·  manual updates' : ''}`,
                      }))}
                      placeholder="Select courier…"
                      size="md"
                    />
                    <CourierModeNote slug={courier} />
                  </div>
                  <div>
                    <label className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">Tracking number</label>
                    <input
                      type="text"
                      value={trackingId}
                      onChange={(e) => setTrackingId(e.target.value)}
                      placeholder="e.g. 1234567890"
                      className={inputClass}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={handleTrackingSave}
                      disabled={savingTracking || !trackingId.trim()}
                      className="h-[42px] px-4 rounded-xl bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-body-sm font-semibold hover:bg-surface-800 dark:hover:bg-surface-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {savingTracking ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>

                {trackingUrl && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                    <span className="text-surface-500">
                      {courierDisplayName(order.courier)} · <span className="font-mono text-surface-700 dark:text-surface-300">{order.trackingId}</span>
                    </span>
                    <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 font-medium hover:underline">
                      <ExternalLink size={12} /> Track on courier site
                    </a>
                    {order.lastTrackedAt && (
                      <span className="text-surface-400">
                        Checked {new Date(order.lastTrackedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}

                {/* Always offered, whatever the courier. Even an auto-tracked
                    parcel gets news by phone that the courier's own feed does
                    not carry — "driver says it goes out tomorrow morning". */}
                <ManualTrackingForm
                  orderId={order.id}
                  onAdded={(updated) => {
                    setOrder(updated);
                    setToast({ msg: 'Tracking update added.', kind: 'ok' });
                  }}
                  onError={(msg) => setToast({ msg, kind: 'err' })}
                />

                <div className="pt-4 border-t border-surface-100 dark:border-surface-800">
                  <TrackingTimeline events={order.trackingEvents} />
                </div>
              </div>
            )}

            {tab === 'history' && (
              <div className="flex-1 overflow-y-auto no-scrollbar">
                <HistoryTab items={statusHistoryWithFlags} />
              </div>
            )}
          </div>
        </div>

        {/* Right — sidebar, fixed width, flat sections (matches Customer Detail) */}
        <div className="w-[340px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-surface-900 min-h-0">
          <div className="flex-1 overflow-y-auto">
            <Section title="Update Status">
              <div className="space-y-2.5">
                <Select
                  value={newStatus}
                  onChange={(v) => setNewStatus(v as OrderStatus)}
                  options={allStatuses.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
                  size="md"
                />
                <textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="Add a note (optional)"
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
                <button
                  onClick={requestStatusUpdate}
                  disabled={savingStatus || newStatus === order.status}
                  className="w-full py-2 px-4 rounded-xl bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors"
                >
                  {savingStatus ? 'Updating…' : 'Update Status'}
                </button>
              </div>
            </Section>

            <Section title="Customer">
              <Link to={`/admin/customers/${order.userId}`} className="flex items-center gap-2.5 group mb-1.5">
                <Avatar name={order.customerName || order.shippingAddress.fullName || 'Customer'} size="sm" />
                <span className="text-body-sm font-semibold text-surface-900 dark:text-surface-100 group-hover:text-brand-600 truncate">
                  {order.customerName || order.shippingAddress.fullName || 'Customer'}
                </span>
              </Link>
              {order.customerEmail && <InfoRow icon={<Mail size={13} />} value={order.customerEmail} />}
              {phone && <InfoRow icon={<Phone size={13} />} value={phone} />}
              {phone && (
                <div className="flex gap-1.5 pt-1.5">
                  <a href={`tel:${phone}`} className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 text-caption font-medium hover:bg-brand-500/10 hover:text-brand-600 transition-colors">
                    <Phone size={12} /> Call
                  </a>
                  <a href={`https://wa.me/91${phone}`} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 text-caption font-medium hover:bg-green-500/10 hover:text-green-600 transition-colors">
                    <MessageCircle size={12} /> WhatsApp
                  </a>
                </div>
              )}
            </Section>

            <Section title="Payment">
              <div className="flex justify-between items-center">
                <span className="text-caption text-surface-500">Status</span>
                <StatusBadge status={order.paymentStatus || 'pending'} type="payment" />
              </div>
              <div className="flex justify-between">
                <span className="text-caption text-surface-500">Method</span>
                <span className="text-caption text-surface-900 dark:text-surface-100 capitalize font-medium">{order.paymentMethod}</span>
              </div>
              {order.paymentId && (
                <div className="flex justify-between gap-2">
                  <span className="text-caption text-surface-500 flex-shrink-0">Payment ID</span>
                  <span className="text-caption text-surface-900 dark:text-surface-100 font-mono truncate">{order.paymentId}</span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 mt-1.5 border-t border-surface-100 dark:border-surface-800">
                <span className="text-caption text-surface-500">Amount</span>
                <span className="text-caption text-surface-900 dark:text-surface-100 font-semibold tabular-nums">{formatPrice(order.total)}</span>
              </div>

              {/* A paid order that was cancelled. Nothing pays the customer
                  back automatically — the shop returns the money by hand and
                  records it here, which is what clears "Refund due". */}
              {order.paymentStatus === 'refund_due' && (
                <div className="mt-2 space-y-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-2.5 py-2">
                  <p className="text-caption font-medium text-amber-700 dark:text-amber-400">
                    {formatPrice(order.total)} is owed back to the customer. Refund it by hand (UPI, bank or cash),
                    then mark it refunded.
                  </p>
                  <button
                    onClick={() => setConfirmRefund(true)}
                    disabled={savingRefund}
                    className="w-full h-9 rounded-lg bg-amber-600 text-white text-[13px] font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {savingRefund ? 'Saving…' : 'Mark as refunded'}
                  </button>
                </div>
              )}

              {/* Direct UPI / bank transfer — the proof and what was decided on it.
                  Approving and rejecting live in Payment Verification, so this is
                  a read-only record rather than a second place to decide. */}
              {order.manualPayment && (
                <div className="pt-2 mt-1.5 border-t border-surface-100 dark:border-surface-800 space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-caption text-surface-500 flex-shrink-0">UTR</span>
                    <span className="text-caption text-surface-900 dark:text-surface-100 font-mono break-all text-right">
                      {order.manualPayment.utr}
                    </span>
                  </div>
                  {order.manualPayment.claimedAmount !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-caption text-surface-500">Customer stated</span>
                      <span
                        className={cn(
                          'text-caption font-semibold tabular-nums',
                          order.manualPayment.claimedAmount !== order.total
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-surface-900 dark:text-surface-100',
                        )}
                      >
                        {formatPrice(order.manualPayment.claimedAmount)}
                      </span>
                    </div>
                  )}
                  {order.manualPayment.rejectionReason && (
                    <p className="text-caption text-red-600 dark:text-red-400">
                      Rejected: {order.manualPayment.rejectionReason}
                    </p>
                  )}
                  <a
                    href={order.manualPayment.screenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg overflow-hidden border border-surface-200 dark:border-surface-700 hover:border-brand-500/40 transition-colors"
                  >
                    <img
                      src={order.manualPayment.screenshotUrl}
                      alt="Payment proof"
                      className="w-full max-h-48 object-cover"
                      loading="lazy"
                    />
                  </a>
                  {order.paymentStatus === 'awaiting_verification' && (
                    <div className="space-y-2">
                      {/* The amount check the admin is really making. Called out
                          because approving a short payment is the expensive
                          mistake, and the two figures otherwise sit three rows
                          apart in the panel above. */}
                      {order.manualPayment.claimedAmount !== undefined &&
                        order.manualPayment.claimedAmount !== order.total && (
                          <p className="px-2.5 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-caption font-medium text-red-700 dark:text-red-400">
                            Customer states {formatPrice(order.manualPayment.claimedAmount)}, order is{' '}
                            {formatPrice(order.total)}.
                          </p>
                        )}

                      {!canVerifyPayments ? null : rejecting ? (
                        <>
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={2}
                            autoFocus
                            placeholder="Why is it being rejected? The customer is shown this."
                            className="w-full px-2.5 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-850 text-caption text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setRejecting(false);
                                setRejectReason('');
                                setPaymentError(null);
                              }}
                              className="flex-1 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => decidePayment(false)}
                              disabled={paymentBusy !== null}
                              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              {paymentBusy === 'reject' ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                              Confirm rejection
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setRejecting(true)}
                            disabled={paymentBusy !== null}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border border-red-200 dark:border-red-500/30 text-[13px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                          >
                            <X size={15} />
                            Reject
                          </button>
                          <button
                            onClick={() => decidePayment(true)}
                            disabled={paymentBusy !== null}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-green-600 text-white text-[13px] font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            {paymentBusy === 'approve' ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Check size={15} />
                            )}
                            Approve
                          </button>
                        </div>
                      )}

                      {paymentError && (
                        <p className="text-caption text-red-600 dark:text-red-400">{paymentError}</p>
                      )}

                      {/* Still the way through to the queue, for working a
                          backlog rather than one order at a time. */}
                      <Link
                        to="/admin/payment-verification"
                        className="block text-center text-caption text-surface-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                      >
                        Open the verification queue
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </Section>

            <Section title="Shipping Address">
              <p className="text-caption font-medium text-surface-900 dark:text-surface-100">{order.shippingAddress.fullName}</p>
              <InfoRow
                icon={<MapPin size={13} />}
                value={[order.shippingAddress.addressLine1, order.shippingAddress.addressLine2, `${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}`].filter(Boolean).join(', ')}
              />
              <InfoRow icon={<Phone size={13} />} value={order.shippingAddress.phone} />
            </Section>

            {/* Which parcel office this order is booked to. The address above is
                the customer's own; this is where the lorry actually takes it,
                and it is what goes on the booking slip. */}
            {order.deliveryPoint?.name && (
              <Section title="Collection Point">
                <p className="text-caption font-medium text-surface-900 dark:text-surface-100">
                  {order.deliveryPoint.name}
                </p>
                {order.deliveryPoint.parcelServiceName && (
                  <p className="text-caption text-surface-500">{order.deliveryPoint.parcelServiceName}</p>
                )}
                <InfoRow
                  icon={<MapPin size={13} />}
                  value={[
                    order.deliveryPoint.address,
                    order.deliveryPoint.area,
                    order.deliveryPoint.city,
                    order.deliveryPoint.pincode,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                />
                {order.deliveryPoint.phone && (
                  <InfoRow
                    icon={<Phone size={13} />}
                    value={`${order.deliveryPoint.phone}${order.deliveryPoint.contactPerson ? ` · ask for ${order.deliveryPoint.contactPerson}` : ''}`}
                  />
                )}
              </Section>
            )}

            {order.notes && (
              <Section title="Notes">
                <p className="text-caption text-surface-600 dark:text-surface-400 whitespace-pre-wrap">{order.notes}</p>
              </Section>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmTerminal}
        variant={newStatus === 'cancelled' ? 'danger' : 'warning'}
        title={newStatus === 'cancelled' ? `Cancel order ${orderRef(order)}?` : `Mark order ${orderRef(order)} delivered?`}
        description={
          newStatus === 'cancelled'
            ? `Its items go back into stock, any coupon is released and the customer is told. This cannot be undone.${
                order.paymentStatus === 'paid' || order.paymentStatus === 'awaiting_verification'
                  ? ` The customer has paid ${formatPrice(order.total)}: nothing is refunded automatically. Pay it back by hand, then use "Mark as refunded" here — until then the order shows "Refund due".`
                  : ''
              }`
            : 'A delivered order is closed for good — its status cannot be changed again afterwards.'
        }
        confirmLabel={newStatus === 'cancelled' ? 'Cancel order' : 'Mark delivered'}
        cancelLabel="Keep as is"
        isLoading={savingStatus}
        onConfirm={() => {
          setConfirmTerminal(false);
          void handleStatusUpdate();
        }}
        onCancel={() => setConfirmTerminal(false)}
      />

      {confirmRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={savingRefund ? undefined : () => setConfirmRefund(false)} />
          <div className="relative bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-xl max-w-md w-full p-6 space-y-3">
            <h3 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
              Mark {formatPrice(order.total)} as refunded?
            </h3>
            <p className="text-body-sm text-surface-500">
              Only once the money is back with the customer — this records the refund, it does not send it.
            </p>
            <textarea
              value={refundNote}
              onChange={(e) => setRefundNote(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="How it was paid back, e.g. UPI ref 4123… (optional)"
              className={`${inputClass} resize-none`}
            />
            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setConfirmRefund(false)}
                disabled={savingRefund}
                className="px-4 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors"
              >
                Not yet
              </button>
              <button
                onClick={() => void handleMarkRefunded()}
                disabled={savingRefund}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-body-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {savingRefund ? 'Saving…' : 'Mark as refunded'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={cn(
            'fixed bottom-5 right-5 z-[300] flex items-center gap-2.5 pl-4 pr-3 py-2.5 rounded-xl shadow-lg text-body-sm font-medium max-w-sm',
            toast.kind === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
          )}
        >
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="p-0.5 rounded hover:bg-white/20 transition-colors">
            <X size={15} />
          </button>
        </div>
      )}
    </DetailShell>
  );
}

// ── Tabs ──
/**
 * One line telling the admin what tracking this courier actually supports.
 *
 * Shown under the picker because that is where the decision is made. The three
 * modes are real differences, not a tidy taxonomy: 'auto' means the server can
 * fetch status, 'deeplink' means only the customer can look it up, and 'manual'
 * means nobody can — the shop types in what the booking office phones through.
 */
function CourierModeNote({ slug }: { slug?: string }) {
  const option = courierOption(slug);
  if (!option) return null;

  const copy: Record<TrackingMode, { text: string; cls: string }> = {
    auto: {
      text: 'Live tracking — "Check status" fetches updates from the courier.',
      cls: 'text-emerald-600 dark:text-emerald-400',
    },
    deeplink: {
      text: 'No live tracking. The customer gets a link to the courier’s own page.',
      cls: 'text-surface-500 dark:text-surface-400',
    },
    manual: {
      text: 'No online tracking at all. Add updates below as you hear them.',
      cls: 'text-amber-600 dark:text-amber-400',
    },
  };
  const { text, cls } = copy[option.mode];

  return (
    <p className={cn('mt-1.5 text-[11px]', cls)}>
      {text}
      {option.note && <span className="block text-surface-400">{option.note}</span>}
    </p>
  );
}


function ItemsTab({ order }: { order: AdminOrder }) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Item list scrolls on its own; the totals footer below stays put */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-1">
        {order.items.map((item) => (
          <div key={item.productId} className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
            <img src={item.image || undefined} alt={item.name} className="w-11 h-11 rounded-lg object-contain p-0.5 bg-surface-100 dark:bg-surface-800 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {item.slug ? (
                <Link to={`/product/${item.slug}`} className="text-body-sm font-medium text-surface-900 dark:text-surface-100 hover:text-brand-600 truncate block">
                  {item.name}
                </Link>
              ) : (
                <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 truncate">{item.name}</p>
              )}
              <p className="text-caption text-surface-400">
                {formatPrice(item.price)} × {item.quantity}
              </p>
            </div>
            <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100 tabular-nums">
              {formatPrice(item.price * item.quantity)}
            </p>
          </div>
        ))}
      </div>
      <div className="shrink-0 border-t border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 space-y-2">
        <div className="flex justify-between text-body-sm">
          <span className="text-surface-500">Subtotal</span>
          <span className="text-surface-900 dark:text-surface-100 tabular-nums">{formatPrice(order.subtotal)}</span>
        </div>
        <div className="flex justify-between text-body-sm">
          <span className="text-surface-500">Shipping</span>
          <span className="text-surface-900 dark:text-surface-100 tabular-nums">
            {order.shipping === 0 ? 'Free' : formatPrice(order.shipping)}
          </span>
        </div>
        {(order.gstAmount ?? 0) > 0 && (
          <div className="flex justify-between text-caption">
            <span className="text-surface-400">Incl. GST ({order.gstRate ?? 18}%)</span>
            <span className="text-surface-400 tabular-nums">{formatPrice(order.gstAmount ?? 0)}</span>
          </div>
        )}
        <div className="flex justify-between text-body-md font-semibold pt-2 border-t border-surface-100 dark:border-surface-800">
          <span className="text-surface-900 dark:text-surface-50">Total</span>
          <span className="text-surface-900 dark:text-surface-50 tabular-nums">{formatPrice(order.total)}</span>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ items }: { items: { entry: StatusHistoryEntry; isTransition: boolean }[] }) {
  if (items.length === 0) return <EmptyRegion icon={<Clock size={22} className="text-surface-300" />} text="No status history yet." />;
  return (
    <div className="p-4">
      <div className="relative">
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-surface-200 dark:bg-surface-700" />
        <div className="space-y-5">
          {[...items].reverse().map(({ entry, isTransition }, i) => {
            if (!isTransition) {
              return (
                <div key={i} className="relative flex items-start gap-3">
                  <div className="relative z-10 w-[30px] h-[30px] flex items-center justify-center flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-surface-300 dark:bg-surface-600" />
                  </div>
                  <div className="flex-1 pt-1.5">
                    {entry.note && <p className="text-caption text-surface-500 italic">&ldquo;{entry.note}&rdquo;</p>}
                    <p className="text-caption text-surface-400 mt-0.5">
                      {new Date(entry.changedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            }
            const EntryIcon = statusIcons[entry.status as OrderStatus] ?? Clock;
            const iconColor = statusIconColors[entry.status as OrderStatus] ?? 'text-surface-500 bg-surface-100 dark:bg-surface-800';
            return (
              <div key={i} className="relative flex items-start gap-3">
                <div className={`relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0 ${iconColor}`}>
                  <EntryIcon size={14} />
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 capitalize">{entry.status}</p>
                  <p className="text-caption text-surface-400">
                    {new Date(entry.changedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {entry.note && <p className="text-caption text-surface-500 mt-0.5 italic">&ldquo;{entry.note}&rdquo;</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Type in a tracking update the shop was told over the phone.
 *
 * The couriers Sivakasi cracker shops actually use mostly publish nothing
 * online — KPN, Surya, Vaigai and ABT have no tracker at all. What exists is a
 * phone call from the booking office, which until now went no further than the
 * person who took it. This puts it on the same timeline the customer already
 * watches for the auto-tracked couriers.
 *
 * The quick phrases are there because these updates are the same five or six
 * every time, and a counter is not a place for typing.
 */
const QUICK_UPDATES = [
  'Booked at Sivakasi',
  'Loaded — in transit',
  'Reached destination branch',
  'Out for delivery',
  'Delivered',
];

function ManualTrackingForm({
  orderId,
  onAdded,
  onError,
}: {
  orderId: string;
  onAdded: (order: AdminOrder) => void;
  onError: (msg: string) => void;
}) {
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (text?: string) => {
    const desc = (text ?? description).trim();
    if (!desc || saving) return;
    setSaving(true);
    try {
      const { addOrderTrackingEvent } = await import('@/services/admin.ts');
      onAdded(await addOrderTrackingEvent(orderId, { description: desc, location: location.trim() || undefined }));
      setDescription('');
      setLocation('');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not add that update.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-4 border-t border-surface-100 dark:border-surface-800">
      <p className="text-label uppercase tracking-wider text-surface-400 font-semibold mb-2">Add an update</p>

      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {QUICK_UPDATES.map((q) => (
          <button
            key={q}
            type="button"
            disabled={saving}
            onClick={() => void submit(q)}
            className="px-2.5 py-1 rounded-lg bg-surface-100 dark:bg-surface-800 text-caption font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 disabled:opacity-50 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }}
          placeholder="What happened? e.g. Reached Madurai branch"
          className={inputClass}
        />
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }}
          placeholder="Where (optional)"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !description.trim()}
          className="h-[42px] px-4 rounded-xl bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-body-sm font-semibold hover:bg-surface-800 dark:hover:bg-surface-200 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>

      <p className="mt-1.5 text-[11px] text-surface-400">
        The customer sees this on their tracking page. "Out for delivery" and "Delivered" also move the order
        status on.
      </p>
    </div>
  );
}
