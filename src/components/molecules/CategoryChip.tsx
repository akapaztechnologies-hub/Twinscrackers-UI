import { cn } from '@/lib/utils.ts';

interface CategoryChipProps {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

export function CategoryChip({ label, count, isActive, onClick }: CategoryChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-5 py-2.5 rounded-full',
        'text-body-sm font-medium whitespace-nowrap',
        'border transition-all duration-200',
        isActive
          ? 'bg-brand-500 text-brand-on border-brand-500 shadow-glow'
          : 'bg-white dark:bg-surface-900 text-surface-600 dark:text-surface-400 border-surface-200 dark:border-surface-700 hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400',
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'text-caption font-bold px-1.5 py-0.5 rounded-full',
          isActive
            ? 'bg-surface-950/20 text-surface-950'
            : 'bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400',
        )}
      >
        {count}
      </span>
    </button>
  );
}
