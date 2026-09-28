import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X, KeyRound } from 'lucide-react';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { DatePicker } from '@/components/atoms/DatePicker.tsx';
import { isValidPhone, isValidEmail, PHONE_ERROR, EMAIL_ERROR } from '@/lib/validation.ts';
import {
  createEmployee,
  updateEmployee,
  getEmployeeById,
  resetEmployeePassword,
} from '@/services/employees.ts';
import { getRoles } from '@/services/rbac.ts';
import type { AdminRole } from '@/types/admin.ts';

type FormData = {
  displayName: string;
  email: string;
  password: string;
  phone: string;
  employeeCode: string;
  designation: string;
  joinedAt: string;
  staffRole: string;
  isActive: boolean;
};

const emptyForm: FormData = {
  displayName: '',
  email: '',
  password: '',
  phone: '',
  employeeCode: '',
  designation: '',
  joinedAt: '',
  staffRole: '',
  isActive: true,
};

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

const errorInputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-red-400 dark:border-red-500/60 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-shadow';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-caption text-red-600 dark:text-red-400 mt-1">{message}</p>;
}

interface EmployeeFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string | null;
  onSuccess: () => void;
}

export function EmployeeFormDrawer({
  isOpen,
  onClose,
  employeeId,
  onSuccess,
}: EmployeeFormDrawerProps) {
  const isEdit = !!employeeId;

  const [form, setForm] = useState<FormData>(emptyForm);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  /** Per-field messages, shown under the field rather than only at the top. */
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  // Editing never shows the existing password (it is hashed and never returned);
  // setting a new one is a separate, deliberate action.
  const [newPassword, setNewPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setNewPassword('');
    setResetDone(false);
    setFieldErrors({});
    setIsLoading(true);

    (async () => {
      try {
        // Only assignable roles are offered — a deactivated role would be
        // rejected by the backend anyway.
        const roleList = await getRoles({ status: 'active' });
        setRoles(roleList);

        if (employeeId) {
          const e = await getEmployeeById(employeeId);
          setForm({
            displayName: e.displayName,
            email: e.email,
            password: '',
            phone: e.phone,
            employeeCode: e.employeeCode,
            designation: e.designation,
            joinedAt: e.joinedAt ? e.joinedAt.slice(0, 10) : '',
            staffRole: e.roleId,
            isActive: e.isActive,
          });
        } else {
          setForm({ ...emptyForm, staffRole: roleList[0]?.id ?? '' });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load employee');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isOpen, employeeId]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear a field's error as soon as the user edits it — keeping a stale
    // complaint on screen while they fix it reads as the form being broken.
    setFieldErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  /** Returns the field errors for the current form, empty when it is valid. */
  const validate = (): Partial<Record<keyof FormData, string>> => {
    const errors: Partial<Record<keyof FormData, string>> = {};

    if (form.displayName.trim().length < 2) errors.displayName = 'Enter the full name';

    // Email is the sign-in identity and is fixed after creation, so it is only
    // validated on the way in.
    if (!isEdit && !isValidEmail(form.email)) errors.email = EMAIL_ERROR;
    if (!isEdit && form.password.length < 6) errors.password = 'At least 6 characters';

    // Optional, but if given it must be a real number — a half-typed phone is
    // worse than none, because nobody finds out until they try to call.
    if (form.phone.trim() && !isValidPhone(form.phone)) errors.phone = PHONE_ERROR;

    if (!form.staffRole) errors.staffRole = 'Pick a role for this employee';

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setIsSaving(true);
    try {
      const payload = {
        displayName: form.displayName.trim(),
        phone: form.phone.trim(),
        employeeCode: form.employeeCode.trim(),
        designation: form.designation.trim(),
        staffRole: form.staffRole,
        isActive: form.isActive,
        ...(form.joinedAt ? { joinedAt: form.joinedAt } : {}),
      };

      if (isEdit && employeeId) {
        await updateEmployee(employeeId, payload);
      } else {
        await createEmployee({
          ...payload,
          email: form.email.trim(),
          password: form.password,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save employee');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!employeeId || newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    setError('');
    setIsResetting(true);
    try {
      await resetEmployeePassword(employeeId, newPassword);
      setNewPassword('');
      setResetDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsResetting(false);
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
                {isEdit ? 'Edit Employee' : 'Add Employee'}
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
                <form id="employee-form" onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
                      {error}
                    </div>
                  )}

                  {roles.length === 0 && (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-body-sm font-medium">
                      No active roles exist yet. Create one on the Roles &amp; Access screen first —
                      an employee needs a role to have any access.
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className={labelClass}>Full Name</label>
                      <input
                        type="text"
                        value={form.displayName}
                        onChange={(e) => set('displayName', e.target.value)}
                        className={fieldErrors.displayName ? errorInputClass : inputClass}
                        placeholder="e.g., Karthik R"
                      />
                      <FieldError message={fieldErrors.displayName} />
                    </div>

                    <div>
                      <label className={labelClass}>Email</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => set('email', e.target.value)}
                        className={fieldErrors.email ? errorInputClass : inputClass}
                        placeholder="e.g., karthik@nvcrackers.com"
                        disabled={isEdit}
                      />
                      <FieldError message={fieldErrors.email} />
                      {isEdit && (
                        <p className="text-caption text-surface-400 mt-1">
                          The sign-in email cannot be changed
                        </p>
                      )}
                    </div>

                    {!isEdit && (
                      <div>
                        <label className={labelClass}>Password</label>
                        <input
                          type="text"
                          value={form.password}
                          onChange={(e) => set('password', e.target.value)}
                          className={fieldErrors.password ? errorInputClass : inputClass}
                          placeholder="At least 6 characters"
                        />
                        <FieldError message={fieldErrors.password} />
                        <p className="text-caption text-surface-400 mt-1">
                          Share this with the employee — they can change it from their profile
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Phone</label>
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={14}
                          value={form.phone}
                          onChange={(e) => set('phone', e.target.value)}
                          className={fieldErrors.phone ? errorInputClass : inputClass}
                          placeholder="e.g., 98765 43210"
                        />
                        <FieldError message={fieldErrors.phone} />
                      </div>
                      <div>
                        <label className={labelClass}>Employee Code</label>
                        <input
                          type="text"
                          value={form.employeeCode}
                          onChange={(e) => set('employeeCode', e.target.value)}
                          className={inputClass}
                          placeholder="e.g., NV-004"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Designation</label>
                        <input
                          type="text"
                          value={form.designation}
                          onChange={(e) => set('designation', e.target.value)}
                          className={inputClass}
                          placeholder="e.g., Counter Staff"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Joined On</label>
                        <DatePicker
                          value={form.joinedAt}
                          onChange={(v) => set('joinedAt', v)}
                          placeholder="Pick a date"
                          size="lg"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-surface-200 dark:border-surface-800 space-y-4">
                    <h3 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
                      Access
                    </h3>
                    <div>
                      <label className={labelClass}>Role</label>
                      <Select
                        value={form.staffRole}
                        onChange={(v) => set('staffRole', v)}
                        placeholder="Select a role"
                        size="lg"
                        options={roles.map((r) => ({
                          value: r.id,
                          label: `${r.name} — ${
                            r.isSuperAdmin
                              ? 'every screen'
                              : `${r.permissions.length} screen${r.permissions.length === 1 ? '' : 's'}`
                          }`,
                        }))}
                      />
                      <FieldError message={fieldErrors.staffRole} />
                      <p className="text-caption text-surface-400 mt-1">
                        The role decides which Admin Portal screens they can open
                      </p>
                    </div>

                    <Toggle
                      label="Active"
                      description="Turn off to block sign-in without deleting the account"
                      checked={form.isActive}
                      onChange={(v) => set('isActive', v)}
                    />
                  </div>

                  {isEdit && (
                    <div className="pt-6 mt-6 border-t border-surface-200 dark:border-surface-800 space-y-3">
                      <h3 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
                        Reset Password
                      </h3>
                      <p className="text-caption text-surface-400">
                        Sets a new password immediately and signs them out everywhere
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className={inputClass}
                          placeholder="New password"
                        />
                        <button
                          type="button"
                          onClick={handleResetPassword}
                          disabled={isResetting || newPassword.length < 6}
                          className="flex items-center gap-2 shrink-0 px-4 h-[42px] rounded-xl border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 disabled:opacity-50 transition-colors"
                        >
                          <KeyRound size={15} />
                          {isResetting ? 'Saving...' : 'Reset'}
                        </button>
                      </div>
                      {resetDone && (
                        <p className="text-caption text-green-600 dark:text-green-400 font-medium">
                          Password updated. Share the new one with them.
                        </p>
                      )}
                    </div>
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
                form="employee-form"
                type="submit"
                disabled={isSaving || isLoading || roles.length === 0}
                className="flex items-center gap-2 px-4 h-10 rounded-xl bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : isEdit ? 'Update Employee' : 'Create Employee'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
