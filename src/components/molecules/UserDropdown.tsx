import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, UserPlus, Package, Heart, MapPin, Settings, LogOut, LayoutDashboard } from 'lucide-react';
import { Avatar } from '@/components/atoms/Avatar.tsx';
import { useAuthStore } from '@/store/auth.ts';
import { realEmail } from '@/components/guestEmail.ts';
import { userDisplayName } from '@/components/userDisplay.ts';
// signOutUser is dynamically imported to keep auth service out of the initial bundle

interface UserDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItems = [
  { icon: User, label: 'My Account', href: '/account' },
  { icon: Package, label: 'Orders', href: '/account/orders' },
  { icon: Heart, label: 'Wishlist', href: '/account/wishlist' },
  { icon: MapPin, label: 'Addresses', href: '/account/addresses' },
  { icon: Settings, label: 'Settings', href: '/account/security' },
];

/*
 * A guest is signed in only to the orders placed on this device — the rest of
 * the account area needs a real account, so the menu offers exactly that
 * instead of links that would only redirect.
 */
const guestMenuItems = [
  { icon: Package, label: 'My Orders', href: '/account/orders' },
  { icon: UserPlus, label: 'Create your account', href: '/claim-account' },
];

export function UserDropdown({ isOpen, onClose }: UserDropdownProps) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const logout = useAuthStore((s) => s.logout);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleSignOut = async () => {
    const { signOutUser } = await import('@/services/auth.ts');
    await signOutUser();
    logout();
    onClose();
  };

  if (!isOpen || !user) return null;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-xl overflow-hidden z-50"
    >
      {/* User Info */}
      <div className="p-4 border-b border-surface-100 dark:border-surface-800">
        <div className="flex items-center gap-3">
          <Avatar src={user.photoURL} name={userDisplayName(user)} size="md" />
          <div className="min-w-0">
            <p className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50 truncate">
              {userDisplayName(user)}
            </p>
            <p className="text-caption text-surface-400 truncate">{realEmail(user.email)}</p>
          </div>
        </div>
      </div>

      {/* Admin Link */}
      {isAdmin && (
        <div className="px-2 pt-2">
          <Link
            to="/admin"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-500/5 hover:bg-brand-500/10 transition-colors"
          >
            <LayoutDashboard size={18} />
            Admin Panel
          </Link>
        </div>
      )}

      {/* Menu Items */}
      <div className="p-2">
        {(user.isGuest ? guestMenuItems : menuItems).map(({ icon: Icon, label, href }) => (
          <Link
            key={href}
            to={href}
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
          >
            <Icon size={18} className="text-surface-400" />
            {label}
          </Link>
        ))}
      </div>

      {/* Sign Out */}
      <div className="p-2 border-t border-surface-100 dark:border-surface-800">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm text-red-500 hover:bg-red-500/10 transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </motion.div>
  );
}
