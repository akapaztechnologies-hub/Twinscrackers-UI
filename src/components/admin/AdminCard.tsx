import { cn } from '@/lib/utils.ts';

interface AdminCardProps {
  title?: string;
  titleAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}

export function AdminCard({ title, titleAction, children, className, bodyClassName, noPadding }: AdminCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800',
        className,
      )}
    >
      {title && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-800">
          <h2 className="font-display font-semibold text-body-lg text-surface-900 dark:text-surface-50">
            {title}
          </h2>
          {titleAction}
        </div>
      )}
      <div className={cn('flex-1', !noPadding && 'p-5', bodyClassName)}>
        {children}
      </div>
    </div>
  );
}
