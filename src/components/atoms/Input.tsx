import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';

    return (
      <div className="w-full">
        {label && (
          <label className="block mb-1.5 text-body-sm font-medium text-surface-700 dark:text-surface-300">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            type={isPassword && showPassword ? 'text' : type}
            className={cn(
              'w-full px-4 py-3 rounded-xl text-body-md',
              'bg-white dark:bg-surface-850',
              'border text-surface-900 dark:text-surface-100',
              'placeholder:text-surface-400 dark:placeholder:text-surface-500',
              'focus:outline-none focus:ring-1 transition-colors',
              error
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-surface-200 dark:border-surface-700 focus:border-brand-500 focus:ring-brand-500',
              icon ? 'pl-11' : '',
              isPassword ? 'pr-11' : '',
              className,
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>
        {error && (
          <p className="mt-1 text-caption text-red-500">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
