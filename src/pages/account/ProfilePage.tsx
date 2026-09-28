import { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, CheckCircle } from 'lucide-react';
import { Avatar } from '@/components/atoms/Avatar.tsx';
import { Input } from '@/components/atoms/Input.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { useAuthStore } from '@/store/auth.ts';
import { updateUserProfile } from '@/services/firestore.ts';
import { isValidPhone, PHONE_ERROR } from '@/lib/validation.ts';
import { realEmail } from '@/components/guestEmail.ts';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [form, setForm] = useState({
    displayName: user?.displayName ?? '',
    phone: user?.phone ?? '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [errors, setErrors] = useState<{ displayName?: string; phone?: string }>({});
  const [saveError, setSaveError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name as keyof typeof prev] ? { ...prev, [name]: undefined } : prev));
    setIsSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // The phone is optional, but a number that is present must be usable — this
    // is the number the shop calls about an order.
    const next: typeof errors = {};
    if (form.displayName.trim().length < 2) next.displayName = 'Enter your name';
    if (form.phone.trim() && !isValidPhone(form.phone)) next.phone = PHONE_ERROR;
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setErrors({});
    setSaveError('');
    setIsLoading(true);
    try {
      await updateUserProfile(user.uid, { displayName: form.displayName, phone: form.phone });
      setUser({ ...user, displayName: form.displayName, phone: form.phone });
      setIsSaved(true);
    } catch (err) {
      // Previously swallowed, so a rejected save looked identical to a successful
      // one — the form simply stopped, with no "Saved" and no explanation.
      setSaveError(err instanceof Error ? err.message : 'Could not save your profile');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50 mb-6">
        Personal Information
      </h2>

      <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 lg:p-8 border border-surface-200 dark:border-surface-800">
        {/* Avatar */}
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-surface-100 dark:border-surface-800">
          <Avatar src={user?.photoURL} name={user?.displayName ?? 'U'} size="xl" />
          <div>
            <p className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">
              {user?.displayName || 'User'}
            </p>
            <p className="text-body-sm text-surface-400">
              Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '—'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
          <Input
            label="Full Name"
            name="displayName"
            value={form.displayName}
            onChange={handleChange}
            placeholder="Your name"
            error={errors.displayName}
          />
          <Input
            label="Email"
            value={realEmail(user?.email)}
            disabled
            className="opacity-60 cursor-not-allowed"
          />
          <Input
            label="Phone"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={handleChange}
            placeholder="+91 98765 43210"
            inputMode="numeric"
            error={errors.phone}
          />

          {saveError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
              {saveError}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" size="lg" isLoading={isLoading}>
              <Save size={18} />
              Save Changes
            </Button>
            {isSaved && (
              <span className="flex items-center gap-1.5 text-body-sm text-emerald-500 font-medium">
                <CheckCircle size={16} /> Saved
              </span>
            )}
          </div>
        </form>
      </div>
    </motion.div>
  );
}
