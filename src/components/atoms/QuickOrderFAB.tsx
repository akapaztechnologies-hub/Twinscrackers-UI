import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useCartStore } from '@/store/cart.ts';

/**
 * Hide wherever Quick Order doesn't make sense, or would collide with another
 * fixed bottom bar (e.g. the sticky Add to Cart bar on the product page).
 *
 * On PHONES this button no longer renders at all — Quick Order is the raised
 * centre tab of `MobileTabBar`, which is both easier to hit and does not float
 * over the content underneath it. What is left here is the desktop and tablet
 * case, where there is no tab bar.
 */
const HIDDEN_PATHS = ['/quick-order', '/product/', '/checkout', '/order-confirmation', '/login', '/signup'];

export function QuickOrderFAB() {
  const { pathname } = useLocation();
  // The cart is a sheet at z-50 and this button is z-[1000], so while the cart
  // is open it floats over Proceed to Checkout. A floating action has no business
  // sitting on top of the sheet the customer is trying to act on.
  const cartOpen = useCartStore((s) => s.isOpen);
  const hidden =
    cartOpen || HIDDEN_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith('/admin');

  if (hidden) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        // `hidden md:flex` — gone on phones (the tab bar owns Quick Order
        // there), still present on tablets, which get the desktop navbar but
        // are wide enough that a corner button is a long reach from the header.
        className="fixed bottom-5 left-5 z-[1000] hidden md:block lg:hidden"
      >
        <Link
          to="/quick-order"
          aria-label="Quick Order — add items fast"
          className="group flex items-center gap-2 h-14 pl-4 pr-5 rounded-full bg-gradient-to-r from-fire-500 to-brand-500 text-white shadow-lg shadow-fire-500/30 hover:shadow-xl active:scale-95 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-fire-500 focus-visible:ring-offset-2"
        >
          <Zap size={22} className="fill-current" />
          <span className="text-body-sm font-bold whitespace-nowrap">Quick Order</span>
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}
