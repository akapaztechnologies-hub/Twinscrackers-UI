import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils.ts';

interface AdminEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
  colSpan?: number;
  asTableRow?: boolean;
}

export function AdminEmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
  colSpan,
  asTableRow,
}: AdminEmptyStateProps) {
  const content = (
    <div className={cn('flex flex-col items-center justify-center py-14 text-center', !asTableRow && className)}>
      <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
        {icon}
      </div>
      <p className="font-display font-semibold text-body-lg text-surface-900 dark:text-surface-50">
        {title}
      </p>
      {description && (
        <p className="mt-1.5 text-body-sm text-surface-500 max-w-xs">{description}</p>
      )}
      {actionLabel && actionHref && (
        <Link
          to={actionHref}
          className="mt-4 px-4 py-2 rounded-xl bg-brand-500 text-brand-on text-body-sm font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-xl bg-brand-500 text-brand-on text-body-sm font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );

  if (asTableRow) {
    return (
      <tr>
        <td colSpan={colSpan} className={className}>
          {content}
        </td>
      </tr>
    );
  }

  return content;
}
