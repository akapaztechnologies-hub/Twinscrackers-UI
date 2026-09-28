import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '@/components/atoms/Container.tsx';
import { useSiteStore } from '@/store/site.ts';
import { footerLinks } from '@/config/navigation.ts';
import { useCategories } from '@/hooks/useCategories.ts';
import { OCCASIONS } from '@/config/occasions.ts';
import { Instagram, Facebook, Youtube } from 'lucide-react';
import { WhatsAppIcon, TelegramIcon } from '@/components/atoms/BrandIcons.tsx';
import logoImg from '@/assets/images/logo_crackers_optimized.png';
import { logoSrc } from '@/lib/logoAssets.ts';
import { safeLink } from '@/components/safeLink.ts';

interface FooterLink { label: string; href: string; }
interface FooterColumn { title: string; links: FooterLink[]; }

// Nothing a shop would have to prove (a certification, delivery coverage).
const defaultBadges = ['Safe & Secure Payments'];

export function Footer() {
  const siteConfig = useSiteStore(s => s.config);
  const currentYear = new Date().getFullYear();
  const categories = useCategories();
  const columns = useMemo<FooterColumn[]>(() => [
    {
      title: 'Shop',
      links: [
        { label: 'All Products', href: '/shop' },
        ...categories.slice(0, 6).map((c) => ({ label: c.name, href: `/shop?category=${c.slug}` })),
        { label: 'Combo Packs', href: '/combo-packs' },
      ],
    },
    { title: 'Occasions', links: OCCASIONS.map((o) => ({ label: o.label, href: `/shop?occasion=${o.slug}` })) },
    { title: 'Company', links: footerLinks.company },
    { title: 'Support', links: footerLinks.support },
  ], [categories]);
  const badges = defaultBadges;
  const copyrightSuffix = 'All rights reserved.';

  return (
    <footer className="bg-surface-100 dark:bg-surface-900 border-t border-surface-200 dark:border-surface-800">
      {/* Main Footer */}
      <Container size="wide">
        <div className="py-10 lg:py-14">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">
            {/* Brand */}
            <div className="sm:col-span-2 lg:col-span-1">
              <Link to="/" className="flex items-center gap-2 mb-4">
                <img src={logoSrc(siteConfig, 'header') || logoImg} alt={siteConfig.name} className="w-11 h-11 rounded-lg object-contain" />
                <span className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">
                  {siteConfig.name}
                </span>
              </Link>
              <p className="text-body-sm text-surface-500 dark:text-surface-400 mb-6 max-w-xs">
                {/* No borrowed customer count in the fallback: the default badge figures are another shop's. */}
                {siteConfig.footerBlurb || `${siteConfig.tagline}.`}
              </p>
              {/* A channel with no URL set in Admin → Content → Social Media
                  is dropped rather than rendered as a dead chip; WhatsApp comes
                  from the contact number, which the store turns into a wa.me
                  link. Each URL is typed in by staff, so one that is not a
                  web address is dropped too (see safeLink). */}
              <div className="flex flex-wrap items-center gap-3">
                {[
                  { icon: Instagram, href: safeLink(siteConfig.social.instagram) ?? undefined, label: 'Instagram' },
                  { icon: Facebook, href: safeLink(siteConfig.social.facebook) ?? undefined, label: 'Facebook' },
                  { icon: Youtube, href: safeLink(siteConfig.social.youtube) ?? undefined, label: 'YouTube' },
                  { icon: TelegramIcon, href: safeLink(siteConfig.social.telegram) ?? undefined, label: 'Telegram' },
                  { icon: WhatsAppIcon, href: safeLink(siteConfig.social.whatsapp) ?? undefined, label: 'WhatsApp' },
                ].filter(({ href }) => Boolean(href)).map(({ icon: Icon, href, label }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-surface-200 dark:bg-surface-800 text-surface-500 dark:text-surface-400 hover:bg-brand-500 hover:text-surface-950 transition-all duration-200"
                  >
                    <Icon size={18} />
                  </a>
                ))}
              </div>
            </div>

            {/* Link Columns */}
            {columns.map((section) => (
              <div key={section.title}>
                <h3 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50 mb-4">
                  {section.title}
                </h3>
                <ul className="space-y-2.5">
                  {section.links.map((link) => (
                    <li key={link.href + link.label}>
                      <Link
                        to={link.href}
                        className="text-body-sm text-surface-500 dark:text-surface-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Container>

      {/* Bottom Bar */}
      <div className="border-t border-surface-200 dark:border-surface-800">
        <Container size="wide">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
            <p className="text-caption text-surface-400">
              &copy; {currentYear} {siteConfig.name}. {copyrightSuffix}
            </p>
            <div className="flex items-center gap-4">
              {badges.map((badge, i) => (
                <span key={badge} className="flex items-center gap-4">
                  {i > 0 && <span className="text-caption text-surface-400">|</span>}
                  <span className="text-caption text-surface-400">{badge}</span>
                </span>
              ))}
            </div>
          </div>
        </Container>
      </div>
    </footer>
  );
}
