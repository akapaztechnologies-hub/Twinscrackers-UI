import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowLeft, Pencil, Ticket, Users, TrendingUp, IndianRupee, Copy, Check,
  Store, Globe, Wallet,
} from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { CouponFormDrawer } from '@/components/admin/CouponFormDrawer.tsx';
import { getCouponStats } from '@/services/coupons.ts';
import { couponState, COUPON_STATE_LABELS, type CouponStats, type CouponState } from '@/types/coupon.ts';

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

const STATE_STYLES: Record<CouponState, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  inactive: 'bg-surface-500/10 text-surface-600 dark:text-surface-300',
  scheduled: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  expired: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  exhausted: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Ticket;
  color: string;
}

function Stat({ label, value, hint, icon: Icon, color }: StatProps) {
  return (
    <div className="p-4 rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-medium text-surface-500 dark:text-surface-400">{label}</p>
          <p className="mt-1 font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50 tabular-nums">
            {value}
          </p>
          {hint && <p className="mt-0.5 text-caption text-surface-500 dark:text-surface-400">{hint}</p>}
        </div>
        <span className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-xl ${color}`}>
          <Icon size={17} />
        </span>
      </div>
    </div>
  );
}

export function AdminCouponDetailPage() {
  const { couponId } = useParams<{ couponId: string }>();
  const navigate = useNavigate();

  const [stats, setStats] = useState<CouponStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!couponId) return;
    setIsLoading(true);
    try {
      setStats(await getCouponStats(couponId, { page, limit: itemsPerPage }));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [couponId, page, itemsPerPage]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const coupon = stats?.coupon;
  const s = stats?.summary;

  const shareLink = coupon
    ? `${window.location.origin}/?coupon=${encodeURIComponent(coupon.code)}`
    : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate('/admin/coupons')}
          className="flex items-center gap-2 text-body-sm text-surface-600 dark:text-surface-400 hover:text-brand-600 transition-colors"
        >
          <ArrowLeft size={16} /> Back to coupons
        </button>
        <p className="mt-6 text-body-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  const chartData = (stats?.timeline ?? []).map((d) => ({
    date: formatDate(d.date),
    sales: d.netSales,
    uses: d.uses,
  }));

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={() => navigate('/admin/coupons')}
            className="flex items-center gap-1.5 text-body-sm text-surface-500 hover:text-brand-600 transition-colors"
          >
            <ArrowLeft size={15} /> Coupons
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-mono font-bold text-heading-md tracking-wider text-surface-900 dark:text-surface-50">
              {coupon?.code ?? '…'}
            </h1>
            {coupon && (
              <span className={`inline-flex px-2 py-0.5 rounded-md text-caption font-medium ${STATE_STYLES[couponState(coupon)]}`}>
                {COUPON_STATE_LABELS[couponState(coupon)]}
              </span>
            )}
          </div>
          <p className="mt-1 text-body-sm text-surface-500 dark:text-surface-400">
            {coupon?.description || 'No description'}
            {coupon?.influencer && (
              <>
                {' · '}
                <Link
                  to={`/admin/influencers/${coupon.influencer.id}`}
                  className="text-brand-600 dark:text-brand-400 hover:underline"
                >
                  {coupon.influencer.name}
                </Link>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors"
            title="A link that applies the code automatically — good for an influencer's bio"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied' : 'Copy share link'}
          </button>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
          >
            <Pencil size={15} />
            Edit
          </button>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Coupons Used"
          value={(s?.uses ?? 0).toLocaleString('en-IN')}
          hint={
            s?.remaining !== null && s?.remaining !== undefined
              ? `${s.remaining.toLocaleString('en-IN')} of ${s.usageLimit.toLocaleString('en-IN')} left`
              : 'No usage limit'
          }
          icon={Ticket}
          color="text-blue-600 bg-blue-500/10"
        />
        <Stat
          label="Sales Generated"
          value={inr(s?.netSales ?? 0)}
          hint={`${inr(s?.avgOrderValue ?? 0)} average order`}
          icon={TrendingUp}
          color="text-emerald-600 bg-emerald-500/10"
        />
        <Stat
          label="Discount Given"
          value={inr(s?.discountGiven ?? 0)}
          hint={`from ${inr(s?.grossSales ?? 0)} of carts`}
          icon={IndianRupee}
          color="text-amber-600 bg-amber-500/10"
        />
        <Stat
          label="Commission Owed"
          value={inr(s?.commission ?? 0)}
          hint={
            coupon?.influencer?.commissionPercent
              ? `${coupon.influencer.commissionPercent}% to ${coupon.influencer.name}`
              : 'No influencer commission'
          }
          icon={Wallet}
          color="text-violet-600 bg-violet-500/10"
        />
      </div>

      {/* Usage progress — the "first N customers" cap, made visible. */}
      {coupon && coupon.usageLimit > 0 && (
        <div className="p-4 rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
          <div className="flex items-center justify-between text-body-sm">
            <span className="font-medium text-surface-700 dark:text-surface-300">
              First {coupon.usageLimit.toLocaleString('en-IN')} customers offer
            </span>
            <span className="tabular-nums text-surface-500">
              {coupon.usedCount.toLocaleString('en-IN')} / {coupon.usageLimit.toLocaleString('en-IN')} used
            </span>
          </div>
          <div className="mt-2.5 h-2 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${Math.min(100, (coupon.usedCount / coupon.usageLimit) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Where it was used */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Unique Customers"
          value={(s?.uniqueCustomers ?? 0).toLocaleString('en-IN')}
          icon={Users}
          color="text-cyan-600 bg-cyan-500/10"
        />
        <Stat
          label="Online Orders"
          value={(s?.onlineUses ?? 0).toLocaleString('en-IN')}
          icon={Globe}
          color="text-indigo-600 bg-indigo-500/10"
        />
        <Stat
          label="Counter Bills"
          value={(s?.posUses ?? 0).toLocaleString('en-IN')}
          icon={Store}
          color="text-rose-600 bg-rose-500/10"
        />
        <Stat
          label="Minimum Order"
          value={coupon?.minOrderValue ? inr(coupon.minOrderValue) : 'None'}
          hint={
            coupon
              ? coupon.discountType === 'percent'
                ? `${coupon.discountValue}% off${coupon.maxDiscount ? ` · max ${inr(coupon.maxDiscount)}` : ''}`
                : `${inr(coupon.discountValue)} off`
              : undefined
          }
          icon={IndianRupee}
          color="text-surface-600 bg-surface-500/10"
        />
      </div>

      {/* Sales over time */}
      {chartData.length > 0 && (
        <div className="p-5 rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
          <h2 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
            Sales from this coupon
          </h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="couponSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16A34A" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-surface-200 dark:text-surface-800" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                <Tooltip
                  formatter={((value: number | undefined, name: string) =>
                    name === 'sales' ? [inr(value ?? 0), 'Sales'] : [value ?? 0, 'Uses']
                  ) as never}
                />
                <Area type="monotone" dataKey="sales" stroke="#16A34A" strokeWidth={2} fill="url(#couponSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Who used it */}
      <div>
        <h2 className="mb-3 font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
          Every use of this coupon
        </h2>
        <DataTable
          columns={[
            { key: 'when', label: 'When' },
            { key: 'customer', label: 'Customer' },
            { key: 'ref', label: 'Order / Bill' },
            { key: 'source', label: 'Channel' },
            { key: 'cart', label: 'Cart', className: 'text-right' },
            { key: 'discount', label: 'Discount', className: 'text-right' },
            { key: 'net', label: 'Net Sales', className: 'text-right' },
          ]}
          isLoading={isLoading}
          isEmpty={(stats?.redemptions.data.length ?? 0) === 0}
          emptyIcon={<Ticket size={24} className="text-surface-400" />}
          emptyTitle="Not used yet"
          emptyDescription="Share the code — every use will show up here with the sale it brought in"
          pagination={{
            currentPage: page,
            totalItems: stats?.redemptions.total ?? 0,
            itemsPerPage,
            onPageChange: setPage,
            onItemsPerPageChange: (size) => {
              setItemsPerPage(size);
              setPage(1);
            },
          }}
        >
          {(stats?.redemptions.data ?? []).map((r) => (
            <tr
              key={r.id}
              className={`border-b border-surface-50 dark:border-surface-850 last:border-0 ${r.status === 'reverted' ? 'opacity-50' : ''}`}
            >
              <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400 whitespace-nowrap">
                {formatDateTime(r.createdAt)}
              </td>
              <td className="px-5 py-3.5">
                <p className="text-body-sm text-surface-900 dark:text-surface-100">{r.customerName}</p>
                {r.customerPhone && <p className="text-caption text-surface-500">{r.customerPhone}</p>}
              </td>
              <td className="px-5 py-3.5 text-body-sm font-mono text-surface-600 dark:text-surface-400">
                {r.reference}
                {r.status === 'reverted' && (
                  <span className="ml-2 text-caption font-sans text-rose-600 dark:text-rose-400">cancelled</span>
                )}
              </td>
              <td className="px-5 py-3.5">
                <span className="inline-flex items-center gap-1 text-caption text-surface-500">
                  {r.source === 'pos' ? <Store size={12} /> : <Globe size={12} />}
                  {r.source === 'pos' ? 'Counter' : 'Online'}
                </span>
              </td>
              <td className="px-5 py-3.5 text-right text-body-sm text-surface-600 dark:text-surface-400 tabular-nums">
                {inr(r.orderSubtotal)}
              </td>
              <td className="px-5 py-3.5 text-right text-body-sm text-amber-600 dark:text-amber-400 tabular-nums">
                −{inr(r.discountAmount)}
              </td>
              <td className="px-5 py-3.5 text-right text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">
                {inr(r.netSales)}
              </td>
            </tr>
          ))}
        </DataTable>
      </div>

      <CouponFormDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        couponId={couponId ?? null}
        onSuccess={fetchStats}
      />
    </div>
  );
}
