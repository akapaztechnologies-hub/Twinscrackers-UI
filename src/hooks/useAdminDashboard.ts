/**
 * Data layer for the admin dashboard.
 *
 * One hook, one fetch pass: every figure the dashboard renders comes from a real
 * server aggregation for the selected window. Nothing here is simulated — where a
 * value has no honest source (a point-in-time count with no history, a growth
 * baseline of zero) `changePct` is `null` and the UI simply renders no delta.
 *
 * Requests are fired concurrently and settled independently, so one failing
 * endpoint degrades its own panel instead of blanking the page. Only the core
 * sales aggregation sets `error`.
 */
import { useEffect, useMemo, useState } from 'react';
import type { DateRange, CustomRange } from '@/components/admin/DateRangeFilter.tsx';
import { getDateRangeStart, getDateRangeEnd } from '@/components/admin/DateRangeFilter.tsx';
import {
  getActiveProducts,
  getAllOrders,
  getAllProducts,
  getDashboardStats,
  getProductAnalytics,
  getSalesAnalytics,
} from '@/services/admin.ts';
import type { SalesAnalytics } from '@/services/admin.ts';
import { getExpenses, expenseTotal } from '@/services/expenses.ts';
import { isPermissionError } from '@/lib/api.ts';
import type { AdminOrder, AdminProduct, Expense } from '@/types/admin.ts';

// =====================
// PUBLIC SHAPES
// =====================

export interface TrendValue {
  value: number;
  /** `null` when no honest prior-period comparison exists — the UI shows no delta. */
  changePct: number | null;
}

/** A figure the signed-in role may not be able to work out at all. */
export interface OptionalTrendValue {
  /** `null` when there is no honest figure — rendered as "—", never as a number. */
  value: number | null;
  changePct: number | null;
  /** Why `value` is null, short enough to sit under the card ("Needs Expenses access"). */
  unavailableReason?: string;
}

export interface DashboardPoint {
  /** YYYY-MM-DD */
  date: string;
  revenue: number;
  orders: number;
}

export interface TopProductRow {
  name: string;
  image?: string;
  category: string;
  /** Catalogue id, when the sales row could be matched back to a live product. */
  productId?: string;
  sold: number;
  revenue: number;
}

export interface LowStockRow {
  id: string;
  name: string;
  category: string;
  image?: string;
  stock: number;
  level: 'low' | 'critical';
}

export interface AdminDashboardData {
  isLoading: boolean;
  error: string | null;
  totalSales: TrendValue;
  liveStock: TrendValue;
  /** `value` is null when the expense list could not be read — see `unavailableReason`. */
  netProfit: OptionalTrendValue;
  series: DashboardPoint[];
  topProducts: TopProductRow[];
  /** Oldest unfulfilled orders — the work queue, not a recap of the window. */
  pendingOrders: AdminOrder[];
  /** Every pending order store-wide, not just the few rows on screen. */
  pendingOrdersTotal: number;
  lowStock: LowStockRow[];
  summary: {
    totalOrders: TrendValue;
    totalCustomers: TrendValue;
    activeOffers: TrendValue;
    reviews: TrendValue;
  };
}

/** Everything the hook loads — the response half of {@link AdminDashboardData}. */
type DashboardCore = Omit<AdminDashboardData, 'isLoading' | 'error'>;

// =====================
// CONSTANTS + SMALL HELPERS
// =====================

const DAY_MS = 86_400_000;
/** Upper bound on the zero-fill loop (~10 years) so a bad date can never spin. */
const MAX_FILLED_DAYS = 3660;
/** Stock at or below this is "Critical" rather than merely "Low". */
const CRITICAL_STOCK = 10;
const EMPTY_TREND: TrendValue = { value: 0, changePct: null };

const EMPTY_CORE: DashboardCore = {
  totalSales: EMPTY_TREND,
  liveStock: EMPTY_TREND,
  netProfit: EMPTY_TREND,
  series: [],
  topProducts: [],
  pendingOrders: [],
  pendingOrdersTotal: 0,
  lowStock: [],
  summary: {
    totalOrders: EMPTY_TREND,
    totalCustomers: EMPTY_TREND,
    activeOffers: EMPTY_TREND,
    reviews: EMPTY_TREND,
  },
};

