import { useState, useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Package, ArrowRight, ShoppingBag, Download, Loader2, Clock } from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { useAuthStore } from '@/store/auth.ts';
import { useSiteStore } from '@/store/site.ts';
import { getOrderById } from '@/services/firestore.ts';
import { downloadOrderInvoice } from '@/lib/orderPdf.ts';
import { formatPrice } from '@/lib/utils.ts';
import type { Order } from '@/types/index.ts';
import { orderRef } from '@/lib/orderRef.ts';
import { ClaimAccountForm, type ClaimAccountDefaults } from '@/components/account/ClaimAccountForm.tsx';

interface LinkCTA { label: string; link: string; }

interface ConfirmationContent {
  thankYou: { title: string; message: string };
  orderNumberLabel: string;
  paymentIdLabel: string;
  qtyLabel: string;
  summary: { subtotal: string; shipping: string; free: string; totalPaid: string };
  estimatedDeliveryLabel: string;
  ctaPrimary: LinkCTA;
  ctaSecondary: LinkCTA;
  notFound: { message: string; ctaLabel: string; ctaLink: string };
}

interface StoreFlowData {
  confirmation: ConfirmationContent;
  [key: string]: unknown;
}

const confirmationDefaults: ConfirmationContent = {
  thankYou: {
    title: 'Order Confirmed!',
    message: 'Thank you for your purchase. Your order has been placed successfully.',
  },
  orderNumberLabel: 'Order Number',
  paymentIdLabel: 'Payment ID',
  qtyLabel: 'Qty:',
  summary: {
    subtotal: 'Subtotal',
    shipping: 'Shipping',
    free: 'Free',
    totalPaid: 'Total Paid',
  },
  estimatedDeliveryLabel: 'Estimated Delivery',
  ctaPrimary: { label: 'Continue Shopping', link: '/shop' },
  ctaSecondary: { label: 'View Orders', link: '/account/orders' },
  notFound: {
    message: 'Order not found',
    ctaLabel: 'Back to Shop',
    ctaLink: '/shop',
  },
};

const storeFlowDefaults: StoreFlowData = { confirmation: confirmationDefaults };

