import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  Receipt,
  IndianRupee,
  Banknote,
  Smartphone,
  CreditCard,
  Clock,
  Plus,
  Eye,
  Pencil,
  LayoutTemplate,
  Download,
  Share2,
  Users,
} from 'lucide-react';
import { formatPrice } from '@/lib/utils.ts';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { ExportButton } from '@/components/admin/ExportButton.tsx';
import { exportToExcel } from '@/lib/exportExcel.ts';
import { useSiteStore } from '@/store/site.ts';
import type { Bill } from '@/types/admin.ts';

const paymentMethodOptions = [
  { label: 'All Methods', value: 'all' },
  { label: 'Cash', value: 'cash' },
  { label: 'UPI', value: 'upi' },
  { label: 'Card', value: 'card' },
  { label: 'Credit', value: 'credit' },
];

const billingModeOptions = [
  { label: 'All Types', value: 'all' },
  { label: 'Retail', value: 'retail' },
  { label: 'Wholesale (any)', value: 'wholesale' },
  { label: 'Wholesale — Per Piece', value: 'wholesale-piece' },
  { label: 'Wholesale — Per Case', value: 'wholesale-case' },
];

/**
 * How a bill's type reads in the table. Bills raised before case billing existed
 * carry no billingMode at all, and every one of them was retail — so the absent
 * case must read "Retail" rather than a blank cell.
 */
const billingModeLabel = {
  retail: { text: 'Retail', cls: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300' },
  'wholesale-piece': { text: 'Wholesale · Piece', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  'wholesale-case': { text: 'Wholesale · Case', cls: 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400' },
};

const dateRangeOptions = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
];

const statusOptions = [
  { label: 'All Status', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Held', value: 'held' },
  { label: 'Cancelled', value: 'cancelled' },
];

const amountOptions = [
  { label: 'Any Amount', value: 'all' },
  { label: 'Under ₹1,000', value: 'lt1k' },
  { label: '₹1,000 – ₹5,000', value: '1k-5k' },
  { label: '₹5,000 – ₹10,000', value: '5k-10k' },
  { label: 'Above ₹10,000', value: 'gt10k' },
];

const sortOptions = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Highest value', value: 'high' },
  { label: 'Lowest value', value: 'low' },
];

function getDateRangeStart(range: string): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = range === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 86400000);
}

/** Map an amount-bucket filter to server min/max grandTotal bounds (grandTotal is integer). */
function amountRange(f: string): { minAmount?: number; maxAmount?: number } {
  if (f === 'lt1k') return { maxAmount: 999 };
  if (f === '1k-5k') return { minAmount: 1000, maxAmount: 4999 };
  if (f === '5k-10k') return { minAmount: 5000, maxAmount: 9999 };
  if (f === 'gt10k') return { minAmount: 10000 };
  return {};
}

const paymentIcons: Record<string, React.ElementType> = {
  cash: Banknote,
  upi: Smartphone,
  card: CreditCard,
  credit: Clock,
};