/**
 * Percentage change, rounded to one decimal. A zero baseline is not a 100% rise —
 * it means there is nothing to compare against, so the caller gets `null`.
 */
const pctChange = (cur: number, prev: number): number | null =>
  prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;

/** Local calendar day key (YYYY-MM-DD) — expense dates and chart buckets are business days. */
function localDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === 'string' && reason) return reason;
  return 'Could not load dashboard data';
}

const normalise = (value: string): string => value.trim().toLowerCase();

const toNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

// =====================
// DATE WINDOWS
// =====================

interface DashboardWindows {
  /** Inclusive window start; `null` for "All Time". */
  start: Date | null;
  /** Window end — the preset's explicit cap, otherwise now. */
  end: Date;
  /** Equal-length window immediately before `start`; `null` for "All Time". */
  prevStart: Date | null;
  prevEnd: Date | null;
  /** Exactly what gets sent to `/admin/analytics/sales`. */
  params: { dateFrom?: string; dateTo?: string; prevFrom?: string; prevTo?: string };
}

/**
 * Resolve the picker's range into the current window plus the equal-length window
 * immediately preceding it. The backend aggregates both in one pass, which is what
 * makes the deltas on the KPI cards real rather than guessed.
 */
function computeWindows(range: DateRange, customRange?: CustomRange): DashboardWindows {
  const start = getDateRangeStart(range, customRange);
  const explicitEnd = getDateRangeEnd(range, customRange);
  const end = explicitEnd ?? new Date();

  if (!start) {
    // "All Time" — no window, and therefore no prior period to compare against.
    return {
      start: null,
      end,
      prevStart: null,
      prevEnd: null,
      params: { dateTo: explicitEnd?.toISOString() },
    };
  }

  const span = Math.max(end.getTime() - start.getTime(), DAY_MS);
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - span);

  return {
    start,
    end,
    prevStart,
    prevEnd,
    params: {
      dateFrom: start.toISOString(),
      dateTo: explicitEnd?.toISOString(),
      prevFrom: prevStart.toISOString(),
      prevTo: prevEnd.toISOString(),
    },
  };
}

