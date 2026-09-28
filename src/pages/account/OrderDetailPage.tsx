import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Package, Truck, CheckCircle, Clock, MapPin, CreditCard, RefreshCw, Loader2, ExternalLink, Printer, Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/atoms/Button.tsx';
import { useAuthStore } from '@/store/auth.ts';
import { useSiteStore } from '@/store/site.ts';
import { getOrderById, refreshOrderTracking } from '@/services/firestore.ts';
import { printOrderInvoice, downloadOrderInvoice } from '@/lib/orderPdf.ts';
import { formatPrice, cn } from '@/lib/utils.ts';
import { TrackingTimeline } from '@/components/order/TrackingTimeline.tsx';
import { reorderItems } from '@/lib/reorder.ts';
import { useCartStore } from '@/store/cart.ts';
import { UpiPaymentPanel } from '@/components/order/UpiPaymentPanel.tsx';
import { getManualPayment } from '@/services/payments.ts';
import { courierDisplayName, buildTrackingUrl } from '@/lib/couriers.ts';
import type { ManualPayment, ManualPaymentInstructions, Order, OrderStatus } from '@/types/index.ts';
import { orderRef } from '@/lib/orderRef.ts';

const timelineSteps: { status: OrderStatus; label: string; icon: typeof Package }[] = [
  { status: 'pending', label: 'Order Placed', icon: Package },
  { status: 'confirmed', label: 'Confirmed', icon: CheckCircle },
  { status: 'processing', label: 'Processing', icon: Clock },
  { status: 'shipped', label: 'Shipped', icon: Truck },
  { status: 'delivered', label: 'Delivered', icon: MapPin },
];

const statusIndex: Record<OrderStatus, number> = {
  pending: 0,
  confirmed: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
  cancelled: -1,
};

