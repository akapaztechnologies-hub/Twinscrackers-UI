import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Package, ArrowRight, ExternalLink, Loader2 } from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { SEO } from '@/components/SEO.tsx';
import { useSiteStore } from '@/store/site.ts';
import { TrackingTimeline } from '@/components/order/TrackingTimeline.tsx';
import { courierDisplayName, buildTrackingUrl } from '@/lib/couriers.ts';
import { trackOrderPublic } from '@/services/firestore.ts';
import { cn } from '@/lib/utils.ts';
import { unwrapData } from '@/lib/content.ts';
import api from '@/lib/api.ts';
import type { OrderTracking, OrderStatus } from '@/types/index.ts';
import type { FunctionalPagesData } from '@/pages/admin/FunctionalPagesTab.tsx';
import { orderRef } from '@/lib/orderRef.ts';

const statusPill: Record<OrderStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  confirmed: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  processing: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  shipped: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  delivered: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  cancelled: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
};

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function TrackOrderPage() {
  const siteConfig = useSiteStore(s => s.config);
  const [params, setParams] = useSearchParams();
  const [orderId, setOrderId] = useState(params.get('id') || params.get('order') || '');
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState<OrderTracking | null>(null);
  const [error, setError] = useState('');
  const [data, setData] = useState<FunctionalPagesData | null>(null);

  useEffect(() => {
    (api.get('/content/functional-pages') as Promise<{ data: FunctionalPagesData }>)
      .then(res => {
        const data = unwrapData<FunctionalPagesData>(res);
        if (data) setData(data);
      })
      .catch(() => {});
  }, []);

  const runTrack = async (id: string) => {
    const q = id.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setTracking(null);
    try {
      const data = await trackOrderPublic(q);
      setTracking(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order not found. Please check your order ID.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-track when arriving with ?id=/?order= (e.g. a deep-link from an order page).
  useEffect(() => {
    const initial = params.get('id') || params.get('order');
    if (initial) runTrack(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim()) return;
    setParams({ id: orderId.trim() }, { replace: true });
    runTrack(orderId);
  };

  const courier = courierDisplayName(tracking?.courier);
  const trackUrl = tracking?.courier && tracking?.trackingId ? buildTrackingUrl(tracking.courier, tracking.trackingId) : undefined;

  return (
    <div className="pt-16 lg:pt-18 min-h-screen">
      <SEO
        title="Track Your Order — Real-Time Delivery Status"
        description={`Track your ${siteConfig.name} order. Enter your order ID to see live courier status and shipment progress.`}
        canonical="/track-order"
      />
      {/* Header */}
      <section className="pt-8 pb-10 lg:pt-10 lg:pb-14 bg-white dark:bg-surface-900">
        <Container size="narrow">
          <div className="text-center">
            <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-brand-500">Order Tracking</span>
            <h1 className="font-display font-bold text-display-sm sm:text-display-md text-surface-900 dark:text-surface-50">{data?.trackHeroTitle || 'Track Your Order'}</h1>
            <p className="mt-4 text-body-lg text-surface-500 dark:text-surface-400">{data?.trackHeroSubtitle || 'Enter your order ID to see live delivery status.'}</p>

            <form onSubmit={handleTrack} className="mt-8 flex flex-col sm:flex-row items-center gap-3 max-w-lg mx-auto">
              <div className="relative flex-1 w-full">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="Enter your order ID"
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-700 text-body-md text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                />
              </div>
              <Button type="submit" size="lg" disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Track'}
                {!loading && <ArrowRight size={16} />}
              </Button>
            </form>
            <p className="mt-3 text-caption text-surface-400">Find your order ID in your confirmation email or under My Orders.</p>
          </div>
        </Container>
      </section>

      {/* Result */}
      <section className="section-padding bg-surface-50 dark:bg-surface-950">
        <Container size="narrow">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className="animate-spin text-brand-500" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center mx-auto mb-4">
                <Package size={36} className="text-surface-400" />
              </div>
              <p className="text-body-lg text-surface-700 dark:text-surface-200 font-medium">{error}</p>
              <p className="mt-2 text-body-sm text-surface-400">Double-check the order ID and try again.</p>
            </div>
          ) : tracking ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              {/* Summary */}
              <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 lg:p-8 border border-surface-200 dark:border-surface-800 mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-surface-200 dark:border-surface-800">
                  <div>
                    <p className="text-label font-bold uppercase tracking-wider text-brand-500 mb-1">Order ID</p>
                    <p className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
                      {orderRef(tracking)}
                    </p>
                  </div>
                  <span className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-full border capitalize', statusPill[tracking.status] ?? statusPill.pending)}>
                    <span className="w-2 h-2 rounded-full bg-current" />
                    <span className="text-body-sm font-semibold">{tracking.status}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-body-sm">
                  <div>
                    <p className="text-surface-500 mb-1">Placed On</p>
                    <p className="font-medium text-surface-900 dark:text-surface-100">{fmtDate(tracking.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-surface-500 mb-1">Courier</p>
                    <p className="font-medium text-surface-900 dark:text-surface-100">{courier || '—'}</p>
                  </div>
                  <div>
                    <p className="text-surface-500 mb-1">Tracking No.</p>
                    <p className="font-medium font-mono text-surface-900 dark:text-surface-100 truncate">{tracking.trackingId || '—'}</p>
                  </div>
                  <div>
                    <p className="text-surface-500 mb-1">Last Checked</p>
                    <p className="font-medium text-surface-900 dark:text-surface-100">{tracking.lastTrackedAt ? fmtDate(tracking.lastTrackedAt) : '—'}</p>
                  </div>
                </div>

                {trackUrl && (
                  <a
                    href={trackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-1.5 text-body-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    <ExternalLink size={15} /> Track on courier website
                  </a>
                )}
              </div>

              {/* Timeline */}
              <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 lg:p-8 border border-surface-200 dark:border-surface-800">
                <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50 mb-6">Delivery Progress</h3>
                <TrackingTimeline
                  events={tracking.trackingEvents}
                  emptyText="No courier updates yet. Your tracking timeline will appear here once the courier scans your package."
                />
              </div>
            </motion.div>
          ) : (
            <div className="text-center py-12">
              <div className="w-20 h-20 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center mx-auto mb-4">
                <Package size={36} className="text-surface-400" />
              </div>
              <p className="text-body-lg text-surface-500">
                Enter your order ID above to track your shipment
              </p>
              <p className="mt-2 text-body-sm text-surface-400">You can find your order ID in your confirmation email</p>
            </div>
          )}
        </Container>
      </section>
    </div>
  );
}
