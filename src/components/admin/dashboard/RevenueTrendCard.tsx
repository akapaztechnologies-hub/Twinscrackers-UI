import { useId, useMemo, useState } from 'react';
import { Info, LineChart as LineChartIcon, Activity, BarChart3 } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { cn, formatPrice } from '@/lib/utils.ts';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { SkeletonLine } from '@/components/admin/Skeleton.tsx';
import { useChartTheme } from '@/hooks/useChartTheme.ts';
import type { TooltipContentProps } from 'recharts';
import type { DashboardPoint } from '@/hooks/useAdminDashboard.ts';

const REVENUE_COLOR = '#DC2626';
const ORDERS_COLOR = '#F59E0B';

type Bucket = 'daily' | 'weekly' | 'monthly';

const BUCKETS: ReadonlyArray<{ value: Bucket; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

interface ChartPoint {
  label: string;
  revenue: number;
  orders: number;
  sortKey: number;
}

/**
 * Series dates are plain 'YYYY-MM-DD' calendar days. `new Date('2025-08-26')`
 * parses as UTC midnight, which renders as the previous day in IST — so build
 * the date from its parts and keep everything in local time.
 */
function parseLocalDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return new Date(NaN);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Monday of the week the given local date falls in. */
function startOfWeek(date: Date): Date {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday);
}

