import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Store, Zap, Gift, User } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import { useCartStore } from '@/store/cart.ts';
import { useAuthStore } from '@/store/auth.ts';

/**
 * The storefront's mobile navigation.
 *
 * Built because customers were not finding the hamburger menu — which is the
 * normal outcome, not a surprise. A hamburger hides every destination behind a
 * tap on an icon whose meaning has to be learned, at the top of the screen,
 * furthest from the thumb. On a phone the shop's five real destinations belong
 * where every app the customer already uses puts them: pinned to the bottom,
 * always visible, labelled in words.
 *
 * The choices behind the layout:
 *
 *  - FIVE slots, no more. Past five the targets get narrower than a thumb.
 *  - Quick Order in the CENTRE and raised. It is the shop's fastest path to a
 *    filled cart and it was previously a floating button that overlapped
 *    content; the centre slot is the easiest one to hit and the hardest to
 *    miss.
 *  - Combos rather than the cart. The cart already sits in the header on
 *    every page with its own badge, so a tab spent on it bought nothing; the
 *    ready-made boxes had no route from the bottom of the screen at all, and
 *    they are what most of this shop's customers actually come for.
 *  - Account points at login when signed out, so the tab never dead-ends.
 *  - Labels under every icon. Icon-only bars test badly with shoppers who are
 *    not daily app users, which is most of a fireworks shop's customers.
 *
 * It publishes its height as `--bottom-bar-h`, the convention the WhatsApp
 * button and the page-level sticky bars already read, so nothing stacks on top
 * of anything else.
 */

/**
 * Routes that pin their own bar to the bottom, or where navigating away is the
 * wrong thing to offer.
 *
 * The product page and Quick Order both have a sticky action bar; two bars
 * stacked would eat a third of a phone screen. Checkout is a funnel — every
 * exit on it is a lost order.
 */
const HIDDEN_PATHS = [
  '/product/',
  '/quick-order',
  '/checkout',
  '/order-confirmation',
  '/login',
  '/signup',
  '/admin',
];

export function MobileTabBar() {
  const { pathname } = useLocation();
  const cartOpen = useCartStore((s) => s.isOpen);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const ref = useRef<HTMLElement>(null);

  const hidden = cartOpen || HIDDEN_PATHS.some((p) => pathname.startsWith(p));

  /**
   * Publish the bar's real height, so the page can leave room for it.
   *
   * Measured rather than hard-coded: the safe-area inset is a different number
   * on a notched iPhone, an Android with gesture navigation and a desktop
   * browser's phone emulator. A constant would be wrong on two of the three,
   * and being wrong here means the last row of products sits under the bar
   * where nobody can tap it.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (hidden) {
      root.style.removeProperty('--tab-bar-h');
      return;
    }
    const el = ref.current;
    if (!el) return;

    const publish = () => root.style.setProperty('--tab-bar-h', `${el.offsetHeight}px`);
    publish();

    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--tab-bar-h');
    };
  }, [hidden]);

  if (hidden) return null;

  const isHome = pathname === '/';
  // Combos have their own tab now, so Shop no longer claims them — two lit
  // tabs for one page reads as a bug.
  const isShop = pathname.startsWith('/shop');
  const isCombos = pathname.startsWith('/combo-packs');
  const isAccount = pathname.startsWith('/account');

  return (
    <nav
      ref={ref}
      aria-label="Main"
      // z-40 keeps it under the cart drawer and any modal, which is correct: a
      // sheet the customer opened is the thing they are acting on.
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-surface-900/95 backdrop-blur-lg border-t border-surface-200 dark:border-surface-800 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
      // The home indicator on a modern iPhone sits where a tab bar's labels
      // would be. Without this the bottom row of text is under the gesture bar.
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5 items-end">
        <TabLink to="/" icon={Home} label="Home" active={isHome} />
        <TabLink to="/shop" icon={Store} label="Shop" active={isShop} />

        {/* Centre slot — raised above the bar so it reads as the primary action
            rather than the third of five equals. */}
        <Link
          to="/quick-order"
          aria-label="Quick Order — add items fast"
          className="flex flex-col items-center justify-end gap-1 pb-1.5 focus:outline-none"
        >
          <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-fire-500 to-brand-500 text-white shadow-lg shadow-fire-500/30 ring-4 ring-white dark:ring-surface-900 active:scale-95 transition-transform">
            <Zap size={21} className="fill-current" />
          </span>
          <span className="text-[10px] font-bold leading-none text-fire-600 dark:text-fire-400">Quick</span>
        </Link>

        {/* Combo packs, not the cart.
            The cart is one tap away in the header on every page, badge and all,
            so a slot spent on it was spent twice. This slot now points at the
            thing a customer cannot otherwise find from the bottom of the
            screen — the ready-made boxes, which is what most of them came to
            buy and what the shop makes its season on. */}
        <TabLink to="/combo-packs" icon={Gift} label="Combos" active={isCombos} />

        {/* Never a dead end: signed out, this is the way in. */}
        <TabLink
          to={isAuthenticated ? '/account' : '/login'}
          icon={User}
          label={isAuthenticated ? 'Account' : 'Sign in'}
          active={isAccount}
        />
      </div>
    </nav>
  );
}

function TabLink({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string;
  icon: typeof Home;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className="relative flex flex-col items-center justify-end gap-1 py-2 pb-1.5 focus:outline-none active:scale-95 transition-transform"
    >
      {/* The active mark is a bar at the top edge AND a colour change, not
          colour alone — colour on its own is invisible to a good number of
          people, and this is the only thing saying where you are. */}
      {active && (
        <motion.span
          layoutId="tab-indicator"
          className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-500"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      <Icon
        size={21}
        className={cn(
          'transition-colors',
          active ? 'text-brand-600 dark:text-brand-400' : 'text-surface-400',
        )}
      />
      <span
        className={cn(
          'text-[10px] font-semibold leading-none transition-colors',
          active ? 'text-brand-600 dark:text-brand-400' : 'text-surface-500 dark:text-surface-400',
        )}
      >
        {label}
      </span>
    </Link>
  );
}
