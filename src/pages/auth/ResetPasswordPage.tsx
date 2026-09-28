import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/atoms/Input.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { PasswordStrengthBar } from '@/components/molecules/PasswordStrengthBar.tsx';
import { confirmReset } from '@/services/auth.ts';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!oobCode) {
      setError('Invalid or expired reset link');
      return;
    }

    setIsLoading(true);
    try {
      await confirmReset(oobCode, password);
      setIsDone(true);
    } catch {
      setError('Failed to reset password. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white dark:bg-surface-900 rounded-2xl p-6 sm:p-8 border border-surface-200 dark:border-surface-800 shadow-card"
    >
      {isDone ? (
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-emerald-500" />
          </div>
          <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
            Password reset!
          </h2>
          <p className="mt-2 text-body-md text-surface-500">
            Your password has been updated. You can now sign in.
          </p>
          <Link to="/login">
            <Button size="lg" className="mt-6">
              Go to Sign In
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="text-center mb-8">
            <h1 className="font-display font-bold text-heading-lg text-surface-900 dark:text-surface-50">
              Set new password
            </h1>
            <p className="mt-2 text-body-md text-surface-500">
              Choose a strong password for your account
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-body-sm text-red-600 dark:text-red-400">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                label="New Password"
                type="password"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock size={18} />}
                required
                autoFocus
              />
              <PasswordStrengthBar password={password} />
            </div>
            <Input
              label="Confirm Password"
              type="password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              icon={<Lock size={18} />}
              required
            />
            <Button type="submit" fullWidth size="lg" isLoading={isLoading}>
              Reset Password
            </Button>
          </form>

          <p className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-body-sm text-surface-500 hover:text-brand-500 transition-colors"
            >
              <ArrowLeft size={16} />
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </motion.div>
  );
}
