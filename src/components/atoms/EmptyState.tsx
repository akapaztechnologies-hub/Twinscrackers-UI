import { cn } from '@/lib/utils.ts';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="w-20 h-20 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">
        {title}
      </h3>
      {description && (
        <p className="mt-2 text-body-md text-surface-500 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
