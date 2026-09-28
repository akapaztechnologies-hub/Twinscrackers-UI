import { useThemeStore } from '@/store/theme.ts';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useThemeStore();

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'relative flex items-center justify-center w-10 h-10 rounded-xl',
        'text-surface-600 dark:text-surface-400',
        'hover:bg-surface-100 dark:hover:bg-surface-800',
        'transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        className,
      )}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <Sun
        size={20}
        className={cn(
          'absolute transition-all duration-300',
          theme === 'dark' ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0',
        )}
      />
      <Moon
        size={20}
        className={cn(
          'absolute transition-all duration-300',
          theme === 'light' ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0',
        )}
      />
    </button>
  );
}