function formatDayLabel(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMonthLabel(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function bucketSeries(series: DashboardPoint[], bucket: Bucket): ChartPoint[] {
  if (bucket === 'daily') {
    return series
      .map((point) => {
        const date = parseLocalDate(point.date);
        return {
          label: formatDayLabel(date) || point.date,
          revenue: point.revenue,
          orders: point.orders,
          sortKey: date.getTime(),
        };
      })
      .sort((a, b) => a.sortKey - b.sortKey);
  }

  const buckets = new Map<number, ChartPoint>();
  for (const point of series) {
    const date = parseLocalDate(point.date);
    if (Number.isNaN(date.getTime())) continue;
    const start =
      bucket === 'weekly' ? startOfWeek(date) : new Date(date.getFullYear(), date.getMonth(), 1);
    const key = start.getTime();
    const existing = buckets.get(key);
    if (existing) {
      existing.revenue += point.revenue;
      existing.orders += point.orders;
    } else {
      buckets.set(key, {
        label: bucket === 'weekly' ? formatDayLabel(start) : formatMonthLabel(start),
        revenue: point.revenue,
        orders: point.orders,
        sortKey: key,
      });
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.sortKey - b.sortKey);
}

/** Site currency symbol, read off the shared formatter so it is never hardcoded. */
function currencySymbol(): string {
  return formatPrice(0).replace(/[\d.,\s]/g, '') || '₹';
}

/** Indian short-form axis ticks: 0 / 50K / 1.5L / 2.4Cr, prefixed with the site currency. */
function formatAxisCurrency(value: number): string {
  const symbol = currencySymbol();
  const abs = Math.abs(value);
  if (abs >= 10000000) return `${symbol}${(value / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${symbol}${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${symbol}${Math.round(value / 1000)}K`;
  return `${symbol}${Math.round(value)}`;
}

interface TooltipEntry {
  dataKey?: string | number;
  value?: number;
}

function ChartTooltip(props: TooltipContentProps<number, string>): React.ReactNode {
  const { active, payload, label } = props;
  if (!active || !payload || payload.length === 0) return null;

  // The gradient Area shares the `revenue` key with the Line, so read values by
  // dataKey and take the first match instead of listing every payload entry.
  const entries = payload as ReadonlyArray<TooltipEntry>;
  const revenue = entries.find((entry) => entry.dataKey === 'revenue')?.value;
  const orders = entries.find((entry) => entry.dataKey === 'orders')?.value;

  return (
    <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-3 py-2.5 shadow-card dark:shadow-card-dark">
      <p className="text-caption font-medium text-surface-500 mb-1.5">{label}</p>
      <div className="space-y-1">
        {revenue !== undefined && (
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: REVENUE_COLOR }}
            />
            <span className="text-caption text-surface-500">Revenue</span>
            <span className="ml-auto text-caption font-semibold tabular-nums text-surface-900 dark:text-surface-50">
              {formatPrice(Math.round(revenue))}
            </span>
          </div>
        )}
        {orders !== undefined && (
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: ORDERS_COLOR }}
            />
            <span className="text-caption text-surface-500">Orders</span>
            <span className="ml-auto text-caption font-semibold tabular-nums text-surface-900 dark:text-surface-50">
              {Math.round(orders).toLocaleString('en-IN')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendMarker({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex items-center justify-center w-6 h-2" aria-hidden="true">
        <span className="absolute inset-x-0 h-[2px] rounded-full" style={{ backgroundColor: color }} />
        <span
          className="relative w-2 h-2 rounded-full ring-2 ring-white dark:ring-surface-900"
          style={{ backgroundColor: color }}
        />
      </span>
      <span className="text-caption text-surface-500">{label}</span>
    </span>
  );
}

interface RevenueTrendCardProps {
  series: DashboardPoint[];
  isLoading?: boolean;
}

export function RevenueTrendCard({ series, isLoading }: RevenueTrendCardProps) {
  const [bucket, setBucket] = useState<Bucket>('daily');
  const [showArea, setShowArea] = useState(true);
  const rawGradientId = useId();
  const gradientId = `revenue-fill-${rawGradientId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // Live CSS variables, so the chart chrome tracks an admin palette change.
  const { grid: gridColor, axis: axisColor, dotFill } = useChartTheme();

  // Bucketing is a pure re-shape of the `series` prop — the card never refetches.
  const chartData = useMemo(() => bucketSeries(series, bucket), [series, bucket]);
  const hasData = useMemo(
    () => chartData.some((point) => point.revenue !== 0 || point.orders !== 0),
    [chartData],
  );

  return (
    <AdminCard noPadding>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 pt-4">
        <div className="flex items-center gap-1.5 min-w-0">
          <h2 className="font-display font-bold text-body-lg text-surface-900 dark:text-surface-50 truncate">
            Festive Sales Revenue Trend
          </h2>
          <span
            className="inline-flex flex-shrink-0"
            role="img"
            title="Revenue earned and number of orders placed over the selected date range."
            aria-label="Revenue earned and number of orders placed over the selected date range."
          >
            <Info size={15} className="text-surface-300 dark:text-surface-600" aria-hidden="true" />
          </span>
        </div>

        <div className="flex items-center gap-2 sm:ml-auto flex-shrink-0">
          <div
            role="group"
            aria-label="Chart grouping"
            className="flex items-center gap-0.5 bg-surface-100 dark:bg-surface-800 rounded-xl p-1"
          >
            {BUCKETS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={bucket === option.value}
                onClick={() => setBucket(option.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-caption font-medium transition-colors',
                  bucket === option.value
                    ? 'bg-white dark:bg-surface-700 shadow-sm text-surface-900 dark:text-surface-50'
                    : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-pressed={showArea}
            aria-label={showArea ? 'Switch to plain line chart' : 'Switch to filled area chart'}
            title={showArea ? 'Switch to plain line chart' : 'Switch to filled area chart'}
            onClick={() => setShowArea((value) => !value)}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-500 hover:text-surface-700 dark:hover:text-surface-200 hover:border-surface-300 dark:hover:border-surface-600 transition-colors"
          >
            {showArea ? <Activity size={16} /> : <LineChartIcon size={16} />}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 px-5 pt-3 pb-1">
        <LegendMarker color={REVENUE_COLOR} label={`Revenue (${currencySymbol()})`} />
        <LegendMarker color={ORDERS_COLOR} label="Orders" />
        <span className="ml-auto text-caption text-surface-400 hidden sm:inline">Orders</span>
      </div>

      {/* Chart */}
      <div className="px-2 sm:px-3 pt-2 pb-4">
        {isLoading ? (
          <div className="h-[300px] px-3">
            <SkeletonLine className="h-full w-full rounded-xl" />
          </div>
        ) : !hasData ? (
          <div className="h-[300px] flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-3">
              <BarChart3 size={24} className="text-surface-400" />
            </div>
            <p className="text-body-sm text-surface-500">No sales in this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={REVENUE_COLOR} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={REVENUE_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                tickMargin={10}
                minTickGap={16}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="revenue"
                tickFormatter={formatAxisCurrency}
                tick={{ fontSize: 11, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                width={58}
              />
              <YAxis
                yAxisId="orders"
                orientation="right"
                tick={{ fontSize: 11, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                width={38}
                allowDecimals={false}
              />
              <Tooltip content={ChartTooltip} cursor={{ stroke: gridColor, strokeWidth: 1 }} />
              {showArea && (
                <Area
                  yAxisId="revenue"
                  type="monotone"
                  dataKey="revenue"
                  stroke="none"
                  fill={`url(#${gradientId})`}
                  fillOpacity={1}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              )}
              <Line
                yAxisId="revenue"
                type="monotone"
                dataKey="revenue"
                stroke={REVENUE_COLOR}
                strokeWidth={2.5}
                dot={{ r: 4, fill: dotFill, stroke: REVENUE_COLOR, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: REVENUE_COLOR, stroke: dotFill, strokeWidth: 2 }}
              />
              <Line
                yAxisId="orders"
                type="monotone"
                dataKey="orders"
                stroke={ORDERS_COLOR}
                strokeWidth={2.5}
                dot={{ r: 4, fill: dotFill, stroke: ORDERS_COLOR, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: ORDERS_COLOR, stroke: dotFill, strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </AdminCard>
  );
}