const paymentStatusConfig: Record<string, { label: string; color: string }> = {
  paid: { label: 'Paid', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  pending: { label: 'Payment Pending', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  awaiting_verification: { label: 'Verifying Payment', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  failed: { label: 'Payment Failed', color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  // A paid order the shop cancelled: the money goes back by hand. Without its
  // own entry it fell through to "Payment Pending", which reads as a demand.
  refund_due: { label: 'Refund Due', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  refunded: { label: 'Refunded', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
};

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const user = useAuthStore((s) => s.user);
  const siteConfig = useSiteStore((s) => s.config);
  const [reordering, setReordering] = useState(false);
  const [reorderNote, setReorderNote] = useState('');
  const openCart = useCartStore((s) => s.openCart);

  /**
   * Rebuild this order in the cart.
   *
   * Opens the cart afterwards rather than jumping to checkout: what came back
   * may be short a discontinued line or two, and the customer should see the
   * basket they are about to pay for before they are asked to pay for it.
   */
  const handleReorder = async () => {
    if (!order) return;
    setReordering(true);
    setReorderNote('');
    try {
      const { added, unavailable } = await reorderItems(order.items);
      if (added === 0) {
        setReorderNote('None of these are on sale any more.');
        return;
      }
      setReorderNote(
        unavailable.length
          ? `${added} item${added === 1 ? '' : 's'} added. Not available now: ${unavailable.join(', ')}.`
          : '',
      );
      openCart();
    } catch {
      setReorderNote('Could not rebuild that order just now. Please try again.');
    } finally {
      setReordering(false);
    }
  };

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  // A direct-UPI order the customer has not finished paying for. Loading this
  // here is what lets them come back later, or resubmit after a rejection,
  // without having to place the order again.
  const [upi, setUpi] = useState<{
    payment: ManualPaymentInstructions;
    manualPayment: ManualPayment | null;
  } | null>(null);
  const [trackMsg, setTrackMsg] = useState('');
  const [pdfBusy, setPdfBusy] = useState<'print' | 'download' | null>(null);

  // True while a direct-UPI order has not been confirmed as paid.
  const invoiceWithheld =
    order?.paymentMethod === 'upi_manual' && order?.paymentStatus !== 'paid';

  const handlePdf = async (mode: 'print' | 'download') => {
    if (!order || pdfBusy || invoiceWithheld) return;
    setPdfBusy(mode);
    try {
      if (mode === 'print') await printOrderInvoice(order);
      else await downloadOrderInvoice(order);
    } catch {
      /* ignore — nothing to recover */
    } finally {
      setPdfBusy(null);
    }
  };

  const uid = user?.uid;

  useEffect(() => {
    if (!uid || !orderId) return;
    // A different order id is a different page: clear the last one first, and
    // ignore its answer if it lands late, so one order can never be shown
    // under another's URL — including after the new one fails to load.
    let cancelled = false;
    setIsLoading(true);
    setOrder(null);
    setReorderNote('');
    setTrackMsg('');
    getOrderById(uid, orderId)
      .then((o) => { if (!cancelled) setOrder(o); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [uid, orderId]);

  // Pull the QR / bank details only while there is still something for the
  // customer to do: an unpaid or under-review direct-UPI order.
  useEffect(() => {
    if (!orderId || !order) return;
    const outstanding =
      order.paymentMethod === 'upi_manual' &&
      order.status !== 'cancelled' &&
      order.paymentStatus !== 'paid';
    if (!outstanding) {
      setUpi(null);
      return;
    }

    let active = true;
    getManualPayment(orderId)
      .then((res) => {
        if (active) setUpi({ payment: res.payment, manualPayment: res.manualPayment });
      })
      .catch(() => {
        // Manual payment may have been switched off since the order was placed —
        // the order itself still renders fine without this panel.
        if (active) setUpi(null);
      });
    return () => {
      active = false;
    };
  }, [orderId, order]);

  const checkStatus = async () => {
    if (!user || !orderId || checking) return;
    setChecking(true);
    setTrackMsg('');
    try {
      const res = await refreshOrderTracking(user.uid, orderId);
      setOrder((o) =>
        o
          ? {
              ...o,
              status: res.status,
              trackingEvents: res.events,
              lastTrackedAt: res.lastTrackedAt,
              courier: res.courier,
              courierName: res.courierName,
            }
          : o,
      );
      if (!res.scraped) {
        setTrackMsg('Couldn’t read live updates automatically. Use “Courier site” to view on the courier’s page.');
      }
    } catch (e) {
      setTrackMsg(e instanceof Error ? e.message : 'Could not check status right now.');
    } finally {
      setChecking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20">
        <p className="text-body-lg text-surface-500">Order not found</p>
        <Link to="/account/orders"><Button className="mt-4">Back to Orders</Button></Link>
      </div>
    );
  }

  const currentStep = statusIndex[order.status];
  const courierUrl = order.trackingId ? buildTrackingUrl(order.courier, order.trackingId) : '';
  // GST added on top of the goods (stored on the order at checkout).
  const gstRate = order.gstRate ?? (siteConfig.gstEnabled !== false ? (siteConfig.gstRate ?? 18) : 0);
  const gstAmount = order.gstAmount ?? 0;
  const showGst = gstAmount > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Link to="/account/orders" className="inline-flex items-center gap-2 text-body-sm text-surface-500 hover:text-brand-500 transition-colors mb-6">
        <ArrowLeft size={16} /> Back to Orders
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
          Order {orderRef(order)}
        </h2>
        {/* A tax invoice asserts the money was received. Withhold it while a
            direct-UPI payment is unverified, rather than issuing a document that
            says "Paid via UPI" before anyone has confirmed it. */}
        <div className={cn('flex items-center gap-2', invoiceWithheld && 'hidden')}>
          <button
            onClick={() => handlePdf('print')}
            disabled={pdfBusy !== null}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-semibold text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50 transition-colors"
          >
            {pdfBusy === 'print' ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
            Print Invoice
          </button>
          <button
            onClick={() => handlePdf('download')}
            disabled={pdfBusy !== null}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {pdfBusy === 'download' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Download Invoice
          </button>
        </div>
      </div>

      {/* Outstanding direct-UPI payment — kept above the timeline because it is
          the only thing on this page the customer still has to act on. */}
      {upi && (
        <div className="mb-6">
          <UpiPaymentPanel
            payment={upi.payment}
            paymentStatus={order.paymentStatus ?? 'pending'}
            manualPayment={upi.manualPayment}
            onSubmitted={() => {
              // Re-read the order so the badge and panel switch to "under review".
              if (user && orderId) getOrderById(user.uid, orderId).then(setOrder).catch(() => {});
            }}
          />
        </div>
      )}

      {/* Status Timeline */}
      {order.status !== 'cancelled' && (
        <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 border border-surface-200 dark:border-surface-800 mb-6">
          <div className="flex items-center justify-between">
            {timelineSteps.map((step, i) => {
              const Icon = step.icon;
              const isCompleted = i <= currentStep;
              const isActive = i === currentStep;
              return (
                <div key={step.status} className="flex-1 flex flex-col items-center relative">
                  {i > 0 && (
                    <div className={cn('absolute top-5 right-1/2 w-full h-0.5', i <= currentStep ? 'bg-emerald-500' : 'bg-surface-200 dark:bg-surface-700')} />
                  )}
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center z-10',
                    isCompleted ? 'bg-emerald-500 text-white' : isActive ? 'bg-brand-500 text-surface-950' : 'bg-surface-200 dark:bg-surface-700 text-surface-400',
                  )}>
                    <Icon size={18} />
                  </div>
                  <p className={cn('mt-2 text-caption font-medium text-center', isCompleted || isActive ? 'text-surface-900 dark:text-surface-100' : 'text-surface-400')}>
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delivery Tracking */}
      {(order.trackingId || order.status === 'shipped' || order.status === 'delivered') && (
        <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 border border-surface-200 dark:border-surface-800 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">Delivery Tracking</h3>
              {order.trackingId ? (
                <p className="mt-1 text-body-sm text-surface-500">
                  {courierDisplayName(order.courier) && <span>{courierDisplayName(order.courier)} · </span>}
                  <span className="font-mono text-surface-700 dark:text-surface-300">{order.trackingId}</span>
                </p>
              ) : (
                <p className="mt-1 text-body-sm text-surface-500">
                  {order.status === 'delivered'
                    ? 'Your order has been delivered.'
                    : 'Your order has shipped — tracking details will appear here soon.'}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {courierUrl && (
                <a
                  href={courierUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
                >
                  <ExternalLink size={14} /> Courier site
                </a>
              )}
              <button
                onClick={checkStatus}
                disabled={checking || !order.trackingId}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                Check status
              </button>
            </div>
          </div>
          {trackMsg && <p className="mb-3 text-body-sm text-amber-600 dark:text-amber-400">{trackMsg}</p>}
          {order.trackingId && (
            <TrackingTimeline events={order.trackingEvents} emptyText="No courier updates yet. Press “Check status” to fetch the latest." />
          )}
          {order.lastTrackedAt && (
            <p className="mt-3 text-caption text-surface-400">
              Last checked{' '}
              {new Date(order.lastTrackedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Items */}
        <div className="lg:col-span-2 bg-white dark:bg-surface-900 rounded-2xl p-6 border border-surface-200 dark:border-surface-800">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">Items</h3>
            {/* Buying the same box again is how this shop's year works. The
                button re-prices from the catalogue rather than the order — see
                lib/reorder.ts. */}
            <button
              onClick={handleReorder}
              disabled={reordering}
              className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-body-sm font-semibold text-surface-700 dark:text-surface-300 hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-60 transition-colors"
            >
              {reordering ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
              Buy these again
            </button>
          </div>

          {reorderNote && (
            <p className="mb-4 px-3 py-2 rounded-xl bg-surface-100 dark:bg-surface-850 text-body-sm text-surface-600 dark:text-surface-400">
              {reorderNote}
            </p>
          )}
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {order.items.map((item) => (
              <div key={item.productId} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                <div className="w-14 h-14 rounded-xl bg-surface-100 dark:bg-surface-850 overflow-hidden flex-shrink-0">
                  <img src={item.image || undefined} alt={item.name} className="w-full h-full object-contain p-1" />
                </div>
                <div className="flex-1 min-w-0">
                  <Link to={`/product/${item.slug}`} className="font-medium text-body-md text-surface-900 dark:text-surface-100 hover:text-brand-500 truncate block">
                    {item.name}
                  </Link>
                  <p className="text-body-sm text-surface-500">Qty: {item.quantity}</p>
                </div>
                <p className="font-display font-bold text-body-md text-surface-900 dark:text-surface-100">
                  {formatPrice(item.price * item.quantity)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 border border-surface-200 dark:border-surface-800">
            <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50 mb-4">Summary</h3>
            <div className="space-y-2 text-body-sm">
              <div className="flex justify-between"><span className="text-surface-500">Subtotal</span><span className="text-surface-900 dark:text-surface-100">{formatPrice(order.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-surface-500">Shipping</span><span className="text-surface-900 dark:text-surface-100">{order.shipping === 0 ? 'Free' : formatPrice(order.shipping)}</span></div>
              {showGst && (
                <div className="flex justify-between text-caption text-surface-400"><span>Incl. GST ({gstRate}%)</span><span>{formatPrice(gstAmount)}</span></div>
              )}
              <div className="flex justify-between pt-2 border-t border-surface-100 dark:border-surface-800 font-display font-bold text-body-lg">
                <span className="text-surface-900 dark:text-surface-50">Total</span>
                <span className="text-brand-600 dark:text-brand-400">{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 border border-surface-200 dark:border-surface-800">
            <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50 mb-3">Details</h3>
            <div className="space-y-3 text-body-sm">
              <div className="flex items-start gap-2"><Clock size={16} className="text-surface-400 mt-0.5 flex-shrink-0" /><span className="text-surface-600 dark:text-surface-400">{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
              <div className="flex items-center gap-2"><CreditCard size={16} className="text-surface-400 flex-shrink-0" /><span className="text-surface-600 dark:text-surface-400">{order.paymentMethod}</span>
                {order.paymentStatus && (
                  <span className={cn('ml-auto px-2 py-0.5 rounded-lg text-caption font-bold uppercase', (paymentStatusConfig[order.paymentStatus] ?? paymentStatusConfig.pending).color)}>
                    {(paymentStatusConfig[order.paymentStatus] ?? paymentStatusConfig.pending).label}
                  </span>
                )}
              </div>
              <div className="flex items-start gap-2"><MapPin size={16} className="text-surface-400 mt-0.5 flex-shrink-0" /><span className="text-surface-600 dark:text-surface-400">{order.shippingAddress.addressLine1}, {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.pincode}</span></div>
            </div>
          </div>

          {/* Where to collect. Fireworks are not delivered to a door, so this
              office and its phone number are how the customer actually gets
              the parcel — and this page, not the one-off confirmation screen,
              is where they come back to look it up on collection day. */}
          {order.deliveryPoint?.name && (
            <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 border border-surface-200 dark:border-surface-800">
              <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50 mb-3">Collect from</h3>
              <div className="space-y-1 text-body-sm">
                <p className="font-semibold text-surface-900 dark:text-surface-100">{order.deliveryPoint.name}</p>
                {order.deliveryPoint.parcelServiceName && (
                  <p className="text-surface-500">{order.deliveryPoint.parcelServiceName}</p>
                )}
                <p className="text-surface-600 dark:text-surface-400">
                  {[
                    order.deliveryPoint.address,
                    order.deliveryPoint.area,
                    order.deliveryPoint.city,
                    order.deliveryPoint.pincode,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {(order.deliveryPoint.phone || order.deliveryPoint.contactPerson) && (
                  <p className="text-surface-600 dark:text-surface-400">
                    {order.deliveryPoint.phone}
                    {order.deliveryPoint.contactPerson && ` · ask for ${order.deliveryPoint.contactPerson}`}
                  </p>
                )}
                <p className="pt-1 text-caption text-surface-400">
                  The driver will call you when your parcel reaches this office.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
