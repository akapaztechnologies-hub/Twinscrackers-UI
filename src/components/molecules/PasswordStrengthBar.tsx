import { useMemo } from 'react';
import { cn } from '@/lib/utils.ts';

interface PasswordStrengthBarProps {
  password: string;
}

function getStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

const levels = [
  { label: 'Too weak', color: 'bg-red-500' },
  { label: 'Weak', color: 'bg-orange-500' },
  { label: 'Fair', color: 'bg-amber-500' },
  { label: 'Good', color: 'bg-emerald-400' },
  { label: 'Strong', color: 'bg-emerald-500' },
];

export function PasswordStrengthBar({ password }: PasswordStrengthBarProps) {
  const strength = useMemo(() => getStrength(password), [password]);
  const level = levels[strength];

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i <= strength - 1 ? level.color : 'bg-surface-200 dark:bg-surface-700',
            )}
          />
        ))}
      </div>
      <p className={cn('mt-1 text-caption', strength <= 1 ? 'text-red-500' : strength <= 2 ? 'text-amber-500' : 'text-emerald-500')}>
        {level.label}
      </p>
    </div>
  );
}
