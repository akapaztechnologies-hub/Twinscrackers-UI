import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X, Ticket } from 'lucide-react';
import { Select } from '@/components/atoms/Select.tsx';
import { DatePicker } from '@/components/atoms/DatePicker.tsx';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import {
  createCoupon,
  updateCoupon,
  getCouponById,
  getInfluencers,
} from '@/services/coupons.ts';
import type { CouponDiscountType, Influencer } from '@/types/coupon.ts';
import { toIstDay } from '@/lib/comboWindow.ts';

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

const hintClass = 'mt-1.5 text-caption text-surface-500 dark:text-surface-400';

const errorClass = 'mt-1.5 text-caption text-red-600 dark:text-red-400';

type FormData = {
  code: string;
  description: string;
  influencer: string;
  discountType: CouponDiscountType;
  discountValue: string;
  maxDiscount: string;
  minOrderValue: string;
  usageLimit: string;
  perUserLimit: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  online: boolean;
  pos: boolean;
};

const emptyForm: FormData = {
  code: '',
  description: '',
  influencer: '',
  discountType: 'percent',
  discountValue: '10',
  maxDiscount: '0',
  minOrderValue: '0',
  usageLimit: '0',
  perUserLimit: '1',
  validFrom: '',
  validTo: '',
  isActive: true,
  online: true,
  pos: true,
};

/**
 * A stored instant back to the IST calendar day the admin picked.
 *
 * Not `iso.slice(0, 10)`: that reads the UTC date, and a day stored as its IST
 * start (18:30 UTC the evening before) would come back a day early — then be
 * saved a day early on the next edit.
 */
function toDateInput(iso: string | null): string {
  return toIstDay(iso);
}

interface CouponFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  couponId: string | null;
  onSuccess: () => void;
  /** Pre-select an influencer when opened from their page. */
  defaultInfluencerId?: string;
}

