import { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, Search, Factory, X, PackageSearch, CheckCircle2, EyeOff, IndianRupee } from 'lucide-react';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import {
  getFactoryProducts,
  createFactoryProduct,
  updateFactoryProduct,
  deleteFactoryProduct,
} from '@/services/factory.ts';
import { FACTORY_UNITS, type FactoryProduct } from '@/types/factory.ts';
import { cn } from '@/lib/utils.ts';

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';
const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

interface FormState {
  name: string;
  rate: string;
  per: string;
  isActive: boolean;
}

const emptyForm: FormState = { name: '', rate: '', per: 'CASE', isActive: true };

const STATUS_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Hidden', value: 'hidden' },
];

const SORT_OPTIONS = [
  { label: 'Name (A–Z)', value: 'name' },
  { label: 'Rate (high to low)', value: 'rate-desc' },
  { label: 'Rate (low to high)', value: 'rate-asc' },
];

/**
 * The factory's product list.
 *
 * Deliberately not the shop's Products screen: these items have no stock, no
 * images and never appear on the website. A factory line is a description, a
 * rate and the unit it is sold by — everything a bill needs and nothing else.
 * Rate and unit here are only the starting point; both stay editable on the
 * bill, because the rate agreed with one trader is not the list rate.
 */
export function AdminFactoryProductsPage() {
  const [products, setProducts] = useState<FactoryProduct[]>([]);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [unitFilter, setUnitFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FactoryProduct | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<FactoryProduct | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      setProducts(await getFactoryProducts({ includeInactive: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the factory product list.');
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  /** Units actually in use, so the filter never offers one with no rows behind it. */
  const unitOptions = useMemo(
    () => [
      { label: 'Any unit', value: '' },
      ...[...new Set(products.map((p) => p.per).filter(Boolean))].sort().map((u) => ({ label: u, value: u })),
    ],
    [products],
  );

  const stats = useMemo(() => {
    const priced = products.filter((p) => p.rate > 0);
    return {
      total: products.length,
      active: products.filter((p) => p.isActive).length,
      hidden: products.filter((p) => !p.isActive).length,
      // Averaged over the items that carry a rate — items left at zero would
      // otherwise drag the figure toward nothing.
      avgRate: priced.length ? Math.round(priced.reduce((s, p) => s + p.rate, 0) / priced.length) : 0,
    };
  }, [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (statusFilter === 'active' && !p.isActive) return false;
      if (statusFilter === 'hidden' && p.isActive) return false;
      if (unitFilter && p.per !== unitFilter) return false;
      return true;
    });
    // Sorted on a copy: `products` is the list as the server sent it, and the
    // add/edit handlers splice into that order.
    if (sortBy === 'rate-desc') return [...rows].sort((a, b) => b.rate - a.rate);
    if (sortBy === 'rate-asc') return [...rows].sort((a, b) => a.rate - b.rate);
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search, statusFilter, unitFilter, sortBy]);

  const filtered = statusFilter !== 'all' || unitFilter !== '' || Boolean(search.trim());

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (product: FactoryProduct) => {
    setEditing(product);
    setForm({
      name: product.name,
      rate: product.rate ? String(product.rate) : '',
      per: product.per || 'CASE',
      isActive: product.isActive,
    });
    setFormError('');
    setFormOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      setFormError('Enter the product name.');
      return;
    }
    setIsSaving(true);
    setFormError('');
    try {
      const payload = {
        name,
        rate: Number(form.rate) || 0,
        per: (form.per || 'CASE').trim().toUpperCase(),
        isActive: form.isActive,
      };
      if (editing) {
        const saved = await updateFactoryProduct(editing.id, payload);
        setProducts((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      } else {
        const created = await createFactoryProduct(payload);
        setProducts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setFormOpen(false);
    } catch (e) {
      // A duplicate name comes back as 409 with the reason — show it rather
      // than leaving the drawer looking like nothing happened.
      setFormError(e instanceof Error ? e.message : 'Could not save that product.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteFactoryProduct(deleteTarget.id);
      setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete that product.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-body-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard
          label="Products"
          value={String(stats.total)}
          icon={Factory}
          color="bg-brand-500/10 text-brand-500"
          isLoading={isLoading}
        />
        <KPICard
          label="Active"
          value={String(stats.active)}
          icon={CheckCircle2}
          color="bg-emerald-500/10 text-emerald-500"
          isLoading={isLoading}
        />
        <KPICard
          label="Hidden"
          value={String(stats.hidden)}
          icon={EyeOff}
          color="bg-surface-500/10 text-surface-500"
          isLoading={isLoading}
        />
        <KPICard
          label="Average rate"
          value={stats.avgRate ? inr(stats.avgRate) : '—'}
          icon={IndianRupee}
          color="bg-blue-500/10 text-blue-500"
          isLoading={isLoading}
        />
      </div>

      {/* Search on the left, the filter panel and the one action on the right —
          the same toolbar the Bills screen uses. */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className={cn(inputClass, 'pl-10')}
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <FilterButton
            activeCount={
              (statusFilter !== 'all' ? 1 : 0) + (unitFilter !== '' ? 1 : 0) + (sortBy !== 'name' ? 1 : 0)
            }
            open={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          />
          <button
            onClick={openAdd}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
          >
            <Plus size={16} />
            Add Product
          </button>
        </div>
      </div>

      <FilterPanel
        open={showFilters}
        onClearAll={() => {
          setStatusFilter('all');
          setUnitFilter('');
          setSortBy('name');
        }}
        filters={[
          { id: 'status', label: 'Status', value: statusFilter, options: STATUS_OPTIONS, onChange: setStatusFilter },
          { id: 'unit', label: 'Per', value: unitFilter, options: unitOptions, onChange: setUnitFilter },
          { id: 'sort', label: 'Sort By', value: sortBy, options: SORT_OPTIONS, onChange: setSortBy },
        ]}
      />

      <DataTable
        columns={[
          { key: 'name', label: 'Product' },
          { key: 'rate', label: 'Rate', className: 'text-right' },
          { key: 'per', label: 'Per', className: 'text-center' },
          { key: 'status', label: 'Status', className: 'text-center' },
          { key: 'actions', label: '', className: 'text-right' },
        ]}
        isLoading={isLoading}
        isEmpty={visible.length === 0}
        emptyIcon={<PackageSearch size={28} />}
        emptyTitle={filtered ? 'No matching products' : 'No factory products yet'}
        emptyDescription={
          filtered
            ? 'Try a different search or filter.'
            : 'Add the items the factory bills for — a name, a rate and the unit.'
        }
        emptyActionLabel={filtered ? undefined : 'Add Product'}
        onEmptyAction={filtered ? undefined : openAdd}
      >
        {visible.map((p) => (
          <tr key={p.id} className="border-b border-surface-100 dark:border-surface-800 last:border-0">
            <td className="px-4 py-3">
              <span className="flex items-center gap-2 font-medium text-body-sm text-surface-900 dark:text-surface-100">
                <Factory size={14} className="text-surface-400 flex-shrink-0" />
                {p.name}
              </span>
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-body-sm text-surface-700 dark:text-surface-300">
              {p.rate ? inr(p.rate) : '—'}
            </td>
            <td className="px-4 py-3 text-center text-body-sm text-surface-500">{p.per}</td>
            <td className="px-4 py-3 text-center">
              <span
                className={cn(
                  'inline-flex px-2 py-0.5 rounded-full text-caption font-semibold',
                  p.isActive
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-surface-200 dark:bg-surface-800 text-surface-500',
                )}
              >
                {p.isActive ? 'Active' : 'Hidden'}
              </span>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => openEdit(p)}
                  aria-label={`Edit ${p.name}`}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-brand-500 transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => {
                    setDeleteError('');
                    setDeleteTarget(p);
                  }}
                  aria-label={`Delete ${p.name}`}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-surface-950/60 backdrop-blur-sm" onClick={() => setFormOpen(false)} />
          <div className="relative w-full sm:max-w-md bg-white dark:bg-surface-900 rounded-t-2xl sm:rounded-2xl border border-surface-200 dark:border-surface-800 shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-800">
              <h2 className="font-display font-semibold text-body-lg text-surface-900 dark:text-surface-50">
                {editing ? 'Edit Product' : 'Add Product'}
              </h2>
              <button
                onClick={() => setFormOpen(false)}
                aria-label="Close"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {formError && (
                <div className="px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-body-sm text-red-600 dark:text-red-400">
                  {formError}
                </div>
              )}
              <div>
                <label className={labelClass}>Product name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Stripped Bijili"
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Rate</label>
                  <input
                    value={form.rate}
                    onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value.replace(/[^\d.]/g, '') }))}
                    inputMode="decimal"
                    placeholder="0.00"
                    className={cn(inputClass, 'tabular-nums')}
                  />
                </div>
                <div>
                  <label className={labelClass}>Per</label>
                  <input
                    value={form.per}
                    onChange={(e) => setForm((f) => ({ ...f, per: e.target.value.toUpperCase() }))}
                    list="factory-units"
                    placeholder="CASE"
                    className={inputClass}
                  />
                  <datalist id="factory-units">
                    {FACTORY_UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
              </div>
              <label className="flex items-center gap-2.5 text-body-sm text-surface-700 dark:text-surface-300">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500/30"
                />
                Show in the bill screen's product picker
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-100 dark:border-surface-800">
              <button
                onClick={() => setFormOpen(false)}
                className="px-4 py-2.5 rounded-xl text-body-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-xl bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {isSaving ? 'Saving...' : editing ? 'Save Changes' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this product?"
        description={`"${deleteTarget?.name ?? ''}" will be removed from the factory list. Bills already raised keep the name and rate they were printed with.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        error={deleteError}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
