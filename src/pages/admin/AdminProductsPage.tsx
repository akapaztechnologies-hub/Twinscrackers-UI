import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, ShoppingBag, AlertTriangle, CheckCircle2, XCircle, Package } from 'lucide-react';
import { formatPrice } from '@/lib/utils.ts';
import { StatusBadge } from '@/components/admin/StatusBadge.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { ExportMenuButton } from '@/components/admin/ExportButton.tsx';
import { ImportDialog } from '@/components/admin/ImportDialog.tsx';
import { Upload, Sparkles } from 'lucide-react';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { ErrorNotice, errorText } from '@/components/admin/AdminShared.tsx';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import { useRowReorder, REORDER_LIMIT, REORDER_COLUMN, reorderRowClass } from '@/hooks/useRowReorder.ts';
import {
  ReorderToggleButton,
  ReorderBanner,
  ReorderHandleCell,
} from '@/components/admin/ReorderBar.tsx';
import type { AdminProduct, Category } from '@/types/admin.ts';
import type { ProductCategory } from '@/types/index.ts';

const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

const stockOptions = [
  { label: 'All Stock Levels', value: 'all' },
  { label: 'In Stock', value: 'in-stock' },
  { label: 'Low Stock', value: 'low-stock' },
  { label: 'Out of Stock', value: 'out-of-stock' },
];

const sortOptions = [
  { label: 'Newest', value: 'newest' },
  { label: 'Storefront Order (Manual)', value: 'manual' },
  { label: 'Price: Low to High', value: 'price-asc' },
  { label: 'Price: High to Low', value: 'price-desc' },
  { label: 'Name A–Z', value: 'name' },
  { label: 'Stock: High to Low', value: 'stock' },
];

type StockFilter = 'all' | 'in-stock' | 'low-stock' | 'out-of-stock';
type ProductStatus = 'all' | 'active' | 'inactive';

/** Map the page's stock-filter value to the server `stock` bucket. */
function stockParam(f: StockFilter): 'all' | 'in' | 'low' | 'out' {
  return f === 'in-stock' ? 'in' : f === 'low-stock' ? 'low' : f === 'out-of-stock' ? 'out' : 'all';
}

