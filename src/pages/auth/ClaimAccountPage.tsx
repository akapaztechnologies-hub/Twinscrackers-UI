import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ClaimAccountForm } from '@/components/account/ClaimAccountForm.tsx';

/**
 * Turn a guest order into an account, for someone coming back after the order.
 *
 * A guest checkout only lets that browser see the orders it placed. Everything
 * else in the account area — addresses, wishlist, orders from another device —
 * needs a real account, and this is where a guest is sent for one. The
 * confirmation page offers the same form straight after the order.
 */
export function ClaimAccountPage() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white dark:bg-surface-900 rounded-2xl p-6 sm:p-8 border border-surface-200 dark:border-surface-800 shadow-card"
    >
      <div className="text-center mb-8">
        <h1 className="font-display font-bold text-heading-lg text-surface-900 dark:text-surface-50">
          Create your account
        </h1>
        <p className="mt-2 text-body-md text-surface-500">
          Ordered with us as a guest? Enter one of your orders and set a password to keep it in your own account.
        </p>
      </div>

      <ClaimAccountForm onClaimed={() => navigate('/account/orders', { replace: true })} />

      <p className="mt-6 text-center text-body-sm text-surface-500">
        Already have an account?{' '}
        <Link to="/login" className="text-brand-500 font-semibold hover:text-brand-600 transition-colors">
          Sign in
        </Link>
      </p>
    </motion.div>
  );
}
