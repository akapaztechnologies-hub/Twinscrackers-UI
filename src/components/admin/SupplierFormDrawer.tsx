import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X } from 'lucide-react';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import {
  createSupplier,
  updateSupplier,
  getSupplierById,
  supplierBalance,
} from '@/services/suppliers.ts';

type FormData = {
  companyName: string;
  contactPerson: string;
  phone: string;
  city: string;
  productsSupplied: string[]; // managed as removable chips
  totalOrdered: string;
  amountPaid: string;
  pesoLicensed: boolean;
};

const emptyForm: FormData = {
  companyName: '',
  contactPerson: '',
  phone: '',
  city: '',
  productsSupplied: [],
  totalOrdered: '0',
  amountPaid: '0',
  pesoLicensed: true,
};

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

interface SupplierFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: string | null;
  onSuccess: () => void;
}

export function SupplierFormDrawer({ isOpen, onClose, supplierId, onSuccess }: SupplierFormDrawerProps) {
  const isEdit = !!supplierId;

  const [form, setForm] = useState<FormData>(emptyForm);
  const [productInput, setProductInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setProductInput('');
    if (supplierId) {
      setIsLoading(true);
      setError('');
      getSupplierById(supplierId)
        .then((s) => {
          if (s) {
            setForm({
              companyName: s.companyName,
              contactPerson: s.contactPerson,
              phone: s.phone,
              city: s.city,
              productsSupplied: s.productsSupplied ?? [],
              totalOrdered: String(s.totalOrdered),
              amountPaid: String(s.amountPaid),
              pesoLicensed: s.pesoLicensed,
            });
          }
        })
        .catch(() => setError('Failed to load supplier'))
        .finally(() => setIsLoading(false));
    } else {
      setForm(emptyForm);
      setError('');
    }
  }, [isOpen, supplierId]);

  const addProduct = () => {
    const value = productInput.trim();
    if (!value) return;
    setForm((f) =>
      f.productsSupplied.some((p) => p.toLowerCase() === value.toLowerCase())
        ? f
        : { ...f, productsSupplied: [...f.productsSupplied, value] },
    );
    setProductInput('');
  };

  const removeProduct = (value: string) => {
    setForm((f) => ({ ...f, productsSupplied: f.productsSupplied.filter((p) => p !== value) }));
  };

  const balance = supplierBalance({
    totalOrdered: Number(form.totalOrdered) || 0,
    amountPaid: Number(form.amountPaid) || 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim()) {
      setError('Company name is required');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const payload = {
        companyName: form.companyName.trim(),
        contactPerson: form.contactPerson.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        productsSupplied: (() => {
          const pending = productInput.trim();
          if (pending && !form.productsSupplied.some((p) => p.toLowerCase() === pending.toLowerCase())) {
            return [...form.productsSupplied, pending];
          }
          return form.productsSupplied;
        })(),
        totalOrdered: Number(form.totalOrdered) || 0,
        amountPaid: Number(form.amountPaid) || 0,
        pesoLicensed: form.pesoLicensed,
      };

      if (isEdit && supplierId) {
        await updateSupplier(supplierId, payload);
      } else {
        await createSupplier(payload);
      }
      onSuccess();
      onClose();
    } catch (e) {
      // Now that this saves to the server, the reason matters — a duplicate
      // code or a missing permission is not "failed to save".
      setError(e instanceof Error ? e.message : 'Failed to save supplier');
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
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-surface-200 dark:border-surface-800">
              <h2 className="font-display font-semibold text-heading-sm text-surface-900 dark:text-surface-50">
                {isEdit ? 'Edit Supplier' : 'Add Supplier'}
              </h2>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-10 h-10 rounded-xl text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
                </div>
              ) : (
                <form id="supplier-form" onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
                      {error}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className={labelClass}>Company Name</label>
                      <input
                        type="text"
                        value={form.companyName}
                        onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                        className={inputClass}
                        placeholder="e.g., Standard Fireworks"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Contact Person</label>
                        <input
                          type="text"
                          value={form.contactPerson}
                          onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                          className={inputClass}
                          placeholder="e.g., Arun"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Phone</label>
                        <input
                          type="tel"
                          value={form.phone}
                          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                          className={inputClass}
                          placeholder="e.g., 04562-265000"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>City</label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                        className={inputClass}
                        placeholder="e.g., Sivakasi"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Products Supplied</label>
                      <input
                        type="text"
                        value={productInput}
                        onChange={(e) => setProductInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            addProduct();
                          } else if (e.key === 'Backspace' && !productInput && form.productsSupplied.length > 0) {
                            removeProduct(form.productsSupplied[form.productsSupplied.length - 1]);
                          }
                        }}
                        onBlur={addProduct}
                        className={inputClass}
                        placeholder="Type a product and press Enter"
                      />
                      <p className="text-caption text-surface-400 mt-1">
                        Add as many as needed — press Enter or comma after each
                      </p>
                      {form.productsSupplied.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {form.productsSupplied.map((p) => (
                            <span
                              key={p}
                              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 text-caption font-medium"
                            >
                              {p}
                              <button
                                type="button"
                                onClick={() => removeProduct(p)}
                                className="flex items-center justify-center w-4 h-4 rounded hover:bg-brand-500/20 transition-colors"
                                aria-label={`Remove ${p}`}
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-surface-200 dark:border-surface-800 space-y-4">
                    <h3 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
                      Payments
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Total Ordered (₹)</label>
                        <input
                          type="number"
                          value={form.totalOrdered}
                          onChange={(e) => setForm((f) => ({ ...f, totalOrdered: e.target.value }))}
                          className={inputClass}
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Amount Paid (₹)</label>
                        <input
                          type="number"
                          value={form.amountPaid}
                          onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))}
                          className={inputClass}
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-50 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700">
                      <span className="text-body-sm font-medium text-surface-600 dark:text-surface-300">
                        Balance {balance < 0 ? '(advance)' : 'due'}
                      </span>
                      <span
                        className={
                          'text-body-md font-bold tabular-nums ' +
                          (balance > 0
                            ? 'text-red-600 dark:text-red-400'
                            : balance < 0
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-green-600 dark:text-green-400')
                        }
                      >
                        ₹{Math.abs(balance).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <Toggle
                      label="PESO Licensed"
                      description="Holds a valid PESO explosives licence"
                      checked={form.pesoLicensed}
                      onChange={(v) => setForm((f) => ({ ...f, pesoLicensed: v }))}
                    />
                  </div>
                </form>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-surface-200 dark:border-surface-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-10 rounded-xl border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors"
              >
                Cancel
              </button>
              <button
                form="supplier-form"
                type="submit"
                disabled={isSaving || isLoading}
                className="flex items-center gap-2 px-4 h-10 rounded-xl bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : isEdit ? 'Update Supplier' : 'Create Supplier'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
