import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.ts';

interface ContainerProps {
  children: ReactNode;
  size?: 'full' | 'wide' | 'default' | 'narrow';
  className?: string;
  as?: 'div' | 'section' | 'main' | 'article';
}

const sizeClasses: Record<string, string> = {
  full: 'max-w-container',
  wide: 'max-w-content',
  default: 'max-w-content',
  narrow: 'max-w-narrow',
};

export function Container({ children, size = 'default', className, as: Tag = 'div' }: ContainerProps) {
  return (
    <Tag
      className={cn(
        'mx-auto w-full px-4 sm:px-6 lg:px-8 xl:px-12',
        sizeClasses[size],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
