import { useState } from 'react';
import { ChevronDown, Phone, Hash, IndianRupee, AlertCircle } from 'lucide-react';
import { Input } from '@/components/atoms/Input.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { claimPastOrder } from '@/services/auth.ts';
import { isValidPhone, PHONE_ERROR } from '@/lib/validation.ts';
import { cleanOrderNumber, parseOrderAmount } from '@/components/account/orderProof.ts';
import { cn } from '@/lib/utils.ts';
import type { Order } from '@/types/index.ts';

/**
 * "Ordered as a guest before? Add a past order."
 *
 * Creating an account from a guest order brings only that order (and any placed
 * on the same device) — proving one order must never unlock everything ever
 * placed on a phone number. Older guest orders come in one at a time, each
 * with its own proof: the phone it was placed with, its order number and the
 * amount it came to. The server limits how often that can be guessed and says
 * so when it refuses; its message is shown as written.
 *
 * Collapsed by default: most customers never need it.
 */
export function AddPastOrderForm({ onAdded }: { onAdded: (order: Order) => void }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Checked here first, so a slip does not spend one of the limited tries.
    if (!isValidPhone(phone)) {
      setError(PHONE_ERROR);
      return;
    }
    if (!cleanOrderNumber(orderNumber)) {
      setError('Enter the order number from your order confirmation.');
      return;
    }
    const total = parseOrderAmount(amount);
    if (total === null) {
      setError('Enter the order amount, as shown on your order confirmation.');
      return;
    }

    setBusy(true);
    try {
      const order = await claimPastOrder({ phone: phone.trim(), orderNumber: cleanOrderNumber(orderNumber), amount: total });
      setPhone('');
      setOrderNumber('');
      setAmount('');
      setOpen(false);
      onAdded(order);
    } catch (err) {
      // 404 (no such order for that phone and amount) and 429 (too many tries)
      // both come with a sentence written for the customer.
      setError(err instanceof Error && err.message ? err.message : 'Could not add that order. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left text-body-sm font-medium text-surface-700 dark:text-surface-300"
      >
        <span>Ordered as a guest before? Add a past order</span>
        <ChevronDown size={16} className={cn('flex-shrink-0 text-surface-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <form onSubmit={submit} className="px-5 pb-5 space-y-4">
          <p className="text-caption text-surface-500 dark:text-surface-400">
            Enter the phone number you ordered with, and the order number and amount from that order's confirmation.
          </p>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-body-sm text-red-600 dark:text-red-400">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}
          <Input
            label="Phone number you ordered with"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            icon={<Phone size={18} />}
            placeholder="98765 43210"
            autoComplete="tel"
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Order number"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              icon={<Hash size={18} />}
              placeholder="ORD-2609-00020"
              autoComplete="off"
              required
            />
            <Input
              label="Order amount (₹)"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              icon={<IndianRupee size={18} />}
              placeholder="2,450"
              autoComplete="off"
              required
            />
          </div>
          <Button type="submit" size="sm" isLoading={busy}>
            Add order
          </Button>
        </form>
      )}
    </div>
  );
}
