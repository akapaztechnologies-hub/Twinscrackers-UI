import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, Gift } from 'lucide-react';
import { formatPrice } from '@/lib/utils.ts';
import { StatusBadge } from '@/components/admin/StatusBadge.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { ErrorNotice, errorText } from '@/components/admin/AdminShared.tsx';
import {
  useRowReorder,
  REORDER_LIMIT,
  REORDER_COLUMN,
  reorderRowClass,
} from '@/hooks/useRowReorder.ts';
import {
  ReorderToggleButton,
  ReorderBanner,
  ReorderHandleCell,
} from '@/components/admin/ReorderBar.tsx';
import { offerStatus, type OfferState } from '@/lib/comboWindow.ts';
import type { AdminProduct } from '@/types/admin.ts';

const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

/** The offer window is a separate axis to active/inactive: a live combo can be
 *  switched off, and an inactive one can still have days left on its offer. */
const offerOptions = [
  { label: 'Any Offer Period', value: 'all' },
  { label: 'Running now', value: 'live' },
  { label: 'Starts later', value: 'scheduled' },
  { label: 'Offer ended', value: 'ended' },
];

const sortOptions = [
  { label: 'Newest', value: 'newest' },
  { label: 'Storefront Order (Manual)', value: 'manual-newest' },
  { label: 'Price: Low to High', value: 'price-asc' },
  { label: 'Price: High to Low', value: 'price-desc' },
  { label: 'Name A–Z', value: 'name' },
];

type ComboStatus = 'all' | 'active' | 'inactive';
type ComboOffer = 'all' | 'live' | 'scheduled' | 'ended';

