import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  FileText,
  IndianRupee,
  ScrollText,
  ArrowRightLeft,
  Printer,
  Share2,
  Ban,
  Pencil,
  LayoutTemplate,
  CheckCircle2,
} from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { cn } from '@/lib/utils.ts';
import { printBillDocument } from '@/lib/billDocument.ts';
import { useSiteStore } from '@/store/site.ts';
import { quotationToBill, quotationEstimate, type Quotation, type QuotationStatus } from '@/types/quotation.ts';
import {
  getQuotations,
  getQuotationStats,
  cancelQuotation,
  type QuotationStats,
} from '@/services/quotations.ts';

/**
 * The Quotations screen.
 *
 * Reads the server, not `localStorage`. Quotations used to live only in the
 * browser that raised them — capped at 30, invisible to every other counter,
 * and gone with the cache — which made "edit a quotation" impossible to mean
 * anything: there was no shared row to edit.
 *
 * Every number here belongs to the SAME series as invoices. A quotation is
 * issued with the `AK-` number the invoice will carry, and converting keeps it,
 * so a quote and the bill it became are the same number rather than two that
 * have to be cross-referenced.
 */

const dateRangeOptions = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
];

const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Converted', value: 'converted' },
  { label: 'Expired', value: 'expired' },
  { label: 'Cancelled', value: 'cancelled' },
];

const typeOptions = [
  { label: 'All Types', value: 'all' },
  { label: 'Retail', value: 'retail' },
  { label: 'Wholesale — per piece', value: 'wholesale-piece' },
  { label: 'Wholesale — per case', value: 'wholesale-case' },
];

const sortOptions = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Highest value', value: 'high' },
  { label: 'Lowest value', value: 'low' },
];

const statusStyle: Record<QuotationStatus, string> = {
  open: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  converted: 'text-brand-600 dark:text-brand-400 bg-brand-500/10',
  expired: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  cancelled: 'text-surface-400 bg-surface-500/10',
};

const typeLabel: Record<string, string> = {
  retail: 'Retail',
  'wholesale-piece': 'Wholesale / piece',
  'wholesale-case': 'Wholesale / case',
};

/** ISO date the list endpoint filters on, for the chosen range. */
function dateFromFor(range: string): string | undefined {
  if (range === 'all') return undefined;
  const now = new Date();
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  return new Date(now.getTime() - (range === '7d' ? 7 : 30) * 86400000).toISOString();
}

