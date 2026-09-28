
import { cn } from '@/lib/utils.ts';

type StatusType = 'order' | 'product' | 'stock' | 'role' | 'payment' | 'user' | 'enquiry';

const orderColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  confirmed: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  processing: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
  shipped: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  delivered: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  cancelled: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};

const orderDots: Record<string, string> = {
  pending: 'bg-amber-500',
  confirmed: 'bg-blue-500',
  processing: 'bg-cyan-500',
  shipped: 'bg-purple-500',
  delivered: 'bg-green-500',
  cancelled: 'bg-red-500',
};

const productColors: Record<string, string> = {
  active: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  inactive: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};

const productDots: Record<string, string> = {
  active: 'bg-green-500',
  inactive: 'bg-red-500',
};

const stockColors: Record<string, string> = {
  'in-stock': 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  'low-stock': 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  'out-of-stock': 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};

const stockDots: Record<string, string> = {
  'in-stock': 'bg-green-500',
  'low-stock': 'bg-amber-500',
  'out-of-stock': 'bg-red-500',
};

const roleColors: Record<string, string> = {
  admin: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  user: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
};

const roleDots: Record<string, string> = {
  admin: 'bg-purple-500',
  user: 'bg-surface-400',
};

const paymentColors: Record<string, string> = {
  paid: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  // A claimed-but-unchecked payment needs its own colour: it is neither money in
  // the bank nor an unpaid order, and mistaking it for either costs real money.
  awaiting_verification: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  failed: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  // A paid order that was cancelled: the customer is owed their money back by
  // hand. A warning, because until someone pays it out it is a debt.
  refund_due: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  refunded: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
};

const paymentDots: Record<string, string> = {
  paid: 'bg-green-500',
  pending: 'bg-amber-500',
  awaiting_verification: 'bg-orange-500',
  failed: 'bg-red-500',
  refund_due: 'bg-yellow-500',
  refunded: 'bg-purple-500',
};

/** Readable text for status values that don't survive a naive de-slugging. */
const labelOverrides: Record<string, string> = {
  awaiting_verification: 'Awaiting verification',
  refund_due: 'Refund due',
  upi_manual: 'UPI / Bank transfer',
  // `capitalize` plus a hyphen swap cannot fix an underscore, so this one needs
  // spelling out the same way the payment statuses do.
  in_progress: 'In progress',
};

const userColors: Record<string, string> = {
  active: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  inactive: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
};

const userDots: Record<string, string> = {
  active: 'bg-green-500',
  inactive: 'bg-surface-400',
};

/**
 * Storefront enquiries. One map covers both pipelines: contact messages
 * (new -> in progress -> resolved) and bulk quotes (new -> contacted -> quoted
 * -> won/lost). `won` borrows the same green as `resolved` because both mean
 * "finished well", and `lost` the same red as a cancelled order.
 */
const enquiryColors: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  in_progress: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
  contacted: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
  quoted: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  resolved: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  won: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  lost: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  spam: 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400',
  archived: 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400',
};

const enquiryDots: Record<string, string> = {
  new: 'bg-blue-500',
  in_progress: 'bg-cyan-500',
  contacted: 'bg-cyan-500',
  quoted: 'bg-violet-500',
  resolved: 'bg-green-500',
  won: 'bg-green-500',
  lost: 'bg-red-500',
  spam: 'bg-surface-400',
  archived: 'bg-surface-400',
};

function getColorMap(type: StatusType) {
  switch (type) {
    case 'order': return { colors: orderColors, dots: orderDots };
    case 'product': return { colors: productColors, dots: productDots };
    case 'stock': return { colors: stockColors, dots: stockDots };
    case 'role': return { colors: roleColors, dots: roleDots };
    case 'payment': return { colors: paymentColors, dots: paymentDots };
    case 'user': return { colors: userColors, dots: userDots };
    case 'enquiry': return { colors: enquiryColors, dots: enquiryDots };
  }
}

interface StatusBadgeProps {
  status: string;
  type: StatusType;
  className?: string;
}

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  const { colors, dots } = getColorMap(type);
  const colorClass = colors[status] ?? 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400';
  const dotClass = dots[status] ?? 'bg-surface-400';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-caption font-medium capitalize',
        colorClass,
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass)} />
      {labelOverrides[status] ?? status.replace('-', ' ')}
    </span>
  );
}
