import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Search, Ticket, TrendingUp, IndianRupee, Users, Copy, Check,
} from 'lucide-react';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { ErrorNotice, errorText } from '@/components/admin/AdminShared.tsx';
import { CouponFormDrawer } from '@/components/admin/CouponFormDrawer.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { getCoupons, getCouponOverview, deleteCoupon } from '@/services/coupons.ts';
import { couponState, COUPON_STATE_LABELS, type Coupon, type CouponOverview, type CouponState } from '@/types/coupon.ts';

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

const STATE_STYLES: Record<CouponState, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  inactive: 'bg-surface-500/10 text-surface-600 dark:text-surface-300',
  scheduled: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  expired: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  exhausted: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

const statusOptions = [
  { label: 'All Coupons', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'inactive' },
  { label: 'Expired', value: 'expired' },
  { label: 'Limit reached', value: 'exhausted' },
];

const sortOptions = [
  { label: 'Newest first', value: 'created-desc' },
  { label: 'Most used', value: 'used-desc' },
  { label: 'Highest sales', value: 'sales-desc' },
  { label: 'Code A-Z', value: 'code-asc' },
];

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

/** What one use of the code takes off, written the way the shop describes it. */
function discountLabel(c: Coupon): string {
  if (c.discountType === 'flat') return `${inr(c.discountValue)} off`;
  return c.maxDiscount > 0
    ? `${c.discountValue}% off · max ${inr(c.maxDiscount)}`
    : `${c.discountValue}% off`;
}

/** A capped coupon reads as "used / limit"; an uncapped one just counts up. */
function usageLabel(c: Coupon): string {
  return c.usageLimit > 0
    ? `${c.usedCount.toLocaleString('en-IN')} / ${c.usageLimit.toLocaleString('en-IN')}`
    : c.usedCount.toLocaleString('en-IN');
}

