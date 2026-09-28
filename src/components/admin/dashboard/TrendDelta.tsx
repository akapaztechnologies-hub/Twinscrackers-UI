import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

interface TrendDeltaProps {
  changePct: number | null;
  label?: string;
  className?: string;
}

function formatPct(changePct: number): string {
  const fixed = Math.abs(changePct).toFixed(1);
  return `${fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed}%`;
}

export function TrendDelta({ changePct, label, className }: TrendDeltaProps) {
  // No honest prior-period comparison => render nothing at all.
  if (changePct === null || !Number.isFinite(changePct)) return null;

  const isUp = changePct >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <div className={cn('flex items-center gap-1.5 min-w-0', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-0.5 text-caption font-semibold tabular-nums flex-shrink-0',
          isUp
            ? 'text-green-600 dark:text-green-400'
            : 'text-red-600 dark:text-red-400',
        )}
      >
        <Icon size={13} strokeWidth={2.5} aria-hidden="true" />
        <span className="sr-only">{isUp ? 'Up' : 'Down'}</span>
        {formatPct(changePct)}
      </span>
      {label && <span className="text-caption text-surface-400 truncate">{label}</span>}
    </div>
  );
}
