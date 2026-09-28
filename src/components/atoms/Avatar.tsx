import { cn } from '@/lib/utils.ts';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-24 h-24 text-2xl',
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn(
          'rounded-full object-cover flex-shrink-0',
          sizes[size],
          className,
        )}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center flex-shrink-0 bg-brand-500 text-surface-950 font-display font-bold',
        sizes[size],
        className,
      )}
    >
      {getInitials(name || '?')}
    </div>
  );
}
