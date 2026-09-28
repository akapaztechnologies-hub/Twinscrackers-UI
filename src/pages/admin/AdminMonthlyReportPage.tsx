import { useState, useEffect, useMemo, useRef } from 'react';
import { exportToExcel } from '@/lib/exportExcel.ts';
import {
  TrendingUp,
  Wallet,
  IndianRupee,
  BarChart3,
  Download,
  CalendarRange,
  FileWarning,
} from 'lucide-react';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { getMonthlyBillSummary } from '@/services/admin.ts';
import { getExpenses, expenseTotal } from '@/services/expenses.ts';
import type { MonthlyBillSummary } from '@/services/admin.ts';
import type { Expense } from '@/types/admin.ts';
import type { InvoiceNumberGaps } from '@/services/quotations.ts';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** ₹ with sign in front of the symbol, e.g. -₹29,087 */
const inr = (n: number) => `${n < 0 ? '-' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;

interface MonthRow {
  month: string;
  orders: number;
  sales: number;
  collections: number;
  expenses: number;
  netProfit: number; // sales − expenses
  pending: number; // still owed today on that month's sales
}

const emptyRow = (month: string): MonthRow => ({
  month,
  orders: 0,
  sales: 0,
  collections: 0,
  expenses: 0,
  netProfit: 0,
  pending: 0,
});

/**
 * Merge the server-side monthly bill aggregation with the (localStorage)
 * expenses for the selected year into 12 report rows.
 */
function buildRows(months: MonthlyBillSummary['months'], expenses: Expense[], year: number): MonthRow[] {
  const rows = MONTHS.map(emptyRow);
  // Months the server sent a still-owed figure for. Collections now count money
  // in the month it came in — udhaar from March paid in May is May's — so
  // "sales − collections" no longer means anything for one month, and went
  // negative in the month the old debt was paid.
  const withOutstanding = new Set<number>();

  for (const m of months) {
    const row = rows[m.month];
    if (!row) continue;
    row.orders = m.orders;
    row.sales = m.sales;
    row.collections = m.collections;
    const outstanding = m.outstanding;
    if (typeof outstanding === 'number' && Number.isFinite(outstanding)) {
      row.pending = Math.max(0, outstanding);
      withOutstanding.add(m.month);
    }
  }

  for (const e of expenses) {
    const [y, m] = e.date.split('-').map(Number);
    if (y !== year || !m || m < 1 || m > 12) continue;
    rows[m - 1].expenses += expenseTotal(e);
  }

  rows.forEach((row, i) => {
    row.netProfit = row.sales - row.expenses;
    // Older servers send no `outstanding`: the best estimate left, never below 0.
    if (!withOutstanding.has(i)) row.pending = Math.max(0, row.sales - row.collections);
  });
  return rows;
}

function sumRows(rows: MonthRow[]): MonthRow {
  return rows.reduce(
    (acc, r) => ({
      month: 'ANNUAL TOTAL',
      orders: acc.orders + r.orders,
      sales: acc.sales + r.sales,
      collections: acc.collections + r.collections,
      expenses: acc.expenses + r.expenses,
      netProfit: acc.netProfit + r.netProfit,
      pending: acc.pending + r.pending,
    }),
    emptyRow('ANNUAL TOTAL'),
  );
}

export function AdminMonthlyReportPage() {
  const [months, setMonths] = useState<MonthlyBillSummary['months']>([]);
  const [billYears, setBillYears] = useState<number[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const yearInitialized = useRef(false);

  // Expenses are local (small) — loaded once.
  useEffect(() => {
    (async () => {
      const ex = await getExpenses().catch(() => [] as Expense[]);
      setExpenses(Array.isArray(ex) ? ex : []);
    })();
  }, []);

  // Bill aggregation for the selected year — re-fetched server-side on year change.
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const summary = await getMonthlyBillSummary(year);
        setMonths(summary.months);
        setBillYears(summary.years);

        // Land on the most recent year that actually has data (once).
        if (!yearInitialized.current) {
          yearInitialized.current = true;
          const years = new Set<number>(summary.years);
          if (years.size && !years.has(year)) setYear(Math.max(...years));
        }
      } catch {
        setMonths([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [year]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>(billYears);
    expenses.forEach((e) => {
      const y = Number(e.date.slice(0, 4));
      if (y) years.add(y);
    });
    years.add(new Date().getFullYear());
    years.add(year);
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((y) => ({ value: String(y), label: String(y) }));
  }, [billYears, expenses, year]);

  const rows = useMemo(() => buildRows(months, expenses, year), [months, expenses, year]);
  const totals = useMemo(() => sumRows(rows), [rows]);

  const now = new Date();
  const currentMonthIdx = year === now.getFullYear() ? now.getMonth() : -1;

  const exportCSV = () => {
    const line = (month: string, r: typeof totals) => ({
      Month: month,
      'Total Orders': r.orders,
      'Total Sales': r.sales,
      'Total Collections': r.collections,
      'Total Expenses': r.expenses,
      'Net Profit': r.netProfit,
      'Pending Amount': r.pending,
    });

    void exportToExcel(
      [...rows.map((r) => line(r.month, r)), line('ANNUAL TOTAL', totals)],
      `monthly-report-${year}`,
      { sheetName: String(year), caption: `Monthly sales, collections and expenses for ${year}.` },
    );
  };

  return (
    <ListPageShell
      header={
        <>
          {/* KPI Cards — annual totals for the selected year */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard label={`Total Sales · ${year}`} value={inr(totals.sales)} icon={TrendingUp} color="text-blue-600 bg-blue-500/10" isLoading={isLoading} />
            <KPICard label="Collections" value={inr(totals.collections)} icon={Wallet} color="text-green-600 bg-green-500/10" isLoading={isLoading} />
            <KPICard label="Expenses" value={inr(totals.expenses)} icon={IndianRupee} color="text-red-600 bg-red-500/10" isLoading={isLoading} />
            <KPICard
              label="Margin*"
              value={inr(totals.netProfit)}
              icon={BarChart3}
              color={totals.netProfit >= 0 ? 'text-emerald-600 bg-emerald-500/10' : 'text-rose-600 bg-rose-500/10'}
              isLoading={isLoading}
            />
          </div>

          {/* Toolbar: source note + year picker + export */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            <div className="flex items-center gap-2 text-surface-500 dark:text-surface-400">
              <CalendarRange size={16} className="text-brand-500" />
              <span className="text-[13px] font-medium">Auto from Bills (POS) + Online Orders &amp; Expenses</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Select
                value={String(year)}
                onChange={(v) => setYear(Number(v))}
                options={yearOptions}
                size="sm"
                fullWidth={false}
                aria-label="Report year"
              />
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
              >
                <Download size={15} />
                Export CSV
              </button>
            </div>
          </div>

          {/* Honesty note: this is not true net profit. */}
          <p className="px-1 text-caption text-surface-400">
            <span className="font-medium text-surface-500 dark:text-surface-400">* Margin = Sales − Expenses.</span>{' '}
            It is <span className="font-medium">not</span> net profit — it does not deduct the 18% GST collected or the cost of goods sold.
          </p>
          <p className="px-1 -mt-2 text-caption text-surface-400">
            Collections = money received that month. Pending = still owed on that month&rsquo;s sales.
          </p>
        </>
      }
    >
      <DataTable
        columns={[
          { key: 'month', label: 'Month' },
          { key: 'orders', label: 'Orders', className: 'text-right' },
          { key: 'sales', label: 'Total Sales', className: 'text-right' },
          { key: 'collections', label: 'Collections', className: 'text-right' },
          { key: 'expenses', label: 'Expenses', className: 'text-right' },
          { key: 'profit', label: 'Margin*', className: 'text-right' },
          { key: 'pending', label: 'Pending', className: 'text-right' },
        ]}
        isLoading={isLoading}
        isEmpty={false}
        emptyIcon={<BarChart3 size={24} className="text-surface-400" />}
        emptyTitle="No data"
        emptyDescription=""
      >
        {rows.map((r, i) => {
          const isCurrent = i === currentMonthIdx;
          return (
            <tr
              key={r.month}
              className={
                'border-b border-surface-50 dark:border-surface-850 last:border-0 transition-colors ' +
                (isCurrent ? 'bg-brand-500/[0.04]' : 'hover:bg-surface-50/50 dark:hover:bg-surface-850/50')
              }
            >
              <td className="px-5 py-1.5 text-body-sm font-medium text-surface-900 dark:text-surface-100">
                <span className="inline-flex items-center gap-2">
                  {r.month}
                  {isCurrent && (
                    <span className="px-1.5 py-0.5 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[10px] font-semibold uppercase tracking-wide">
                      Now
                    </span>
                  )}
                </span>
              </td>
              <td className="px-5 py-1.5 text-right text-body-sm text-surface-600 dark:text-surface-400 tabular-nums">{r.orders}</td>
              <td className="px-5 py-1.5 text-right text-body-sm text-surface-700 dark:text-surface-300 tabular-nums">{inr(r.sales)}</td>
              <td className="px-5 py-1.5 text-right text-body-sm text-green-600 dark:text-green-400 tabular-nums">{inr(r.collections)}</td>
              <td className="px-5 py-1.5 text-right text-body-sm text-surface-600 dark:text-surface-400 tabular-nums">{inr(r.expenses)}</td>
              <td className={'px-5 py-1.5 text-right text-body-sm font-semibold tabular-nums ' + (r.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                {inr(r.netProfit)}
              </td>
              <td className={'px-5 py-1.5 text-right text-body-sm tabular-nums ' + (r.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-surface-400')}>
                {inr(r.pending)}
              </td>
            </tr>
          );
        })}

        {/* Annual total */}
        <tr className="border-t-2 border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/40">
          <td className="px-5 py-2.5 text-body-sm font-bold text-surface-900 dark:text-surface-50 uppercase tracking-wide">
            {totals.month}
          </td>
          <td className="px-5 py-2.5 text-right text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">{totals.orders}</td>
          <td className="px-5 py-2.5 text-right text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">{inr(totals.sales)}</td>
          <td className="px-5 py-2.5 text-right text-body-sm font-bold text-green-600 dark:text-green-400 tabular-nums">{inr(totals.collections)}</td>
          <td className="px-5 py-2.5 text-right text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">{inr(totals.expenses)}</td>
          <td className={'px-5 py-2.5 text-right text-body-sm font-bold tabular-nums ' + (totals.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
            {inr(totals.netProfit)}
          </td>
          <td className={'px-5 py-2.5 text-right text-body-sm font-bold tabular-nums ' + (totals.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-surface-400')}>
            {inr(totals.pending)}
          </td>
        </tr>
      </DataTable>

      <NumberGapsPanel year={year} />
    </ListPageShell>
  );
}

/**
 * The invoice numbers this year's quotations are holding.
 *
 * Quotations draw from the same `AK-YYMM-#####` series as invoices, so a
 * quotation nobody converts leaves a number that never appears on a bill. A gap
 * in an invoice series is the first thing a GST auditor asks about, so the
 * answer is kept here, beside the figures being filed, instead of having to be
 * reconstructed later.
 *
 * Renders nothing when there are no gaps — which is the normal case, and not
 * worth an empty panel on every report.
 */
