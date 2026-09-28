import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, ShoppingBag, Search, ChevronDown, User, LogOut,
  Package, Heart, Zap, Flame, Layers, Sparkles, Info,
  MapPin, Truck, Phone,
} from 'lucide-react';
import { ThemeToggle } from '@/components/atoms/ThemeToggle.tsx';
import { Container } from '@/components/atoms/Container.tsx';
import { Avatar } from '@/components/atoms/Avatar.tsx';
import { UserDropdown } from '@/components/molecules/UserDropdown.tsx';
import { useScrollDirection } from '@/hooks/useScrollDirection.ts';
import { useCartStore } from '@/store/cart.ts';
import { useAuthStore } from '@/store/auth.ts';
// signOutUser is dynamically imported to keep auth service out of the initial bundle
import { useCategories } from '@/hooks/useCategories.ts';
import { OCCASIONS } from '@/config/occasions.ts';
import type { NavLink } from '@/types/index.ts';
import { useSiteStore } from '@/store/site.ts';
import { AnnouncementBar } from '@/components/organisms/AnnouncementBar.tsx';
import { cn } from '@/lib/utils.ts';
import logoImg from '@/assets/images/logo_crackers_optimized.png';
import { logoSrc } from '@/lib/logoAssets.ts';
import { realEmail } from '@/components/guestEmail.ts';
import { safeLink } from '@/components/safeLink.ts';
import { userDisplayName } from '@/components/userDisplay.ts';

// Icon map for mobile drawer nav links
const navIcons: Record<string, React.ReactNode> = {
  Shop: <Flame size={20} />,
  Collections: <Layers size={20} />,
  'Quick Order': <Zap size={20} className="fill-current" />,
  Combos: <Sparkles size={20} />,
  About: <Info size={20} />,
};

// Staggered animation variants
const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
} as const;
const itemVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring' as const, damping: 20, stiffness: 300 } },
};