export function AdminCouponsPage() {
  const navigate = useNavigate();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [overview, setOverview] = useState<CouponOverview | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('created-desc');
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalItems, setTotalItems] = useState(0);

  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editCouponId, setEditCouponId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState('');

  const fetchCoupons = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getCoupons({
        page: currentPage,
        limit: itemsPerPage,
        search: search || undefined,
        status: status === 'all' ? undefined : status,
        sort,
      });
      setCoupons(res.data);
      setTotalItems(res.total);
    } catch {
      setCoupons([]);
      setTotalItems(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, itemsPerPage, search, status, sort]);

  useEffect(() => {
    void fetchCoupons();
  }, [fetchCoupons]);

  useEffect(() => {
    getCouponOverview().then(setOverview).catch(() => setOverview(null));
  }, []);

  // Any narrowing change invalidates the current page number.
  useEffect(() => {
    setCurrentPage(1);
  }, [search, status, sort]);

  const refresh = () => {
    void fetchCoupons();
    getCouponOverview().then(setOverview).catch(() => {});
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setActionError('');
    try {
      await deleteCoupon(deleteTarget.id);
      refresh();
    } catch (err) {
      setActionError(errorText(err, 'That coupon could not be deleted. Please try again.'));
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(''), 1500);
    } catch {
      /* clipboard blocked — nothing useful to say */
    }
  };

  const hasActiveNarrowing = !!search || status !== 'all';
  const s = overview?.summary;

  return (
    <ListPageShell
      header={
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Active Coupons"
              value={String(s?.activeCoupons ?? 0)}
              icon={Ticket}
              color="text-blue-600 bg-blue-500/10"
              isLoading={!overview}
            />
            <KPICard
              label="Coupons Used"
              value={(s?.uses ?? 0).toLocaleString('en-IN')}
              icon={Users}
              color="text-violet-600 bg-violet-500/10"
              isLoading={!overview}
            />
            <KPICard
              label="Sales From Coupons"
              value={inr(s?.netSales ?? 0)}
              icon={TrendingUp}
              color="text-emerald-600 bg-emerald-500/10"
              isLoading={!overview}
            />
            <KPICard
              label="Discount Given"
              value={inr(s?.discountGiven ?? 0)}
              icon={IndianRupee}
              color="text-amber-600 bg-amber-500/10"
              isLoading={!overview}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search code or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <FilterButton
                activeCount={(status !== 'all' ? 1 : 0) + (sort !== 'created-desc' ? 1 : 0)}
                open={showFilters}
                onClick={() => setShowFilters((v) => !v)}
              />
              <button
                onClick={() => {
                  setEditCouponId(null);
                  setIsDrawerOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Plus size={15} />
                New Coupon
              </button>
            </div>
          </div>

          <FilterPanel
            open={showFilters}
            onClearAll={() => {
              setStatus('all');
              setSort('created-desc');
            }}
            filters={[
              { id: 'status', label: 'Status', value: status, options: statusOptions, onChange: setStatus },
              { id: 'sort', label: 'Sort By', value: sort, options: sortOptions, onChange: setSort },
            ]}
          />

          <ErrorNotice message={actionError} onDismiss={() => setActionError('')} />
        </>
      }
    >
      <DataTable
        columns={[
          { key: 'code', label: 'Code' },
          { key: 'influencer', label: 'Influencer' },
          { key: 'discount', label: 'Discount' },
          { key: 'used', label: 'Used', className: 'text-right' },
          { key: 'sales', label: 'Sales', className: 'text-right' },
          { key: 'given', label: 'Discount Given', className: 'text-right' },
          { key: 'validity', label: 'Ends' },
          { key: 'status', label: 'Status' },
          { key: 'actions', label: '', className: 'w-20' },
        ]}
        isLoading={isLoading}
        isEmpty={coupons.length === 0}
        emptyIcon={<Ticket size={24} className="text-surface-400" />}
        emptyTitle="No coupons yet"
        emptyDescription={
          hasActiveNarrowing
            ? 'Try adjusting your search or filters'
            : 'Create a code for an influencer to share, then track the sales it brings in'
        }
        emptyActionLabel={!hasActiveNarrowing ? 'New Coupon' : undefined}
        onEmptyAction={() => {
          setEditCouponId(null);
          setIsDrawerOpen(true);
        }}
        pagination={{
          currentPage,
          totalItems,
          itemsPerPage,
          onPageChange: setCurrentPage,
          onItemsPerPageChange: (size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          },
        }}
      >
        {coupons.map((c) => {
          const state = couponState(c);
          return (
            <tr
              key={c.id}
              onClick={() => navigate(`/admin/coupons/${c.id}`)}
              className="border-b border-surface-50 dark:border-surface-850 last:border-0 hover:bg-surface-50/50 dark:hover:bg-surface-850/50 cursor-pointer transition-colors"
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold tracking-wider text-body-sm text-surface-900 dark:text-surface-100">
                    {c.code}
                  </span>
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      void copyCode(c.code);
                    }}
                    title="Copy code"
                    className="p-1 rounded-md text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                  >
                    {copiedCode === c.code ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
                {c.description && (
                  <p className="mt-0.5 text-caption text-surface-500 truncate max-w-[200px]">{c.description}</p>
                )}
              </td>
              <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400">
                {c.influencer?.name ?? '—'}
              </td>
              <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400 whitespace-nowrap">
                {discountLabel(c)}
              </td>
              <td className="px-5 py-3.5 text-right text-body-sm font-semibold text-surface-900 dark:text-surface-100 tabular-nums whitespace-nowrap">
                {usageLabel(c)}
              </td>
              <td className="px-5 py-3.5 text-right text-body-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {inr(c.totalSales)}
              </td>
              <td className="px-5 py-3.5 text-right text-body-sm text-surface-500 tabular-nums">
                {inr(c.totalDiscountGiven)}
              </td>
              <td className="px-5 py-3.5 text-body-sm text-surface-500 whitespace-nowrap">
                {c.validTo ? formatDate(c.validTo) : 'No end date'}
              </td>
              <td className="px-5 py-3.5">
                <span className={`inline-flex px-2 py-0.5 rounded-md text-caption font-medium whitespace-nowrap ${STATE_STYLES[state]}`}>
                  {COUPON_STATE_LABELS[state]}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                  <button
                    onClick={() => {
                      setEditCouponId(c.id);
                      setIsDrawerOpen(true);
                    }}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </DataTable>

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget && deleteTarget.usedCount > 0 ? 'Pause Coupon' : 'Delete Coupon'}
        description={
          deleteTarget && deleteTarget.usedCount > 0
            ? `${deleteTarget.code} has already been used ${deleteTarget.usedCount} time${deleteTarget.usedCount === 1 ? '' : 's'}, so it will be paused instead of deleted — its sales history stays intact.`
            : 'This coupon has never been used, so it will be deleted permanently.'
        }
        confirmLabel={deleteTarget && deleteTarget.usedCount > 0 ? 'Pause' : 'Delete'}
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <CouponFormDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        couponId={editCouponId}
        onSuccess={refresh}
      />
    </ListPageShell>
  );
}