/** How each offer state reads in the list — greyed when there is nothing to say. */
const OFFER_CHIP: Record<OfferState, string | null> = {
  always: null,
  scheduled: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  live: 'bg-green-500/10 text-green-600 dark:text-green-400',
  ending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  ended: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function OfferChip({ combo }: { combo: AdminProduct }) {
  const status = offerStatus(combo);
  const tone = OFFER_CHIP[status.state];
  if (!tone) return null;
  return (
    <span className={`block w-fit mt-1 px-2 py-0.5 rounded-md text-caption font-medium ${tone}`}>
      {status.state === 'ending' && status.daysLeft !== null
        ? status.daysLeft <= 0
          ? 'Ends today'
          : `${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} left`
        : status.label}
    </span>
  );
}

/** Admin list of combo packs — same product data as AdminProductsPage, permanently
 *  scoped to isCombo products, with its own "New Combo" entry point. */
export function AdminCombosPage() {
  const navigate = useNavigate();
  const [combos, setCombos] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<ComboStatus>('all');
  const [offer, setOffer] = useState<ComboOffer>('all');
  const [sortBy, setSortBy] = useState('newest');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState('');

  // Storefront arrangement for the Combo Packs page. Same interaction as the
  // Products screen, scoped to combos — they carry their own set of positions.
  const [reorderMode, setReorderMode] = useState(false);
  const [orderNote, setOrderNote] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchCombos = useCallback(async () => {
    setIsLoading(true);
    try {
      const { getAllProducts } = await import('@/services/admin.ts');
      const result = await getAllProducts({
        isCombo: true,
        status,
        offer,
        search: debouncedSearch,
        sort: sortBy,
        page: reorderMode ? 1 : currentPage,
        limit: reorderMode ? REORDER_LIMIT : itemsPerPage,
      });
      setCombos(result.data);
      setTotal(result.total);
    } catch {
      setCombos([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [status, offer, debouncedSearch, sortBy, currentPage, itemsPerPage, reorderMode]);

  useEffect(() => { fetchCombos(); }, [fetchCombos]);
  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, status, offer, sortBy]);

  // Picking another sort from the filter panel leaves reorder mode — the rows
  // would no longer be in the order a drag is allowed to rewrite.
  useEffect(() => {
    if (reorderMode && sortBy !== 'manual-newest') setReorderMode(false);
  }, [reorderMode, sortBy]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setActionError('');
    try {
      const { deleteProduct } = await import('@/services/admin.ts');
      await deleteProduct(deleteTarget);
      await fetchCombos();
    } catch (err) {
      setActionError(errorText(err, 'The combo could not be deactivated. Please try again.'));
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  /**
   * Persist the arrangement after a drop. Scoped to combos, so it can never
   * disturb the positions the Products screen manages.
   */
  const saveOrder = useCallback(async (next: AdminProduct[]) => {
    setOrderNote('');
    try {
      const { reorderProducts } = await import('@/services/admin.ts');
      await reorderProducts(next.map((c) => c.id), true);
      setOrderNote('Storefront order saved');
    } catch (e) {
      setOrderNote(e instanceof Error ? e.message : 'Could not save the new order');
      throw e;
    } finally {
      setTimeout(() => setOrderNote(''), 4000);
    }
  }, []);

  const reorder = useRowReorder(combos, setCombos, saveOrder, reorderMode);

  const toggleReorderMode = () => {
    const next = !reorderMode;
    setReorderMode(next);
    // The manual sort is the only one a drag can express; leaving it restores
    // the page's usual default rather than stranding the admin in it.
    setSortBy(next ? 'manual-newest' : 'newest');
  };

  return (
    <ListPageShell
      header={
        <>
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search combos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <FilterButton
                activeCount={[status !== 'all', offer !== 'all', sortBy !== 'newest'].filter(Boolean).length}
                open={showFilters}
                onClick={() => setShowFilters(!showFilters)}
              />
              <ReorderToggleButton active={reorderMode} onClick={toggleReorderMode} />
              <Link
                to="/admin/combos/new"
                className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Plus size={15} />
                New Combo
              </Link>
            </div>
          </div>

          <FilterPanel
            open={showFilters}
            onClearAll={() => { setStatus('all'); setOffer('all'); setSortBy('newest'); }}
            filters={[
              { id: 'status', label: 'Status', value: status, options: statusOptions, onChange: (v) => setStatus(v as ComboStatus) },
              { id: 'offer', label: 'Offer Period', value: offer, options: offerOptions, onChange: (v) => setOffer(v as ComboOffer) },
              { id: 'sort', label: 'Sort By', value: sortBy, options: sortOptions, onChange: setSortBy },
            ]}
          />

          {reorderMode && (
            <ReorderBanner
              shown={combos.length}
              total={total}
              noun="combo packs"
              isSaving={reorder.isSaving}
              note={orderNote}
            />
          )}

          <ErrorNotice message={actionError} onDismiss={() => setActionError('')} />
        </>
      }
    >
      <DataTable
        columns={[
          ...(reorderMode ? [REORDER_COLUMN] : []),
          { key: 'combo', label: 'Combo' },
          { key: 'contents', label: 'Contents' },
          { key: 'price', label: 'Price' },
          { key: 'status', label: 'Status' },
          { key: 'actions', label: '', className: 'w-20' },
        ]}
        isLoading={isLoading}
        isEmpty={combos.length === 0}
        emptyIcon={<Gift size={24} className="text-surface-400" />}
        emptyTitle="No combo packs yet"
        emptyDescription={debouncedSearch ? 'Try adjusting your search' : 'Create your first combo pack to get started'}
        emptyActionLabel={!debouncedSearch ? 'New Combo' : undefined}
        emptyActionHref={!debouncedSearch ? '/admin/combos/new' : undefined}
        pagination={
          reorderMode
            ? undefined
            : {
                currentPage,
                totalItems: total,
                itemsPerPage,
                onPageChange: setCurrentPage,
                onItemsPerPageChange: (size) => { setItemsPerPage(size); setCurrentPage(1); },
              }
        }
      >
        {combos.map((combo, index) => (
          <tr
            key={combo.id}
            {...(reorderMode ? reorder.rowProps(index) : {})}
            onClick={reorderMode ? undefined : () => navigate(`/admin/combos/${combo.id}/edit`)}
            className={reorderRowClass(reorderMode, reorder.dropEdge(index))}
          >
            {reorderMode && <ReorderHandleCell />}
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-3">
                <img
                  src={combo.images[0] || undefined}
                  alt={combo.name}
                  className="w-10 h-10 rounded-lg object-contain p-0.5 bg-surface-100 dark:bg-surface-800"
                />
                <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                  {combo.name}
                </p>
              </div>
            </td>
            <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400">
              {combo.comboItems?.length ? `${combo.comboItems.length} item${combo.comboItems.length === 1 ? '' : 's'}` : '—'}
            </td>
            <td className="px-5 py-3.5">
              <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 tabular-nums">
                {formatPrice(combo.price)}
              </p>
              {combo.originalPrice && combo.originalPrice > combo.price && (
                <span className="text-caption text-green-600 font-semibold">
                  {Math.round(((combo.originalPrice - combo.price) / combo.originalPrice) * 100)}% off
                </span>
              )}
            </td>
            <td className="px-5 py-3.5">
              <StatusBadge status={combo.isActive !== false ? 'active' : 'inactive'} type="product" />
              <OfferChip combo={combo} />
            </td>
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Link
                  to={`/admin/combos/${combo.id}/edit`}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                >
                  <Pencil size={16} />
                </Link>
                <button
                  onClick={() => setDeleteTarget(combo.id)}
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
        title="Deactivate Combo"
        description="Are you sure you want to deactivate this combo pack? It will no longer be visible on the storefront."
        confirmLabel="Deactivate"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </ListPageShell>
  );
}
