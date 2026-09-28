import { cn } from '@/lib/utils.ts';
import type { ProductBadge } from '@/types/index.ts';

interface BadgeProps {
  type: ProductBadge;
  className?: string;
}

const badgeConfig: Record<ProductBadge, { label: string; className: string }> = {
  new: {
    label: 'NEW',
    className: 'bg-blue-500 text-white',
  },
  bestseller: {
    label: 'BEST SELLER',
    className: 'bg-brand-500 text-surface-950',
  },
  limited: {
    label: 'LIMITED',
    className: 'bg-red-600 text-white animate-pulse-soft',
  },
  premium: {
    label: 'PREMIUM',
    className: 'bg-surface-900 text-brand-400 border border-brand-500/30 dark:bg-surface-0 dark:text-surface-900',
  },
  'low-noise': {
    label: 'LOW NOISE',
    className: 'bg-emerald-500 text-white',
  },
};

export function Badge({ type, className }: BadgeProps) {
  const config = badgeConfig[type];
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-lg text-label font-bold uppercase tracking-wider',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
