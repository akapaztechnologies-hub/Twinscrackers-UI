import { cn } from '@/lib/utils.ts';
import { getStarArray } from '@/lib/utils.ts';
import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number;
  reviewCount?: number;
  size?: 'sm' | 'md';
  showCount?: boolean;
  className?: string;
}

export function StarRating({ rating, reviewCount, size = 'sm', showCount = true, className }: StarRatingProps) {
  const stars = getStarArray(rating);
  const iconSize = size === 'sm' ? 14 : 18;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex items-center">
        {stars.map((type, i) => (
          <Star
            key={i}
            size={iconSize}
            className={cn(
              type === 'full' && 'fill-brand-500 text-brand-500',
              type === 'half' && 'fill-brand-500/50 text-brand-500',
              type === 'empty' && 'fill-surface-300 text-surface-300 dark:fill-surface-700 dark:text-surface-700',
            )}
          />
        ))}
      </div>
      {showCount && reviewCount !== undefined && (
        <span className="text-body-sm text-surface-500 dark:text-surface-400">
          ({reviewCount.toLocaleString()})
        </span>
      )}
    </div>
  );
}
