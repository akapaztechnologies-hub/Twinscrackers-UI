import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils.ts';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    // text-brand-on, not a fixed colour: the accent is admin-configurable, and
    // dark ink on gold (9:1) is the same choice that makes navy unreadable
    // (1.8:1). The token flips with the palette.
    'bg-brand-500 text-brand-on hover:bg-brand-400 active:bg-brand-600 shadow-glow hover:shadow-glow-lg',
  secondary:
    'bg-surface-200 text-surface-900 hover:bg-surface-300 dark:bg-surface-800 dark:text-surface-100 dark:hover:bg-surface-700',
  ghost:
    'bg-transparent text-surface-700 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800',
  outline:
    'border-2 border-surface-300 text-surface-700 hover:border-brand-500 hover:text-brand-500 dark:border-surface-700 dark:text-surface-300 dark:hover:border-brand-500 dark:hover:text-brand-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-body-sm',
  md: 'px-6 py-2.5 text-body-md',
  lg: 'px-8 py-3 text-body-lg font-semibold',
  xl: 'px-10 py-4 text-body-lg font-bold',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, fullWidth, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl font-medium',
          'transition-all duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
          'dark:focus-visible:ring-offset-surface-950',
          'active:scale-[0.97]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className,
        )}
        {...props}
      >
        {isLoading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
