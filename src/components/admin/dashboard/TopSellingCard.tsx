import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Star, Sparkles } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils.ts';
import { SkeletonLine } from '@/components/admin/Skeleton.tsx';
import type { TopProductRow } from '@/hooks/useAdminDashboard.ts';

const MAX_ROWS = 5;

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
        <Sparkles className="w-4 h-4 text-red-400 dark:text-red-500/80" />
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

const headCell = 'text-caption font-semibold text-surface-400 uppercase tracking-wider px-5 py-3 whitespace-nowrap';

/**
 * Compact units: 1,240 stays as-is, 12,400 becomes 12.4k. Keeps the Sold column
 * inside its fixed width no matter how big a festive season gets.
 */
function compactUnits(value: number): string {
  if (value < 10_000) return value.toLocaleString('en-IN');
  return `${Math.round(value / 100) / 10}k`;
}

interface TopSellingCardProps {
  rows: TopProductRow[];
  isLoading?: boolean;
}

export function TopSellingCard({ rows, isLoading }: TopSellingCardProps) {
  const navigate = useNavigate();
  const visible = rows.slice(0, MAX_ROWS);

  return (
    // Height is reserved for a full five rows whether or not there are five.
    // Without it the card is as tall as the day's data: it renders at five
    // skeleton rows, collapses to one when the numbers land, and shifts again
    // on every date-range change — and next to a card doing the same thing it
    // reads as the dashboard flinching.
    <div className="flex flex-col min-h-[25rem] bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm shadow-surface-900/[0.03] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-surface-100 dark:border-surface-800">
        <div className="flex items-center gap-2 min-w-0">
          <Star className="w-4 h-4 text-amber-500 fill-amber-500 flex-shrink-0" />
          <h2 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50 truncate">
            Top Selling Fireworks
          </h2>
        </div>
        <Link
          to="/admin/products"
          className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-850 text-caption font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-50 transition-colors"
        >
          View All Products
        </Link>
      </div>

      <div className="flex-1">
        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b border-surface-100 dark:border-surface-800">
              <th className={cn(headCell, 'text-left w-9 pr-0')}>#</th>
              <th className={cn(headCell, 'text-left px-3')}>Product</th>
              <th className={cn(headCell, 'text-right w-16 px-2')}>Sold</th>
              <th className={cn(headCell, 'text-right w-24')}>Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
            {isLoading ? (
              Array.from({ length: MAX_ROWS }).map((_, idx) => (
                <tr key={idx}>
                  <td className="pl-5 py-3"><SkeletonLine className="h-[12px] w-3" /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <SkeletonLine className="w-9 h-[36px] flex-shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <SkeletonLine className="h-[12px] w-full max-w-[7rem]" />
                        <SkeletonLine className="h-[10px] w-16" />
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3"><SkeletonLine className="h-[12px] w-10 ml-auto" /></td>
                  <td className="pr-5 py-3"><SkeletonLine className="h-[12px] w-16 ml-auto" /></td>
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="flex flex-col items-center justify-center py-12 text-center px-5">
                    <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-3">
                      <Star className="w-5 h-5 text-surface-400" />
                    </div>
                    <p className="font-display font-semibold text-body-sm text-surface-900 dark:text-surface-50">
                      No sales in this period
                    </p>
                    <p className="mt-1 text-caption text-surface-500 max-w-[16rem]">
                      Top sellers appear here once orders come in.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              visible.map((row, idx) => {
                // Sales rows are grouped by product *name*, so a renamed or deleted
                // product (or a combo) has no catalogue match — those rows stay inert
                // rather than pointing at an edit page that will not load.
                const openable = Boolean(row.productId);
                return (
                  <tr
                    key={`${row.name}-${idx}`}
                    onClick={openable ? () => navigate(`/admin/products/${row.productId}/edit`) : undefined}
                    className={cn(
                      'hover:bg-surface-50/70 dark:hover:bg-surface-850/50 transition-colors',
                      openable && 'cursor-pointer',
                    )}
                  >
                    <td className="pl-5 py-3 text-body-sm text-surface-400 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductThumb src={row.image} alt={row.name} className="w-9 h-9" />
                        <div className="min-w-0 flex-1">
                          {openable ? (
                            <Link
                              to={`/admin/products/${row.productId}/edit`}
                              onClick={(event) => event.stopPropagation()}
                              title={row.name}
                              className="block font-semibold text-[13px] leading-tight text-surface-900 dark:text-surface-50 truncate hover:text-red-600 dark:hover:text-red-500 transition-colors"
                            >
                              {row.name}
                            </Link>
                          ) : (
                            <p title={row.name} className="font-semibold text-[13px] leading-tight text-surface-900 dark:text-surface-50 truncate">
                              {row.name}
                            </p>
                          )}
                          {/* The only place category appears now — its own column said
                              nothing the subtitle does not. */}
                          <p className="text-[11px] leading-tight text-surface-400 truncate mt-0.5 capitalize">
                            {row.category}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td
                      title={`${row.sold.toLocaleString('en-IN')} units`}
                      className="px-2 py-3 text-body-sm font-medium text-surface-900 dark:text-surface-100 tabular-nums text-right whitespace-nowrap"
                    >
                      {compactUnits(row.sold)}
                    </td>
                    <td className="pr-5 py-3 text-body-sm font-semibold text-surface-900 dark:text-surface-100 tabular-nums text-right whitespace-nowrap">
                      {formatPrice(row.revenue)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
