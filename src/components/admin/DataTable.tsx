import { cn } from '@/lib/utils.ts';
import { SkeletonTableRows } from './Skeleton.tsx';
import { AdminEmptyState } from './AdminEmptyState.tsx';
import { Pagination } from './Pagination.tsx';

interface DataTableProps {
  columns: { key: string; label: string; className?: string }[];
  isLoading: boolean;
  isEmpty: boolean;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  emptyActionHref?: string;
  onEmptyAction?: () => void;
  children: React.ReactNode;
  className?: string;
  pagination?: {
    currentPage: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (size: number) => void;
  };
}

export function DataTable({
  columns,
  isLoading,
  isEmpty,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  emptyActionHref,
  onEmptyAction,
  children,
  className,
  pagination,
}: DataTableProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 overflow-hidden',
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-100 dark:border-surface-800">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'text-left text-caption font-semibold text-surface-500 uppercase tracking-wider px-5 py-3',
                    col.className,
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonTableRows columns={columns.length} rows={5} />
            ) : isEmpty ? (
              <AdminEmptyState
                asTableRow
                colSpan={columns.length}
                icon={emptyIcon}
                title={emptyTitle}
                description={emptyDescription}
                actionLabel={emptyActionLabel}
                actionHref={emptyActionHref}
                onAction={onEmptyAction}
              />
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
      {pagination && pagination.totalItems > 0 && !isLoading && !isEmpty && (
        <div className="border-t border-surface-100 dark:border-surface-800 px-5 py-3">
          <Pagination {...pagination} />
        </div>
      )}
    </div>
  );
}