function NumberGapsPanel({ year }: { year: number }) {
  const [gaps, setGaps] = useState<InvoiceNumberGaps | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getInvoiceNumberGaps } = await import('@/services/quotations.ts');
        const data = await getInvoiceNumberGaps(year);
        if (!cancelled) setGaps(data);
      } catch {
        // Never blocks the report — this is a footnote to it, not part of it.
        if (!cancelled) setGaps(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  if (!gaps || gaps.total === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-amber-500/5 transition-colors"
      >
        <FileWarning size={17} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-body-sm font-semibold text-surface-900 dark:text-surface-100">
            {gaps.total} invoice number{gaps.total !== 1 ? 's' : ''} held by unconverted quotations
          </span>
          <span className="block mt-0.5 text-caption text-surface-500 dark:text-surface-400">
            These numbers are missing from {year}'s invoices because the quotation was never taken up.
            Worth {inr(gaps.totalValue)} in quotes. Keep this to hand for a GST audit.
          </span>
        </span>
        <span className="flex-shrink-0 text-caption font-medium text-amber-700 dark:text-amber-400">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <div className="border-t border-amber-200 dark:border-amber-500/20 divide-y divide-amber-200/60 dark:divide-amber-500/10">
          {gaps.months.map((m) => (
            <div key={m.month} className="px-5 py-3">
              <p className="text-caption font-semibold text-surface-700 dark:text-surface-300">
                {MONTHS[m.month - 1]} — {m.count} number{m.count !== 1 ? 's' : ''} · {inr(m.value)}
              </p>
              <ul className="mt-2 space-y-1">
                {m.numbers.map((n) => (
                  <li key={n.number} className="flex flex-wrap items-baseline gap-x-2 text-caption">
                    <span className="font-mono font-semibold text-surface-900 dark:text-surface-100">{n.number}</span>
                    <span className="capitalize text-surface-500">{n.status}</span>
                    <span className="text-surface-400">{n.customerName || 'Walk-in'}</span>
                    <span className="ml-auto tabular-nums text-surface-500">{inr(n.grandTotal)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
