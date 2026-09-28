import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Package, MapPin, Shield, Heart, Bell } from 'lucide-react';
import { Avatar } from '@/components/atoms/Avatar.tsx';
import { useAuthStore } from '@/store/auth.ts';
import { accountSections } from '@/config/account.ts';
import { realEmail } from '@/components/guestEmail.ts';
import { userDisplayName, userFirstName } from '@/components/userDisplay.ts';

const iconMap: Record<string, typeof User> = { User, Package, MapPin, Shield, Heart, Bell };

export function AccountDashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      {/* Welcome */}
      <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 lg:p-8 border border-surface-200 dark:border-surface-800 mb-6">
        <div className="flex items-center gap-4">
          <Avatar src={user?.photoURL} name={userDisplayName(user) || 'User'} size="lg" />
          <div>
            <h1 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
              {/* A guest token carries no name — never "Welcome, undefined!". */}
              {userFirstName(user) ? `Welcome, ${userFirstName(user)}!` : 'Welcome!'}
            </h1>
            <p className="text-body-md text-surface-500">{realEmail(user?.email)}</p>
          </div>
        </div>
      </div>

      {/* Section Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accountSections.map((section, i) => {
          const Icon = iconMap[section.icon] ?? User;
          return (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Link
                to={section.href}
                className="block p-6 bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 hover:border-brand-500/30 hover:shadow-md transition-all duration-200 group"
              >
                <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center mb-4 group-hover:bg-brand-500/20 transition-colors">
                  <Icon size={24} className="text-brand-500" />
                </div>
                <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">
                  {section.label}
                </h3>
                <p className="mt-1 text-body-sm text-surface-500">{section.description}</p>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