export function AdminQuotationsPage() {
  const siteConfig = useSiteStore((s) => s.config);
  const navigate = useNavigate();

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [stats, setStats] = useState<QuotationStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);

  /** The quotation the cancel dialog is asking about. */
  const [cancelTarget, setCancelTarget] = useState<Quotation | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Debounced so typing in the box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, summary] = await Promise.all([
        getQuotations({
          page: currentPage,
          limit: itemsPerPage,
          search: debouncedSearch || undefined,
          status: statusFilter === 'all' ? undefined : (statusFilter as QuotationStatus),
          billingMode: typeFilter === 'all' ? undefined : (typeFilter as 'retail' | 'wholesale-piece' | 'wholesale-case'),
          dateFrom: dateFromFor(dateRange),
          sort: sortBy,
        }),
        getQuotationStats().catch(() => null),
      ]);
      setQuotations(list.data);
      setTotalItems(list.total);
      if (summary) setStats(summary);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load quotations.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearch, statusFilter, typeFilter, dateRange, sortBy]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  /**
   * Print a quotation on the document it was priced for.
   *
   * Through `billDocument.ts`, the one place that decides which template a
   * document gets. This screen used to call `BillPDF` directly, which is why
   * every quotation came out on the retail tax invoice however the customer was
   * actually being billed.
   */
  const print = useCallback(async (q: Quotation) => {
    try {
      await printBillDocument(quotationToBill(q), true, quotationEstimate(q));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not print that quotation.');
    }
  }, []);

  const share = useCallback(
    (q: Quotation) => {
      if (!q.customerPhone) return;
      const validity = q.layout?.validUntil
        ? `Valid until ${new Date(q.layout.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : '';
      const text = [
        `*${siteConfig.name}* — Quotation ${q.quotationNumber}`,
        q.customerName || 'Customer',
        `Total: ₹${(q.grandTotal || 0).toLocaleString('en-IN')}`,
        validity,
        'This is a quotation, not a tax invoice. 🎆',
      ]
        .filter(Boolean)
        .join('%0A');
      window.open(`https://wa.me/91${q.customerPhone}?text=${text}`, '_blank');
    },
    [siteConfig.name],
  );

  const confirmCancel = useCallback(async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      await cancelQuotation(cancelTarget.id);
      setNotice(`Quotation ${cancelTarget.quotationNumber} cancelled.`);
      setCancelTarget(null);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel that quotation.');
    } finally {
      setIsCancelling(false);
    }
  }, [cancelTarget, load]);

  const activeFilters =
    [statusFilter, dateRange, typeFilter].filter((v) => v !== 'all').length + (sortBy !== 'newest' ? 1 : 0);

  return (
    <ListPageShell
      header={
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard label="Total Quotations" value={String(stats?.total ?? 0)} icon={ScrollText} color="text-blue-600 bg-blue-500/10" />
            <KPICard label="Open" value={String(stats?.open ?? 0)} icon={FileText} color="text-emerald-600 bg-emerald-500/10" />
            <KPICard
              label="Open Value"
              value={`₹${(stats?.openValue ?? 0).toLocaleString('en-IN')}`}
              icon={IndianRupee}
              color="text-amber-600 bg-amber-500/10"
            />
            <KPICard label="Converted" value={String(stats?.converted ?? 0)} icon={CheckCircle2} color="text-brand-600 bg-brand-500/10" />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium">
              <span className="flex-1">{error}</span>
            </div>
          )}
          {notice && !error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 text-caption font-medium">
              <CheckCircle2 size={14} />
              <span className="flex-1">{notice}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search by number, customer, phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <FilterButton activeCount={activeFilters} open={showFilters} onClick={() => setShowFilters(!showFilters)} />
            </div>
          </div>

          <FilterPanel
            open={showFilters}
            onClearAll={() => {
              setStatusFilter('all');
              setTypeFilter('all');
              setDateRange('all');
              setSortBy('newest');
              setCurrentPage(1);
            }}
            filters={[
              { id: 'status', label: 'Status', value: statusFilter, options: statusOptions, onChange: (v) => { setStatusFilter(v); setCurrentPage(1); } },
              { id: 'type', label: 'Billing Type', value: typeFilter, options: typeOptions, onChange: (v) => { setTypeFilter(v); setCurrentPage(1); } },
              { id: 'date', label: 'Date Range', value: dateRange, options: dateRangeOptions, onChange: (v) => { setDateRange(v); setCurrentPage(1); } },
              { id: 'sort', label: 'Sort By', value: sortBy, options: sortOptions, onChange: (v) => { setSortBy(v); setCurrentPage(1); } },
            ]}
          />
        </>
      }
    >
      <DataTable
        columns={[
          { key: 'number', label: 'Number' },
          { key: 'date', label: 'Date' },
          { key: 'valid', label: 'Valid Until' },
          { key: 'customer', label: 'Customer' },
          { key: 'type', label: 'Type' },
          { key: 'status', label: 'Status' },
          { key: 'items', label: 'Items' },
          { key: 'total', label: 'Total' },
          { key: 'actions', label: '', className: 'w-56' },
        ]}
        isLoading={isLoading}
        isEmpty={!isLoading && quotations.length === 0}
        emptyIcon={<ScrollText size={24} className="text-surface-400" />}
        emptyTitle="No quotations yet"
        emptyDescription="Create one from Billing — switch to Quotation mode and Save & Print."
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
        {quotations.map((q) => {
          // A converted quotation's number now belongs to a real invoice, and a
          // cancelled one is withdrawn. Either way it is settled: reprinting it
          // is fair, changing it is not.
          const settled = q.status === 'converted' || q.status === 'cancelled';
          return (
            <tr
              key={q.id}
              className="border-b border-surface-50 dark:border-surface-850 last:border-0 hover:bg-surface-50/50 dark:hover:bg-surface-850/50 transition-colors"
            >
              <td className="px-5 py-3.5 text-body-sm font-semibold font-mono text-surface-900 dark:text-surface-100">
                {q.quotationNumber}
                {q.layout?.displayNumber && q.layout.displayNumber !== q.quotationNumber && (
                  <span className="block text-[10px] font-sans font-normal text-surface-400">
                    printed as {q.layout.displayNumber}
                  </span>
                )}
              </td>
              <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400">
                {new Date(q.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
              </td>
              <td className="px-5 py-3.5 text-body-sm text-surface-500 tabular-nums">
                {q.layout?.validUntil
                  ? new Date(q.layout.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
                  : '—'}
              </td>
              <td className="px-5 py-3.5">
                <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100">{q.customerName || 'Walk-in'}</p>
                {q.customerPhone && <p className="text-caption text-surface-400 tabular-nums">{q.customerPhone}</p>}
              </td>
              <td className="px-5 py-3.5">
                <span className="text-caption font-medium text-surface-600 dark:text-surface-300">
                  {typeLabel[q.billingMode ?? 'retail']}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <span className={cn('px-2 py-0.5 rounded-md text-[11px] font-semibold capitalize', statusStyle[q.status])}>
                  {q.status}
                </span>
              </td>
              <td className="px-5 py-3.5 text-body-sm text-surface-500 tabular-nums">{q.itemCount ?? q.items?.length ?? 0}</td>
              <td className="px-5 py-3.5 text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">
                ₹{(q.grandTotal || 0).toLocaleString('en-IN')}
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => navigate(`/admin/billing?quote=${q.id}`)}
                    disabled={settled}
                    title={settled ? 'Settled — cannot be edited' : 'Edit items & prices'}
                    aria-label="Edit quotation"
                    className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => navigate(`/admin/quotations/${q.id}/layout`)}
                    title="Edit the printed layout"
                    aria-label="Edit layout"
                    className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                  >
                    <LayoutTemplate size={15} />
                  </button>
                  <button
                    onClick={() => navigate(`/admin/billing?convert=${q.id}`)}
                    disabled={settled}
                    title={settled ? 'Already settled' : 'Convert to invoice — keeps this number'}
                    aria-label="Convert to invoice"
                    className="p-1.5 rounded-lg text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ArrowRightLeft size={15} />
                  </button>
                  <button
                    onClick={() => void print(q)}
                    title="Print quotation"
                    aria-label="Print quotation"
                    className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                  >
                    <Printer size={15} />
                  </button>
                  <button
                    onClick={() => share(q)}
                    disabled={!q.customerPhone}
                    title="Share on WhatsApp"
                    aria-label="Share on WhatsApp"
                    className="p-1.5 rounded-lg text-surface-400 hover:text-green-600 hover:bg-green-500/10 disabled:opacity-40 transition-colors"
                  >
                    <Share2 size={15} />
                  </button>
                  <button
                    onClick={() => setCancelTarget(q)}
                    disabled={settled}
                    title={settled ? 'Already settled' : 'Cancel this quotation'}
                    aria-label="Cancel quotation"
                    className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <Ban size={15} />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </DataTable>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        variant="danger"
        title={`Cancel ${cancelTarget?.quotationNumber ?? ''}?`}
        // Cancelled rather than deleted, and the dialog says why: the number
        // came out of the invoice series, so a deleted row would leave a gap in
        // it that nobody can account for later.
        description="The quotation is marked cancelled and kept, so its number stays accounted for in the invoice series. It can no longer be edited or converted."
        confirmLabel="Cancel quotation"
        cancelLabel="Keep it"
        isLoading={isCancelling}
        onConfirm={() => void confirmCancel()}
        onCancel={() => setCancelTarget(null)}
      />
    </ListPageShell>
  );
}
