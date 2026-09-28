import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react';
import { Input } from '@/components/atoms/Input.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { resetPassword } from '@/services/auth.ts';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await resetPassword(email);
      setIsSent(true);
    } catch {
      setError('Failed to send reset email. Please check the address and try again.');
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
      {isSent ? (
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-emerald-500" />
          </div>
          <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
            Check your email
          </h2>
          <p className="mt-2 text-body-md text-surface-500">
            We've sent a password reset link to <strong className="text-surface-700 dark:text-surface-300">{email}</strong>
          </p>
          <p className="mt-1 text-body-sm text-surface-400">
            Didn't get it? Check your spam folder.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 mt-6 text-body-sm text-brand-500 font-semibold hover:text-brand-600 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <div className="text-center mb-8">
            <h1 className="font-display font-bold text-heading-lg text-surface-900 dark:text-surface-50">
              Forgot password?
            </h1>
            <p className="mt-2 text-body-md text-surface-500">
              Enter your email and we'll send you a reset link
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-body-sm text-red-600 dark:text-red-400">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={18} />}
              required
              autoFocus
            />
            <Button type="submit" fullWidth size="lg" isLoading={isLoading}>
              Send Reset Link
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
