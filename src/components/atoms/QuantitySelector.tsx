import { Minus, Plus } from 'lucide-react';
import { QuantityInput } from '@/components/atoms/QuantityInput.tsx';
import { cn } from '@/lib/utils.ts';

interface QuantitySelectorProps {
  quantity: number;
  onChange: (quantity: number) => void;
  min?: number;
  max?: number;
  className?: string;
  /** Screen-reader name for the typed field, e.g. `Quantity for Lava (3 in 1)`. */
  label?: string;
}

export function QuantitySelector({
  quantity,
  onChange,
  min = 1,
  max = 99,
  className,
  label = 'Quantity',
}: QuantitySelectorProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-xl border border-surface-200 dark:border-surface-700',
        className,
      )}
    >
      <button
        onClick={() => onChange(Math.max(min, quantity - 1))}
        disabled={quantity <= min}
        className="flex items-center justify-center w-11 h-11 lg:w-9 lg:h-9 text-surface-500 hover:text-surface-900 dark:hover:text-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Decrease quantity"
      >
        <Minus size={16} />
      </button>
      {/* Typed rather than read-only: the buttons are for nudging a number,
          not for reaching 50 of something. It stays borderless so the pill
          around it still reads as one control. */}
      <QuantityInput
        value={quantity}
        onCommit={onChange}
        label={label}
        min={min}
        max={max}
        className="w-11 h-11 lg:w-10 lg:h-9 bg-transparent text-center text-body-sm font-semibold tabular-nums text-surface-900 dark:text-surface-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      />
      <button
        onClick={() => onChange(Math.min(max, quantity + 1))}
        disabled={quantity >= max}
        className="flex items-center justify-center w-11 h-11 lg:w-9 lg:h-9 text-surface-500 hover:text-surface-900 dark:hover:text-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Increase quantity"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
