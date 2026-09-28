import { cn } from '@/lib/utils.ts';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <label className={cn('flex items-center justify-between gap-4 cursor-pointer', disabled && 'opacity-50 cursor-not-allowed')}>
      {(label || description) && (
        <div>
          {label && <p className="text-body-md font-medium text-surface-900 dark:text-surface-100">{label}</p>}
          {description && <p className="text-body-sm text-surface-500 dark:text-surface-400">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0',
          checked ? 'bg-brand-500' : 'bg-surface-300 dark:bg-surface-600',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </label>
  );
}
