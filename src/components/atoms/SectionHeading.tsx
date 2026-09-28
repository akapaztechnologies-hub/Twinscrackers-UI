import { cn } from '@/lib/utils.ts';
import { motion } from 'framer-motion';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
  className?: string;
}

export function SectionHeading({ eyebrow, title, subtitle, align = 'center', className }: SectionHeadingProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      viewport={{ once: true, amount: 0.3 }}
      className={cn(
        'mb-12 lg:mb-16',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {eyebrow && (
        <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-brand-500">
          {eyebrow}
        </span>
      )}
      <h2
        className={cn(
          'font-display font-bold text-display-sm sm:text-display-md lg:text-display-lg text-balance',
          'text-surface-900 dark:text-surface-50',
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 max-w-2xl text-body-lg text-surface-500 dark:text-surface-400 mx-auto text-balance">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
