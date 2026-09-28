import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search, Layers, Upload } from 'lucide-react';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { CategoryFormDrawer } from '@/components/admin/CategoryFormDrawer.tsx';
import { ExportButton } from '@/components/admin/ExportButton.tsx';
import { ImportDialog } from '@/components/admin/ImportDialog.tsx';
import { ErrorNotice, errorText } from '@/components/admin/AdminShared.tsx';
import type { Category } from '@/types/admin.ts';

const statusOptions = [
  { label: 'All Status', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

const productsOptions = [
  { label: 'All Categories', value: 'all' },
  { label: 'Has products', value: 'has' },
  { label: 'Empty (no products)', value: 'empty' },
];

const sortOptions = [
  { label: 'Display order', value: 'order' },
  { label: 'Name (A–Z)', value: 'name-asc' },
  { label: 'Name (Z–A)', value: 'name-desc' },
  { label: 'Most products', value: 'products-high' },
  { label: 'Fewest products', value: 'products-low' },
  { label: 'Recently added', value: 'newest' },
];

export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [productsFilter, setProductsFilter] = useState('all');
  const [sortBy, setSortBy] = useState('order');
  const [showFilters, setShowFilters] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [actionError, setActionError] = useState('');

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);

  /** Full-field CSV, in the same column order the importer reads back. */
  const handleExport = async () => {
    setIsExporting(true);
    setActionError('');
    try {
      const { exportCategories } = await import('@/services/transfer.ts');
      await exportCategories();
    } catch (err) {
      setActionError(errorText(err, 'The categories could not be exported. Please try again.'));
    } finally {
      setIsExporting(false);
    }
  };

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const { getAllCategories } = await import('@/services/admin.ts');
      const result = await getAllCategories();
      setCategories(result.data);
    } catch {
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const { deleteCategory } = await import('@/services/admin.ts');
      await deleteCategory(deleteTarget);
      // Refetch rather than dropping the row locally: the list has to reflect
      // what the server actually did, not what the click hoped it did.
      await fetchCategories();
      setDeleteTarget(null);
    } catch (e) {
      // The server refuses while products are still filed under the category.
      // Keep the dialog open and say why.
      setDeleteError(e instanceof Error ? e.message : 'Could not delete this category.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleStatus = async (categoryId: string, currentStatus: boolean) => {
    setActionError('');
    try {
      const { toggleCategoryStatus } = await import('@/services/admin.ts');
      await toggleCategoryStatus(categoryId, !currentStatus);
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, isActive: !currentStatus } : c)),
      );
    } catch (err) {
      setActionError(errorText(err, 'That category could not be switched. Please try again.'));
    }
  };

  // Filter + sort
  let filtered = categories;
  if (statusFilter !== 'all') {
    filtered = filtered.filter((c) => (statusFilter === 'active' ? c.isActive : !c.isActive));
  }
  if (productsFilter !== 'all') {
    filtered = filtered.filter((c) => {
      const count = c.productCount ?? 0;
      return productsFilter === 'has' ? count > 0 : count === 0;
    });
  }
  if (search) {
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.slug.toLowerCase().includes(search.toLowerCase()),
    );
  }
  filtered = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'name-asc': return a.name.localeCompare(b.name);
      case 'name-desc': return b.name.localeCompare(a.name);
      case 'products-high': return (b.productCount ?? 0) - (a.productCount ?? 0);
      case 'products-low': return (a.productCount ?? 0) - (b.productCount ?? 0);
      case 'newest': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      default: return a.displayOrder - b.displayOrder;
    }
  });

  // Pagination
  const totalItems = filtered.length;
  const paginatedData = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset page when search or filters change
  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, productsFilter, sortBy]);

  // Stats
  const totalActive = categories.filter((c) => c.isActive).length;
  const totalInactive = categories.filter((c) => !c.isActive).length;
  const activeFilters = [statusFilter, productsFilter].filter((v) => v !== 'all').length + (sortBy !== 'order' ? 1 : 0);

  return (
    <ListPageShell
      header={
        <>
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Total Categories" value={String(categories.length)} icon={Layers} color="text-blue-600 bg-blue-500/10" isLoading={isLoading} />
        <KPICard label="Active" value={String(totalActive)} icon={Layers} color="text-green-600 bg-green-500/10" isLoading={isLoading} />
        <KPICard label="Inactive" value={String(totalInactive)} icon={Layers} color="text-surface-500 bg-surface-500/10" isLoading={isLoading} />
      </div>

      {/* Toolbar: Search + Add */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <FilterButton activeCount={activeFilters} open={showFilters} onClick={() => setShowFilters(!showFilters)} />
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3.5 h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
          >
            <Upload size={16} />
            Import
          </button>
          <ExportButton onExport={handleExport} isExporting={isExporting} />
          <button
            onClick={() => {
              setEditCategoryId(null);
              setIsDrawerOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
          >
            <Plus size={15} />
            Add Category
          </button>
        </div>
      </div>

      {/* Expandable filter panel */}
      <FilterPanel
        open={showFilters}
        onClearAll={() => { setStatusFilter('all'); setProductsFilter('all'); setSortBy('order'); }}
        filters={[
          { id: 'status', label: 'Status', value: statusFilter, options: statusOptions, onChange: setStatusFilter },
          { id: 'products', label: 'Products', value: productsFilter, options: productsOptions, onChange: setProductsFilter },
          { id: 'sort', label: 'Sort By', value: sortBy, options: sortOptions, onChange: setSortBy },
        ]}
      />

      <ErrorNotice message={actionError} onDismiss={() => setActionError('')} />
        </>
      }
    >

      {/* Table */}
      <DataTable
        columns={[
          { key: 'category', label: 'Category' },
          { key: 'slug', label: 'Slug' },
          { key: 'products', label: 'Products' },
          { key: 'status', label: 'Status' },
          { key: 'order', label: 'Order' },
          { key: 'actions', label: '', className: 'w-20' },
        ]}
        isLoading={isLoading}
        isEmpty={filtered.length === 0}
        emptyIcon={<Layers size={24} className="text-surface-400" />}
        emptyTitle="No categories found"
        emptyDescription={search || activeFilters > 0 ? 'Try adjusting your search or filters' : 'Create your first category to organize products'}
        emptyActionLabel={!search && activeFilters === 0 ? 'Add Category' : undefined}
        onEmptyAction={() => {
          setEditCategoryId(null);
          setIsDrawerOpen(true);
        }}
        pagination={{
          currentPage,
          totalItems,
          itemsPerPage,
          onPageChange: setCurrentPage,
          onItemsPerPageChange: (size) => { setItemsPerPage(size); setCurrentPage(1); },
        }}
      >
        {paginatedData.map((cat) => (
          <tr
            key={cat.id}
            onClick={() => {
              setEditCategoryId(cat.id);
              setIsDrawerOpen(true);
            }}
            className="border-b border-surface-50 dark:border-surface-850 last:border-0 hover:bg-surface-50/50 dark:hover:bg-surface-850/50 cursor-pointer transition-colors"
          >
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-3">
                {cat.image ? (
                  <img src={cat.image} alt={cat.name} className="w-10 h-10 rounded-lg object-cover bg-surface-100 dark:bg-surface-800" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
                    <Layers size={18} className="text-surface-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 truncate">{cat.name}</p>
                  {cat.description && (
                    <p className="text-caption text-surface-400 truncate max-w-xs">{cat.description}</p>
                  )}
                </div>
              </div>
            </td>
            <td className="px-5 py-3.5 text-body-sm text-surface-500 font-mono">{cat.slug}</td>
            <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400 tabular-nums">
              {cat.productCount ?? 0}
            </td>
            <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
              <Toggle
                checked={cat.isActive}
                onChange={() => handleToggleStatus(cat.id, cat.isActive)}
              />
            </td>
            <td className="px-5 py-3.5 text-body-sm text-surface-500 tabular-nums">{cat.displayOrder}</td>
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    setEditCategoryId(cat.id);
                    setIsDrawerOpen(true);
                  }}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeleteTarget(cat.id)}
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
        title="Delete Category"
        description="This removes the category for good. It is refused while products are still filed under it — use the on/off switch to just hide one."
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteError(''); }}
      />

      <CategoryFormDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        categoryId={editCategoryId}
        onSuccess={fetchCategories}
      />
      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Import categories"
        entityLabel="categories"
        onImport={async (file, dryRun) => {
          const { importCategories } = await import('@/services/transfer.ts');
          return importCategories(file, dryRun);
        }}
        templates={[
          {
            label: 'Blank template',
            download: async () => {
              const { downloadCategoryTemplate } = await import('@/services/transfer.ts');
              return downloadCategoryTemplate();
            },
          },
        ]}
        onImported={fetchCategories}
      />
    </ListPageShell>
  );
}
