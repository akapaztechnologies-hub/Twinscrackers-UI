import { Store } from 'lucide-react';
import { SkeletonLine } from '@/components/admin/Skeleton.tsx';
import { TrendDelta } from './TrendDelta.tsx';
import type { AdminDashboardData } from '@/hooks/useAdminDashboard.ts';

type Summary = AdminDashboardData['summary'];

const TILES: { key: keyof Summary; label: string }[] = [
  { key: 'totalOrders', label: 'Total Orders' },
  { key: 'totalCustomers', label: 'Total Customers' },
  { key: 'activeOffers', label: 'Active Offers' },
  { key: 'reviews', label: 'Reviews' },
];

interface StoreSummaryCardProps {
  summary: Summary;
  isLoading?: boolean;
}

export function StoreSummaryCard({ summary, isLoading }: StoreSummaryCardProps) {
  return (
    <div className="flex flex-col bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm shadow-surface-900/[0.03]">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-surface-100 dark:border-surface-800">
        <Store className="w-4 h-4 text-red-600 dark:text-red-500 flex-shrink-0" />
        <h2 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50 truncate">
          Store Summary
        </h2>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-2 gap-3">
          {TILES.map(({ key, label }) => {
            const metric = summary[key];
            return (
              <div key={key} className="rounded-xl bg-surface-50 dark:bg-surface-800/50 p-3.5">
                <p className="text-[11px] leading-tight text-surface-500">{label}</p>
                {isLoading ? (
                  <SkeletonLine className="h-[24px] w-16 mt-2" />
                ) : (
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-body-lg text-surface-900 dark:text-surface-50 tabular-nums">
                      {metric.value.toLocaleString('en-IN')}
                    </span>
                    <TrendDelta changePct={metric.changePct} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