export function OrderConfirmationPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const siteConfig = useSiteStore((s) => s.config);
  const store = storeFlowDefaults;
  const c = { ...confirmationDefaults, ...store.confirmation };
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);

  const handleDownload = async () => {
    if (!order || pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadOrderInvoice(order);
    } catch {
      /* ignore */
    } finally {
      setPdfBusy(false);
    }
  };

  // Keyed on the account id: claiming an account on this page replaces the
  // user object, and that is no reason to fetch the order again.
  const uid = user?.uid;

  useEffect(() => {
    if (!uid || !orderId) return;
    let cancelled = false;
    getOrderById(uid, orderId)
      .then((o) => { if (!cancelled) setOrder(o); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [uid, orderId]);

  // A guest IS authenticated by this point — the checkout adopted the session
  // the server issued for the customer record it attached their order to — so
  // this only catches somebody who arrived at the URL with no session at all.
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: `/order-confirmation/${orderId}` }} replace />;
  }

  if (isLoading) {
    return (
      <div className="pt-24 min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950">
        <div className="w-10 h-10 rounded-full border-3 border-brand-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="pt-24 min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950">
        <div className="text-center">
          <p className="text-body-lg text-surface-500">{c.notFound.message}</p>
          <Link to={c.notFound.ctaLink} className="mt-4 inline-block">
            <Button>{c.notFound.ctaLabel}</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Counted from when the order was placed, not from whenever this page is
  // opened — coming back to it a week later used to push the date a week out.
  const placedAt = order.createdAt ? new Date(order.createdAt) : new Date();
  const estimatedDelivery = Number.isNaN(placedAt.getTime()) ? new Date() : placedAt;
  estimatedDelivery.setDate(estimatedDelivery.getDate() + (order.shipping > 0 ? 3 : 7));

  // "Total Paid" only once it is: a cash-on-delivery or unverified UPI order
  // has not been paid yet, and saying so beside the amount misleads.
  const totalLabel = order.paymentStatus === 'paid' ? c.summary.totalPaid : 'Order Total';

  // GST added on top of the goods (stored on the order at checkout).
  const gstRate = order.gstRate ?? (siteConfig.gstEnabled !== false ? (siteConfig.gstRate ?? 18) : 0);
  const gstAmount = order.gstAmount ?? 0;
  const showGst = gstAmount > 0;

  return (
    <div className="pt-16 lg:pt-18 min-h-screen bg-surface-50 dark:bg-surface-950">
      <Container size="narrow">
        <div className="py-12 lg:py-16">
          {/* Success Animation */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
            className="flex justify-center mb-8"
          >
            <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
              >
                <CheckCircle size={48} className="text-emerald-500" />
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="text-center mb-10"
          >
            <h1 className="font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">
              {c.thankYou.title}
            </h1>
            <p className="mt-3 text-body-lg text-surface-500">
              {c.thankYou.message}
            </p>
          </motion.div>

          {/* Order Details Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="bg-white dark:bg-surface-900 rounded-2xl p-6 lg:p-8 border border-surface-200 dark:border-surface-800 mb-6"
          >
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-surface-200 dark:border-surface-800">
              <div>
                <p className="text-body-sm text-surface-500">{c.orderNumberLabel}</p>
                <p className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">
                  {orderRef(order)}
                </p>
              </div>
              <div className="text-right">
                {/* Only label it a payment id when there actually is one — a
                    direct-UPI order has none until an admin verifies it, and
                    falling back to the method printed "upi_manual" here. */}
                <p className="text-body-sm text-surface-500">
                  {order.paymentId ? c.paymentIdLabel : 'Payment'}
                </p>
                <p className="text-body-sm font-medium text-surface-700 dark:text-surface-300">
                  {order.paymentId ??
                    (order.paymentMethod === 'upi_manual'
                      ? 'UPI / Bank transfer'
                      : order.paymentMethod)}
                </p>
              </div>
            </div>

            {/* A direct-UPI order is not finished at this screen — it still needs
                payment or is waiting on our review. Say so, and link onward. */}
            {order.paymentMethod === 'upi_manual' && order.paymentStatus !== 'paid' && (
              <div className="mb-6 -mt-2 flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <Clock size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-50">
                    {order.paymentStatus === 'awaiting_verification'
                      ? 'We are verifying your payment'
                      : 'Your payment is not complete yet'}
                  </p>
                  <p className="text-body-sm text-surface-500 mt-0.5">
                    {order.paymentStatus === 'awaiting_verification'
                      ? 'We have your payment proof and will confirm this order shortly.'
                      : 'Finish paying and upload your payment screenshot to confirm this order.'}
                  </p>
                  <Link
                    to={`/account/orders/${order.id}`}
                    className="inline-block mt-2 text-body-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    {order.paymentStatus === 'awaiting_verification'
                      ? 'View order status'
                      : 'Complete payment'} &rarr;
                  </Link>
                </div>
              </div>
            )}

            {/* Items */}
            <div className="space-y-3 mb-6">
              {order.items.map((item) => (
                <div key={item.productId} className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-surface-100 dark:bg-surface-850 overflow-hidden flex-shrink-0">
                    <img src={item.image || undefined} alt={item.name} className="w-full h-full object-contain p-1" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                      {item.name}
                    </p>
                    <p className="text-caption text-surface-500">{c.qtyLabel} {item.quantity}</p>
                  </div>
                  <span className="text-body-sm font-bold text-surface-900 dark:text-surface-100">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="pt-4 border-t border-surface-200 dark:border-surface-800 space-y-2">
              <div className="flex justify-between text-body-sm text-surface-500">
                <span>{c.summary.subtotal}</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-body-sm text-surface-500">
                <span>{c.summary.shipping}</span>
                <span>{order.shipping === 0 ? c.summary.free : formatPrice(order.shipping)}</span>
              </div>
              {showGst && (
                <div className="flex justify-between text-caption text-surface-400">
                  <span>Incl. GST ({gstRate}%)</span>
                  <span>{formatPrice(gstAmount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-3 border-t border-surface-200 dark:border-surface-800">
                <span className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">
                  {totalLabel}
                </span>
                <span className="font-display font-bold text-heading-sm text-brand-600 dark:text-brand-400">
                  {formatPrice(order.total)}
                </span>
              </div>
            </div>

            {/* Download order copy */}
            <button
              onClick={handleDownload}
              disabled={pdfBusy}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-semibold text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-60 transition-colors"
            >
              {pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Download Invoice (PDF)
            </button>
          </motion.div>

          {/* Estimated Delivery */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.45 }}
            className="bg-white dark:bg-surface-900 rounded-2xl p-6 border border-surface-200 dark:border-surface-800 mb-8"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center">
                <Package size={20} className="text-brand-500" />
              </div>
              <div>
                <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">
                  {c.estimatedDeliveryLabel}
                </p>
                <p className="text-body-sm text-surface-500">
                  {estimatedDelivery.toLocaleDateString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Where to collect. Given its own card because it is the one thing
              on this page the customer will come back to look up: fireworks
              are not delivered to a door, so this address and this phone
              number are how they actually get their order. */}
          {order.deliveryPoint?.name && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.45 }}
              className="bg-white dark:bg-surface-900 rounded-2xl p-6 lg:p-8 border border-surface-200 dark:border-surface-800 mb-6"
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                  <Package size={20} className="text-brand-600 dark:text-brand-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-caption text-surface-500">Collect your order from</p>
                  <p className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">
                    {order.deliveryPoint.name}
                  </p>
                  {order.deliveryPoint.parcelServiceName && (
                    <p className="text-body-sm text-surface-500">{order.deliveryPoint.parcelServiceName}</p>
                  )}
                  <p className="mt-2 text-body-sm text-surface-600 dark:text-surface-400">
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
                    <p className="mt-1 text-body-sm text-surface-600 dark:text-surface-400">
                      {order.deliveryPoint.phone}
                      {order.deliveryPoint.contactPerson && ` · ask for ${order.deliveryPoint.contactPerson}`}
                    </p>
                  )}
                  <p className="mt-3 text-caption text-surface-400">
                    The driver will call you when your parcel reaches this office.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Offered only AFTER the order is safely placed, and only to a
              guest. Asking for a password before the order is the friction
              guest checkout exists to remove; asking once the order is done
              costs nothing and the account inherits it, because the order is
              already attached to their phone-keyed record. */}
          {user?.isGuest && siteConfig.offerAccountAfterOrder && (
            <ClaimAccountCard
              reference={orderRef(order)}
              defaults={{
                phone: order.shippingAddress?.phone || user.phone || '',
                orderNumber: order.orderNumber || orderRef(order),
                amount: order.total,
              }}
            />
          )}

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.55 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link to={c.ctaPrimary.link}>
              <Button size="lg">
                <ShoppingBag size={18} />
                {c.ctaPrimary.label}
              </Button>
            </Link>
            <Link to={c.ctaSecondary.link}>
              <Button size="lg" variant="outline">
                {c.ctaSecondary.label}
                <ArrowRight size={18} />
              </Button>
            </Link>
          </motion.div>
        </div>
      </Container>
    </div>
  );
}

/**
 * "Set a password and this order is in your account."
 *
 * Shown to a guest on the confirmation page. It creates an account holding this
 * order and any others placed on this device — never everything ever ordered
 * on the phone number, which proving one order must not unlock. Older orders
 * are added from My Orders, each with its own proof.
 *
 * The order number and amount are asked for because the server needs proof
 * beyond a phone number; this visitor has the order on screen, so they are
 * filled in for them.
 *
 * Dismissible, and dismissal sticks for the page: a customer who does not want
 * an account should not be asked twice on the same screen.
 */
function ClaimAccountCard({
  reference,
  defaults,
}: {
  /** How the order is named on screen, so this card and the header agree. */
  reference: string;
  defaults: ClaimAccountDefaults;
}) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [done, setDone] = useState(false);

  if (dismissed) return null;

  if (done) {
    return (
      <div className="mb-6 p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-center">
        <p className="text-body-md font-semibold text-emerald-700 dark:text-emerald-300">
          Account created — you're signed in.
        </p>
        <p className="mt-1 text-body-sm text-emerald-600 dark:text-emerald-400">
          This order, and any others placed on this device, are in your account now. You can add older orders from
          My Orders.
        </p>
        <Link to="/account/orders" className="mt-3 inline-block">
          <Button size="sm">View my orders</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-6 p-5 rounded-2xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <p className="text-body-md font-semibold text-surface-900 dark:text-surface-50">
            Track this order and reorder faster
          </p>
          <p className="mt-0.5 text-body-sm text-surface-500 dark:text-surface-400">
            Set a password and order {reference} is saved to your account.
          </p>
        </div>
        {!open && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setOpen(true)}>
              Create account
            </Button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="px-3 py-2 text-body-sm font-medium text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
            >
              No thanks
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="mt-4">
          <ClaimAccountForm defaults={defaults} onClaimed={() => setDone(true)} onCancel={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
