import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Plus, Ticket, TrendingUp, Wallet, Users,
  Phone, Mail, Instagram, Store, Globe, HandCoins,
} from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { InfluencerFormDrawer } from '@/components/admin/InfluencerFormDrawer.tsx';
import { CouponFormDrawer } from '@/components/admin/CouponFormDrawer.tsx';
import { getInfluencerById, recordPayout } from '@/services/coupons.ts';
import { couponState, COUPON_STATE_LABELS, type InfluencerDetail } from '@/types/coupon.ts';

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

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

export function AdminInfluencerDetailPage() {
  const { influencerId } = useParams<{ influencerId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<InfluencerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCouponOpen, setIsCouponOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [isPayingOut, setIsPayingOut] = useState(false);
  const [payoutError, setPayoutError] = useState('');
  // Set by "Pay full": the box shows the balance to the paisa, and this keeps
  // the exact figure the server reported, so paying in full clears it exactly.
  const [fullBalance, setFullBalance] = useState<{ shown: string; exact: number } | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!influencerId) return;
    setIsLoading(true);
    try {
      setDetail(await getInfluencerById(influencerId, { page, limit: itemsPerPage }));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [influencerId, page, itemsPerPage]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const handlePayout = async () => {
    if (!influencerId) return;
    // "Pay full" untouched since it was pressed sends the balance exactly as
    // the server reported it, rather than the two-decimal figure on screen.
    const payingFull = fullBalance !== null && payoutAmount.trim() === fullBalance.shown;
    const typed = Number(payoutAmount);
    // Negative is allowed on purpose: it is how an over-recorded payout gets
    // corrected, and the server accepts it.
    if (!payoutAmount.trim() || !Number.isFinite(typed) || typed === 0) {
      setPayoutError('Enter an amount');
      return;
    }
    // Rupees and paise — the server books to the paisa, so a third decimal
    // would be rounded away without anyone seeing it.
    if (!payingFull && Math.abs(Math.round(typed * 100) - typed * 100) > 1e-6) {
      setPayoutError('Enter at most 2 decimal places (rupees and paise)');
      return;
    }
    const amount = payingFull ? fullBalance.exact : Math.round(typed * 100) / 100;
    setIsPayingOut(true);
    setPayoutError('');
    try {
      await recordPayout(influencerId, amount);
      setPayoutAmount('');
      setFullBalance(null);
      void fetchDetail();
    } catch (err) {
      setPayoutError((err as Error).message);
    } finally {
      setIsPayingOut(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate('/admin/influencers')}
          className="flex items-center gap-2 text-body-sm text-surface-600 dark:text-surface-400 hover:text-brand-600 transition-colors"
        >
          <ArrowLeft size={16} /> Back to influencers
        </button>
        <p className="mt-6 text-body-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  const i = detail?.influencer;
  const s = detail?.summary;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={() => navigate('/admin/influencers')}
            className="flex items-center gap-1.5 text-body-sm text-surface-500 hover:text-brand-600 transition-colors"
          >
            <ArrowLeft size={15} /> Influencers
          </button>
          <h1 className="mt-2 font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
            {i?.name ?? '…'}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-surface-500 dark:text-surface-400">
            {i?.instagram && (
              <span className="flex items-center gap-1.5">
                <Instagram size={14} /> @{i.instagram}
              </span>
            )}
            {i?.phone && (
              <span className="flex items-center gap-1.5">
                <Phone size={14} /> {i.phone}
              </span>
            )}
            {i?.email && (
              <span className="flex items-center gap-1.5">
                <Mail size={14} /> {i.email}
              </span>
            )}
            {i?.commissionPercent ? <span>{i.commissionPercent}% commission</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCouponOpen(true)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors"
          >
            <Plus size={15} />
            New Code
          </button>
          <button
            onClick={() => setIsEditOpen(true)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
          >
            <Pencil size={15} />
            Edit
          </button>
        </div>
      </div>

      {i?.notes && (
        <p className="p-3.5 rounded-xl bg-surface-50 dark:bg-surface-850/60 text-body-sm text-surface-600 dark:text-surface-300">
          {i.notes}
        </p>
      )}

      {/* Performance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Coupons Used"
          value={(s?.uses ?? 0).toLocaleString('en-IN')}
          hint={`${inr(s?.avgOrderValue ?? 0)} average order`}
          icon={Ticket}
          color="text-blue-600 bg-blue-500/10"
        />
        <Stat
          label="Sales Generated"
          value={inr(s?.netSales ?? 0)}
          hint={`${inr(s?.discountGiven ?? 0)} given as discount`}
          icon={TrendingUp}
          color="text-emerald-600 bg-emerald-500/10"
        />
        <Stat
          label="Commission Earned"
          value={inr(s?.commissionEarned ?? 0)}
          hint={`${inr(s?.totalPaidOut ?? 0)} already paid`}
          icon={Wallet}
          color="text-violet-600 bg-violet-500/10"
        />
        <Stat
          label="Still Owed"
          value={inr(s?.commissionDue ?? 0)}
          hint="Earned minus paid"
          icon={HandCoins}
          color="text-amber-600 bg-amber-500/10"
        />
      </div>

      {/* Payout */}
      <div className="p-4 rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
        <h2 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
          Record a payout
        </h2>
        <p className="mt-1 text-body-sm text-surface-500 dark:text-surface-400">
          Enter what you handed over, in rupees and paise. It comes straight off the "still owed" figure above. To correct a payout recorded by mistake, enter it as a minus amount.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="number"
            value={payoutAmount}
            onChange={(e) => setPayoutAmount(e.target.value)}
            className="w-40 px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40"
            placeholder="Amount ₹"
            step="0.01"
          />
          <button
            onClick={handlePayout}
            disabled={isPayingOut}
            className="px-4 h-10 rounded-xl bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {isPayingOut ? 'Saving...' : 'Record Payout'}
          </button>
          {s && s.commissionDue > 0 && (
            <button
              onClick={() => {
                const shown = s.commissionDue.toFixed(2);
                setPayoutAmount(shown);
                setFullBalance({ shown, exact: s.commissionDue });
              }}
              className="text-body-sm text-brand-600 dark:text-brand-400 hover:underline"
            >
              Pay full {inr(s.commissionDue)}
            </button>
          )}
          {payoutError && (
            <span className="text-body-sm text-red-600 dark:text-red-400">{payoutError}</span>
          )}
        </div>
      </div>

      {/* Their codes */}
      <div>
        <h2 className="mb-3 font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
          Their coupon codes
        </h2>
        {(detail?.coupons.length ?? 0) === 0 ? (
          <div className="p-6 rounded-2xl border border-dashed border-surface-200 dark:border-surface-800 text-center">
            <Ticket size={22} className="mx-auto text-surface-400" />
            <p className="mt-2 text-body-sm text-surface-500 dark:text-surface-400">
              No code yet — create one for them to share.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(detail?.coupons ?? []).map((c) => (
              <Link
                key={c.id}
                to={`/admin/coupons/${c.id}`}
                className="p-4 rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 hover:border-brand-500/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold tracking-wider text-body-sm text-surface-900 dark:text-surface-100">
                    {c.code}
                  </span>
                  <span className="text-caption text-surface-500">{COUPON_STATE_LABELS[couponState(c)]}</span>
                </div>
                <p className="mt-1 text-caption text-surface-500">
                  {c.discountType === 'percent' ? `${c.discountValue}% off` : `${inr(c.discountValue)} off`}
                  {c.usageLimit > 0
                    ? ` · ${c.usedCount}/${c.usageLimit} used`
                    : ` · ${c.usedCount} used`}
                </p>
                <p className="mt-2 font-display font-bold text-body-md text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {inr(c.totalSales)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Every sale they brought */}
      <div>
        <h2 className="mb-3 font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
          Sales they brought in
        </h2>
        <DataTable
          columns={[
            { key: 'when', label: 'When' },
            { key: 'code', label: 'Code' },
            { key: 'customer', label: 'Customer' },
            { key: 'source', label: 'Channel' },
            { key: 'net', label: 'Net Sales', className: 'text-right' },
            { key: 'commission', label: 'Commission', className: 'text-right' },
          ]}
          isLoading={isLoading}
          isEmpty={(detail?.redemptions.data.length ?? 0) === 0}
          emptyIcon={<Users size={24} className="text-surface-400" />}
          emptyTitle="No sales yet"
          emptyDescription="Once someone orders with their code, the sale shows up here"
          pagination={{
            currentPage: page,
            totalItems: detail?.redemptions.total ?? 0,
            itemsPerPage,
            onPageChange: setPage,
            onItemsPerPageChange: (size) => {
              setItemsPerPage(size);
              setPage(1);
            },
          }}
        >
          {(detail?.redemptions.data ?? []).map((r) => (
            <tr
              key={r.id}
              className={`border-b border-surface-50 dark:border-surface-850 last:border-0 ${r.status === 'reverted' ? 'opacity-50' : ''}`}
            >
              <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400 whitespace-nowrap">
                {formatDateTime(r.createdAt)}
              </td>
              <td className="px-5 py-3.5 font-mono text-body-sm text-surface-700 dark:text-surface-300">
                {r.code}
                {r.status === 'reverted' && (
                  <span className="ml-2 font-sans text-caption text-rose-600 dark:text-rose-400">cancelled</span>
                )}
              </td>
              <td className="px-5 py-3.5">
                <p className="text-body-sm text-surface-900 dark:text-surface-100">{r.customerName}</p>
                {r.customerPhone && <p className="text-caption text-surface-500">{r.customerPhone}</p>}
              </td>
              <td className="px-5 py-3.5">
                <span className="inline-flex items-center gap-1 text-caption text-surface-500">
                  {r.source === 'pos' ? <Store size={12} /> : <Globe size={12} />}
                  {r.source === 'pos' ? 'Counter' : 'Online'}
                </span>
              </td>
              <td className="px-5 py-3.5 text-right text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">
                {inr(r.netSales)}
              </td>
              <td className="px-5 py-3.5 text-right text-body-sm text-violet-600 dark:text-violet-400 tabular-nums">
                {inr(r.commissionAmount)}
              </td>
            </tr>
          ))}
        </DataTable>
      </div>

      <InfluencerFormDrawer
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        influencerId={influencerId ?? null}
        onSuccess={fetchDetail}
      />
      <CouponFormDrawer
        isOpen={isCouponOpen}
        onClose={() => setIsCouponOpen(false)}
        couponId={null}
        defaultInfluencerId={influencerId}
        onSuccess={fetchDetail}
      />
    </div>
  );
}
