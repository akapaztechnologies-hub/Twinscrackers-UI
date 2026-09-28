import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '@/types/admin.ts';
import { Select } from '@/components/atoms/Select.tsx';
import { DatePicker } from '@/components/atoms/DatePicker.tsx';
import {
  createExpense,
  updateExpense,
  getExpenseById,
  expenseTotal,
} from '@/services/expenses.ts';

type FormData = {
  date: string;
  category: string;
  description: string;
  amount: string;
  gst: string;
  paidTo: string;
};

/** Today's date as YYYY-MM-DD (local calendar, not UTC) for the date input default. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

interface ExpenseFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  expenseId: string | null;
  onSuccess: () => void;
}

export function ExpenseFormDrawer({ isOpen, onClose, expenseId, onSuccess }: ExpenseFormDrawerProps) {
  const isEdit = !!expenseId;

  const emptyForm: FormData = {
    date: todayISO(),
    category: EXPENSE_CATEGORIES[0],
    description: '',
    amount: '0',
    gst: '0',
    paidTo: '',
  };

  const [form, setForm] = useState<FormData>(emptyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (expenseId) {
      setIsLoading(true);
      setError('');
      getExpenseById(expenseId)
        .then((ex) => {
          if (ex) {
            setForm({
              date: ex.date,
              category: ex.category,
              description: ex.description,
              amount: String(ex.amount),
              gst: String(ex.gst),
              paidTo: ex.paidTo,
            });
          }
        })
        .catch(() => setError('Failed to load expense'))
        .finally(() => setIsLoading(false));
    } else {
      setForm({
        date: todayISO(),
        category: EXPENSE_CATEGORIES[0],
        description: '',
        amount: '0',
        gst: '0',
        paidTo: '',
      });
      setError('');
    }
  }, [isOpen, expenseId]);

  const total = expenseTotal({ amount: Number(form.amount) || 0, gst: Number(form.gst) || 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date) {
      setError('Date is required');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const payload = {
        date: form.date,
        category: form.category,
        description: form.description.trim(),
        amount: Number(form.amount) || 0,
        gst: Number(form.gst) || 0,
        paidTo: form.paidTo.trim(),
      };

      if (isEdit && expenseId) {
        await updateExpense(expenseId, payload);
      } else {
        await createExpense(payload);
      }
      onSuccess();
      onClose();
    } catch {
      setError('Failed to save expense');
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
                {isEdit ? 'Edit Expense' : 'Add Expense'}
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
                <form id="expense-form" onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
                      {error}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Date</label>
                        <DatePicker
                          value={form.date}
                          onChange={(v) => setForm((f) => ({ ...f, date: v }))}
                          size="md"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Category</label>
                        <Select
                          value={form.category}
                          onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
                          size="md"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Description</label>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        className={`${inputClass} resize-none`}
                        rows={2}
                        placeholder="e.g., Lorry hire Chennai-Sivakasi"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Paid To</label>
                      <input
                        type="text"
                        value={form.paidTo}
                        onChange={(e) => setForm((f) => ({ ...f, paidTo: e.target.value }))}
                        className={inputClass}
                        placeholder="e.g., Kumar Transports"
                      />
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-surface-200 dark:border-surface-800 space-y-4">
                    <h3 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
                      Amount
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Amount (₹)</label>
                        <input
                          type="number"
                          value={form.amount}
                          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                          className={inputClass}
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>GST (₹)</label>
                        <input
                          type="number"
                          value={form.gst}
                          onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))}
                          className={inputClass}
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-50 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700">
                      <span className="text-body-sm font-medium text-surface-600 dark:text-surface-300">Total</span>
                      <span className="text-body-md font-bold tabular-nums text-surface-900 dark:text-surface-50">
                        ₹{total.toLocaleString('en-IN')}
                      </span>
                    </div>
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
                form="expense-form"
                type="submit"
                disabled={isSaving || isLoading}
                className="flex items-center gap-2 px-4 h-10 rounded-xl bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : isEdit ? 'Update Expense' : 'Create Expense'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