export function AdminBillsPage() {
  const siteConfig = useSiteStore(s => s.config);
  const [bills, setBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [billingModeFilter, setBillingModeFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [amountFilter, setAmountFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();

  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ totalBills: 0, totalRevenue: 0, todayRevenue: 0, uniqueCustomers: 0 });
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Debounce the search box so keystrokes don't hit the API on every character.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Build the bill-list query — filters / search / sort / paging all server-side.
  const buildParams = useCallback(() => {
    const rangeStart = getDateRangeStart(dateRange);
    return {
      search: debouncedSearch || undefined,
      status: statusFilter,
      paymentMethod: paymentFilter,
      billingMode: billingModeFilter,
      ...amountRange(amountFilter),
      dateFrom: rangeStart ? rangeStart.toISOString() : undefined,
      sort: sortBy,
    };
  }, [debouncedSearch, statusFilter, paymentFilter, billingModeFilter, amountFilter, dateRange, sortBy]);

  useEffect(() => {
    // A slow answer for the filters before must not land over the answer for
    // the filters now.
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const { getBillsPaged } = await import('@/services/admin.ts');
        const result = await getBillsPaged({ ...buildParams(), page: currentPage, limit: itemsPerPage });
        if (cancelled) return;
        setBills(result.data);
        setTotal(result.total);
      } catch {
        if (cancelled) return;
        setBills([]);
        setTotal(0);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildParams, currentPage, itemsPerPage]);

  // Store-wide KPIs (server aggregation, not derived from the visible page).
  useEffect(() => {
    (async () => {
      try {
        const { getBillStats } = await import('@/services/admin.ts');
        setStats(await getBillStats());
      } catch {
        /* keep last stats */
      }
    })();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, paymentFilter, billingModeFilter, dateRange, statusFilter, amountFilter, sortBy]);

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const handleExport = async () => {
    setIsExporting(true);
    setExportError('');
    try {
      const { getBillsPaged } = await import('@/services/admin.ts');
      // Every page, not the first. The server caps a page at 100 rows, and the
      // export used to stop there without a word — a season's bills exported as
      // its most recent hundred.
      const PAGE = 100;
      const rows: Bill[] = [];
      for (let page = 1; ; page += 1) {
        const res = await getBillsPaged({ ...buildParams(), page, limit: PAGE });
        rows.push(...res.data);
        const pages = res.totalPages ?? Math.ceil(res.total / PAGE);
        if (res.data.length === 0 || page >= pages) break;
      }
      await exportToExcel(
        rows.map((b) => ({
          'Bill No': b.billNumber,
          // A cancelled bill is voided, not a sale; without this column it read
          // as one in every total built from the sheet.
          Status: b.status,
          Type: billingModeLabel[b.billingMode ?? 'retail']?.text ?? 'Retail',
          Customer: b.customerName || 'Walk-in',
          Phone: b.customerPhone || '',
          Items: b.itemCount,
          Quantity: b.totalQuantity,
          Subtotal: b.subtotal,
          'Discount %': b.discountPercent,
          Discount: b.totalDiscount,
          Coupon: b.couponDiscount ?? 0,
          Taxable: b.taxableAmount,
          CGST: b.totalCgst,
          SGST: b.totalSgst,
          // Inter-state tax lives here; it exported as nothing before.
          IGST: b.totalIgst ?? 0,
          Delivery: b.deliveryCharge ?? 0,
          'Round Off': b.roundOff ?? 0,
          Total: b.grandTotal,
          Payment: b.payment.method,
          Date: new Date(b.createdAt).toLocaleString('en-IN'),
        })),
        'bills',
      );
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Could not export the bills.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ListPageShell
      header={
        <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Bills"
          value={String(stats.totalBills)}
          icon={Receipt}
          color="text-blue-600 bg-blue-500/10"
          isLoading={isLoading}
        />
        <KPICard
          label="Total Revenue"
          value={formatPrice(stats.totalRevenue)}
          icon={IndianRupee}
          color="text-green-600 bg-green-500/10"
          isLoading={isLoading}
        />
        <KPICard
          label="Today's Revenue"
          value={formatPrice(stats.todayRevenue)}
          icon={Banknote}
          color="text-amber-600 bg-amber-500/10"
          isLoading={isLoading}
        />
        <KPICard
          label="Unique Customers"
          value={String(stats.uniqueCustomers)}
          icon={Users}
          color="text-purple-600 bg-purple-500/10"
          isLoading={isLoading}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            placeholder="Search by bill no, name, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <FilterButton
            activeCount={[paymentFilter, dateRange, statusFilter, amountFilter].filter((v) => v !== 'all').length + (sortBy !== 'newest' ? 1 : 0)}
            open={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          />
          <ExportButton onExport={() => void handleExport()} isExporting={isExporting} />
          <Link
            to="/admin/billing"
            className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
          >
            <Plus size={15} />
            New Bill
          </Link>
        </div>
      </div>

      {exportError && (
        <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium">
          {exportError}
        </div>
      )}

      {/* Filter Panel */}
      <FilterPanel
        open={showFilters}
        onClearAll={() => {
          setPaymentFilter('all');
          setBillingModeFilter('all');
          setDateRange('all');
          setStatusFilter('all');
          setAmountFilter('all');
          setSortBy('newest');
        }}
        filters={[
          { id: 'payment', label: 'Payment Method', value: paymentFilter, options: paymentMethodOptions, onChange: setPaymentFilter },
          { id: 'billingMode', label: 'Customer Type', value: billingModeFilter, options: billingModeOptions, onChange: setBillingModeFilter },
          { id: 'status', label: 'Status', value: statusFilter, options: statusOptions, onChange: setStatusFilter },
          { id: 'amount', label: 'Amount', value: amountFilter, options: amountOptions, onChange: setAmountFilter },
          { id: 'date', label: 'Date Range', value: dateRange, options: dateRangeOptions, onChange: setDateRange },
          { id: 'sort', label: 'Sort By', value: sortBy, options: sortOptions, onChange: setSortBy },
        ]}
      />
        </>
      }
    >
      {/* Table */}
      <DataTable
        columns={[
          { key: 'bill', label: 'Bill No.' },
          { key: 'name', label: 'Name' },
          { key: 'phone', label: 'Phone' },
          { key: 'type', label: 'Type' },
          { key: 'total', label: 'Total' },
          { key: 'payment', label: 'Payment' },
          { key: 'date', label: 'Date' },
          { key: 'time', label: 'Time' },
          { key: 'actions', label: '', className: 'w-24' },
        ]}
        isLoading={isLoading}
        isEmpty={bills.length === 0}
        emptyIcon={<Receipt size={24} className="text-surface-400" />}
        emptyTitle="No bills yet"
        emptyDescription={
          debouncedSearch
            ? 'Try adjusting your search'
            : 'Bills will appear here after you generate them from the Billing page'
        }
        emptyActionLabel="Create First Bill"
        emptyActionHref="/admin/billing"
        pagination={{
          currentPage,
          totalItems: total,
          itemsPerPage,
          onPageChange: setCurrentPage,
          onItemsPerPageChange: (size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          },
        }}
      >
        {bills.map((bill) => {
          const PayIcon = paymentIcons[bill.payment.method] || Banknote;
          return (
            <tr
              key={bill.id}
              onClick={() => navigate(`/admin/bills/${bill.id}`)}
              className="border-b border-surface-50 dark:border-surface-850 last:border-0 hover:bg-surface-50/50 dark:hover:bg-surface-850/50 transition-colors cursor-pointer group"
            >
              <td className="px-5 py-3.5">
                <span className="text-body-sm font-bold text-surface-900 dark:text-surface-100 font-mono">
                  {bill.billNumber}
                </span>
                {/* Under "All Status" a voided bill otherwise reads as a sale. */}
                {bill.status === 'cancelled' && (
                  <span className="ml-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">
                    Cancelled
                  </span>
                )}
              </td>
              <td className="px-5 py-3.5">
                <p className="text-body-sm text-surface-900 dark:text-surface-100">
                  {bill.customerName || '—'}
                </p>
              </td>
              <td className="px-5 py-3.5">
                {bill.customerPhone ? (
                  <a
                    href={`tel:${bill.customerPhone}`}
                    className="text-body-sm text-brand-600 dark:text-brand-400 hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      const text = `Bill: ${bill.billNumber}%0ATotal: ₹${bill.grandTotal}%0AThank you for shopping at ${siteConfig.name}!`;
                      window.open(`https://wa.me/91${bill.customerPhone}?text=${text}`, '_blank');
                    }}
                  >
                    {bill.customerPhone}
                  </a>
                ) : (
                  <span className="text-caption text-surface-400">—</span>
                )}
              </td>
              <td className="px-5 py-3.5">
                {(() => {
                  const m = billingModeLabel[bill.billingMode ?? 'retail'] ?? billingModeLabel.retail;
                  return (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium whitespace-nowrap ${m.cls}`}>
                      {m.text}
                    </span>
                  );
                })()}
              </td>
              <td className="px-5 py-3.5 text-body-sm font-semibold text-surface-900 dark:text-surface-100 tabular-nums">
                {formatPrice(bill.grandTotal)}
              </td>
              <td className="px-5 py-3.5">
                <span className="inline-flex items-center gap-1.5 text-caption font-medium text-surface-600 dark:text-surface-400 capitalize">
                  <PayIcon size={13} />
                  {bill.payment.method}
                </span>
              </td>
              <td className="px-5 py-3.5 text-body-sm text-surface-500">
                {new Date(bill.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </td>
              <td className="px-5 py-3.5 text-body-sm text-surface-500">
                {new Date(bill.createdAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/admin/bills/${bill.id}`);
                    }}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                    title="View Details"
                  >
                    <Eye size={15} />
                  </button>
                  {/* A cancelled bill has had its stock returned and its coupon
                      slot freed, so it is past correcting — the server refuses
                      it too, and offering the button would only mislead. */}
                  {bill.status !== 'cancelled' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Editing happens on the billing screen itself, loaded
                        // with this bill — the same place it was raised, with
                        // the product search and pricing rules already in it.
                        navigate(`/admin/billing?edit=${bill.id}`);
                      }}
                      className="p-1.5 rounded-lg text-surface-400 hover:text-amber-600 hover:bg-amber-500/10 transition-colors"
                      title="Edit items & prices"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  {/* Every billing mode, not just the full-case pad. The
                      printed page — number, date, party GSTIN, transport, note
                      — is editable on a retail bill exactly as it is on a
                      wholesale one, and the shop gets those wrong just as
                      often. Shown on a cancelled bill too, read-only, because
                      reprinting one is still legitimate. */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/admin/bills/${bill.id}/case-invoice`);
                    }}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                    title="Edit printed layout"
                  >
                    <LayoutTemplate size={15} />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      // Routed through billDocument so a full-case wholesale
                      // bill downloads the wholesale pad, not the tax invoice.
                      const { downloadBillDocument } = await import('@/lib/billDocument.ts');
                      await downloadBillDocument(bill);
                    }}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-blue-600 hover:bg-blue-500/10 transition-colors"
                    title="Download PDF"
                  >
                    <Download size={15} />
                  </button>
                  {bill.customerPhone && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const text = `Bill: ${bill.billNumber}%0ATotal: ₹${bill.grandTotal}%0AThank you for shopping at ${siteConfig.name}!`;
                        window.open(`https://wa.me/91${bill.customerPhone}?text=${text}`, '_blank');
                      }}
                      className="p-1.5 rounded-lg text-surface-400 hover:text-green-600 hover:bg-green-500/10 transition-colors"
                      title="WhatsApp"
                    >
                      <Share2 size={15} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </DataTable>
    </ListPageShell>
  );
}

