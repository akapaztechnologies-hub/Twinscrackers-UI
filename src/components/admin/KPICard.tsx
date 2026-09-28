import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import { SkeletonLine } from './Skeleton.tsx';

interface KPICardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  href?: string;
  change?: number;
  isLoading?: boolean;
}

export function KPICard({ label, value, icon: Icon, color, href, change, isLoading }: KPICardProps) {
  const card = (
    <div
      className={cn(
        'bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-3 transition-colors',
        href && 'hover:border-brand-500/30 group cursor-pointer',
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
          <Icon size={18} />
        </div>
        {isLoading ? (
          <div className="flex-1 space-y-1.5">
            <SkeletonLine className="h-5 w-16" />
            <SkeletonLine className="h-3 w-12" />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-body-lg text-surface-900 dark:text-surface-50 truncate">
              {value}
            </p>
            <p className={cn('text-caption text-surface-500 truncate', href && 'group-hover:text-brand-600 transition-colors')}>
              {label}
            </p>
          </div>
        )}
        {change !== undefined && !isLoading && (
          <div
            className={cn(
              'flex items-center gap-0.5 text-caption font-medium px-1.5 py-0.5 rounded-md flex-shrink-0',
              change >= 0
                ? 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-500/10'
                : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10',
            )}
          >
            {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link to={href}>{card}</Link>;
  }
  return card;
}
