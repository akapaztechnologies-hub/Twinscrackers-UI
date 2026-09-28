import { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, Search, Factory, IndianRupee, Wallet, ShieldCheck, UploadCloud, X } from 'lucide-react';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { SupplierFormDrawer } from '@/components/admin/SupplierFormDrawer.tsx';
import {
  getSuppliers,
  deleteSupplier,
  supplierBalance,
  readLocalSuppliers,
  importLocalSuppliers,
  clearLocalSuppliers,
} from '@/services/suppliers.ts';
import type { Supplier } from '@/types/admin.ts';

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;

export function AdminSuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [pesoFilter, setPesoFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [sortBy, setSortBy] = useState('code');
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editSupplierId, setEditSupplierId] = useState<string | null>(null);

  // Rows this browser kept back when the screen had no API behind it. Offered
  // rather than uploaded, because the old code seeded sample suppliers that
  // nobody should find in their real directory.
  const [strandedLocal, setStrandedLocal] = useState<Supplier[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importNote, setImportNote] = useState('');

  const fetchSuppliers = async () => {
    setIsLoading(true);
    try {
      const result = await getSuppliers();
      setSuppliers(result);
      // The offer only makes sense against an empty directory — the import
      // endpoint refuses once the server has rows of its own.
      setStrandedLocal(result.length === 0 ? readLocalSuppliers() : []);
    } catch {
      setSuppliers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSupplier(deleteTarget);
      setSuppliers((prev) => prev.filter((s) => s.id !== deleteTarget));
    } catch {
      /* handled */
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const importStranded = async () => {
    setIsImporting(true);
    setImportNote('');
    try {
      const count = await importLocalSuppliers(strandedLocal);
      clearLocalSuppliers();
      setStrandedLocal([]);
      setImportNote(`${count} supplier(s) moved to the server.`);
      await fetchSuppliers();
    } catch (e) {
      setImportNote(e instanceof Error ? e.message : 'Could not import those suppliers.');
    } finally {
      setIsImporting(false);
    }
  };

  const discardStranded = () => {
    clearLocalSuppliers();
    setStrandedLocal([]);
  };

  // City filter options are derived from the data so they grow with it.
  const cityOptions = useMemo(() => {
    const cities = Array.from(new Set(suppliers.map((s) => s.city).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return [{ label: 'All Cities', value: 'all' }, ...cities.map((c) => ({ label: c, value: c }))];
  }, [suppliers]);

  const filtered = useMemo(() => {
    let list = suppliers;

    if (pesoFilter !== 'all') list = list.filter((s) => (pesoFilter === 'yes' ? s.pesoLicensed : !s.pesoLicensed));
    if (cityFilter !== 'all') list = list.filter((s) => s.city === cityFilter);
    if (balanceFilter !== 'all') {
      list = list.filter((s) => {
        const b = supplierBalance(s);
        if (balanceFilter === 'due') return b > 0;
        if (balanceFilter === 'settled') return b === 0;
        return b < 0; // 'advance'
      });
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.companyName.toLowerCase().includes(q) ||
          s.supplierCode.toLowerCase().includes(q) ||
          s.contactPerson.toLowerCase().includes(q) ||
          s.city.toLowerCase().includes(q) ||
          s.phone.includes(search) ||
          s.productsSupplied.some((p) => p.toLowerCase().includes(q)),
      );
    }

    const sorted = [...list];
    switch (sortBy) {
      case 'name-asc':
        sorted.sort((a, b) => a.companyName.localeCompare(b.companyName));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.companyName.localeCompare(a.companyName));
        break;
      case 'balance-high':
        sorted.sort((a, b) => supplierBalance(b) - supplierBalance(a));
        break;
      case 'ordered-high':
        sorted.sort((a, b) => (b.totalOrdered || 0) - (a.totalOrdered || 0));
        break;
      default: // 'code'
        sorted.sort((a, b) => a.supplierCode.localeCompare(b.supplierCode));
    }
    return sorted;
  }, [suppliers, search, pesoFilter, cityFilter, balanceFilter, sortBy]);

  const totalItems = filtered.length;
  const paginatedData = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, pesoFilter, cityFilter, balanceFilter, sortBy]);

  const activeFilterCount =
    (pesoFilter !== 'all' ? 1 : 0) +
    (cityFilter !== 'all' ? 1 : 0) +
    (balanceFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'code' ? 1 : 0);

  // Sorting never removes rows, so it doesn't count toward the "no results" empty state.
  const hasActiveNarrowing = !!search || pesoFilter !== 'all' || cityFilter !== 'all' || balanceFilter !== 'all';

  // Stats
  const totalOrdered = suppliers.reduce((sum, s) => sum + (s.totalOrdered || 0), 0);
  const totalPaid = suppliers.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
  const outstanding = totalOrdered - totalPaid;

  return (
    <ListPageShell
      header={
        <>
          {/* Leftovers from when this screen only saved to the browser. */}
          {strandedLocal.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 text-body-sm text-surface-700 dark:text-surface-300">
              <UploadCloud size={18} className="text-amber-600 shrink-0" />
              <span className="flex-1 min-w-[220px]">
                <strong>{strandedLocal.length} supplier{strandedLocal.length === 1 ? '' : 's'}</strong>{' '}
                ({strandedLocal.slice(0, 3).map((s) => s.companyName).join(', ')}
                {strandedLocal.length > 3 ? '…' : ''}) are saved only in this browser, from before
                suppliers were shared across devices. Move them to the server so everyone sees them.
              </span>
              <button
                onClick={() => void importStranded()}
                disabled={isImporting}
                className="px-3.5 h-9 rounded-lg bg-amber-500 text-white text-[13px] font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {isImporting ? 'Moving…' : 'Move to server'}
              </button>
              <button
                onClick={discardStranded}
                title="Forget this browser's copy without saving it"
                className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {importNote && (
            <p className="px-4 text-body-sm font-medium text-surface-600 dark:text-surface-400">{importNote}</p>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard label="Total Suppliers" value={String(suppliers.length)} icon={Factory} color="text-blue-600 bg-blue-500/10" isLoading={isLoading} />
            <KPICard label="Total Ordered" value={inr(totalOrdered)} icon={IndianRupee} color="text-violet-600 bg-violet-500/10" isLoading={isLoading} />
            <KPICard label="Total Paid" value={inr(totalPaid)} icon={Wallet} color="text-green-600 bg-green-500/10" isLoading={isLoading} />
            <KPICard label="Outstanding" value={inr(outstanding)} icon={IndianRupee} color="text-red-600 bg-red-500/10" isLoading={isLoading} />
          </div>

          {/* Toolbar: Search + Add */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search suppliers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <FilterButton activeCount={activeFilterCount} open={showFilters} onClick={() => setShowFilters((v) => !v)} />
              <button
                onClick={() => {
                  setEditSupplierId(null);
                  setIsDrawerOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Plus size={15} />
                Add Supplier
              </button>
            </div>
          </div>

          <FilterPanel
            open={showFilters}
            onClearAll={() => {
              setPesoFilter('all');
              setCityFilter('all');
              setBalanceFilter('all');
              setSortBy('code');
            }}
            filters={[
              {
                id: 'peso',
                label: 'PESO',
                value: pesoFilter,
                options: [
                  { label: 'All PESO', value: 'all' },
                  { label: 'Licensed', value: 'yes' },
                  { label: 'Not Licensed', value: 'no' },
                ],
                onChange: setPesoFilter,
              },
              { id: 'city', label: 'City', value: cityFilter, options: cityOptions, onChange: setCityFilter },
              {
                id: 'balance',
                label: 'Balance',
                value: balanceFilter,
                options: [
                  { label: 'All Balances', value: 'all' },
                  { label: 'Outstanding', value: 'due' },
                  { label: 'Settled', value: 'settled' },
                  { label: 'Advance paid', value: 'advance' },
                ],
                onChange: setBalanceFilter,
              },
              {
                id: 'sort',
                label: 'Sort By',
                value: sortBy,
                options: [
                  { label: 'Code (SUP#)', value: 'code' },
                  { label: 'Name A–Z', value: 'name-asc' },
                  { label: 'Name Z–A', value: 'name-desc' },
                  { label: 'Highest balance', value: 'balance-high' },
                  { label: 'Highest ordered', value: 'ordered-high' },
                ],
                onChange: setSortBy,
              },
            ]}
          />
        </>
      }
    >
      {/* Table */}
      <DataTable
        columns={[
          { key: 'supplier', label: 'Supplier' },
          { key: 'contact', label: 'Contact' },
          { key: 'city', label: 'City' },
          { key: 'ordered', label: 'Ordered', className: 'text-right' },
          { key: 'paid', label: 'Paid', className: 'text-right' },
          { key: 'balance', label: 'Balance', className: 'text-right' },
          { key: 'peso', label: 'PESO' },
          { key: 'actions', label: '', className: 'w-20' },
        ]}
        isLoading={isLoading}
        isEmpty={filtered.length === 0}
        emptyIcon={<Factory size={24} className="text-surface-400" />}
        emptyTitle="No suppliers found"
        emptyDescription={
          hasActiveNarrowing ? 'Try adjusting your search or filters' : 'Add your first supplier to track orders and payments'
        }
        emptyActionLabel={!hasActiveNarrowing ? 'Add Supplier' : undefined}
        onEmptyAction={() => {
          setEditSupplierId(null);
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
        {paginatedData.map((s) => {
          const balance = supplierBalance(s);
          return (
            <tr
              key={s.id}
              onClick={() => {
                setEditSupplierId(s.id);
                setIsDrawerOpen(true);
              }}
              className="border-b border-surface-50 dark:border-surface-850 last:border-0 hover:bg-surface-50/50 dark:hover:bg-surface-850/50 cursor-pointer transition-colors"
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center flex-shrink-0">
                    <Factory size={18} className="text-surface-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 truncate">{s.companyName}</p>
                    <p className="text-caption text-surface-400 font-mono">{s.supplierCode}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <p className="text-body-sm text-surface-700 dark:text-surface-300">{s.contactPerson || '—'}</p>
                {s.phone && <p className="text-caption text-surface-400 tabular-nums">{s.phone}</p>}
              </td>
              <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400">{s.city || '—'}</td>
              <td className="px-5 py-3.5 text-right text-body-sm text-surface-600 dark:text-surface-400 tabular-nums">{inr(s.totalOrdered)}</td>
              <td className="px-5 py-3.5 text-right text-body-sm text-surface-600 dark:text-surface-400 tabular-nums">{inr(s.amountPaid)}</td>
              <td className="px-5 py-3.5 text-right">
                <span
                  className={
                    'text-body-sm font-semibold tabular-nums ' +
                    (balance > 0
                      ? 'text-red-600 dark:text-red-400'
                      : balance < 0
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-green-600 dark:text-green-400')
                  }
                >
                  {inr(Math.abs(balance))}
                </span>
              </td>
              <td className="px-5 py-3.5">
                {s.pesoLicensed ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-caption font-medium">
                    <ShieldCheck size={12} />
                    Yes
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-100 dark:bg-surface-800 text-surface-500 text-caption font-medium">No</span>
                )}
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => {
                      setEditSupplierId(s.id);
                      setIsDrawerOpen(true);
                    }}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(s.id)}
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
        title="Delete Supplier"
        description="Are you sure you want to delete this supplier? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <SupplierFormDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        supplierId={editSupplierId}
        onSuccess={fetchSuppliers}
      />
    </ListPageShell>
  );
}
