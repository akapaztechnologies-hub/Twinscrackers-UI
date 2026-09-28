import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Search, Megaphone, TrendingUp, Wallet, Ticket,
} from 'lucide-react';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { ErrorNotice, errorText } from '@/components/admin/AdminShared.tsx';
import { InfluencerFormDrawer } from '@/components/admin/InfluencerFormDrawer.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { getInfluencers, deleteInfluencer } from '@/services/coupons.ts';
import type { Influencer } from '@/types/coupon.ts';

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  youtube: 'bg-red-500/10 text-red-600 dark:text-red-400',
  facebook: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  whatsapp: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  other: 'bg-surface-500/10 text-surface-600 dark:text-surface-300',
};

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

const sortOptions = [
  { label: 'Highest sales', value: 'sales' },
  { label: 'Most uses', value: 'uses' },
  { label: 'Commission due', value: 'due' },
  { label: 'Name A-Z', value: 'name' },
];

/** Compact follower count — 12500 reads as 12.5K on a narrow column. */
function formatFollowers(n: number): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export function AdminInfluencersPage() {
  const navigate = useNavigate();

  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('sales');
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [deleteTarget, setDeleteTarget] = useState<Influencer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const fetchInfluencers = useCallback(async () => {
    setIsLoading(true);
    try {
      setInfluencers(await getInfluencers({ status: status === 'all' ? undefined : status }));
    } catch {
      setInfluencers([]);
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void fetchInfluencers();
  }, [fetchInfluencers]);

  // Search and sort are done here rather than server-side: the roster is a
  // handful of people, and the list endpoint already returns everyone with
  // their performance attached.
  const filtered = useMemo(() => {
    let list = influencers;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.instagram.toLowerCase().includes(q) ||
          i.phone.includes(q) ||
          i.coupons.some((c) => c.code.toLowerCase().includes(q)),
      );
    }
    const sorted = [...list];
    if (sort === 'sales') sorted.sort((a, b) => b.netSales - a.netSales);
    else if (sort === 'uses') sorted.sort((a, b) => b.uses - a.uses);
    else if (sort === 'due') sorted.sort((a, b) => b.commissionDue - a.commissionDue);
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [influencers, search, sort]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, status, sort]);

  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setActionError('');
    try {
      await deleteInfluencer(deleteTarget.id);
      void fetchInfluencers();
    } catch (err) {
      setActionError(errorText(err, 'That influencer could not be removed. Please try again.'));
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const totalSales = influencers.reduce((sum, i) => sum + i.netSales, 0);
  const totalDue = influencers.reduce((sum, i) => sum + i.commissionDue, 0);
  const totalUses = influencers.reduce((sum, i) => sum + i.uses, 0);
  const hasActiveNarrowing = !!search || status !== 'all';

  return (
    <ListPageShell
      header={
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Influencers"
              value={String(influencers.length)}
              icon={Megaphone}
              color="text-pink-600 bg-pink-500/10"
              isLoading={isLoading}
            />
            <KPICard
              label="Coupons Used"
              value={totalUses.toLocaleString('en-IN')}
              icon={Ticket}
              color="text-blue-600 bg-blue-500/10"
              isLoading={isLoading}
            />
            <KPICard
              label="Sales Generated"
              value={inr(totalSales)}
              icon={TrendingUp}
              color="text-emerald-600 bg-emerald-500/10"
              isLoading={isLoading}
            />
            <KPICard
              label="Commission Due"
              value={inr(totalDue)}
              icon={Wallet}
              color="text-violet-600 bg-violet-500/10"
              isLoading={isLoading}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search name, handle or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <FilterButton
                activeCount={(status !== 'all' ? 1 : 0) + (sort !== 'sales' ? 1 : 0)}
                open={showFilters}
                onClick={() => setShowFilters((v) => !v)}
              />
              <button
                onClick={() => {
                  setEditId(null);
                  setIsDrawerOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Plus size={15} />
                Add Influencer
              </button>
            </div>
          </div>

          <FilterPanel
            open={showFilters}
            onClearAll={() => {
              setStatus('all');
              setSort('sales');
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
          { key: 'name', label: 'Influencer' },
          { key: 'codes', label: 'Codes' },
          { key: 'followers', label: 'Followers', className: 'text-right' },
          { key: 'uses', label: 'Uses', className: 'text-right' },
          { key: 'sales', label: 'Sales', className: 'text-right' },
          { key: 'rate', label: 'Rate', className: 'text-right' },
          { key: 'due', label: 'Commission Due', className: 'text-right' },
          { key: 'actions', label: '', className: 'w-20' },
        ]}
        isLoading={isLoading}
        isEmpty={filtered.length === 0}
        emptyIcon={<Megaphone size={24} className="text-surface-400" />}
        emptyTitle="No influencers yet"
        emptyDescription={
          hasActiveNarrowing
            ? 'Try adjusting your search or filters'
            : 'Add the people promoting your shop, then give each one a coupon code to share'
        }
        emptyActionLabel={!hasActiveNarrowing ? 'Add Influencer' : undefined}
        onEmptyAction={() => {
          setEditId(null);
          setIsDrawerOpen(true);
        }}
        pagination={{
          currentPage,
          totalItems: filtered.length,
          itemsPerPage,
          onPageChange: setCurrentPage,
          onItemsPerPageChange: (size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          },
        }}
      >
        {paginated.map((i) => (
          <tr
            key={i.id}
            onClick={() => navigate(`/admin/influencers/${i.id}`)}
            className={`border-b border-surface-50 dark:border-surface-850 last:border-0 hover:bg-surface-50/50 dark:hover:bg-surface-850/50 cursor-pointer transition-colors ${i.isActive ? '' : 'opacity-60'}`}
          >
            <td className="px-5 py-3.5">
              <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100">{i.name}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <span className={`inline-flex px-1.5 py-0.5 rounded text-caption font-medium ${PLATFORM_COLORS[i.platform] ?? PLATFORM_COLORS.other}`}>
                  {i.platform}
                </span>
                {i.instagram && <span className="text-caption text-surface-500">@{i.instagram}</span>}
              </div>
            </td>
            <td className="px-5 py-3.5">
              <div className="flex flex-wrap gap-1">
                {i.coupons.length === 0 ? (
                  <span className="text-body-sm text-surface-400">No code yet</span>
                ) : (
                  i.coupons.slice(0, 3).map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex px-1.5 py-0.5 rounded font-mono text-caption bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300"
                    >
                      {c.code}
                    </span>
                  ))
                )}
                {i.coupons.length > 3 && (
                  <span className="text-caption text-surface-500">+{i.coupons.length - 3}</span>
                )}
              </div>
            </td>
            <td className="px-5 py-3.5 text-right text-body-sm text-surface-500 tabular-nums">
              {formatFollowers(i.followers)}
            </td>
            <td className="px-5 py-3.5 text-right text-body-sm font-semibold text-surface-900 dark:text-surface-100 tabular-nums">
              {i.uses.toLocaleString('en-IN')}
            </td>
            <td className="px-5 py-3.5 text-right text-body-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {inr(i.netSales)}
            </td>
            <td className="px-5 py-3.5 text-right text-body-sm text-surface-500 tabular-nums">
              {i.commissionPercent ? `${i.commissionPercent}%` : '—'}
            </td>
            <td className="px-5 py-3.5 text-right text-body-sm font-bold text-violet-600 dark:text-violet-400 tabular-nums">
              {inr(i.commissionDue)}
            </td>
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                <button
                  onClick={() => {
                    setEditId(i.id);
                    setIsDrawerOpen(true);
                  }}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeleteTarget(i)}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget && deleteTarget.uses > 0 ? 'Deactivate Influencer' : 'Delete Influencer'}
        description={
          deleteTarget && deleteTarget.uses > 0
            ? `${deleteTarget.name} has ${deleteTarget.uses} recorded sale${deleteTarget.uses === 1 ? '' : 's'}, so they will be deactivated instead of deleted — payout history stays intact.`
            : 'This influencer has no recorded sales, so they will be deleted permanently.'
        }
        confirmLabel={deleteTarget && deleteTarget.uses > 0 ? 'Deactivate' : 'Delete'}
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <InfluencerFormDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        influencerId={editId}
        onSuccess={fetchInfluencers}
      />
    </ListPageShell>
  );
}
