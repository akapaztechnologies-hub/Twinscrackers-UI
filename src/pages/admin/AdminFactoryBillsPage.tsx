import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Printer, Pencil, Ban, FileText, Plus, Factory, IndianRupee, Receipt, Percent } from 'lucide-react';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { getFactoryBills, cancelFactoryBill, getFactoryBillStats } from '@/services/factory.ts';
import { printFactoryBill } from '@/lib/factoryBillPrint.ts';
import type { FactoryBill } from '@/types/factory.ts';
import { cn } from '@/lib/utils.ts';

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;
const day = (value: string) => (value || '').slice(0, 10);

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

/**
 * `yyyy-mm-dd` in the shop's own timezone.
 *
 * Not `toISOString().slice(0, 10)`: that is UTC, and after 5:30am IST it names
 * the wrong day — "today" would start yesterday.
 */
function localIso(d: Date): string {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

type Preset = 'all' | 'today' | 'week' | 'month' | 'year';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_OPTIONS = [
  { label: 'Any month', value: '' },
  ...MONTHS.map((label, i) => ({ label, value: String(i) })),
];

/** This year and the five before it — far enough back for any pad in use. */
const YEAR_OPTIONS = [
  { label: 'Any year', value: '' },
  ...Array.from({ length: 6 }, (_, i) => {
    const year = String(new Date().getFullYear() - i);
    return { label: year, value: year };
  }),
];

const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * Every bill the factory has raised.
 *
 * A screen of its own rather than rows inside the shop's Bills list: these are
 * a different firm's invoices, on their own numbering run, and mixing the two
 * would make either list a poor answer to "what did we bill?". The Factory Bill
 * screen raises one; this is where they are all found afterwards.
 */
export function AdminFactoryBillsPage() {
  const navigate = useNavigate();
  const [bills, setBills] = useState<FactoryBill[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{ count: number; total: number; taxable: number; gst: number } | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Which control set the window, so the buttons show what is active and the
  // cards can name the period rather than saying "in range" for everything.
  const [preset, setPreset] = useState<Preset>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [monthSel, setMonthSel] = useState('');
  const [yearSel, setYearSel] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<FactoryBill | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await getFactoryBills({ page, limit: perPage, search, status, from, to });
      setBills(result.bills);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the factory bills.');
      setBills([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, perPage, search, status, from, to]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const result = await getFactoryBillStats({ from, to });
        setStats(result.totals);
      } catch {
        setStats(null);
      }
    })();
  }, [from, to]);

  // A new search or filter starts at the first page, or the list can look empty
  // while sitting on page 4 of a result that now has one page.
  useEffect(() => {
    setPage(1);
  }, [search, status, from, to]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    setMonthSel('');
    setYearSel('');
    const now = new Date();
    if (p === 'all') {
      setFrom('');
      setTo('');
      return;
    }
    if (p === 'today') {
      setFrom(localIso(now));
      setTo(localIso(now));
      return;
    }
    if (p === 'week') {
      // Weeks start Monday here, as the shop's own week does.
      const start = new Date(now);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      setFrom(localIso(start));
      setTo(localIso(now));
      return;
    }
    if (p === 'month') {
      setFrom(localIso(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(localIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
      return;
    }
    setFrom(localIso(new Date(now.getFullYear(), 0, 1)));
    setTo(localIso(new Date(now.getFullYear(), 11, 31)));
  };

  /** Month, year, or both. A month with no year means this year. */
  const applyMonthYear = (month: string, year: string) => {
    setMonthSel(month);
    setYearSel(year);
    setPreset('all');
    if (month === '' && year === '') {
      setFrom('');
      setTo('');
      return;
    }
    const y = Number(year) || new Date().getFullYear();
    if (month === '') {
      setFrom(localIso(new Date(y, 0, 1)));
      setTo(localIso(new Date(y, 11, 31)));
      return;
    }
    const m = Number(month);
    setFrom(localIso(new Date(y, m, 1)));
    // Day 0 of the next month is the last day of this one, leap years included.
    setTo(localIso(new Date(y, m + 1, 0)));
  };

  const clearRange = () => {
    setPreset('all');
    setMonthSel('');
    setYearSel('');
    setFrom('');
    setTo('');
  };

  const print = async (bill: FactoryBill) => {
    setBusyId(bill.id);
    setError('');
    try {
      await printFactoryBill(bill);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the print dialog.');
    } finally {
      setBusyId(null);
    }
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    setCancelError('');
    try {
      await cancelFactoryBill(cancelTarget.id);
      setCancelTarget(null);
      await load();
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Could not cancel that bill.');
    } finally {
      setIsCancelling(false);
    }
  };

  const period =
    monthSel !== ''
      ? `${MONTHS[Number(monthSel)]} ${yearSel || new Date().getFullYear()}`
      : yearSel
        ? yearSel
        : PRESETS.find((p) => p.value === preset)!.label.toLowerCase();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard
          label={`Bills ${period}`}
          value={String(stats?.count ?? 0)}
          icon={Receipt}
          color="bg-brand-500/10 text-brand-500"
          isLoading={stats === null}
        />
        <KPICard
          label={`Billed ${period}`}
          value={inr(stats?.total ?? 0)}
          icon={IndianRupee}
          color="bg-emerald-500/10 text-emerald-500"
          isLoading={stats === null}
        />
        <KPICard
          label={`Taxable ${period}`}
          value={inr(stats?.taxable ?? 0)}
          icon={Factory}
          color="bg-blue-500/10 text-blue-500"
          isLoading={stats === null}
        />
        <KPICard
          label={`GST ${period}`}
          value={inr(stats?.gst ?? 0)}
          icon={Percent}
          color="bg-amber-500/10 text-amber-500"
          isLoading={stats === null}
        />
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-body-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Search on the left, the filter panel and the one action on the right —
          the same toolbar the Bills screen uses. */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Invoice number, party or GSTIN"
            className={cn(inputClass, 'pl-10')}
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <FilterButton
            activeCount={
              (status !== 'all' ? 1 : 0) +
              (preset !== 'all' ? 1 : 0) +
              (monthSel !== '' ? 1 : 0) +
              (yearSel !== '' ? 1 : 0)
            }
            open={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          />
          <button
            onClick={() => navigate('/admin/factory')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
          >
            <Plus size={16} />
            New Factory Bill
          </button>
        </div>
      </div>

      <FilterPanel
        open={showFilters}
        onClearAll={() => {
          setStatus('all');
          clearRange();
        }}
        filters={[
          { id: 'status', label: 'Status', value: status, options: STATUSES, onChange: setStatus },
          {
            id: 'period',
            label: 'Period',
            value: preset,
            options: PRESETS,
            onChange: (v) => applyPreset(v as Preset),
          },
          {
            id: 'month',
            label: 'Month',
            value: monthSel,
            options: MONTH_OPTIONS,
            onChange: (v) => applyMonthYear(v, yearSel),
          },
          {
            id: 'year',
            label: 'Year',
            value: yearSel,
            options: YEAR_OPTIONS,
            onChange: (v) => applyMonthYear(monthSel, v),
          },
        ]}
      />

      <DataTable
        columns={[
          { key: 'number', label: 'Invoice' },
          { key: 'date', label: 'Date' },
          { key: 'party', label: 'Party' },
          { key: 'type', label: 'Type', className: 'text-center' },
          { key: 'taxable', label: 'Taxable', className: 'text-right' },
          { key: 'gst', label: 'GST', className: 'text-right' },
          { key: 'total', label: 'Total', className: 'text-right' },
          { key: 'actions', label: '', className: 'text-right' },
        ]}
        isLoading={isLoading}
        isEmpty={bills.length === 0}
        emptyIcon={<FileText size={28} />}
        emptyTitle={search || status !== 'all' ? 'No matching bills' : 'No factory bills yet'}
        emptyDescription={
          search || status !== 'all'
            ? 'Try a different search or filter.'
            : 'Raise one on the Factory Bill screen and it will be listed here.'
        }
        emptyActionLabel={search || status !== 'all' ? undefined : 'New Factory Bill'}
        onEmptyAction={search || status !== 'all' ? undefined : () => navigate('/admin/factory')}
        pagination={{
          currentPage: page,
          totalItems: total,
          itemsPerPage: perPage,
          onPageChange: setPage,
          onItemsPerPageChange: (size) => {
            setPerPage(size);
            setPage(1);
          },
        }}
      >
        {bills.map((bill) => {
          const gst = (bill.totalCgst ?? 0) + (bill.totalSgst ?? 0) + (bill.totalIgst ?? 0);
          const cancelled = bill.status === 'cancelled';
          return (
            <tr
              key={bill.id}
              className={cn(
                'border-b border-surface-100 dark:border-surface-800 last:border-0',
                cancelled && 'opacity-60',
              )}
            >
              <td className="px-4 py-3">
                <span className="flex items-center gap-2 font-display font-semibold text-body-sm tabular-nums text-surface-900 dark:text-surface-100">
                  {bill.invoiceNumber}
                  {cancelled && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500">
                      CANCELLED
                    </span>
                  )}
                </span>
              </td>
              <td className="px-4 py-3 text-body-sm text-surface-600 dark:text-surface-300 whitespace-nowrap">
                {day(bill.invoiceDate)}
              </td>
              <td className="px-4 py-3">
                <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100">{bill.party?.name}</p>
                {bill.party?.gstin && (
                  <p className="text-caption text-surface-400 tabular-nums">{bill.party.gstin}</p>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                <span
                  className={cn(
                    'inline-flex px-2 py-0.5 rounded-full text-caption font-semibold capitalize',
                    bill.paymentMode === 'credit'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {bill.paymentMode}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-body-sm text-surface-700 dark:text-surface-300">
                {inr(bill.taxableValue)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-body-sm text-surface-500">
                {inr(gst)}
                <span className="block text-caption text-surface-400">
                  {bill.taxKind === 'inter' ? 'IGST' : 'CGST+SGST'}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-body-sm font-semibold text-brand-600 dark:text-brand-400">
                {inr(bill.grandTotal)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => void print(bill)}
                    disabled={busyId === bill.id}
                    aria-label={`Print ${bill.invoiceNumber}`}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-brand-500 disabled:opacity-40 transition-colors"
                  >
                    <Printer size={15} />
                  </button>
                  {!cancelled && (
                    <>
                      <button
                        onClick={() => navigate(`/admin/factory?edit=${bill.id}`)}
                        aria-label={`Edit ${bill.invoiceNumber}`}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-brand-500 transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => {
                          setCancelError('');
                          setCancelTarget(bill);
                        }}
                        aria-label={`Cancel ${bill.invoiceNumber}`}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      >
                        <Ban size={15} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </DataTable>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title={`Cancel bill ${cancelTarget?.invoiceNumber ?? ''}?`}
        description="The bill is marked cancelled and keeps its number, so the printed run stays accounted for. It can still be reprinted."
        confirmLabel="Cancel bill"
        cancelLabel="Keep it"
        variant="danger"
        isLoading={isCancelling}
        error={cancelError}
        onConfirm={doCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
