/**
 * The dashboard's work queue: orders that are still `pending` and waiting on staff.
 *
 * Deliberately *not* scoped to the dashboard's date picker. An order left pending
 * three weeks ago is still unfulfilled, and hiding it because the picker says
 * "Last 7 Days" would be the one case where this panel actively misleads. Rows are
 * oldest-first for the same reason — the order ageing out is the urgent one.
 */
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils.ts';
import { SkeletonLine } from '@/components/admin/Skeleton.tsx';
import type { AdminOrder } from '@/types/admin.ts';

const MAX_ROWS = 5;

/** An order sitting this many days without action is called out in red. */
const STALE_DAYS = 3;

/**
 * "Sep 2, 10:45 AM". Rendered with en-US because Indian English shortens
 * September to "Sept" and puts the day first, which does not match the design.
 * Returns an em dash rather than "Invalid Date" when the timestamp is unusable.
 */
function formatOrderDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  // No year: a pending order is recent by nature, and the column has to stay narrow.
  return date
    .toLocaleString('en-US', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(/,([^,]*)$/, '$1');
}

/** Order ids are long; the tail is what staff actually read out. */
function shortOrderId(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}

/**
 * Whole days an order has been waiting. Only surfaced from day 1 — "0d" is noise,
 * and an order placed this morning needs no nudge.
 */
function ageInDays(iso: string): number {
  const placed = new Date(iso).getTime();
  if (Number.isNaN(placed)) return 0;
  return Math.floor((Date.now() - placed) / 86_400_000);
}

const headCell = 'text-caption font-semibold text-surface-400 uppercase tracking-wider px-5 py-3 whitespace-nowrap';

interface PendingOrdersCardProps {
  orders: AdminOrder[];
  /** Pending orders store-wide — the badge counts all of them, not just the rows shown. */
  total?: number;
  isLoading?: boolean;
}

export function PendingOrdersCard({ orders, total, isLoading }: PendingOrdersCardProps) {
  const navigate = useNavigate();
  const visible = orders.slice(0, MAX_ROWS);
  const count = total ?? orders.length;

  return (
    // Same reserved height as TopSellingCard — the two sit side by side and
    // have to stay level as their row counts change independently.
    <div className="flex flex-col min-h-[25rem] bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm shadow-surface-900/[0.03] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-surface-100 dark:border-surface-800">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="w-4 h-4 text-red-600 dark:text-red-500 flex-shrink-0" />
          <h2 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50 truncate">
            Orders Needing Action
          </h2>
          {!isLoading && count > 0 && (
            <span
              aria-label={`${count} pending ${count === 1 ? 'order' : 'orders'}`}
              className="flex-shrink-0 min-w-[1.375rem] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-500/15 text-caption font-semibold text-red-700 dark:text-red-400 text-center tabular-nums"
            >
              {count}
            </span>
          )}
        </div>
        <Link
          to="/admin/orders?status=pending"
          className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-850 text-caption font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-50 transition-colors"
        >
          View All Orders
        </Link>
      </div>

      <div className="flex-1">
        {/* Three fixed columns, no sideways scroll. Order id and customer share a
            cell because they are read together; every row here is pending, so a
            status column would print the same word five times. */}
        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b border-surface-100 dark:border-surface-800">
              <th className={cn(headCell, 'text-left')}>Order</th>
              <th className={cn(headCell, 'text-left w-[7.5rem] px-2')}>Placed</th>
              <th className={cn(headCell, 'text-right w-24 pl-0')}>Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
            {isLoading ? (
              Array.from({ length: MAX_ROWS }).map((_, idx) => (
                <tr key={idx}>
                  <td className="px-5 py-3.5 space-y-1.5">
                    <SkeletonLine className="h-[12px] w-16" />
                    <SkeletonLine className="h-[10px] w-24" />
                  </td>
                  <td className="px-2 py-3.5 space-y-1.5">
                    <SkeletonLine className="h-[12px] w-20" />
                    <SkeletonLine className="h-[10px] w-14" />
                  </td>
                  <td className="pr-5 py-3.5"><SkeletonLine className="h-[12px] w-16 ml-auto" /></td>
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <div className="flex flex-col items-center justify-center py-12 text-center px-5">
                    <div className="w-12 h-12 rounded-2xl bg-green-50 dark:bg-green-500/10 flex items-center justify-center mb-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-500" />
                    </div>
                    <p className="font-display font-semibold text-body-sm text-surface-900 dark:text-surface-50">
                      All caught up
                    </p>
                    <p className="mt-1 text-caption text-surface-500 max-w-[16rem]">
                      No orders are waiting on you. New ones will show up here as they are placed.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              visible.map((order) => {
                const age = ageInDays(order.createdAt);

                return (
                  <tr
                    key={order.id}
                    onClick={() => navigate(`/admin/orders/${order.id}`)}
                    className="hover:bg-surface-50/70 dark:hover:bg-surface-850/50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      {/* Kept a real link, not just the row handler: this is what makes
                          the row keyboard-reachable and middle-clickable to a new tab. */}
                      <Link
                        to={`/admin/orders/${order.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="block font-semibold text-body-sm text-surface-900 dark:text-surface-50 tabular-nums hover:text-red-600 dark:hover:text-red-500 transition-colors"
                      >
                        {shortOrderId(order.id)}
                      </Link>
                      <span
                        title={order.customerName || 'Unknown'}
                        className="block truncate text-[11px] leading-tight text-surface-500 mt-0.5"
                      >
                        {order.customerName || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-2 py-3.5 text-body-sm text-surface-500 whitespace-nowrap">
                      {formatOrderDate(order.createdAt)}
                      {age > 0 && (
                        <span
                          className={cn(
                            'block text-[11px] leading-tight font-medium mt-0.5',
                            age >= STALE_DAYS
                              ? 'text-red-600 dark:text-red-500'
                              : 'text-amber-600 dark:text-amber-500',
                          )}
                        >
                          {age}d waiting
                        </span>
                      )}
                    </td>
                    <td className="pr-5 py-3.5 text-body-sm font-semibold text-surface-900 dark:text-surface-100 tabular-nums text-right whitespace-nowrap">
                      {formatPrice(order.total)}
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
