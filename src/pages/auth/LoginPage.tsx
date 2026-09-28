import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { Input } from '@/components/atoms/Input.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { SocialLoginButton } from '@/components/molecules/SocialLoginButton.tsx';
import { signInWithEmail, signInWithGoogle } from '@/services/auth.ts';
import { ApiRequestError } from '@/lib/api.ts';
import { useAuthStore, postLoginPath } from '@/store/auth.ts';
import { useWishlistStore } from '@/store/wishlist.ts';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useAuthStore((s) => s.setUser);
  const fetchWishlist = useWishlistStore((s) => s.fetchWishlist);

  // Where they were bounced from, if a guard sent them here. Otherwise the
  // landing page depends on who signs in — staff go to the Admin Portal, not
  // to the customer account area.
  const cameFrom = (location.state as { from?: string })?.from;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const user = await signInWithEmail(email, password);
      setUser(user);
      fetchWishlist();
      navigate(postLoginPath(user, cameFrom), { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      // A lock after too many wrong passwords. The server's message says how
      // long is left, which is the one thing the customer needs — so it is
      // shown as written rather than mapped onto a generic line below.
      if (err instanceof ApiRequestError && err.status === 429) {
        setError(msg || 'Too many attempts. Please try again later.');
        return;
      }
      if (
        msg.includes('Invalid email or password') ||
        msg.includes('invalid-credential') ||
        msg.includes('wrong-password') ||
        msg.includes('user-not-found')
      ) {
        setError('Incorrect email or password');
      } else if (msg.includes('deactivated')) {
        setError('Your account has been deactivated. Please contact support.');
      } else if (msg.includes('sign in with Google')) {
        setError('This account uses Google login. Please sign in with Google.');
      } else if (msg.includes('too-many-requests')) {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(msg || 'Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setIsGoogleLoading(true);
    try {
      const user = await signInWithGoogle();
      setUser(user);
      fetchWishlist();
      navigate(postLoginPath(user, cameFrom), { replace: true });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (err instanceof ApiRequestError && err.message) {
        // Our server said no, and why — an employee while the shop has not
        // allowed Google sign-in, a deactivated account. A generic "failed,
        // try again" read as a broken button and sent them round in circles.
        setError(err.message);
      } else if (!code.includes('popup-closed') && !code.includes('cancelled')) {
        // Closing the Google popup is not an error.
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white dark:bg-surface-900 rounded-2xl p-6 sm:p-8 border border-surface-200 dark:border-surface-800 shadow-card"
    >
      <div className="text-center mb-8">
        <h1 className="font-display font-bold text-heading-lg text-surface-900 dark:text-surface-50">
          Welcome back
        </h1>
        <p className="mt-2 text-body-md text-surface-500">
          Sign in to your account
        </p>
      </div>

      {/* Google OAuth */}
      <SocialLoginButton onClick={handleGoogle} isLoading={isGoogleLoading} />

      {/* Divider */}
      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-surface-200 dark:bg-surface-700" />
        <span className="text-caption text-surface-400 uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-surface-200 dark:bg-surface-700" />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-body-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={<Mail size={18} />}
          required
          autoComplete="email"
          autoFocus
        />
        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock size={18} />}
          required
          autoComplete="current-password"
        />

        <div className="flex items-center justify-end">
          <Link
            to="/forgot-password"
            className="text-body-sm text-brand-500 hover:text-brand-600 transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth size="lg" isLoading={isLoading}>
          Sign In
        </Button>
      </form>

      <p className="mt-6 text-center text-body-sm text-surface-500">
        Don't have an account?{' '}
        <Link to="/signup" className="text-brand-500 font-semibold hover:text-brand-600 transition-colors">
          Sign up
        </Link>
      </p>
      {/* A guest has no password to sign in with; their way in is to claim
          the orders they placed. */}
      <p className="mt-2 text-center text-body-sm text-surface-500">
        Ordered as a guest?{' '}
        <Link to="/claim-account" className="text-brand-500 font-semibold hover:text-brand-600 transition-colors">
          Create your account
        </Link>
      </p>
    </motion.div>
  );
}
