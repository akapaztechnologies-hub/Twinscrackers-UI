import { cn } from '@/lib/utils.ts';
import { SkeletonCircle, SkeletonLine } from '@/components/admin/Skeleton.tsx';
import { TrendDelta } from '@/components/admin/dashboard/TrendDelta.tsx';

export type StatCardTone = 'red' | 'amber' | 'green';

const TONE_BADGE: Record<StatCardTone, string> = {
  red: 'bg-red-600 dark:bg-red-500',
  amber: 'bg-amber-500 dark:bg-amber-400',
  green: 'bg-green-600 dark:bg-green-500',
};

const CARD_BASE =
  'bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-card dark:shadow-card-dark overflow-hidden p-4 xl:p-5';

/** Scales with the viewport so the number never outgrows its column. */
const VALUE_SIZE = 'text-[clamp(1.05rem,1.5vw,1.75rem)]';

interface DashboardStatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  tone: StatCardTone;
  changePct: number | null;
  comparisonLabel?: string;
  isLoading?: boolean;
  /** A short muted line under the value — e.g. why there is no figure to show. */
  footnote?: string;
}

export function DashboardStatCard({
  label,
  value,
  icon: Icon,
  tone,
  changePct,
  comparisonLabel,
  isLoading,
  footnote,
}: DashboardStatCardProps) {
  if (isLoading) {
    return (
      <div className={CARD_BASE}>
        <div className="flex items-center gap-3.5">
          <SkeletonCircle className="w-11 h-11 flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <SkeletonLine className="h-3 w-20" />
            <SkeletonLine className="h-7 w-32" />
            <SkeletonLine className="h-3 w-28" />
          </div>
        </div>
      </div>
    );
  }

  const hasValue = value.trim().length > 0;

  return (
    <div className={CARD_BASE}>
      <div className="flex items-center gap-3.5">
        <div
          className={cn(
            'w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0',
            TONE_BADGE[tone],
          )}
        >
          <Icon size={20} strokeWidth={2} className="text-white" aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-caption text-surface-500 truncate">{label}</p>
          {hasValue ? (
            <p className={cn('font-display font-bold leading-tight tabular-nums text-surface-900 dark:text-surface-50 truncate', VALUE_SIZE)}>
              {value}
            </p>
          ) : (
            <p className={cn('font-display font-bold leading-tight text-surface-300 dark:text-surface-700', VALUE_SIZE)}>
              &mdash;
            </p>
          )}
          <TrendDelta changePct={changePct} label={comparisonLabel} className="mt-1" />
          {footnote && <p className="mt-1 text-caption text-surface-400 truncate">{footnote}</p>}
        </div>
      </div>
    </div>
  );
}
