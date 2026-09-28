import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Boxes,
  Search,
  AlertTriangle,
  XCircle,
  IndianRupee,
  History,
  Save,
  Loader2,
  PackagePlus,
  ArrowLeft,
} from 'lucide-react';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { ExportButton } from '@/components/admin/ExportButton.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { StockAdjustDrawer } from '@/components/admin/StockAdjustDrawer.tsx';
import { useSiteStore } from '@/store/site.ts';
import { cn } from '@/lib/utils.ts';
import {
  getInventory,
  getInventorySummary,
  getStockMovements,
  bulkSetStock,
  MOVEMENT_META,
  STOCK_MOVEMENT_TYPES,
  type InventoryItem,
  type InventorySummary,
  type StockMovement,
} from '@/services/inventory.ts';

type View = 'stock' | 'movements';

const inputClass =
  'pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all';

/**
 * Inventory: what is on the shelf, and every change that got it there.
 *
 * Two views over the same data. **Stock** is an editable sheet — type new
 * counts across as many rows as needed and save once, which is how a physical
 * stock-take actually happens. **Movements** is the append-only ledger that
 * explains each change, so "why is this 3 and not 30?" has an answer.
 */
export function AdminInventoryPage() {
  const currency = useSiteStore((s) => s.config.currency);
  const [view, setView] = useState<View>('stock');

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortBy, setSortBy] = useState('stock-asc');
  const [movementType, setMovementType] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [total, setTotal] = useState(0);

  /**
   * productId -> the count typed into the sheet, before saving.
   *
   * Each entry carries the value the row held when it was first touched, and
   * the product's name. That is what lets an edit survive a search, a filter or
   * a page turn: the check for "did this actually change" no longer has to find
   * the row in the list currently on screen. It used to, so searching for the
   * next product to count silently dropped everything typed so far — the sheet
   * still showed "Save 6 changes" as 6, then as 1, and nobody could see why.
   */
  const [edits, setEdits] = useState<Record<string, { value: string; was: number; name: string }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null);
  const [historyFor, setHistoryFor] = useState<InventoryItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Page size too: page 9 of 25-row pages does not exist at 100 rows a page.
  useEffect(() => setPage(1), [debouncedSearch, stockFilter, sortBy, movementType, view, perPage]);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getInventorySummary());
    } catch {
      // handle error
    }
  }, []);

  const loadStock = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getInventory({
        page,
        limit: perPage,
        search: debouncedSearch,
        stock: stockFilter,
        sort: sortBy,
      });
      setItems(result.data);
      setTotal(result.pagination.total);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, perPage, debouncedSearch, stockFilter, sortBy]);

  const loadMovements = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getStockMovements({
        page,
        limit: perPage,
        type: movementType,
        productId: historyFor?._id,
      });
      setMovements(result.data);
      setTotal(result.pagination.total);
    } catch {
      setMovements([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, perPage, movementType, historyFor]);

  useEffect(() => {
    if (view === 'stock') void loadStock();
    else void loadMovements();
  }, [view, loadStock, loadMovements]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  /** Only rows whose typed value differs from what was stored get sent. */
  const pendingEdits = useMemo(
    () =>
      Object.entries(edits)
        .filter(([, entry]) => entry.value.trim() !== '')
        .map(([productId, entry]) => ({
          productId,
          stockCount: Number(entry.value),
          was: entry.was,
          name: entry.name,
        }))
        .filter(
          (entry) =>
            Number.isFinite(entry.stockCount) &&
            entry.stockCount >= 0 &&
            entry.stockCount !== entry.was,
        ),
    [edits],
  );

  /**
   * Edits for products not in the list on screen — because the admin searched
   * for the next one, or turned the page. Counted so the save bar can say so:
   * a button offering to save six changes when one row is highlighted looks
   * like a bug, and the honest answer is that the other five are elsewhere.
   */
  const offscreenEdits = useMemo(
    () => pendingEdits.filter((entry) => !items.some((i) => i._id === entry.productId)).length,
    [pendingEdits, items],
  );

  /**
   * A stock-take can be twenty rows typed over ten minutes, and none of it is
   * on the server until Save. Closing the tab on that is not recoverable, so
   * the browser asks first — only while something is actually unsaved.
   */
  useEffect(() => {
    if (pendingEdits.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingEdits.length]);

  const handleSaveSheet = async () => {
    if (!pendingEdits.length) return;
    setIsSaving(true);
    try {
      const result = await bulkSetStock(
        pendingEdits.map(({ productId, stockCount }) => ({ productId, stockCount })),
        'Stock sheet updated',
      );
      // Keep what did not save, so it can be retried. Clearing everything lost
      // the counts typed for exactly the rows that still need them.
      const failed = new Set(result.errors.map((err) => err.productId));
      setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([productId]) => failed.has(productId))));
      await Promise.all([loadStock(), loadSummary()]);
      showToast(
        result.errors.length
          ? `${result.updated} updated, ${result.errors.length} failed — those are still in the sheet: ${result.errors
              .map((err) => err.message)
              .filter(Boolean)
              .slice(0, 2)
              .join('; ')}`
          : `${result.updated} product${result.updated === 1 ? '' : 's'} updated`,
      );
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { exportInventory, exportStockMovements } = await import('@/services/transfer.ts');
      if (view === 'stock') await exportInventory();
      else await exportStockMovements({ type: movementType, productId: historyFor?._id });
    } catch {
      // handle error
    } finally {
      setIsExporting(false);
    }
  };

  const openHistory = (item: InventoryItem) => {
    setHistoryFor(item);
    setMovementType('all');
    setView('movements');
  };

  const money = (value: number) =>
    `${currency}${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const lowThreshold = summary?.lowStockThreshold ?? 20;

  const stockTone = (count: number) => {
    if (count <= 0) return 'text-red-600 bg-red-500/10';
    if (count <= lowThreshold) return 'text-amber-600 bg-amber-500/10';
    return 'text-green-600 bg-green-500/10';
  };

  return (
    <ListPageShell
      header={
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Products Tracked"
              value={String(summary?.totalSkus ?? 0)}
              icon={Boxes}
              color="text-blue-600 bg-blue-500/10"
              isLoading={!summary}
            />
            <KPICard
              label="Stock Value"
              value={money(summary?.retailValue ?? 0)}
              icon={IndianRupee}
              color="text-green-600 bg-green-500/10"
              isLoading={!summary}
            />
            <KPICard
              label={`Low Stock (≤${lowThreshold})`}
              value={String(summary?.lowStock ?? 0)}
              icon={AlertTriangle}
              color="text-amber-600 bg-amber-500/10"
              isLoading={!summary}
            />
            <KPICard
              label="Out of Stock"
              value={String(summary?.outOfStock ?? 0)}
              icon={XCircle}
              color="text-red-600 bg-red-500/10"
              isLoading={!summary}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            {view === 'stock' ? (
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={inputClass}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                {historyFor && (
                  <button
                    onClick={() => {
                      setHistoryFor(null);
                      setView('stock');
                    }}
                    className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
                  >
                    <ArrowLeft size={14} />
                    All products
                  </button>
                )}
                <span className="text-[13px] text-surface-500 dark:text-surface-400">
                  {historyFor ? `History for ${historyFor.name}` : 'All stock movements'}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto">
              {view === 'stock' && (
                <FilterButton
                  activeCount={(stockFilter !== 'all' ? 1 : 0) + (sortBy !== 'stock-asc' ? 1 : 0)}
                  open={showFilters}
                  onClick={() => setShowFilters(!showFilters)}
                />
              )}
              {/* View switch — sits with the filters so the toolbar stays one row. */}
              <div className="flex items-center gap-1 p-1 rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
                {(['stock', 'movements'] as View[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      setView(v);
                      if (v === 'stock') setHistoryFor(null);
                    }}
                    className={cn(
                      'px-3 h-7 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors',
                      view === v
                        ? 'bg-brand-500 text-white'
                        : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800',
                    )}
                  >
                    {v === 'stock' ? 'Stock Sheet' : 'Movement History'}
                  </button>
                ))}
              </div>
              {view === 'movements' && (
                <Select
                  value={movementType}
                  onChange={setMovementType}
                  size="sm"
                  fullWidth={false}
                  active={movementType !== 'all'}
                  aria-label="Filter by movement type"
                  className="min-w-[9.5rem]"
                  options={[
                    { value: 'all', label: 'All types' },
                    ...STOCK_MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_META[t].label })),
                  ]}
                />
              )}
              <ExportButton onExport={handleExport} isExporting={isExporting} />
              {view === 'stock' && pendingEdits.length > 0 && (
                <>
                  <button
                    onClick={() => setEdits({})}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 disabled:opacity-60 transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSaveSheet}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-60 transition-colors shadow-sm shadow-brand-500/20"
                  >
                    {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    Save {pendingEdits.length} change{pendingEdits.length === 1 ? '' : 's'}
                    {offscreenEdits > 0 && (
                      <span className="font-normal opacity-80">({offscreenEdits} off-screen)</span>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {view === 'stock' && (
            <FilterPanel
              open={showFilters}
              onClearAll={() => {
                setStockFilter('all');
                setSortBy('stock-asc');
              }}
              filters={[
                {
                  id: 'stock',
                  label: 'Stock Level',
                  value: stockFilter,
                  onChange: setStockFilter,
                  options: [
                    { value: 'all', label: 'All' },
                    { value: 'in', label: `Healthy (>${lowThreshold})` },
                    { value: 'low', label: `Low (1–${lowThreshold})` },
                    { value: 'out', label: 'Out of stock' },
                  ],
                },
                {
                  id: 'sort',
                  label: 'Sort',
                  value: sortBy,
                  onChange: setSortBy,
                  options: [
                    { value: 'stock-asc', label: 'Lowest stock first' },
                    { value: 'stock-desc', label: 'Highest stock first' },
                    { value: 'value-desc', label: 'Highest value first' },
                    { value: 'name', label: 'Name (A–Z)' },
                  ],
                },
              ]}
            />
          )}
        </>
      }
    >
      {toast && (
        <div className="fixed bottom-6 right-6 z-[1200] px-4 py-3 rounded-xl bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-[13px] font-medium shadow-lg">
          {toast}
        </div>
      )}

      {view === 'stock' ? (
        <DataTable
          columns={[
            { key: 'product', label: 'Product' },
            { key: 'stock', label: 'On Hand', className: 'w-40' },
            { key: 'value', label: 'Stock Value', className: 'w-36' },
            { key: 'status', label: 'Status', className: 'w-32' },
            { key: 'actions', label: '', className: 'w-28' },
          ]}
          isLoading={isLoading}
          isEmpty={items.length === 0}
          emptyIcon={<Boxes size={22} />}
          emptyTitle="No products found"
          emptyDescription="Adjust the filters, or add products first."
          pagination={{
            currentPage: page,
            totalItems: total,
            itemsPerPage: perPage,
            onPageChange: setPage,
            onItemsPerPageChange: setPerPage,
          }}
        >
          {items.map((item) => {
            const typed = edits[item._id]?.value;
            const isDirty =
              typed !== undefined && typed !== '' && Number(typed) !== item.stockCount;
            return (
              <tr
                key={item._id}
                className="border-b border-surface-100 dark:border-surface-800 last:border-0 hover:bg-surface-50/60 dark:hover:bg-surface-850/40 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {item.images?.[0] ? (
                      <img
                        src={item.images[0]}
                        alt=""
                        className="w-9 h-9 rounded-lg object-cover bg-surface-100 dark:bg-surface-800 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-surface-100 dark:bg-surface-800 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-surface-900 dark:text-surface-100 truncate">
                        {item.name}
                      </p>
                      <p className="text-caption text-surface-400 truncate">
                        {item.categorySlug || 'Uncategorised'} · {money(item.price)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min={0}
                    value={typed ?? String(item.stockCount)}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [item._id]: {
                          value: e.target.value,
                          // Captured once, on the first keystroke: the stored
                          // count this edit is a change FROM. Re-reading it
                          // later would compare the typed value against itself
                          // after a reload and call the change nothing.
                          was: prev[item._id]?.was ?? item.stockCount,
                          name: item.name,
                        },
                      }))
                    }
                    className={cn(
                      'w-24 h-9 px-3 rounded-lg border bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all',
                      isDirty
                        ? 'border-brand-500 ring-2 ring-brand-500/20'
                        : 'border-surface-200 dark:border-surface-700',
                    )}
                  />
                </td>
                <td className="px-4 py-3 text-[13px] text-surface-600 dark:text-surface-400">
                  {money(item.stockValue ?? item.stockCount * item.price)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-1 rounded-md text-caption font-medium',
                      stockTone(item.stockCount),
                    )}
                  >
                    {item.stockCount <= 0
                      ? 'Out of stock'
                      : item.stockCount <= lowThreshold
                        ? 'Low'
                        : 'In stock'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setAdjustTarget(item)}
                      title="Add or remove stock"
                      className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                    >
                      <PackagePlus size={15} />
                    </button>
                    <button
                      onClick={() => openHistory(item)}
                      title="Stock history"
                      className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                    >
                      <History size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      ) : (
        <DataTable
          columns={[
            { key: 'date', label: 'When', className: 'w-44' },
            { key: 'product', label: 'Product' },
            { key: 'type', label: 'Type', className: 'w-36' },
            { key: 'qty', label: 'Change', className: 'w-28' },
            { key: 'balance', label: 'Balance', className: 'w-28' },
            { key: 'reason', label: 'Reason' },
          ]}
          isLoading={isLoading}
          isEmpty={movements.length === 0}
          emptyIcon={<History size={22} />}
          emptyTitle="No stock movements yet"
          emptyDescription="Sales, purchases and adjustments will appear here as they happen."
          pagination={{
            currentPage: page,
            totalItems: total,
            itemsPerPage: perPage,
            onPageChange: setPage,
            onItemsPerPageChange: setPerPage,
          }}
        >
          {movements.map((m) => (
            <tr
              key={m._id}
              className="border-b border-surface-100 dark:border-surface-800 last:border-0 hover:bg-surface-50/60 dark:hover:bg-surface-850/40 transition-colors"
            >
              <td className="px-4 py-3 text-[13px] text-surface-600 dark:text-surface-400 whitespace-nowrap">
                {new Date(m.createdAt).toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td className="px-4 py-3">
                <p className="text-[13px] font-medium text-surface-900 dark:text-surface-100 truncate">
                  {m.productName || '—'}
                </p>
                {m.referenceId && (
                  <p className="text-caption text-surface-400 truncate">
                    {m.referenceType}: {m.referenceId}
                  </p>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-1 rounded-md text-caption font-medium',
                    MOVEMENT_META[m.type]?.tone ?? 'text-surface-600 bg-surface-500/10',
                  )}
                >
                  {MOVEMENT_META[m.type]?.label ?? m.type}
                </span>
              </td>
              <td
                className={cn(
                  'px-4 py-3 text-[13px] font-semibold',
                  m.quantity < 0 ? 'text-red-600' : 'text-green-600',
                )}
              >
                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
              </td>
              <td className="px-4 py-3 text-[13px] text-surface-600 dark:text-surface-400">
                {m.balanceAfter}
              </td>
              <td className="px-4 py-3 text-[13px] text-surface-500 dark:text-surface-400">
                {m.reason || '—'}
                {m.createdBy?.name && (
                  <span className="block text-caption text-surface-400">by {m.createdBy.name}</span>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <StockAdjustDrawer
        item={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        onSaved={(message) => {
          setAdjustTarget(null);
          showToast(message);
          void loadStock();
          void loadSummary();
        }}
      />
    </ListPageShell>
  );
}