export function AdminProductsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, inStock: 0, lowStock: 0, outOfStock: 0 });
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const [productStatus, setProductStatus] = useState<ProductStatus>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sortBy, setSortBy] = useState('newest');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [isDescribing, setIsDescribing] = useState(false);
  const [describeNote, setDescribeNote] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStock, setEditStock] = useState('');
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [actionError, setActionError] = useState('');
  // Off by default: an import is usually a price or description update, and a
  // sheet exported last week carries last week's stock.
  const [importStock, setImportStock] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Storefront arrangement. Turning it on pins the list to the manual sort,
  // because dragging rows that are sorted by price or name would be meaningless.
  const [reorderMode, setReorderMode] = useState(false);
  const [orderNote, setOrderNote] = useState('');

  // Debounce the search box so keystrokes don't spam the API.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Load categories for the filter dropdown.
  useEffect(() => {
    (async () => {
      try {
        const { getAllCategories } = await import('@/services/admin.ts');
        const { data } = await getAllCategories();
        setCategories(data);
      } catch {
        /* keep empty — dropdown falls back to just "All Categories" */
      }
    })();
  }, []);

  const categoryOptions = [
    { label: 'All Categories', value: 'all' },
    ...categories.map((c) => ({ label: c.name, value: c.slug })),
  ];

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const { getAllProducts } = await import('@/services/admin.ts');
      const result = await getAllProducts({
        // Combos live in the same collection behind an isCombo flag and have
        // their own page — without this they show up here as category-less rows.
        isCombo: false,
        category: category === 'all' ? undefined : category,
        status: productStatus,
        stock: stockParam(stockFilter),
        search: debouncedSearch,
        sort: sortBy,
        page: reorderMode ? 1 : currentPage,
        limit: reorderMode ? REORDER_LIMIT : itemsPerPage,
      });
      setProducts(result.data);
      setTotal(result.total);
    } catch {
      setProducts([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [category, productStatus, stockFilter, debouncedSearch, sortBy, currentPage, itemsPerPage, reorderMode]);

  const fetchStats = useCallback(async () => {
    try {
      const { getProductStats } = await import('@/services/admin.ts');
      setStats(await getProductStats({ isCombo: false }));
    } catch {
      /* keep last stats */
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Reset to page 1 whenever a filter/search/sort changes.
  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, category, productStatus, stockFilter, sortBy]);

  // Picking another sort from the filter panel leaves reorder mode — the rows
  // would no longer be in the order a drag is allowed to rewrite.
  useEffect(() => {
    if (reorderMode && sortBy !== 'manual') setReorderMode(false);
  }, [reorderMode, sortBy]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setActionError('');
    try {
      const { deleteProduct } = await import('@/services/admin.ts');
      await deleteProduct(deleteTarget);
      await Promise.all([fetchProducts(), fetchStats()]);
    } catch (err) {
      setActionError(errorText(err, 'The product could not be deactivated. Please try again.'));
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  /**
   * Set an exact count from the table.
   *
   * Goes through the inventory "set" route rather than a product update: that
   * writes a ledger row explaining the change and tells anyone waiting on a
   * back-in-stock alert. A bare product update did neither.
   */
  const handleSaveStock = async (productId: string) => {
    const newStock = Number(editStock);
    if (editStock.trim() === '' || !Number.isInteger(newStock) || newStock < 0) {
      setActionError('Stock must be a whole number, zero or more.');
      return;
    }
    setIsSavingStock(true);
    setActionError('');
    try {
      const { setStock } = await import('@/services/inventory.ts');
      const result = await setStock(productId, newStock, 'Corrected from the Products list');
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, stockCount: result.stockCount, inStock: result.inStock } : p)),
      );
      setEditingId(null);
      fetchStats();
    } catch (err) {
      setActionError(errorText(err, 'The stock count could not be saved. Please try again.'));
    } finally {
      setIsSavingStock(false);
    }
  };

  /**
   * Persist the arrangement after a drop.
   *
   * Only the rows on screen are sent. The server treats them as a permutation
   * of the positions they already hold, so reordering a filtered or searched
   * list rearranges just those products and leaves the rest of the catalogue
   * untouched.
   */
  const saveOrder = useCallback(async (next: AdminProduct[]) => {
    setOrderNote('');
    try {
      const { reorderProducts } = await import('@/services/admin.ts');
      await reorderProducts(next.map((p) => p.id), false);
      setOrderNote('Storefront order saved');
    } catch (e) {
      setOrderNote(e instanceof Error ? e.message : 'Could not save the new order');
      throw e;
    } finally {
      setTimeout(() => setOrderNote(''), 4000);
    }
  }, []);

  const reorder = useRowReorder(products, setProducts, saveOrder, reorderMode);

  const toggleReorderMode = () => {
    const next = !reorderMode;
    setReorderMode(next);
    // The manual sort is the only one a drag can express; leaving it restores
    // the page's usual default rather than stranding the admin in it.
    setSortBy(next ? 'manual' : 'newest');
    setEditingId(null);
  };

  /**
   * Exported from the server so the file carries EVERY product field in the
   * exact column order the importer reads back. The old client-side export
   * wrote eight display columns, which could not round-trip.
   */
  /**
   * Write descriptions for every product that has none.
   *
   * `onlyMissing` is left at its server default of true, so anything the shop
   * has written by hand is untouched — one click must never flatten real copy.
   */
  const fillDescriptions = async () => {
    setIsDescribing(true);
    setDescribeNote('');
    try {
      const { describeProductsBulk } = await import('@/services/admin.ts');
      const r = await describeProductsBulk();
      setDescribeNote(
        `${r.updated} description(s) written, ${r.skipped} already had one.`,
      );
      await fetchProducts();
    } catch (e) {
      setDescribeNote(e instanceof Error ? e.message : 'Could not write descriptions.');
    } finally {
      setIsDescribing(false);
      setTimeout(() => setDescribeNote(''), 6000);
    }
  };

  /** Quick = the columns the shop edits; full = every field, for backup. */
  const handleExport = async (mode: 'quick' | 'full') => {
    setIsExporting(true);
    setActionError('');
    try {
      const { exportProducts } = await import('@/services/transfer.ts');
      await exportProducts(
        {
          isCombo: false,
          category: category === 'all' ? undefined : category,
          isActive: productStatus === 'all' ? undefined : productStatus === 'active',
        },
        mode,
      );
    } catch (err) {
      setActionError(errorText(err, 'The products could not be exported. Please try again.'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ListPageShell
      header={
        <>
      {/* Stock KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Products" value={String(stats.total)} icon={Package} color="text-blue-600 bg-blue-500/10" isLoading={isLoading} />
        <KPICard label="In Stock" value={String(stats.inStock)} icon={CheckCircle2} color="text-green-600 bg-green-500/10" isLoading={isLoading} />
        <KPICard label="Low Stock" value={String(stats.lowStock)} icon={AlertTriangle} color="text-amber-600 bg-amber-500/10" isLoading={isLoading} />
        <KPICard label="Out of Stock" value={String(stats.outOfStock)} icon={XCircle} color="text-red-600 bg-red-500/10" isLoading={isLoading} />
      </div>

      {/* Toolbar: Search + Filter toggle + Add Product */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <FilterButton
            activeCount={[category, productStatus, stockFilter].filter((v) => v !== 'all').length + (sortBy !== 'newest' ? 1 : 0)}
            open={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          />
          <ReorderToggleButton active={reorderMode} onClick={toggleReorderMode} />
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3.5 h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
          >
            <Upload size={16} />
            Import
          </button>
          <button
            onClick={() => void fillDescriptions()}
            disabled={isDescribing}
            title="Write a description for every product that does not have one yet"
            className="flex items-center gap-2 px-3.5 h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors disabled:opacity-50"
          >
            <Sparkles size={16} />
            {isDescribing ? 'Writing…' : 'Fill Descriptions'}
          </button>
          {describeNote && (
            <span className="text-caption font-medium text-green-600 dark:text-green-400 whitespace-nowrap">
              {describeNote}
            </span>
          )}
          <ExportMenuButton
            isExporting={isExporting}
            choices={[
              {
                label: 'Quick sheet',
                hint: 'Name, category, prices, stock and order — the columns you change.',
                onSelect: () => void handleExport('quick'),
              },
              {
                label: 'Full sheet',
                hint: 'Every field, including descriptions and images. For backup.',
                onSelect: () => void handleExport('full'),
              },
            ]}
          />
          <Link
            to="/admin/products/new"
            className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
          >
            <Plus size={15} />
            Add Product
          </Link>
        </div>
      </div>

      {/* Expandable filter panel — full width */}
      <FilterPanel
        open={showFilters}
        onClearAll={() => { setCategory('all'); setProductStatus('all'); setStockFilter('all'); setSortBy('newest'); }}
        filters={[
          { id: 'category', label: 'Category', value: category, options: categoryOptions, onChange: (v) => setCategory(v as ProductCategory | 'all') },
          { id: 'status', label: 'Status', value: productStatus, options: statusOptions, onChange: (v) => setProductStatus(v as ProductStatus) },
          { id: 'stock', label: 'Stock Level', value: stockFilter, options: stockOptions, onChange: (v) => setStockFilter(v as StockFilter) },
          { id: 'sort', label: 'Sort By', value: sortBy, options: sortOptions, onChange: setSortBy },
        ]}
      />

      {reorderMode && (
        <ReorderBanner
          shown={products.length}
          total={total}
          noun="products"
          isSaving={reorder.isSaving}
          note={orderNote}
        />
      )}

      <ErrorNotice message={actionError} onDismiss={() => setActionError('')} />
        </>
      }
    >
      {/* Products Table */}
      <DataTable
        columns={[
          ...(reorderMode ? [REORDER_COLUMN] : []),
          { key: 'product', label: 'Product' },
          { key: 'category', label: 'Category' },
          { key: 'price', label: 'Price' },
          { key: 'stock', label: 'Stock' },
          { key: 'stockStatus', label: 'Stock Status' },
          { key: 'status', label: 'Status' },
          { key: 'actions', label: '', className: 'w-20' },
        ]}
        isLoading={isLoading}
        isEmpty={products.length === 0}
        emptyIcon={<ShoppingBag size={24} className="text-surface-400" />}
        emptyTitle="No products found"
        emptyDescription={debouncedSearch ? 'Try adjusting your search' : 'Add your first product to get started'}
        emptyActionLabel={!debouncedSearch ? 'Add Product' : undefined}
        emptyActionHref={!debouncedSearch ? '/admin/products/new' : undefined}
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
        {products.map((product, index) => {
          const stock = product.stockCount ?? 0;
          // Stock can go below zero when the shop sells ahead of a delivery —
          // that is out of stock, not "low".
          const stockStatus = stock <= 0 ? 'out-of-stock' : stock <= 20 ? 'low-stock' : 'in-stock';
          const edge = reorder.dropEdge(index);

          return (
            <tr
              key={product.id}
              {...(reorderMode ? reorder.rowProps(index) : {})}
              onClick={reorderMode ? undefined : () => navigate(`/admin/products/${product.id}/edit`)}
              className={reorderRowClass(reorderMode, edge)}
            >
              {reorderMode && <ReorderHandleCell />}
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <img
                    src={product.images[0] || undefined}
                    alt={product.name}
                    className="w-10 h-10 rounded-lg object-contain p-0.5 bg-surface-100 dark:bg-surface-800"
                  />
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                      {product.name}
                    </p>
                    {product.badge && (
                      <span className="text-caption text-brand-600 dark:text-brand-400 capitalize">
                        {product.badge}
                      </span>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400 capitalize">
                {product.category.replace('-', ' ')}
              </td>
              <td className="px-5 py-3.5">
                <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 tabular-nums">
                  {formatPrice(product.price)}
                </p>
                {product.originalPrice && product.originalPrice > product.price && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-caption text-surface-400 line-through tabular-nums">
                      {formatPrice(product.originalPrice)}
                    </span>
                    <span className="text-caption text-green-600 font-semibold">
                      {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% off
                    </span>
                  </div>
                )}
              </td>
              <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                {editingId === product.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={editStock}
                      onChange={(e) => setEditStock(e.target.value)}
                      className="w-20 px-2.5 py-1.5 rounded-lg border border-brand-300 dark:border-brand-500/40 text-body-sm bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      min="0"
                      autoFocus
                    />
                    <button onClick={() => handleSaveStock(product.id)} disabled={isSavingStock} className="px-2.5 py-1 rounded-lg text-caption text-white bg-brand-500 hover:bg-brand-600 font-medium transition-colors disabled:opacity-50">{isSavingStock ? 'Saving…' : 'Save'}</button>
                    <button onClick={() => setEditingId(null)} className="px-2.5 py-1 rounded-lg text-caption text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingId(product.id); setEditStock(String(stock)); }}
                    // A draggable row swallows text selection, so inline stock
                    // editing is off while the catalogue is being arranged.
                    disabled={reorderMode}
                    className={`text-body-sm font-semibold tabular-nums enabled:hover:underline ${
                      stock <= 0 ? 'text-red-600' : stock <= 20 ? 'text-amber-600' : 'text-green-600'
                    }`}
                    title={reorderMode ? 'Finish reordering to edit stock' : 'Click to edit stock'}
                  >
                    {stock}
                  </button>
                )}
              </td>
              <td className="px-5 py-3.5">
                <StatusBadge status={stockStatus} type="stock" />
              </td>
              <td className="px-5 py-3.5">
                <StatusBadge
                  status={product.isActive !== false ? 'active' : 'inactive'}
                  type="product"
                />
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Link
                    to={`/admin/products/${product.id}/edit`}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                  >
                    <Pencil size={16} />
                  </Link>
                  <button
                    onClick={() => setDeleteTarget(product.id)}
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
        title="Deactivate Product"
        description="Are you sure you want to deactivate this product? It will no longer be visible on the storefront."
        confirmLabel="Deactivate"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Import products"
        entityLabel="products"
        onImport={async (file, dryRun) => {
          const { importProducts } = await import('@/services/transfer.ts');
          return importProducts(file, dryRun, { updateStock: importStock });
        }}
        controls={
          <Toggle
            checked={importStock}
            onChange={setImportStock}
            label="Also update stock from this file"
            description="Off: the Stock column is ignored, so an older sheet cannot put back counts that sales have since changed."
          />
        }
        controlsKey={String(importStock)}
        templates={[
          {
            label: 'Quick template',
            download: async () => {
              const { downloadProductTemplate } = await import('@/services/transfer.ts');
              return downloadProductTemplate('quick');
            },
          },
          {
            label: 'Full template',
            download: async () => {
              const { downloadProductTemplate } = await import('@/services/transfer.ts');
              return downloadProductTemplate('full');
            },
          },
        ]}
        onImported={() => {
          fetchProducts();
          fetchStats();
        }}
      />
    </ListPageShell>
  );
}
