import { useState } from 'react';
import { BellRing, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/atoms/Button.tsx';
import { useAuthStore } from '@/store/auth.ts';
import api from '@/lib/api.ts';
import { realEmail } from '@/components/guestEmail.ts';

/**
 * "Tell me when this is back."
 *
 * An out-of-stock product page is the one place on this site where a customer
 * wants something the shop cannot sell them — and until now the only thing
 * offered was a disabled button. This takes an address or a number instead, so
 * the restock has somebody to tell.
 *
 * A signed-in customer needs to type nothing: their account already carries
 * both. Everyone else gets one field, because asking a stranger for two is how
 * you get neither.
 */
export function BackInStockNotify({ slug, productName }: { slug: string; productName: string }) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // A guest's account carries a placeholder address that can never receive
  // mail — alerting it would promise an email that never comes. Such a customer
  // is asked for a contact like anyone signed out.
  const accountEmail = realEmail(user?.email);

  const submit = async () => {
    setError('');
    const value = accountEmail || contact.trim();
    // Ten digits is a phone; anything with an @ is an address. Guessing from
    // the shape beats making the customer pick from a dropdown first.
    const isPhone = /^\d{10}$/.test(value);
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

    if (!isPhone && !isEmail) {
      setError('Enter your email or a 10-digit phone number.');
      return;
    }

    setIsSaving(true);
    try {
      await api.post(`/products/${slug}/stock-alert`, isPhone ? { phone: value } : { email: value });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-body-sm font-medium">
        <Check size={17} />
        We'll tell you as soon as {productName} is back.
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="outline" size="lg" fullWidth onClick={() => setOpen(true)}>
        <BellRing size={18} />
        Notify me when it's back
      </Button>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900">
      <p className="text-body-sm font-medium text-surface-900 dark:text-surface-50">
        We'll let you know the moment it returns.
      </p>

      {!accountEmail && (
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Email or 10-digit phone"
          autoFocus
          className="input-field mt-3"
        />
      )}

      {error && <p className="mt-2 text-body-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <Button onClick={submit} disabled={isSaving}>
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Notify me'}
        </Button>
        <button
          onClick={() => setOpen(false)}
          className="text-body-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
