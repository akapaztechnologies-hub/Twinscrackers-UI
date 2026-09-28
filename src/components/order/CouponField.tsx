import { useState, useEffect, useRef } from 'react';
import { Ticket, X, Check, Loader2 } from 'lucide-react';
import { validateCoupon } from '@/services/coupons.ts';
import { formatPrice } from '@/lib/utils.ts';
import type { AppliedCoupon } from '@/types/coupon.ts';

interface CouponFieldProps {
  items: { productId: string; quantity: number }[];
  applied: AppliedCoupon | null;
  onApply: (coupon: AppliedCoupon | null) => void;
  /** Auto-fill and submit this code once — from a `?coupon=` link in an influencer bio. */
  autoCode?: string;
}

/**
 * Coupon entry for the order summary.
 *
 * Only ever sends the CODE. The discount that comes back is the server's
 * decision and is used for display alone — checkout re-sends the code, and the
 * server prices it again against the real cart before charging anything.
 */
export function CouponField({ items, applied, onApply, autoCode }: CouponFieldProps) {
  const [code, setCode] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState('');
  const autoTried = useRef('');

  const submit = async (raw: string) => {
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed) {
      setError('Enter a coupon code');
      return;
    }
    if (items.length === 0) {
      setError('Add something to your cart first');
      return;
    }
    setIsChecking(true);
    setError('');
    try {
      const result = await validateCoupon(trimmed, items);
      onApply(result);
      setCode('');
    } catch (err) {
      onApply(null);
      setError((err as Error).message);
    } finally {
      setIsChecking(false);
    }
  };

  // A code arriving in the URL is applied once, silently — a shopper who clicked
  // an influencer's link should see the discount already on, not a form to fill.
  useEffect(() => {
    if (!autoCode || applied || items.length === 0) return;
    if (autoTried.current === autoCode) return;
    autoTried.current = autoCode;
    void submit(autoCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCode, items.length]);

  // The discount depends on the cart, so a cart edit invalidates the quote.
  // Re-check silently and drop the coupon if it no longer qualifies.
  const appliedCode = applied?.code;
  const cartKey = items.map((i) => `${i.productId}:${i.quantity}`).join(',');
  const lastCartKey = useRef(cartKey);
  useEffect(() => {
    if (lastCartKey.current === cartKey) return;
    lastCartKey.current = cartKey;
    if (!appliedCode) return;
    if (items.length === 0) {
      onApply(null);
      return;
    }
    // Only the newest check may speak. Two quick cart edits sent two checks,
    // and whichever answered last won — possibly the older cart's discount; a
    // check still in flight when the customer removed the coupon put it back.
    // Removing the coupon or editing the cart again re-runs this, which
    // cancels the one in flight.
    let cancelled = false;
    validateCoupon(appliedCode, items)
      .then((result) => {
        if (!cancelled) onApply(result);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        onApply(null);
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, appliedCode]);

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
        <div className="flex items-center gap-2 min-w-0">
          <Check size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0">
            <p className="font-mono font-bold text-body-sm tracking-wider text-emerald-700 dark:text-emerald-300">
              {applied.code}
            </p>
            <p className="text-caption text-emerald-600/80 dark:text-emerald-400/80 truncate">
              {formatPrice(applied.discount)} off{applied.description ? ` · ${applied.description}` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onApply(null);
            setError('');
          }}
          className="shrink-0 p-1.5 rounded-lg text-emerald-700/70 dark:text-emerald-400/70 hover:bg-emerald-500/10 transition-colors"
          aria-label="Remove coupon"
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Ticket size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (error) setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit(code);
              }
            }}
            placeholder="Coupon code"
            maxLength={32}
            className="w-full pl-9 pr-3 h-10 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm font-mono tracking-wider uppercase text-surface-900 dark:text-surface-100 placeholder:font-sans placeholder:tracking-normal placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow"
          />
        </div>
        <button
          type="button"
          onClick={() => void submit(code)}
          disabled={isChecking}
          className="shrink-0 px-4 h-10 rounded-xl border border-surface-300 dark:border-surface-600 text-body-sm font-semibold text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-50 transition-colors"
        >
          {isChecking ? <Loader2 size={16} className="animate-spin" /> : 'Apply'}
        </button>
      </div>
      {error && <p className="mt-1.5 text-caption text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