/** Every local calendar day key from `fromKey` to `toKey` inclusive. */
function dayKeysBetween(fromKey: string, toKey: string): string[] {
  const [year, month, day] = fromKey.split('-').map(Number);
  const cursor = new Date(year, (month || 1) - 1, day || 1);
  const keys: string[] = [];
  for (let i = 0; i <= MAX_FILLED_DAYS; i += 1) {
    const key = localDayKey(cursor);
    if (key > toKey) break;
    keys.push(key);
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/**
 * The server only emits days that actually had orders. The chart needs a
 * continuous axis, so every calendar day in the window is present in ascending
 * order — a day with no orders is a real zero, not a gap.
 */
function buildSeries(
  points: SalesAnalytics['timeSeries'],
  start: Date | null,
  end: Date,
): DashboardPoint[] {
  const byDate = new Map<string, DashboardPoint>();
  for (const point of points ?? []) {
    const key = typeof point?.date === 'string' ? point.date.slice(0, 10) : '';
    if (!key) continue;
    const existing = byDate.get(key);
    byDate.set(key, {
      date: key,
      revenue: (existing?.revenue ?? 0) + toNumber(point.revenue),
      orders: (existing?.orders ?? 0) + toNumber(point.orders),
    });
  }

  const knownKeys = [...byDate.keys()].sort();
  // "All Time" has no start, so the axis begins at the first day that has data.
  const fromKey = start ? localDayKey(start) : knownKeys[0];
  if (!fromKey) return [];
  const toKey = localDayKey(end);

  const filled: DashboardPoint[] = [];
  const covered = new Set<string>();
  for (const key of dayKeysBetween(fromKey, toKey)) {
    covered.add(key);
    filled.push(byDate.get(key) ?? { date: key, revenue: 0, orders: 0 });
  }
  // Keep any real datum the generated span missed (the server buckets in UTC, so a
  // window edge can land a day either side) — never drop a day that has revenue.
  for (const [key, point] of byDate) {
    if (!covered.has(key)) filled.push(point);
  }

  filled.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return filled;
}

/** Expenses (amount + GST) whose business date falls inside the window. */
function expensesInWindow(expenses: Expense[], start: Date | null, end: Date | null): number {
  if (!end) return 0;
  const fromKey = start ? localDayKey(start) : '';
  const toKey = localDayKey(end);
  let total = 0;
  for (const expense of expenses) {
    const key = (expense.date || '').slice(0, 10);
    if (!key) continue;
    if (fromKey && key < fromKey) continue;
    if (key > toKey) continue;
    total += expenseTotal(expense);
  }
  return Math.round(total * 100) / 100;
}

// =====================
// CATALOGUE JOIN
// =====================

interface CatalogEntry {
  id?: string;
  image?: string;
  category: string;
}

interface CatalogIndex {
  byName: Map<string, CatalogEntry>;
  bySlug: Map<string, CatalogEntry>;
}

/**
 * The sales aggregations group order lines by product *name*, and the low-stock
 * projection carries no category — both are joined back to the catalogue here so
 * the tables can show a thumbnail and a category without another round trip.
 */
function buildCatalogIndex(products: AdminProduct[]): CatalogIndex {
  const byName = new Map<string, CatalogEntry>();
  const bySlug = new Map<string, CatalogEntry>();
  for (const product of products) {
    const entry: CatalogEntry = {
      id: product.id,
      image: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : undefined,
      category: typeof product.category === 'string' ? product.category : '',
    };
    const nameKey = normalise(product.name ?? '');
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, entry);
    const slugKey = normalise(product.slug ?? '');
    if (slugKey && !bySlug.has(slugKey)) bySlug.set(slugKey, entry);
  }
  return { byName, bySlug };
}

// =====================
// HOOK
// =====================

interface Snapshot {
  /** The range this data was loaded for — anything else on screen is stale. */
  key: string;
  error: string | null;
  core: DashboardCore;
}

export function useAdminDashboard(range: DateRange, customRange?: CustomRange): AdminDashboardData {
  const customStart = customRange?.start ?? '';
  const customEnd = customRange?.end ?? '';
  const requestKey = `${range}|${customStart}|${customEnd}`;

  // Keyed on primitives so a fresh `customRange` object per render can't retrigger the fetch.
  const windows = useMemo(
    () => computeWindows(range, { start: customStart, end: customEnd }),
    [range, customStart, customEnd],
  );

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const [
        salesResult,
        statsResult,
        ordersResult,
        catalogResult,
        productResult,
        expenseResult,
        comboResult,
      ] = await Promise.allSettled([
        getSalesAnalytics(windows.params),
        getDashboardStats(),
        // Deliberately unfiltered by the picker: an order left pending outside the
        // selected window is still unfulfilled, and that is the point of the panel.
        // Oldest first so the ones ageing out sit at the top.
        getAllOrders({ status: 'pending', limit: 5, sort: 'oldest' }),
        getActiveProducts(),
        getProductAnalytics(),
        getExpenses(),
        getAllProducts({ isCombo: true, status: 'active', offer: 'live', limit: 1 }),
      ]);

      // A response for a range the user has already moved off must not land.
      if (!active) return;

      // The sales aggregation is the spine of the page — without it there is
      // nothing honest to draw, so this is the only failure that sets `error`.
      if (salesResult.status === 'rejected') {
        setSnapshot({ key: requestKey, error: errorMessage(salesResult.reason), core: EMPTY_CORE });
        return;
      }

      const sales = salesResult.value;
      const stats = settled(statsResult, {
        totalRevenue: 0,
        ordersToday: 0,
        totalCustomers: 0,
        lowStockCount: 0,
        totalOrders: 0,
        avgOrderValue: 0,
        statusBreakdown: {} as Record<string, number>,
      });
      const catalog = settled(catalogResult, [] as AdminProduct[]);
      const productAnalytics = settled(productResult, {
        topProducts: [],
        categoryBreakdown: [],
        lowStock: [],
      });
      const pendingOrders = settled(ordersResult, {
        data: [] as AdminOrder[],
        total: 0,
        hasMore: false,
      });
      const activeCombos = comboResult.status === 'fulfilled' ? comboResult.value.total : 0;
      const index = buildCatalogIndex(catalog);

      const revenue = toNumber(sales.kpis?.revenue);
      const prevRevenue = toNumber(sales.prev?.revenue);
      const orders = toNumber(sales.kpis?.orders);
      const prevOrders = toNumber(sales.prev?.orders);

      // Net profit = window revenue less the expenses booked inside the same window,
      // compared against that same calculation over the preceding window. Without
      // the expense list — a role without the Expenses screen is refused it —
      // there is no honest figure: revenue less nothing would overstate profit by
      // every rupee spent, so the card is told it is unavailable instead.
      let netProfit: OptionalTrendValue;
      if (expenseResult.status === 'fulfilled') {
        const expenses = expenseResult.value;
        const windowProfit = revenue - expensesInWindow(expenses, windows.start, windows.end);
        const prevProfit = prevRevenue - expensesInWindow(expenses, windows.prevStart, windows.prevEnd);
        netProfit = { value: windowProfit, changePct: pctChange(windowProfit, prevProfit) };
      } else {
        netProfit = {
          value: null,
          changePct: null,
          unavailableReason: isPermissionError(expenseResult.reason)
            ? 'Needs Expenses access'
            : 'Expenses could not be loaded',
        };
      }

      // Total sellable units on hand. This is a point-in-time count and nothing in
      // the system stores stock history, so there is no baseline and no delta.
      const liveStockUnits = productAnalytics.categoryBreakdown.reduce(
        (sum, category) => sum + toNumber(category.totalStock),
        0,
      );

      const topProducts: TopProductRow[] = (sales.topProducts ?? []).slice(0, 5).map((row) => {
        const match = index.byName.get(normalise(row.name ?? ''));
        return {
          name: row.name ?? '',
          image: match?.image,
          category: match?.category ?? '',
          productId: match?.id,
          sold: toNumber(row.count),
          revenue: toNumber(row.revenue),
        };
      });

      // The admin product list can filter to the low-stock bucket but only sorts
      // stock descending, so the *lowest* rows come from the analytics endpoint,
      // which the server already sorts ascending and caps.
      const lowStock: LowStockRow[] = productAnalytics.lowStock.slice(0, 5).map((row) => {
        const match =
          index.bySlug.get(normalise(row.slug ?? '')) ?? index.byName.get(normalise(row.name ?? ''));
        const stock = toNumber(row.stockCount);
        return {
          id: row._id ?? row.slug ?? row.name,
          name: row.name ?? '',
          category: match?.category ?? '',
          image: Array.isArray(row.images) && row.images.length > 0 ? row.images[0] : match?.image,
          stock,
          level: stock <= CRITICAL_STOCK ? 'critical' : 'low',
        };
      });

      const reviews = catalog.reduce((sum, product) => sum + toNumber(product.reviewCount), 0);

      setSnapshot({
        key: requestKey,
        error: null,
        core: {
          totalSales: { value: revenue, changePct: pctChange(revenue, prevRevenue) },
          liveStock: { value: liveStockUnits, changePct: null },
          netProfit,
          series: buildSeries(sales.timeSeries, windows.start, windows.end),
          topProducts,
          pendingOrders: pendingOrders.data,
          pendingOrdersTotal: pendingOrders.total,
          lowStock,
          summary: {
            // Store-wide total, with the window-over-window order count as its delta.
            totalOrders: { value: toNumber(stats.totalOrders), changePct: pctChange(orders, prevOrders) },
            // The sales aggregation reports new customers for the selected window only;
            // there is no matching prior-window figure, so no delta can be claimed.
            totalCustomers: { value: toNumber(stats.totalCustomers), changePct: null },
            activeOffers: { value: toNumber(activeCombos), changePct: null },
            reviews: { value: reviews, changePct: null },
          },
        },
      });
    };

    void load();

    return () => {
      active = false;
    };
  }, [requestKey, windows]);

  // Loading is derived, never set: a snapshot from another range is stale by definition.
  const current = snapshot && snapshot.key === requestKey ? snapshot : null;

  return useMemo(
    () => ({
      isLoading: current === null,
      error: current?.error ?? null,
      ...(current?.core ?? EMPTY_CORE),
    }),
    [current],
  );
}
