import { Outlet, Link } from 'react-router-dom';
import { useSiteStore } from '@/store/site.ts';
import logoImg from '@/assets/images/logo_crackers_optimized.png';
import { logoSrc } from '@/lib/logoAssets.ts';
import { RouteErrorBoundary } from '@/AppErrorBoundary.tsx';

export function AuthLayout() {
  const siteConfig = useSiteStore(s => s.config);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-50 dark:bg-surface-950 px-4 py-10">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2.5 mb-8">
        <img src={logoSrc(siteConfig, 'header') || logoImg} alt={siteConfig.name} className="w-[52px] h-[52px] rounded-xl object-contain" />
        <span className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
          {siteConfig.name}
        </span>
      </Link>

      {/* Auth Card */}
      <div className="w-full max-w-md">
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </div>

      {/* Footer Link */}
      <p className="mt-8 text-caption text-surface-400">
        &copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
      </p>
    </div>
  );
}
