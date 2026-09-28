import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Package } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import { SkeletonLine } from '@/components/admin/Skeleton.tsx';
import type { LowStockRow } from '@/hooks/useAdminDashboard.ts';

const MAX_ROWS = 5;

const levelMeta: Record<LowStockRow['level'], { label: string; className: string }> = {
  critical: {
    label: 'Critical',
    className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  },
  low: {
    label: 'Low Stock',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  },
};

/**
 * Product thumbnail that degrades to a tinted tile instead of a broken image.
 * The failed URL is stored (rather than a boolean) so a row re-used for a
 * different product retries the new image without needing an effect.
 */
function ProductThumb({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const broken = !src || failedSrc === src;

  if (broken) {
    return (
      <div
        aria-hidden
        className={cn(
          'flex-shrink-0 flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-500/10',
          className,
        )}
      >
        <Package className="w-4 h-4 text-red-400 dark:text-red-500/80" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className={cn('flex-shrink-0 rounded-lg object-cover bg-surface-100 dark:bg-surface-800', className)}
    />
  );
}

interface LowStockCardProps {
  rows: LowStockRow[];
  isLoading?: boolean;
  /** Lets the rail hand the card its leftover height (e.g. `flex-1`). */
  className?: string;
}

export function LowStockCard({ rows, isLoading, className }: LowStockCardProps) {
  const visible = rows.slice(0, MAX_ROWS);

  return (
    <div
      className={cn(
        'flex flex-col bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm shadow-surface-900/[0.03]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-surface-100 dark:border-surface-800">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="w-1 h-4 rounded-full bg-red-600 flex-shrink-0" />
          <h2 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50 truncate">
            Low Stock Alerts
          </h2>
        </div>
        <Link
          to="/admin/products"
          className="flex-shrink-0 text-caption font-semibold text-red-600 dark:text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
        >
          View All
        </Link>
      </div>

      {/* flex-1 + justify-center: when the rail gives the card extra height,
          the row list (never more than 5 items) centers in it instead of
          leaving a gap stranded below the last row. */}
      <div className="flex-1 flex flex-col justify-center p-2">
        {isLoading ? (
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {Array.from({ length: MAX_ROWS }).map((_, idx) => (
              <div key={idx} className="flex items-center gap-3 px-3 py-3">
                <SkeletonLine className="w-10 h-[40px] flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <SkeletonLine className="h-[12px] w-28" />
                  <SkeletonLine className="h-[10px] w-16" />
                </div>
                <div className="space-y-1.5">
                  <SkeletonLine className="h-[10px] w-8 ml-auto" />
                  <SkeletonLine className="h-[12px] w-12 ml-auto" />
                </div>
                <SkeletonLine className="h-[22px] w-16 flex-shrink-0" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-green-50 dark:bg-green-500/10 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <p className="font-display font-semibold text-body-sm text-surface-900 dark:text-surface-50">
              All products are well stocked
            </p>
            <p className="mt-1 text-caption text-surface-500 max-w-[15rem]">
              Nothing needs restocking right now.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {visible.map((row) => {
              const level = levelMeta[row.level];
              return (
                <Link
                  key={row.id}
                  to="/admin/products"
                  className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-850/60 transition-colors"
                >
                  <ProductThumb src={row.image} alt={row.name} className="w-10 h-10" />

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[13px] leading-tight text-surface-900 dark:text-surface-50 truncate">
                      {row.name}
                    </p>
                    <p className="text-[11px] leading-tight text-surface-400 truncate mt-0.5 capitalize">
                      {row.category}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-[11px] leading-tight text-surface-400">Stock</p>
                    <p className="font-semibold text-[13px] leading-tight text-surface-900 dark:text-surface-50 tabular-nums mt-0.5">
                      {row.stock.toLocaleString('en-IN')} pcs
                    </p>
                  </div>

                  <span
                    className={cn(
                      'flex-shrink-0 inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap',
                      level.className,
                    )}
                  >
                    {level.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
