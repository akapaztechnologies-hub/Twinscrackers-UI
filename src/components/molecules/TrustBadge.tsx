import { motion } from 'framer-motion';
import { cn } from '@/lib/utils.ts';

interface TrustBadgeProps {
  label: string;
  value: string;
  index?: number;
}

export function TrustBadge({ label, value, index = 0 }: TrustBadgeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      viewport={{ once: true }}
      className={cn(
        'flex flex-col items-center text-center px-6 py-4',
        'border-r border-surface-200 dark:border-surface-800 last:border-0',
      )}
    >
      <span className="font-display font-bold text-heading-md lg:text-heading-lg text-brand-500">
        {value}
      </span>
      <span className="mt-1 text-body-sm text-surface-500 dark:text-surface-400">
        {label}
      </span>
    </motion.div>
  );
}