export function Navbar() {
  const siteConfig = useSiteStore(s => s.config);
  // From shop settings — filtered like every staff-entered link (see safeLink).
  const whatsappLink = safeLink(siteConfig.social.whatsapp);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const { isAtTop } = useScrollDirection();
  const location = useLocation();
  const totalItems = useCartStore((s) => s.totalItems());
  const openCart = useCartStore((s) => s.openCart);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const categories = useCategories();

  const navLinks: NavLink[] = useMemo(() => [
    {
      label: 'Shop',
      href: '/shop',
      children: [
        { label: 'All Products', href: '/shop' },
        ...categories.map((c) => ({ label: c.name, href: `/shop?category=${c.slug}` })),
      ],
    },
    {
      label: 'Collections',
      href: '/shop',
      children: OCCASIONS.map((o) => ({ label: o.label, href: `/shop?occasion=${o.slug}` })),
    },
    { label: 'Quick Order', href: '/quick-order', highlight: true },
    { label: 'Combos', href: '/combo-packs' },
    { label: 'About', href: '/about' },
  ], [categories]);

  const handleSignOut = async () => {
    const { signOutUser } = await import('@/services/auth.ts');
    await signOutUser();
    logout();
    setIsMobileOpen(false);
  };

  const isHome = location.pathname === '/';
  const isTransparent = isHome && isAtTop;

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300 flex flex-col',
          isTransparent
            ? 'bg-transparent'
            : 'glass-nav shadow-sm',
        )}
      >
        <AnnouncementBar />
        <Container size="full">
          <nav className="flex items-center justify-between h-16 lg:h-18">
            {/* Logo */}
            <Link
              to="/"
              className="flex items-center gap-2 z-10"
              onClick={() => setIsMobileOpen(false)}
            >
              <img src={logoSrc(siteConfig, 'header') || logoImg} alt={siteConfig.name} width={44} height={44} className="w-11 h-11 rounded-lg object-contain" />
              <span
                className={cn(
                  'font-display font-bold text-heading-sm transition-colors',
                  isTransparent
                    ? 'text-white'
                    : 'text-surface-900 dark:text-surface-50',
                )}
              >
                {siteConfig.name}
              </span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <div
                  key={link.label}
                  className="relative"
                  onMouseEnter={() => link.children && setActiveDropdown(link.label)}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  {link.highlight ? (
                    <Link
                      to={link.href}
                      className="group relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-body-sm font-semibold transition-all duration-300 bg-gradient-to-r from-fire-500 to-brand-500 text-white shadow-md shadow-fire-500/25 hover:shadow-lg hover:shadow-fire-500/40 hover:scale-105 active:scale-95"
                    >
                      <Zap size={14} className="fill-current transition-transform group-hover:rotate-12" />
                      {link.label}
                      <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </Link>
                  ) : (
                    <Link
                      to={link.href}
                      className={cn(
                        'flex items-center gap-1 px-4 py-2 rounded-xl text-body-sm font-medium transition-colors',
                        isTransparent
                          ? 'text-white/80 hover:text-white hover:bg-white/10'
                          : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 hover:bg-surface-100 dark:hover:bg-surface-800',
                      )}
                    >
                      {link.label}
                      {link.children && <ChevronDown size={14} className="opacity-50" />}
                    </Link>
                  )}

                  {/* Dropdown */}
                  <AnimatePresence>
                    {link.children && activeDropdown === link.label && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-1 w-56 rounded-2xl p-2 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 shadow-lg max-h-[236px] overflow-y-auto overscroll-contain"
                      >
                        {link.children.map((child) => (
                          <Link
                            key={child.label}
                            to={child.href}
                            className="block px-4 py-2.5 rounded-xl text-body-sm text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                          >
                            {child.label}
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-1">
              <Link
                to="/shop"
                className={cn(
                  'flex items-center justify-center w-10 h-10 rounded-xl transition-colors',
                  isTransparent
                    ? 'text-white/80 hover:text-white hover:bg-white/10'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800',
                )}
                aria-label="Search products"
              >
                <Search size={20} />
              </Link>

              <ThemeToggle
                className={cn(
                  isTransparent && 'text-white/80 hover:text-white hover:bg-white/10',
                )}
              />

              {/* User / Auth */}
              {isAuthenticated && user ? (
                <div className="relative hidden lg:block">
                  <button
                    onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                    className={cn(
                      'flex items-center justify-center w-10 h-10 rounded-xl transition-colors overflow-hidden',
                      isTransparent
                        ? 'text-white/80 hover:text-white hover:bg-white/10'
                        : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800',
                    )}
                    aria-label="Account menu"
                  >
                    <Avatar src={user.photoURL} name={userDisplayName(user)} size="sm" />
                  </button>
                  <AnimatePresence>
                    {isUserDropdownOpen && (
                      <UserDropdown isOpen={isUserDropdownOpen} onClose={() => setIsUserDropdownOpen(false)} />
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <Link
                  to="/login"
                  className={cn(
                    'hidden lg:flex items-center justify-center w-10 h-10 rounded-xl transition-colors',
                    isTransparent
                      ? 'text-white/80 hover:text-white hover:bg-white/10'
                      : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800',
                  )}
                  aria-label="Sign in"
                >
                  <User size={20} />
                </Link>
              )}

              {/* Cart */}
              <button
                onClick={openCart}
                className={cn(
                  'relative flex items-center justify-center w-10 h-10 rounded-xl transition-colors',
                  isTransparent
                    ? 'text-white/80 hover:text-white hover:bg-white/10'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800',
                )}
                aria-label="Open cart"
              >
                <ShoppingBag size={20} />
                {totalItems > 0 && (
                  <motion.span
                    key={totalItems}
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full bg-brand-500 text-surface-950 text-caption font-bold"
                  >
                    {totalItems}
                  </motion.span>
                )}
              </button>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setIsMobileOpen(!isMobileOpen)}
                className={cn(
                  'lg:hidden flex items-center justify-center w-10 h-10 rounded-xl transition-colors ml-1',
                  isTransparent
                    ? 'text-white/80 hover:text-white hover:bg-white/10'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800',
                )}
                aria-label="Toggle menu"
              >
                {isMobileOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </nav>
        </Container>
      </header>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-[85%] max-w-sm bg-white dark:bg-surface-900 shadow-2xl lg:hidden flex flex-col"
            >
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-end p-5 pb-0">
                  <button
                    onClick={() => setIsMobileOpen(false)}
                    className="flex items-center justify-center w-11 h-11 rounded-xl text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                  >
                    <X size={22} />
                  </button>
                </div>

                {/* User Zone */}
                <div className="px-5 pt-5 pb-2">
                  {isAuthenticated && user ? (
                    <Link
                      // A guest has only their orders — the rest of the account area needs an account.
                      to={user.isGuest ? '/account/orders' : '/account'}
                      onClick={() => setIsMobileOpen(false)}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-surface-50 dark:bg-surface-850 transition-colors"
                    >
                      <Avatar src={user.photoURL} name={userDisplayName(user)} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50 truncate">
                          {userDisplayName(user)}
                        </p>
                        <p className="text-caption text-surface-400 truncate">{realEmail(user.email)}</p>
                      </div>
                      <ChevronDown size={16} className="-rotate-90 text-surface-400" />
                    </Link>
                  ) : (
                    <div className="flex gap-2">
                      <Link
                        to="/login"
                        onClick={() => setIsMobileOpen(false)}
                        className="flex-1 px-4 py-3 rounded-xl text-center text-body-sm font-semibold bg-brand-500 text-surface-950 hover:bg-brand-600 transition-colors"
                      >
                        Sign In
                      </Link>
                      <Link
                        to="/signup"
                        onClick={() => setIsMobileOpen(false)}
                        className="flex-1 px-4 py-3 rounded-xl text-center text-body-sm font-semibold border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
                      >
                        Sign Up
                      </Link>
                    </div>
                  )}
                </div>

                {/* Quick Order CTA — top priority */}
                <motion.div variants={listVariants} initial="hidden" animate="visible" className="px-5 pt-3">
                  <motion.div variants={itemVariants}>
                    <Link
                      to="/quick-order"
                      onClick={() => setIsMobileOpen(false)}
                      className="flex items-center gap-3 px-4 py-4 rounded-2xl bg-gradient-to-r from-fire-500 to-brand-500 text-white shadow-lg shadow-fire-500/20 active:scale-[0.98] transition-transform"
                    >
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20">
                        <Zap size={22} className="fill-current" />
                      </div>
                      <div>
                        <p className="font-display font-bold text-body-md">Quick Order</p>
                        <p className="text-body-sm text-white/80">Add items fast, bulk friendly</p>
                      </div>
                    </Link>
                  </motion.div>
                </motion.div>

                {/* Browse Section */}
                <motion.div variants={listVariants} initial="hidden" animate="visible" className="px-5 pt-5">
                  <motion.p variants={itemVariants} className="px-2 mb-2 text-label uppercase font-semibold text-surface-400 dark:text-surface-500 tracking-widest">
                    Browse
                  </motion.p>
                  <div className="space-y-0.5">
                    {navLinks
                      .filter((link) => !link.highlight)
                      .map((link) => (
                        <motion.div key={link.label} variants={itemVariants}>
                          {link.children ? (
                            /* Accordion parent */
                            <div>
                              <button
                                onClick={() => setExpandedMenu(expandedMenu === link.label ? null : link.label)}
                                className={cn(
                                  'w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-body-md font-medium transition-colors',
                                  expandedMenu === link.label
                                    ? 'bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-50'
                                    : 'text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-850',
                                )}
                              >
                                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400">
                                  {navIcons[link.label]}
                                </span>
                                <span className="flex-1 text-left">{link.label}</span>
                                <motion.span
                                  animate={{ rotate: expandedMenu === link.label ? 180 : 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="text-surface-400"
                                >
                                  <ChevronDown size={18} />
                                </motion.span>
                              </button>
                              <AnimatePresence>
                                {expandedMenu === link.label && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                                    className="overflow-hidden"
                                  >
                                    <div className="ml-6 pl-5 border-l-2 border-surface-200 dark:border-surface-800 py-1 space-y-0.5">
                                      {link.children.map((child) => (
                                        <Link
                                          key={child.label}
                                          to={child.href}
                                          onClick={() => setIsMobileOpen(false)}
                                          className="block px-3 py-2.5 rounded-lg text-body-sm text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
                                        >
                                          {child.label}
                                        </Link>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          ) : (
                            /* Simple link */
                            <Link
                              to={link.href}
                              onClick={() => setIsMobileOpen(false)}
                              className="flex items-center gap-3 px-3 py-3.5 rounded-xl text-body-md font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
                            >
                              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400">
                                {navIcons[link.label]}
                              </span>
                              {link.label}
                            </Link>
                          )}
                        </motion.div>
                      ))}
                  </div>
                </motion.div>

                {/* Account Section (logged in) */}
                {isAuthenticated && user && (
                  <motion.div variants={listVariants} initial="hidden" animate="visible" className="px-5 pt-5">
                    <motion.p variants={itemVariants} className="px-2 mb-2 text-label uppercase font-semibold text-surface-400 dark:text-surface-500 tracking-widest">
                      My Account
                    </motion.p>
                    <div className="space-y-0.5">
                      {[
                        { to: '/account', icon: <User size={20} />, label: 'Dashboard' },
                        { to: '/account/orders', icon: <Package size={20} />, label: 'Orders' },
                        { to: '/account/wishlist', icon: <Heart size={20} />, label: 'Wishlist' },
                        { to: '/account/addresses', icon: <MapPin size={20} />, label: 'Addresses' },
                      ].map((item) => (
                        <motion.div key={item.label} variants={itemVariants}>
                          <Link
                            to={item.to}
                            onClick={() => setIsMobileOpen(false)}
                            className="flex items-center gap-3 px-3 py-3.5 rounded-xl text-body-md font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
                          >
                            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400">
                              {item.icon}
                            </span>
                            {item.label}
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Support Section */}
                <motion.div variants={listVariants} initial="hidden" animate="visible" className="px-5 pt-5 pb-4">
                  <motion.p variants={itemVariants} className="px-2 mb-2 text-label uppercase font-semibold text-surface-400 dark:text-surface-500 tracking-widest">
                    Support
                  </motion.p>
                  <div className="space-y-0.5">
                    {[
                      { to: '/track-order', icon: <Truck size={20} />, label: 'Track Order' },
                      { to: '/bulk-orders', icon: <Package size={20} />, label: 'Bulk Orders' },
                      { to: '/contact', icon: <Phone size={20} />, label: 'Contact Us' },
                    ].map((item) => (
                      <motion.div key={item.label} variants={itemVariants}>
                        <Link
                          to={item.to}
                          onClick={() => setIsMobileOpen(false)}
                          className="flex items-center gap-3 px-3 py-3.5 rounded-xl text-body-md font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
                        >
                          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400">
                            {item.icon}
                          </span>
                          {item.label}
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* Sticky Footer */}
              <div className="border-t border-surface-200 dark:border-surface-800 p-5 space-y-3">
                {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-3 rounded-xl bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 font-medium text-body-sm hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Chat on WhatsApp
                </a>
                )}
                <div className="flex items-center justify-between text-caption text-surface-400">
                  <span>{siteConfig.contact.phone}</span>
                  <span>{siteConfig.contact.email}</span>
                </div>
                {isAuthenticated && (
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-body-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut size={18} />
                    Sign Out
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
