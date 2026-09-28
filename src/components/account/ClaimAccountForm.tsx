import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Hash, IndianRupee, Mail, Lock, AlertCircle } from 'lucide-react';
import { Input } from '@/components/atoms/Input.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { useAuthStore } from '@/store/auth.ts';
import { claimGuestAccount } from '@/services/auth.ts';
import { ApiRequestError } from '@/lib/api.ts';
import { isValidEmail, isValidPhone, EMAIL_ERROR, PHONE_ERROR } from '@/lib/validation.ts';
import { cleanOrderNumber, parseOrderAmount } from '@/components/account/orderProof.ts';
import type { UserProfile } from '@/types/index.ts';

/**
 * "Make the order I placed as a guest into an account."
 *
 * A phone number alone is not proof of anything, so the form also asks for
 * something only the person who placed the order has in front of them: its
 * order number and the amount it came to. The server checks the pair and limits
 * how many times it can be guessed.
 *
 * Proving one order unlocks only that order — never everything ever placed on
 * that phone number, which is what let a made-up "proof" order open somebody
 * else's history. The new account holds this order plus any placed on this
 * device; older ones are added one at a time, each with its own proof, from My
 * Orders. The help text says so, so nobody expects their whole history at once.
 *
 * Used on the order confirmation page (pre-filled — that visitor has the
 * order on screen already) and on its own page for anyone coming back later.
 */
export interface ClaimAccountDefaults {
  phone?: string;
  orderNumber?: string;
  amount?: number;
}

export function ClaimAccountForm({
  defaults,
  onClaimed,
  onCancel,
}: {
  defaults?: ClaimAccountDefaults;
  /** Called once the account exists and the customer is signed in to it. */
  onClaimed: (user: UserProfile) => void;
  onCancel?: () => void;
}) {
  const setUser = useAuthStore((s) => s.setUser);
  const [phone, setPhone] = useState(defaults?.phone ?? '');
  const [orderNumber, setOrderNumber] = useState(defaults?.orderNumber ?? '');
  const [amount, setAmount] = useState(defaults?.amount ? String(defaults.amount) : '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** The email already has an account — the answer is to sign in, not retry. */
  const [emailTaken, setEmailTaken] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailTaken(false);

    // Checked here as well as on the server, so a slip comes back as a
    // sentence — and does not spend one of the limited tries.
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
    if (!isValidEmail(email)) {
      setError(EMAIL_ERROR);
      return;
    }
    if (password.length < 8) {
      setError('Choose a password of at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      const result = await claimGuestAccount({
        phone: phone.trim(),
        orderNumber: cleanOrderNumber(orderNumber),
        amount: total,
        email: email.trim(),
        password,
      });
      setUser(result.user);
      onClaimed(result.user);
    } catch (err) {
      // Only the "email already used" 409 gets the sign-in banner. The other 409
      // — the order was claimed by someone else a moment ago, and the account
      // just made has been removed — says what happened in its own words.
      if (err instanceof ApiRequestError && err.status === 409 && /email/i.test(err.message)) {
        setEmailTaken(true);
      } else {
        setError(err instanceof Error ? err.message : 'Could not create the account. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-body-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}
      {emailTaken && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-body-sm text-amber-700 dark:text-amber-300">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            That email already has an account —{' '}
            {/* Straight to My Orders afterwards, where "Add a past order" is. */}
            <Link to="/login" state={{ from: '/account/orders' }} className="font-semibold underline underline-offset-2">
              sign in
            </Link>
            , then add this order from My Orders.
          </span>
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
      <p className="-mt-2 text-caption text-surface-500 dark:text-surface-400">
        You'll find the order number and amount on your order confirmation. Creating your account adds this order
        (and any orders placed on this device) to it. You can add older orders later from My Orders.
      </p>
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        icon={<Mail size={18} />}
        placeholder="you@example.com"
        autoComplete="email"
        required
      />
      <Input
        label="Choose a password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        icon={<Lock size={18} />}
        placeholder="At least 8 characters"
        autoComplete="new-password"
        required
      />

      <div className="flex items-center gap-3">
        <Button type="submit" isLoading={busy}>
          Create account
        </Button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 text-body-sm font-medium text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
