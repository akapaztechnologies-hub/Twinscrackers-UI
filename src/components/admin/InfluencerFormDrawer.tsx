import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X } from 'lucide-react';
import { Select } from '@/components/atoms/Select.tsx';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import { createInfluencer, updateInfluencer, getInfluencerById } from '@/services/coupons.ts';
import { INFLUENCER_PLATFORMS, type InfluencerPlatform } from '@/types/coupon.ts';

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

const errorClass = 'mt-1.5 text-caption text-red-600 dark:text-red-400';

/** Indian mobile: 10 digits starting 6-9. Blank is fine — a phone is optional. */
function phoneError(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length !== 10) return 'A mobile number is 10 digits';
  if (!/^[6-9]/.test(digits)) return 'An Indian mobile number starts with 6, 7, 8 or 9';
  return '';
}

function emailError(raw: string): string {
  if (!raw.trim()) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim()) ? '' : 'Enter a valid email address';
}

type FormData = {
  name: string;
  phone: string;
  email: string;
  instagram: string;
  platform: InfluencerPlatform;
  followers: string;
  commissionPercent: string;
  notes: string;
  isActive: boolean;
};

const emptyForm: FormData = {
  name: '',
  phone: '',
  email: '',
  instagram: '',
  platform: 'instagram',
  followers: '',
  commissionPercent: '5',
  notes: '',
  isActive: true,
};

interface InfluencerFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  influencerId: string | null;
  onSuccess: () => void;
}

export function InfluencerFormDrawer({
  isOpen,
  onClose,
  influencerId,
  onSuccess,
}: InfluencerFormDrawerProps) {
  const isEdit = !!influencerId;

  const [form, setForm] = useState<FormData>(emptyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setFieldErrors({});
    if (influencerId) {
      setIsLoading(true);
      getInfluencerById(influencerId)
        .then(({ influencer: i }) => {
          setForm({
            name: i.name,
            phone: i.phone,
            email: i.email,
            instagram: i.instagram,
            platform: i.platform,
            followers: i.followers ? String(i.followers) : '',
            commissionPercent: String(i.commissionPercent),
            notes: i.notes,
            isActive: i.isActive,
          });
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false));
    } else {
      setForm(emptyForm);
    }
  }, [isOpen, influencerId]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear a field's error as soon as it is edited — re-checked on submit.
    setFieldErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: '' } : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (form.name.trim().length < 2) errors.name = 'Enter the full name';
    const phoneMsg = phoneError(form.phone);
    if (phoneMsg) errors.phone = phoneMsg;
    const emailMsg = emailError(form.email);
    if (emailMsg) errors.email = emailMsg;
    const commission = Number(form.commissionPercent);
    if (form.commissionPercent !== '' && (!Number.isFinite(commission) || commission < 0 || commission > 100)) {
      errors.commissionPercent = 'Commission must be between 0 and 100';
    }
    const followers = Number(form.followers);
    if (form.followers !== '' && (!Number.isFinite(followers) || followers < 0)) {
      errors.followers = 'Enter a valid follower count';
    }

    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        // Sent as the bare 10 digits the server stores and matches on.
        phone: form.phone.replace(/\D/g, '').slice(-10),
        email: form.email.trim(),
        instagram: form.instagram.trim(),
        platform: form.platform,
        followers: Number(form.followers) || 0,
        commissionPercent: Number(form.commissionPercent) || 0,
        notes: form.notes.trim(),
        isActive: form.isActive,
      };
      if (isEdit && influencerId) await updateInfluencer(influencerId, payload);
      else await createInfluencer(payload);
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/60"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 z-[101] w-full max-w-lg bg-white dark:bg-surface-900 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-5 border-b border-surface-200 dark:border-surface-800">
              <h2 className="font-display font-semibold text-heading-sm text-surface-900 dark:text-surface-50">
                {isEdit ? 'Edit Influencer' : 'Add Influencer'}
              </h2>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-10 h-10 rounded-xl text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
                </div>
              ) : (
                <form id="influencer-form" onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
                      {error}
                    </div>
                  )}

                  <div>
                    <label className={labelClass}>Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                      className={inputClass}
                      placeholder="e.g., Rahul Kumar"
                      maxLength={80}
                    />
                    {fieldErrors.name && <p className={errorClass}>{fieldErrors.name}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Phone</label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={form.phone}
                        // Typing is restricted to 10 digits rather than merely
                        // rejected on submit — the field cannot hold a number
                        // that is not dialable in the first place.
                        onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className={inputClass}
                        placeholder="9876543210"
                        maxLength={10}
                      />
                      {fieldErrors.phone && <p className={errorClass}>{fieldErrors.phone}</p>}
                    </div>
                    <div>
                      <label className={labelClass}>Email</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => set('email', e.target.value)}
                        className={inputClass}
                        placeholder="optional"
                      />
                      {fieldErrors.email && <p className={errorClass}>{fieldErrors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Platform</label>
                      <Select
                        value={form.platform}
                        onChange={(v) => set('platform', v as InfluencerPlatform)}
                        options={INFLUENCER_PLATFORMS}
                        size="md"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Handle</label>
                      <input
                        type="text"
                        value={form.instagram}
                        onChange={(e) => set('instagram', e.target.value)}
                        className={inputClass}
                        placeholder="@handle or profile link"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Followers</label>
                      <input
                        type="number"
                        value={form.followers}
                        onChange={(e) => set('followers', e.target.value)}
                        className={inputClass}
                        min="0"
                        placeholder="optional"
                      />
                      {fieldErrors.followers && <p className={errorClass}>{fieldErrors.followers}</p>}
                    </div>
                    <div>
                      <label className={labelClass}>Commission (%)</label>
                      <input
                        type="number"
                        value={form.commissionPercent}
                        onChange={(e) => set('commissionPercent', e.target.value)}
                        className={inputClass}
                        min="0"
                        max="100"
                        step="0.5"
                      />
                      {fieldErrors.commissionPercent && (
                        <p className={errorClass}>{fieldErrors.commissionPercent}</p>
                      )}
                    </div>
                  </div>
                  <p className="-mt-2 text-caption text-surface-500 dark:text-surface-400">
                    Commission is worked out on net sales — the cart value after their discount,
                    before shipping.
                  </p>

                  <div>
                    <label className={labelClass}>Notes</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => set('notes', e.target.value)}
                      className={`${inputClass} resize-none`}
                      rows={3}
                      placeholder="Deal terms, posting schedule, anything worth remembering"
                      maxLength={500}
                    />
                  </div>

                  <Toggle
                    checked={form.isActive}
                    onChange={(v) => set('isActive', v)}
                    label="Active"
                    description="Turn off when the collaboration ends"
                  />
                </form>
              )}
            </div>

            <div className="p-5 border-t border-surface-200 dark:border-surface-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-10 rounded-xl border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors"
              >
                Cancel
              </button>
              <button
                form="influencer-form"
                type="submit"
                disabled={isSaving || isLoading}
                className="flex items-center gap-2 px-4 h-10 rounded-xl bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : isEdit ? 'Update' : 'Add Influencer'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
