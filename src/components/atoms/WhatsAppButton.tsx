import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSiteStore } from '@/store/site.ts';
import { useCartStore } from '@/store/cart.ts';
import { WhatsAppIcon } from '@/components/atoms/BrandIcons.tsx';
import { safeLink } from '@/components/safeLink.ts';

const HIDDEN_PATHS = ['/checkout', '/order-confirmation', '/login', '/signup', '/safety'];

export function WhatsAppButton() {
  const { pathname } = useLocation();
  const siteConfig = useSiteStore(s => s.config);
  // Same reason as QuickOrderFAB: this is z-[1000] and the cart sheet is z-50,
  // so it covered Proceed to Checkout whenever the cart was open.
  const cartOpen = useCartStore((s) => s.isOpen);
  const [visible, setVisible] = useState(false);
  const [tooltip, setTooltip] = useState(false);

  // Delay entry by 1.5s after mount
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Hide on checkout, order confirmation, login, admin routes
  const hidden =
    cartOpen ||
    HIDDEN_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/admin');

  // No number configured in Admin -> Content -> Company Info: render nothing
  // rather than a link that opens WhatsApp with an empty recipient. The link
  // comes from shop settings, so one that is not a web address is dropped too.
  const whatsappLink = safeLink(siteConfig.social.whatsapp);
  if (hidden || !visible || !whatsappLink) return null;

  // Build WhatsApp URL with pre-filled message ({name} token → company name)
  const message = encodeURIComponent(
    (siteConfig.whatsappMessage || 'Hi {name} team! I have a question.').replace(/\{name\}/g, siteConfig.name),
  );
  const href = `${whatsappLink}?text=${message}`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        // Sits above whatever is pinned to the bottom of the viewport rather
        // than on top of it. Two things can be: a page-level sticky bar, which
        // publishes `--bottom-bar-h` (see QuickOrderPage), and the mobile tab
        // bar, which publishes `--tab-bar-h`. Both fall back to 0px, so on a
        // desktop page with neither the button is exactly where it always was.
        className="fixed right-5 z-[1000] lg:right-6 bottom-[calc(var(--bottom-bar-h,0px)+var(--tab-bar-h,0px)+1.25rem)] lg:bottom-[calc(var(--bottom-bar-h,0px)+var(--tab-bar-h,0px)+1.5rem)] transition-[bottom] duration-300"
        onMouseEnter={() => setTooltip(true)}
        onMouseLeave={() => setTooltip(false)}
      >
        {/* Tooltip — desktop only */}
        <AnimatePresence>
          {tooltip && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
              className="absolute right-full mr-3 top-1/2 -translate-y-1/2 hidden lg:block whitespace-nowrap"
            >
              <div className="px-3 py-2 rounded-lg bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-body-sm font-medium shadow-lg">
                {siteConfig.whatsappTooltip || 'Chat with us on WhatsApp'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Button */}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with us on WhatsApp, opens WhatsApp"
          className="group flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
        >
          <WhatsAppIcon size={28} />
        </a>
      </motion.div>
    </AnimatePresence>
  );
}
