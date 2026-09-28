import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X } from 'lucide-react';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import { createRole, updateRole, getRoleById } from '@/services/rbac.ts';

type FormData = {
  name: string;
  description: string;
  isActive: boolean;
};

const emptyForm: FormData = {
  name: '',
  description: '',
  isActive: true,
};

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

interface RoleFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  roleId: string | null;
  /** Receives the saved role's id so a newly created role can be selected. */
  onSuccess: (roleId: string) => void;
}

/**
 * Name and description only. Which screens the role can open is edited on the
 * Roles page itself, where the matrix has room to breathe.
 */
export function RoleFormDrawer({ isOpen, onClose, roleId, onSuccess }: RoleFormDrawerProps) {
  const isEdit = !!roleId;

  const [form, setForm] = useState<FormData>(emptyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');

    if (roleId) {
      setIsLoading(true);
      getRoleById(roleId)
        .then((r) =>
          setForm({ name: r.name, description: r.description, isActive: r.isActive }),
        )
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : 'Failed to load role'),
        )
        .finally(() => setIsLoading(false));
    } else {
      setForm(emptyForm);
    }
  }, [isOpen, roleId]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        isActive: form.isActive,
      };

      const saved =
        isEdit && roleId ? await updateRole(roleId, payload) : await createRole(payload);

      onSuccess(saved.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save role');
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
            className="fixed top-0 right-0 bottom-0 z-[101] w-full max-w-md bg-white dark:bg-surface-900 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-surface-200 dark:border-surface-800">
              <h2 className="font-display font-semibold text-heading-sm text-surface-900 dark:text-surface-50">
                {isEdit ? 'Edit Role' : 'New Role'}
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
                <form id="role-form" onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
                      {error}
                    </div>
                  )}

                  <div>
                    <label className={labelClass}>Role Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                      className={inputClass}
                      placeholder="e.g., Cashier"
                      required
                      minLength={2}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                      className={`${inputClass} min-h-[90px] resize-y`}
                      placeholder="What this role is for, e.g., Handles counter billing only"
                    />
                  </div>

                  <Toggle
                    label="Active"
                    description="Turn off to stop this role being assigned to anyone new"
                    checked={form.isActive}
                    onChange={(v) => set('isActive', v)}
                  />

                  {!isEdit && (
                    <p className="text-caption text-surface-400">
                      After creating the role, choose its screens on the Roles page. A new role
                      starts with no access at all.
                    </p>
                  )}
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
                form="role-form"
                type="submit"
                disabled={isSaving || isLoading}
                className="flex items-center gap-2 px-4 h-10 rounded-xl bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : isEdit ? 'Update Role' : 'Create Role'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
