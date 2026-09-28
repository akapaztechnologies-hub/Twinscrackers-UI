/**
 * Admin dashboard — the festive-season command centre.
 *
 * This page is pure composition: it owns the selected date range and hands it to
 * `useAdminDashboard`, which is the single source for every figure on screen.
 * Nothing here invents a number — panels render their own loading and empty
 * states, and a metric with no honest prior-period baseline simply shows no delta.
 */
import { useState } from 'react';
import { Download, IndianRupee, Package, Wallet } from 'lucide-react';
import { formatPrice } from '@/lib/utils.ts';
import type { CustomRange, DateRange } from '@/components/admin/DateRangeFilter.tsx';
import { exportSheetsToExcel } from '@/lib/exportExcel.ts';
import { DashboardDateRange } from '@/components/admin/dashboard/DashboardDateRange.tsx';
import { useAdminDashboard } from '@/hooks/useAdminDashboard.ts';
import { DashboardStatCard } from '@/components/admin/dashboard/DashboardStatCard.tsx';
import { RevenueTrendCard } from '@/components/admin/dashboard/RevenueTrendCard.tsx';
import { TopSellingCard } from '@/components/admin/dashboard/TopSellingCard.tsx';
import { PendingOrdersCard } from '@/components/admin/dashboard/PendingOrdersCard.tsx';
import { LowStockCard } from '@/components/admin/dashboard/LowStockCard.tsx';
import { BoostSalesCard } from '@/components/admin/dashboard/BoostSalesCard.tsx';
import { StoreSummaryCard } from '@/components/admin/dashboard/StoreSummaryCard.tsx';

/** What the KPI deltas are measured against, phrased for the window in view. */
const COMPARISON_LABELS: Record<DateRange, string> = {
  today: 'vs yesterday',
  '7d': 'vs last 7 days',
  '30d': 'vs last 30 days',
  '90d': 'vs last 90 days',
  custom: 'vs previous period',
  all: 'vs previous period',
};

export function AdminDashboardPage() {
  const [range, setRange] = useState<DateRange>('7d');
  const [customRange, setCustomRange] = useState<CustomRange>();
  const data = useAdminDashboard(range, customRange);

  const comparisonLabel = COMPARISON_LABELS[range];
  const canExport = data.series.length > 0 || data.topProducts.length > 0;

  /**
   * Two tabs in one workbook.
   *
   * These were one CSV sharing a single column set, which meant every Daily
   * Sales row carried three blank product columns and vice versa. A tab each
   * lets both sections keep only the columns they actually have.
   */
  const handleExport = () => {
    if (!canExport) return;

    void exportSheetsToExcel(
      [
        {
          name: 'Daily Sales',
          rows: data.series.map((point) => ({
            Date: point.date,
            Revenue: point.revenue,
            Orders: point.orders,
          })),
        },
        {
          name: 'Top Products',
          rows: data.topProducts.map((product) => ({
            Product: product.name,
            Category: product.category,
            Revenue: product.revenue,
            'Units Sold': product.sold,
          })),
        },
      ],
      'dashboard-report',
    );
  };

  return (
    <div className="space-y-6">
      {data.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-4 py-3 text-body-sm"
        >
          Dashboard data could not be loaded. Some panels may be empty — try again in a moment.
        </div>
      )}

      {/* No items-start: both columns stretch to the taller one, so the rail can
          grow into the space under its last card instead of leaving it blank. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
        {/* Main content */}
        <div className="space-y-6 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <DashboardStatCard
              label="Total Sales"
              value={formatPrice(data.totalSales.value)}
              icon={IndianRupee}
              tone="red"
              changePct={data.totalSales.changePct}
              comparisonLabel={comparisonLabel}
              isLoading={data.isLoading}
            />
            <DashboardStatCard
              label="Live Stock Count"
              value={data.liveStock.value.toLocaleString('en-IN')}
              icon={Package}
              tone="amber"
              changePct={data.liveStock.changePct}
              comparisonLabel={comparisonLabel}
              isLoading={data.isLoading}
            />
            {/* No figure when the expenses could not be read — revenue less
                nothing would pass for profit. The card says why instead. */}
            <DashboardStatCard
              label="Net Profit"
              value={data.netProfit.value === null ? '' : formatPrice(data.netProfit.value)}
              icon={Wallet}
              tone="green"
              changePct={data.netProfit.changePct}
              comparisonLabel={comparisonLabel}
              isLoading={data.isLoading}
              footnote={data.netProfit.unavailableReason}
            />
          </div>

          <RevenueTrendCard series={data.series} isLoading={data.isLoading} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopSellingCard rows={data.topProducts} isLoading={data.isLoading} />
            <PendingOrdersCard
              orders={data.pendingOrders}
              total={data.pendingOrdersTotal}
              isLoading={data.isLoading}
            />
          </div>
        </div>

        {/* Right rail — Low Stock Alerts absorbs the leftover height so the
            column bottoms out level with the content beside it. */}
        <div className="flex flex-col gap-6 min-w-0">
          <div className="flex items-center gap-2">
            <DashboardDateRange
              value={range}
              onChange={setRange}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
              className="flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={handleExport}
              disabled={data.isLoading || !canExport}
              title={canExport ? 'Download this dashboard as CSV' : 'Nothing to export yet'}
              className="flex-shrink-0 whitespace-nowrap flex items-center gap-2 h-10 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-body-sm font-semibold transition-colors shadow-sm shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600"
            >
              <Download size={16} aria-hidden="true" />
              Export Report
            </button>
          </div>

          <LowStockCard rows={data.lowStock} isLoading={data.isLoading} className="flex-1" />
          <BoostSalesCard />
          <StoreSummaryCard summary={data.summary} isLoading={data.isLoading} />
        </div>
      </div>
    </div>
  );
}
