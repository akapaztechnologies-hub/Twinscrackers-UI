import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, MessageCircle, CheckCircle } from 'lucide-react';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import { useAuthStore } from '@/store/auth.ts';
import { getNotificationPrefs, updateNotificationPrefs } from '@/services/firestore.ts';
import type { NotificationPreferences } from '@/types/index.ts';

/**
 * What the shop is allowed to send this customer.
 *
 * Only the two channels that exist are offered. The screen used to carry SMS
 * and browser-push switches as well, neither of which anything read — there is
 * no SMS sender and no service worker — and a switch that changes nothing is
 * worse than no switch at all, because the customer believes they have turned
 * something off.
 */

const defaultPrefs: NotificationPreferences = {
  emailOrderUpdates: true,
  emailPromotions: false,
  whatsappOrderUpdates: true,
};

export function NotificationsPage() {
  const user = useAuthStore((s) => s.user);
  const [prefs, setPrefs] = useState<NotificationPreferences>(defaultPrefs);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    getNotificationPrefs(user.uid)
      .then((saved) => setPrefs({ ...defaultPrefs, ...saved }))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [user]);

  const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    setIsSaved(false);
    if (!user) return;
    try {
      await updateNotificationPrefs(user.uid, { [key]: value });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch {
      // Put the switch back. Leaving it flipped tells the customer a change
      // was saved that the server never accepted.
      setPrefs(previous);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
          Notifications
        </h2>
        {isSaved && (
          <span className="flex items-center gap-1.5 text-body-sm text-emerald-500 font-medium">
            <CheckCircle size={16} /> Saved
          </span>
        )}
      </div>

      <div className="space-y-6">
        <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 border border-surface-200 dark:border-surface-800">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <MessageCircle size={20} className="text-green-600" />
            </div>
            <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">
              WhatsApp
            </h3>
          </div>
          <Toggle
            label="Order updates"
            description="A message when your order is confirmed, packed, sent and delivered — on the number you ordered with."
            checked={prefs.whatsappOrderUpdates}
            onChange={(v) => handleToggle('whatsappOrderUpdates', v)}
          />
        </div>

        <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 border border-surface-200 dark:border-surface-800">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Mail size={20} className="text-blue-500" />
            </div>
            <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">
              Email
            </h3>
          </div>
          <div className="space-y-4">
            <Toggle
              label="Order updates"
              description="Your order confirmation, invoice and delivery updates."
              checked={prefs.emailOrderUpdates}
              onChange={(v) => handleToggle('emailOrderUpdates', v)}
            />
            <Toggle
              label="Offers and new arrivals"
              description="Occasional mail about festive offers and new combo packs. Off unless you ask for it."
              checked={prefs.emailPromotions}
              onChange={(v) => handleToggle('emailPromotions', v)}
            />
          </div>
        </div>

        <p className="text-body-sm text-surface-500 dark:text-surface-400">
          Messages about a payment that needs checking are always sent — turning these off never
          stops us telling you something is wrong with an order.
        </p>
      </div>
    </motion.div>
  );
}
