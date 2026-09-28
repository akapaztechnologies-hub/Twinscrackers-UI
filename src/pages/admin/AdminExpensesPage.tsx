import { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, Search, Wallet, IndianRupee, CalendarDays, Receipt } from 'lucide-react';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { ExpenseFormDrawer } from '@/components/admin/ExpenseFormDrawer.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { getExpenses, deleteExpense, expenseTotal } from '@/services/expenses.ts';
import { EXPENSE_CATEGORIES } from '@/types/admin.ts';
import type { Expense } from '@/types/admin.ts';

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;

/** Format a YYYY-MM-DD calendar string in the local zone (avoids UTC off-by-one). */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

/** Current YYYY-MM prefix from local date parts (not UTC). */
function currentMonthPrefix(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Local YYYY-MM-DD for a Date. */
function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Does an expense date (YYYY-MM-DD) fall inside the given range key?
 * Bounded on both ends so future-dated expenses never leak in, and 'month'
 * mirrors the "This Month" KPI exactly.
 */
function matchesRange(date: string, range: string): boolean {
  if (range === 'all') return true;
  const now = new Date();
  if (range === 'month') return date.startsWith(currentMonthPrefix());
  if (range === 'year') return date.startsWith(`${now.getFullYear()}-`);
  if (range === '30d' || range === '90d') {
    const back = new Date(now);
    back.setDate(back.getDate() - (range === '30d' ? 29 : 89)); // inclusive of today = exactly 30/90 days
    return date >= localISO(back) && date <= localISO(now);
  }
  return true;
}

const dateRangeOptions = [
  { label: 'All Time', value: 'all' },
  { label: 'This Month', value: 'month' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 90 Days', value: '90d' },
  { label: 'This Year', value: 'year' },
];

const categoryOptions = [
  { label: 'All Categories', value: 'all' },
  ...EXPENSE_CATEGORIES.map((c) => ({ label: c, value: c })),
];

const CATEGORY_COLORS: Record<string, string> = {
  Transport: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  Loading: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Packing: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  Staff: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  Rent: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  Electricity: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  Maintenance: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  'License Fee': 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  Miscellaneous: 'bg-surface-500/10 text-surface-600 dark:text-surface-300',
};

export function AdminExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      const result = await getExpenses();
      setExpenses(result);
    } catch {
      setExpenses([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteExpense(deleteTarget);
      setExpenses((prev) => prev.filter((e) => e.id !== deleteTarget));
    } catch {
      /* handled */
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const filtered = useMemo(() => {
    let list = expenses;
    if (categoryFilter !== 'all') list = list.filter((e) => e.category === categoryFilter);
    if (dateRange !== 'all') list = list.filter((e) => matchesRange(e.date, dateRange));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.paidTo.toLowerCase().includes(q),
      );
    }
    return list;
  }, [expenses, categoryFilter, dateRange, search]);

  const totalItems = filtered.length;
  const paginatedData = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, dateRange]);

  const activeFilterCount = (categoryFilter !== 'all' ? 1 : 0) + (dateRange !== 'all' ? 1 : 0);
  const hasActiveNarrowing = !!search || categoryFilter !== 'all' || dateRange !== 'all';

  // Stats
  const totalSpent = expenses.reduce((sum, e) => sum + expenseTotal(e), 0);
  const totalGst = expenses.reduce((sum, e) => sum + (e.gst || 0), 0);
  const thisMonthPrefix = currentMonthPrefix(); // YYYY-MM (local)
  const thisMonth = expenses
    .filter((e) => e.date.startsWith(thisMonthPrefix))
    .reduce((sum, e) => sum + expenseTotal(e), 0);

  return (
    <ListPageShell
      header={
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard label="Total Records" value={String(expenses.length)} icon={Receipt} color="text-blue-600 bg-blue-500/10" isLoading={isLoading} />
            <KPICard label="Total Spent" value={inr(totalSpent)} icon={Wallet} color="text-red-600 bg-red-500/10" isLoading={isLoading} />
            <KPICard label="This Month" value={inr(thisMonth)} icon={CalendarDays} color="text-violet-600 bg-violet-500/10" isLoading={isLoading} />
            <KPICard label="Total GST" value={inr(totalGst)} icon={IndianRupee} color="text-green-600 bg-green-500/10" isLoading={isLoading} />
          </div>

          {/* Toolbar: Search + Filters + Add */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search expenses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <FilterButton activeCount={activeFilterCount} open={showFilters} onClick={() => setShowFilters((v) => !v)} />
              <button
                onClick={() => {
                  setEditExpenseId(null);
                  setIsDrawerOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Plus size={15} />
                Add Expense
              </button>
            </div>
          </div>

          <FilterPanel
            open={showFilters}
            onClearAll={() => {
              setCategoryFilter('all');
              setDateRange('all');
            }}
            filters={[
              { id: 'category', label: 'Category', value: categoryFilter, options: categoryOptions, onChange: setCategoryFilter },
              { id: 'date', label: 'Date Range', value: dateRange, options: dateRangeOptions, onChange: setDateRange },
            ]}
          />
        </>
      }
    >
      {/* Table */}
      <DataTable
        columns={[
          { key: 'date', label: 'Date' },
          { key: 'category', label: 'Category' },
          { key: 'description', label: 'Description' },
          { key: 'paidTo', label: 'Paid To' },
          { key: 'amount', label: 'Amount', className: 'text-right' },
          { key: 'gst', label: 'GST', className: 'text-right' },
          { key: 'total', label: 'Total', className: 'text-right' },
          { key: 'actions', label: '', className: 'w-20' },
        ]}
        isLoading={isLoading}
        isEmpty={filtered.length === 0}
        emptyIcon={<Wallet size={24} className="text-surface-400" />}
        emptyTitle="No expenses found"
        emptyDescription={hasActiveNarrowing ? 'Try adjusting your search or filters' : 'Record your first expense to start tracking spending'}
        emptyActionLabel={!hasActiveNarrowing ? 'Add Expense' : undefined}
        onEmptyAction={() => {
          setEditExpenseId(null);
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
        {paginatedData.map((e) => (
          <tr
            key={e.id}
            onClick={() => {
              setEditExpenseId(e.id);
              setIsDrawerOpen(true);
            }}
            className="border-b border-surface-50 dark:border-surface-850 last:border-0 hover:bg-surface-50/50 dark:hover:bg-surface-850/50 cursor-pointer transition-colors"
          >
            <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400 tabular-nums whitespace-nowrap">
              {formatDate(e.date)}
            </td>
            <td className="px-5 py-3.5">
              <span className={'inline-flex px-2 py-0.5 rounded-md text-caption font-medium ' + (CATEGORY_COLORS[e.category] ?? 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300')}>
                {e.category}
              </span>
            </td>
            <td className="px-5 py-3.5">
              <p className="text-body-sm text-surface-900 dark:text-surface-100 truncate max-w-xs">{e.description || '—'}</p>
            </td>
            <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400">{e.paidTo || '—'}</td>
            <td className="px-5 py-3.5 text-right text-body-sm text-surface-600 dark:text-surface-400 tabular-nums">{inr(e.amount)}</td>
            <td className="px-5 py-3.5 text-right text-body-sm text-surface-500 tabular-nums">{inr(e.gst)}</td>
            <td className="px-5 py-3.5 text-right text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">{inr(expenseTotal(e))}</td>
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                <button
                  onClick={() => {
                    setEditExpenseId(e.id);
                    setIsDrawerOpen(true);
                  }}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeleteTarget(e.id)}
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
        title="Delete Expense"
        description="Are you sure you want to delete this expense? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ExpenseFormDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        expenseId={editExpenseId}
        onSuccess={fetchExpenses}
      />
    </ListPageShell>
  );
}
