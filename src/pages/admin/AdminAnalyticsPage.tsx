import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  IndianRupee,
  Package,
  ShoppingBag,
  TrendingUp,
  BarChart3,
  Users,
  UserPlus,
  UserCheck,
  Globe,
  Eye,
  MousePointerClick,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from 'recharts';
import { formatPrice } from '@/lib/utils.ts';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { SkeletonLine } from '@/components/admin/Skeleton.tsx';
import { DateRangeFilter, getDateRangeStart, getDateRangeEnd } from '@/components/admin/DateRangeFilter.tsx';
import { ExportButton } from '@/components/admin/ExportButton.tsx';
import { exportToExcel } from '@/lib/exportExcel.ts';
import { useChartTheme } from '@/hooks/useChartTheme.ts';
import type { DateRange, CustomRange } from '@/components/admin/DateRangeFilter.tsx';
import type { SalesAnalytics, TrafficSummary } from '@/services/admin.ts';
import type { AdminOrder } from '@/types/admin.ts';

/** The order list's own page cap on the server. */
const EXPORT_PAGE_SIZE = 100;
/** 50 pages = 5,000 orders — a backstop so a bad total can never loop forever. */
const MAX_EXPORT_PAGES = 50;

function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getGrowth(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : undefined;
  return Math.round(((current - previous) / previous) * 100);
}

/** Current + previous date windows (ISO) for the sales-analytics query. */
/** The traffic rollup takes a plain day count, so map the shared range onto one. */
const TRAFFIC_DAYS: Record<DateRange, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: 365,
  custom: 30,
};

/** Seconds -> "2m 34s". Sub-minute sessions read better as plain seconds. */
function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
}

/**
 * The selected window plus the equal-length window straight before it.
 *
 * The previous window is measured from the current one's own start and length,
 * the way the dashboard does it. It used to be rebuilt from a day count, which
 * for "Today" compared midnight-to-now against a full 24 hours ending this time
 * yesterday — so every morning read as a steep drop.
 */
function computeWindows(dateRange: DateRange, customRange: CustomRange) {
  const cutoff = getDateRangeStart(dateRange, customRange);
  const endDate = getDateRangeEnd(dateRange, customRange);
  const dateFrom = cutoff ? cutoff.toISOString() : undefined;
  const dateTo = endDate ? endDate.toISOString() : undefined;

  let prevFrom: string | undefined;
  let prevTo: string | undefined;
  if (cutoff) {
    const end = endDate ?? new Date();
    const span = Math.max(end.getTime() - cutoff.getTime(), 1);
    const prevEnd = new Date(cutoff.getTime() - 1);
    prevFrom = new Date(prevEnd.getTime() - span).toISOString();
    prevTo = prevEnd.toISOString();
  }
  return { dateFrom, dateTo, prevFrom, prevTo };
}

