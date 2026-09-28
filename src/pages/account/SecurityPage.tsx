import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, CheckCircle, AlertCircle, Shield } from 'lucide-react';
import { Input } from '@/components/atoms/Input.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { PasswordStrengthBar } from '@/components/molecules/PasswordStrengthBar.tsx';
import { changePassword } from '@/services/auth.ts';
import { useAuthStore } from '@/store/auth.ts';

export function SecurityPage() {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
    setIsSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      setIsSaved(true);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch {
      setError('Failed to update password. You may need to sign in again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isGoogleUser = user?.photoURL?.includes('googleusercontent');

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50 mb-6">
        Security
      </h2>

      {/* Change Password */}
      <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 lg:p-8 border border-surface-200 dark:border-surface-800 mb-6">
        <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50 mb-6">
          Change Password
        </h3>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-body-sm text-red-600 dark:text-red-400">
            <AlertCircle size={16} className="flex-shrink-0" /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
          <Input
            label="Current Password"
            name="currentPassword"
            type="password"
            value={form.currentPassword}
            onChange={handleChange}
            icon={<Lock size={18} />}
            required
          />
          <div>
            <Input
              label="New Password"
              name="newPassword"
              type="password"
              value={form.newPassword}
              onChange={handleChange}
              icon={<Lock size={18} />}
              placeholder="Min. 8 characters"
              required
            />
            <PasswordStrengthBar password={form.newPassword} />
          </div>
          <Input
            label="Confirm New Password"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange}
            icon={<Lock size={18} />}
            required
          />
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" size="lg" isLoading={isLoading}>Update Password</Button>
            {isSaved && (
              <span className="flex items-center gap-1.5 text-body-sm text-emerald-500 font-medium">
                <CheckCircle size={16} /> Password updated
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Connected Accounts */}
      <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 lg:p-8 border border-surface-200 dark:border-surface-800">
        <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50 mb-4">
          Connected Accounts
        </h3>
        <div className="flex items-center justify-between p-4 rounded-xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-body-md text-surface-900 dark:text-surface-100">Google</p>
              <p className="text-caption text-surface-400">{isGoogleUser ? 'Connected' : 'Not connected'}</p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 text-body-sm font-medium ${isGoogleUser ? 'text-emerald-500' : 'text-surface-400'}`}>
            <Shield size={16} />
            {isGoogleUser ? 'Linked' : 'Not linked'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