export function CouponFormDrawer({
  isOpen,
  onClose,
  couponId,
  onSuccess,
  defaultInfluencerId,
}: CouponFormDrawerProps) {
  const isEdit = !!couponId;

  const [form, setForm] = useState<FormData>(emptyForm);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setFieldErrors({});
    getInfluencers().then(setInfluencers).catch(() => setInfluencers([]));

    if (couponId) {
      setIsLoading(true);
      getCouponById(couponId)
        .then((c) => {
          setForm({
            code: c.code,
            description: c.description,
            influencer: c.influencer?.id ?? '',
            discountType: c.discountType,
            discountValue: String(c.discountValue),
            maxDiscount: String(c.maxDiscount),
            minOrderValue: String(c.minOrderValue),
            usageLimit: String(c.usageLimit),
            perUserLimit: String(c.perUserLimit),
            validFrom: toDateInput(c.validFrom),
            validTo: toDateInput(c.validTo),
            isActive: c.isActive,
            online: c.channels.online,
            pos: c.channels.pos,
          });
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false));
    } else {
      setForm({ ...emptyForm, influencer: defaultInfluencerId ?? '' });
    }
  }, [isOpen, couponId, defaultInfluencerId]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear a field's error as soon as it is edited — re-checked on submit.
    setFieldErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: '' } : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const code = form.code.trim().toUpperCase().replace(/\s+/g, '');
    const value = Number(form.discountValue);
    const maxDiscount = Number(form.maxDiscount);
    const minOrder = Number(form.minOrderValue);
    const limit = Number(form.usageLimit);
    const perUser = Number(form.perUserLimit);

    const errors: Record<string, string> = {};
    if (!/^[A-Z0-9]{3,20}$/.test(code)) {
      errors.code = 'Use 3-20 letters or numbers, with no spaces or symbols';
    }
    if (!Number.isFinite(value) || value <= 0) {
      errors.discountValue = 'Enter a discount greater than zero';
    } else if (form.discountType === 'percent' && value > 100) {
      errors.discountValue = 'A percentage cannot be more than 100';
    }
    if (form.discountType === 'percent' && (!Number.isFinite(maxDiscount) || maxDiscount < 0)) {
      errors.maxDiscount = 'Enter 0 for no cap, or a rupee amount';
    }
    if (!Number.isFinite(minOrder) || minOrder < 0) {
      errors.minOrderValue = 'Enter 0 for no minimum, or a rupee amount';
    }
    // A flat discount bigger than the minimum order makes small carts free. The
    // server clamps it, but the admin should see the mistake before saving.
    if (form.discountType === 'flat' && minOrder > 0 && value > minOrder) {
      errors.minOrderValue =
        'The minimum should be at least the discount amount — right now the discount is larger than it';
    }
    if (!Number.isInteger(limit) || limit < 0) {
      errors.usageLimit = 'Enter 0 for unlimited, or a whole number';
    }
    if (!Number.isInteger(perUser) || perUser < 0) {
      errors.perUserLimit = 'Enter 0 for unlimited, or a whole number';
    }
    if (limit > 0 && perUser > 0 && perUser > limit) {
      errors.perUserLimit = 'One customer cannot use it more times than the total limit';
    }
    if (form.validFrom && form.validTo && form.validFrom > form.validTo) {
      errors.validTo = 'The end date must come after the start date';
    }
    if (!form.online && !form.pos) {
      errors.channels = 'Pick at least one place the code can be used';
    }

    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const payload = {
        code,
        description: form.description.trim(),
        influencer: form.influencer || null,
        discountType: form.discountType,
        discountValue: value,
        maxDiscount: form.discountType === 'percent' ? maxDiscount : 0,
        minOrderValue: minOrder,
        usageLimit: limit,
        perUserLimit: perUser,
        validFrom: form.validFrom || null,
        validTo: form.validTo || null,
        isActive: form.isActive,
        channels: { online: form.online, pos: form.pos },
      };

      if (isEdit && couponId) await updateCoupon(couponId, payload);
      else await createCoupon(payload);

      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const usageLimit = Number(form.usageLimit) || 0;

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
                {isEdit ? 'Edit Coupon' : 'New Coupon'}
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
                <form id="coupon-form" onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
                      {error}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className={labelClass}>Coupon Code</label>
                      <div className="relative">
                        <Ticket
                          size={16}
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400"
                        />
                        <input
                          type="text"
                          value={form.code}
                          onChange={(e) => set('code', e.target.value.toUpperCase())}
                          className={`${inputClass} pl-10 font-mono tracking-wider uppercase`}
                          placeholder="RAHUL10"
                          maxLength={20}
                        />
                      </div>
                      {fieldErrors.code ? (
                        <p className={errorClass}>{fieldErrors.code}</p>
                      ) : (
                        <p className={hintClass}>
                          This is what the customer types at checkout. Letters and numbers only.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className={labelClass}>Influencer</label>
                      <Select
                        value={form.influencer}
                        onChange={(v) => set('influencer', v)}
                        options={[
                          { value: '', label: 'No influencer (shop promotion)' },
                          ...influencers.map((i) => ({
                            value: i.id,
                            label: i.commissionPercent
                              ? `${i.name} · ${i.commissionPercent}% commission`
                              : i.name,
                          })),
                        ]}
                        size="md"
                      />
                      <p className={hintClass}>
                        Sales on this code are credited to them, and commission is worked out from
                        their rate.
                      </p>
                    </div>

                    <div>
                      <label className={labelClass}>Description</label>
                      <input
                        type="text"
                        value={form.description}
                        onChange={(e) => set('description', e.target.value)}
                        className={inputClass}
                        placeholder="e.g., Diwali reel collab"
                        maxLength={200}
                      />
                    </div>
                  </div>

                  {/* Discount */}
                  <div className="space-y-4 pt-2 border-t border-surface-100 dark:border-surface-850">
                    <h3 className="pt-4 text-body-sm font-semibold text-surface-900 dark:text-surface-100">
                      Discount
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Type</label>
                        <Select
                          value={form.discountType}
                          onChange={(v) => set('discountType', v as CouponDiscountType)}
                          options={[
                            { value: 'percent', label: 'Percentage off' },
                            { value: 'flat', label: 'Flat ₹ off' },
                          ]}
                          size="md"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          {form.discountType === 'percent' ? 'Percent (%)' : 'Amount (₹)'}
                        </label>
                        <input
                          type="number"
                          value={form.discountValue}
                          onChange={(e) => set('discountValue', e.target.value)}
                          className={inputClass}
                          min="1"
                          max={form.discountType === 'percent' ? '100' : undefined}
                        />
                        {fieldErrors.discountValue && (
                          <p className={errorClass}>{fieldErrors.discountValue}</p>
                        )}
                      </div>
                    </div>

                    {form.discountType === 'percent' && (
                      <div>
                        <label className={labelClass}>Maximum discount (₹)</label>
                        <input
                          type="number"
                          value={form.maxDiscount}
                          onChange={(e) => set('maxDiscount', e.target.value)}
                          className={inputClass}
                          min="0"
                        />
                        {fieldErrors.maxDiscount ? (
                          <p className={errorClass}>{fieldErrors.maxDiscount}</p>
                        ) : (
                          <p className={hintClass}>Caps how much a big cart can save. 0 means no cap.</p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className={labelClass}>Minimum order value (₹)</label>
                      <input
                        type="number"
                        value={form.minOrderValue}
                        onChange={(e) => set('minOrderValue', e.target.value)}
                        className={inputClass}
                        min="0"
                      />
                      {fieldErrors.minOrderValue ? (
                        <p className={errorClass}>{fieldErrors.minOrderValue}</p>
                      ) : (
                        <p className={hintClass}>The cart must reach this before the code works. 0 = no minimum.</p>
                      )}
                    </div>
                  </div>

                  {/* Limits */}
                  <div className="space-y-4 pt-2 border-t border-surface-100 dark:border-surface-850">
                    <h3 className="pt-4 text-body-sm font-semibold text-surface-900 dark:text-surface-100">
                      Limits
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Total uses</label>
                        <input
                          type="number"
                          value={form.usageLimit}
                          onChange={(e) => set('usageLimit', e.target.value)}
                          className={inputClass}
                          min="0"
                          step="1"
                        />
                        {fieldErrors.usageLimit && <p className={errorClass}>{fieldErrors.usageLimit}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Per customer</label>
                        <input
                          type="number"
                          value={form.perUserLimit}
                          onChange={(e) => set('perUserLimit', e.target.value)}
                          className={inputClass}
                          min="0"
                          step="1"
                        />
                        {fieldErrors.perUserLimit && <p className={errorClass}>{fieldErrors.perUserLimit}</p>}
                      </div>
                    </div>
                    <p className={hintClass}>
                      {usageLimit > 0
                        ? `Only the first ${usageLimit.toLocaleString('en-IN')} customers can use this code — it stops working after that. Cancelled orders give their slot back.`
                        : 'Total uses 0 means unlimited. Set it to 200 for a "first 200 customers only" offer.'}
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Starts</label>
                        <DatePicker value={form.validFrom} onChange={(v) => set('validFrom', v)} size="md" />
                      </div>
                      <div>
                        <label className={labelClass}>Ends</label>
                        <DatePicker value={form.validTo} onChange={(v) => set('validTo', v)} size="md" />
                      </div>
                    </div>
                    {fieldErrors.validTo ? (
                      <p className={errorClass}>{fieldErrors.validTo}</p>
                    ) : (
                      <p className={hintClass}>Leave both blank to run the code until you pause it.</p>
                    )}
                  </div>

                  {/* Where it works */}
                  <div className="space-y-3 pt-2 border-t border-surface-100 dark:border-surface-850">
                    <h3 className="pt-4 text-body-sm font-semibold text-surface-900 dark:text-surface-100">
                      Where it works
                    </h3>
                    <Toggle
                      checked={form.online}
                      onChange={(v) => set('online', v)}
                      label="Online store"
                      description="Customers can type it at checkout"
                    />
                    <Toggle
                      checked={form.pos}
                      onChange={(v) => set('pos', v)}
                      label="Shop counter"
                      description="Staff can apply it on a walk-in bill"
                    />
                    {fieldErrors.channels && <p className={errorClass}>{fieldErrors.channels}</p>}
                    <Toggle
                      checked={form.isActive}
                      onChange={(v) => set('isActive', v)}
                      label="Active"
                      description="Turn off to pause the code without losing its history"
                    />
                  </div>
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
                form="coupon-form"
                type="submit"
                disabled={isSaving || isLoading}
                className="flex items-center gap-2 px-4 h-10 rounded-xl bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : isEdit ? 'Update Coupon' : 'Create Coupon'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