export function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<SalesAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [customRange, setCustomRange] = useState<CustomRange>({ start: '', end: '' });

  // Read from the live CSS variables so the charts follow an admin palette
  // change; SVG attributes cannot take a Tailwind class.
  const chart = useChartTheme();
  const { grid: gridColor, tooltipBg, tooltipBorder, axis: axisColor } = chart;

  // All charts/KPIs come from one server aggregation over the selected window —
  // no orders/users are shipped to the browser to compute here.
  useEffect(() => {
    // A slower answer for the range the admin just left must not land on top of
    // the one they picked.
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const { getSalesAnalytics } = await import('@/services/admin.ts');
        const result = await getSalesAnalytics(computeWindows(dateRange, customRange));
        if (!cancelled) setAnalytics(result);
      } catch {
        if (!cancelled) setAnalytics(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateRange, customRange]);

  const kpis = analytics?.kpis ?? { revenue: 0, orders: 0, delivered: 0, avgOrderValue: 0 };
  const prev = analytics?.prev ?? { revenue: 0, orders: 0, delivered: 0, avgOrderValue: 0 };
  const totalRevenue = kpis.revenue;
  const totalOrders = kpis.orders;
  const avgOrderValue = kpis.avgOrderValue;
  const deliveredOrders = kpis.delivered;
  const prevRevenue = prev.revenue;
  const prevOrders = prev.orders;
  const prevAvg = prev.avgOrderValue;
  const prevDelivered = prev.delivered;
  const customerInsights = analytics?.customerInsights ?? { totalCustomers: 0, uniqueBuyers: 0, newCustomers: 0, returningBuyers: 0 };
  const timeSeriesData = analytics?.timeSeries ?? [];
  const topProducts = analytics?.topProducts ?? [];
  const customerGrowthData = analytics?.customerGrowth ?? [];

  // Real first-party traffic, recorded by the beacon in @/lib/track.ts.
  const [traffic, setTraffic] = useState<TrafficSummary | null>(null);
  const trafficDays = TRAFFIC_DAYS[dateRange] ?? 7;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getTraffic } = await import('@/services/admin.ts');
      const result = await getTraffic(trafficDays);
      if (!cancelled) setTraffic(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [trafficDays]);

  const trafficData = traffic?.series ?? [];

  const handleExport = async () => {
    try {
      const { getAllOrders } = await import('@/services/admin.ts');
      const w = computeWindows(dateRange, customRange);
      // The server hands out at most 100 orders a page, so a busy month has to
      // be walked page by page — one request used to export the first 100 and
      // stop without a word.
      const orders: AdminOrder[] = [];
      for (let page = 1; page <= MAX_EXPORT_PAGES; page += 1) {
        const res = await getAllOrders({ dateFrom: w.dateFrom, dateTo: w.dateTo, page, limit: EXPORT_PAGE_SIZE });
        orders.push(...res.data);
        const lastPage = res.totalPages ?? (res.hasMore ? page + 1 : page);
        if (res.data.length === 0 || page >= lastPage) break;
      }
      void exportToExcel(
        orders.map((o) => ({
          orderId: o.id,
          date: o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN') : '',
          status: o.status,
          items: o.items.length,
          subtotal: o.subtotal,
          shipping: o.shipping,
          total: o.total,
          paymentMethod: o.paymentMethod,
          // Orders carry the buyer on `user` (an id) — the name is what a
          // spreadsheet reader can use.
          customer: o.customerName || o.customerEmail || '',
        })),
        'analytics-orders',
      );
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <DateRangeFilter
          value={dateRange}
          onChange={setDateRange}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
        />
        <div className="flex-1" />
        <ExportButton onExport={handleExport} label="Export Orders" />
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Revenue"
          value={formatPrice(totalRevenue)}
          icon={IndianRupee}
          color="text-green-600 bg-green-500/10"
          isLoading={isLoading}
          change={dateRange !== 'all' ? getGrowth(totalRevenue, prevRevenue) : undefined}
        />
        <KPICard
          label="Total Orders"
          value={String(totalOrders)}
          icon={Package}
          color="text-blue-600 bg-blue-500/10"
          isLoading={isLoading}
          change={dateRange !== 'all' ? getGrowth(totalOrders, prevOrders) : undefined}
        />
        <KPICard
          label="Avg Order Value"
          value={formatPrice(Math.round(avgOrderValue))}
          icon={TrendingUp}
          color="text-purple-600 bg-purple-500/10"
          isLoading={isLoading}
          change={dateRange !== 'all' ? getGrowth(avgOrderValue, prevAvg) : undefined}
        />
        <KPICard
          label="Delivered"
          value={String(deliveredOrders)}
          icon={ShoppingBag}
          color="text-amber-600 bg-amber-500/10"
          isLoading={isLoading}
          change={dateRange !== 'all' ? getGrowth(deliveredOrders, prevDelivered) : undefined}
        />
      </div>

      {/* Revenue & Orders Over Time — Line Chart */}
      <AdminCard title="Revenue & Orders Over Time">
        {isLoading ? (
          <div className="h-72 flex items-center justify-center">
            <SkeletonLine className="h-full w-full rounded-xl" />
          </div>
        ) : timeSeriesData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-3">
              <BarChart3 size={24} className="text-surface-400" />
            </div>
            <p className="text-body-sm text-surface-500">No data for this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeriesData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatDateShort(new Date(v))}
                tick={{ fontSize: 12, fill: axisColor }}
                axisLine={{ stroke: gridColor }}
                tickLine={false}
              />
              <YAxis
                yAxisId="revenue"
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 12, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <YAxis
                yAxisId="orders"
                orientation="right"
                tick={{ fontSize: 12, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: 12,
                  fontSize: 13,
                }}
                labelFormatter={(v) => formatDateShort(new Date(v))}
                formatter={((value: number | undefined, name: string) =>
                  name === 'revenue' ? [formatPrice(value ?? 0), 'Revenue'] : [value ?? 0, 'Orders']
                ) as never}
              />
              <Line yAxisId="revenue" type="monotone" dataKey="revenue" stroke={chart.brand} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              <Line yAxisId="orders" type="monotone" dataKey="orders" stroke={chart.fire} strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        )}
        {!isLoading && timeSeriesData.length > 0 && (
          <div className="flex items-center gap-6 mt-3 px-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: chart.brand }} />
              <span className="text-caption text-surface-500">Revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 rounded-full border-dashed" style={{ borderTop: `2px dashed ${chart.fire}`, height: 0 }} />
              <span className="text-caption text-surface-500">Orders</span>
            </div>
          </div>
        )}
      </AdminCard>

      {/* Customer Insights & Customer Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Insights */}
        <AdminCard title="Customer Insights">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <SkeletonLine className="h-8 w-8 rounded-xl" />
                  <div className="flex-1 space-y-1">
                    <SkeletonLine className="h-4 w-20" />
                    <SkeletonLine className="h-3 w-12" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {([
                { label: 'Total Customers', value: customerInsights.totalCustomers, icon: Users, color: 'text-blue-600 bg-blue-500/10' },
                { label: 'Unique Buyers', value: customerInsights.uniqueBuyers, icon: UserCheck, color: 'text-green-600 bg-green-500/10' },
                { label: 'New Customers', value: customerInsights.newCustomers, icon: UserPlus, color: 'text-purple-600 bg-purple-500/10' },
                { label: 'Returning Buyers', value: customerInsights.returningBuyers, icon: Users, color: 'text-amber-600 bg-amber-500/10' },
              ] as const).map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.color}`}>
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display font-bold text-body-lg text-surface-900 dark:text-surface-50">{item.value}</p>
                      <p className="text-caption text-surface-500 truncate">{item.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AdminCard>

        {/* Customer Growth Over Time */}
        <AdminCard title="Customer Growth">
          {isLoading ? (
            <div className="h-[230px] flex items-center justify-center">
              <SkeletonLine className="h-full w-full rounded-xl" />
            </div>
          ) : customerGrowthData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-3">
                <Users size={24} className="text-surface-400" />
              </div>
              <p className="text-body-sm text-surface-500">No customer data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={customerGrowthData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: axisColor }}
                  axisLine={{ stroke: gridColor }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: axisColor }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: 12,
                    fontSize: 13,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="totalUsers"
                  stroke={chart.brand}
                  fill={chart.brand}
                  fillOpacity={0.1}
                  strokeWidth={2}
                  name="Total Users"
                />
                <Area
                  type="monotone"
                  dataKey="newUsers"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  name="New Users"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </AdminCard>
      </div>

      {/* Top Products by Revenue */}
      <AdminCard
        title="Top Products by Revenue"
        titleAction={
          <Link
            to="/admin/analytics/products"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
          >
            View All
            <ArrowRight size={14} />
          </Link>
        }
      >
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <SkeletonLine className="h-full w-full rounded-xl" />
          </div>
        ) : topProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-3">
              <ShoppingBag size={24} className="text-surface-400" />
            </div>
            <p className="text-body-sm text-surface-500">No sales data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(250, topProducts.length * 38)}>
            <BarChart
              data={topProducts.map((p) => ({ ...p, shortName: p.name.length > 20 ? p.name.slice(0, 20) + '…' : p.name }))}
              layout="vertical"
              margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: axisColor }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="shortName"
                tick={{ fontSize: 12, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                width={140}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: 12,
                  fontSize: 13,
                }}
                formatter={((value: number | undefined, _name: string, props: { payload: { count: number } }) => [
                  `${formatPrice(value ?? 0)} (${props.payload.count} sold)`,
                  'Revenue',
                ]) as never}
                labelFormatter={(label) => String(label)}
              />
              <Bar
                dataKey="revenue"
                fill={chart.brand}
                fillOpacity={0.8}
                radius={[0, 6, 6, 0]}
                barSize={22}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </AdminCard>

      {/* Website Traffic — first-party, recorded by the beacon in @/lib/track.ts */}
      <AdminCard
        title="Website Traffic"
        titleAction={
          <span className="px-2 py-0.5 rounded-md bg-green-500/10 text-caption font-medium text-green-600 dark:text-green-400">
            Live
          </span>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {([
              { label: 'Page Views', value: traffic?.totalPageViews ?? 0, icon: Eye, color: 'text-blue-600 bg-blue-500/10' },
              { label: 'Unique Visitors', value: traffic?.uniqueVisitors ?? 0, icon: Globe, color: 'text-green-600 bg-green-500/10' },
              { label: 'Avg. Session', value: formatDuration(traffic?.avgSessionSeconds ?? 0), icon: MousePointerClick, color: 'text-purple-600 bg-purple-500/10' },
            ] as const).map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display font-bold text-body-md text-surface-900 dark:text-surface-50">{typeof item.value === 'number' ? item.value.toLocaleString('en-IN') : item.value}</p>
                    <p className="text-caption text-surface-500 truncate">{item.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trafficData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatDateShort(new Date(v))}
                tick={{ fontSize: 11, fill: axisColor }}
                axisLine={{ stroke: gridColor }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 12, fill: axisColor }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: 12,
                  fontSize: 13,
                }}
                labelFormatter={(v) => formatDateShort(new Date(v))}
              />
              <Area type="monotone" dataKey="pageViews" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.08} strokeWidth={2} name="Page Views" />
              <Area type="monotone" dataKey="visitors" stroke="#22C55E" fill="#22C55E" fillOpacity={0.08} strokeWidth={2} name="Visitors" />
            </AreaChart>
          </ResponsiveContainer>
          {traffic && !traffic.hasData && (
            <p className="text-caption text-surface-400 text-center">
              No visits recorded yet. Numbers appear here as soon as someone opens the storefront —
              tracking starts from the moment this build goes live.
            </p>
          )}

          {/* Where the traffic came from and what it looked at. Only rendered
              once there is something to show, so the card stays quiet on day one. */}
          {(traffic?.topPages.length || traffic?.topReferrers.length) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {traffic.topPages.length > 0 && (
                <div>
                  <p className="text-caption font-semibold text-surface-500 mb-2">Top Pages</p>
                  <ul className="space-y-1.5">
                    {traffic.topPages.slice(0, 5).map((p) => (
                      <li key={p.path} className="flex items-center justify-between gap-3 text-body-sm">
                        <span className="truncate text-surface-700 dark:text-surface-300">{p.path}</span>
                        <span className="tabular-nums text-surface-500 flex-shrink-0">{p.views.toLocaleString('en-IN')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {traffic.topReferrers.length > 0 && (
                <div>
                  <p className="text-caption font-semibold text-surface-500 mb-2">Top Sources</p>
                  <ul className="space-y-1.5">
                    {traffic.topReferrers.slice(0, 5).map((r) => (
                      <li key={r.source} className="flex items-center justify-between gap-3 text-body-sm">
                        <span className="truncate text-surface-700 dark:text-surface-300">{r.source}</span>
                        <span className="tabular-nums text-surface-500 flex-shrink-0">{r.visits.toLocaleString('en-IN')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </AdminCard>
    </div>
  );
}
