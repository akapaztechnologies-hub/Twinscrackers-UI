import { cn } from '@/lib/utils.ts';

interface SkeletonProps {
  className?: string;
}

export function SkeletonLine({ className }: SkeletonProps) {
  return (
    <div className={cn('h-4 rounded-md bg-surface-200/70 dark:bg-surface-700/50 animate-pulse', className)} />
  );
}

export function SkeletonCircle({ className }: SkeletonProps) {
  return (
    <div className={cn('w-10 h-10 rounded-full bg-surface-200/70 dark:bg-surface-700/50 animate-pulse', className)} />
  );
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-5 space-y-3',
        className,
      )}
    >
      <SkeletonLine className="h-3 w-1/3" />
      <SkeletonLine className="h-7 w-1/2" />
      <SkeletonLine className="h-3 w-2/3" />
    </div>
  );
}

interface SkeletonTableRowProps {
  columns: number;
  rows?: number;
}

export function SkeletonTableRows({ columns, rows = 5 }: SkeletonTableRowProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={rowIdx} className="border-b border-surface-50 dark:border-surface-850 last:border-0">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <td key={colIdx} className="px-5 py-3.5">
              <SkeletonLine
                className={cn(
                  'h-4',
                  colIdx === 0 ? 'w-24' : colIdx === columns - 1 ? 'w-10' : 'w-20',
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
