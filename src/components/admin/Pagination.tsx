import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import { Select } from '@/components/atoms/Select.tsx';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
}

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

export function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  const pages = getPageNumbers(currentPage, totalPages);

  if (totalItems === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <p className="text-body-sm text-surface-500">
        Showing <span className="font-medium text-surface-700 dark:text-surface-300">{startItem}–{endItem}</span> of{' '}
        <span className="font-medium text-surface-700 dark:text-surface-300">{totalItems}</span>
      </p>

      <div className="flex items-center gap-3">
        <Select
          value={String(itemsPerPage)}
          onChange={(v) => onItemsPerPageChange(Number(v))}
          options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: `${n} / page` }))}
          size="sm"
          fullWidth={false}
        />

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>

          {pages.map((page, i) =>
            page === 'ellipsis' ? (
              <span key={`e${i}`} className="w-8 text-center text-body-sm text-surface-400">...</span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={cn(
                  'min-w-[32px] h-8 rounded-lg text-body-sm font-medium transition-colors',
                  page === currentPage
                    ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800',
                )}
              >
                {page}
              </button>
            ),
          )}

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
