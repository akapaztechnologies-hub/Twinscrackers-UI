import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Star } from 'lucide-react';
import { getIcon } from '@/lib/content.ts';
import { safeLink } from '@/components/safeLink.ts';
import { Container } from '@/components/atoms/Container.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { useContentSection } from '@/hooks/useContent.ts';
import { useSiteStore } from '@/store/site.ts';

interface Highlight { id: string; icon: string; text: string; }
interface PreviewStat { id: string; value: string; label: string; }

interface AboutPreviewData {
  eyebrow: string;
  titlePrefix: string;
  titleHighlight: string;
  titleSuffix: string;
  body: string;
  image: string;
  imageAlt: string;
  highlights: Highlight[];
  stats: PreviewStat[];
  badgeValue: string;
  badgeLabel: string;
  ctaLabel: string;
  ctaLink: string;
  [key: string]: unknown;
}

/*
 * Fallbacks for any field the shop has not saved in Admin -> Content.
 *
 * They were one shop's history ("Since 1999", 25 years, 50,000 families), and
 * this build serves more than one shop. The name now comes from Company Info
 * (`{name}` below), and the year, the age badge and the counted stats have no
 * stand-in at all: they are shown only once the shop saves its own.
 */
const defaults: AboutPreviewData = {
  eyebrow: 'Our Story',
  titlePrefix: 'Crafting',
  titleHighlight: 'Celebrations',
  titleSuffix: '',
  body: "{name} brings premium fireworks from Sivakasi, India's fireworks capital, to celebrations across the country — every spark chosen for colour, safety and wonder.",
  image: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=900&q=80',
  imageAlt: 'Fireworks lighting up the night sky',
  highlights: [
    { id: 'h1', icon: 'Shield', text: 'Safety guidance with every order' },
    { id: 'h2', icon: 'MapPin', text: 'From Sivakasi, Tamil Nadu' },
    { id: 'h3', icon: 'Leaf', text: 'Low-noise & eco-friendly range' },
  ],
  stats: [],
  badgeValue: '',
  badgeLabel: '',
  ctaLabel: 'Discover Our Story',
  ctaLink: '/about',
};

export function AboutPreview() {
  const data = useContentSection<AboutPreviewData>('about-preview', defaults);
  const siteName = useSiteStore((s) => s.config.name);
  // `{name}` in any text — the default's or the shop's own — reads as the shop name.
  const withName = (text: string) => (text ?? '').replace(/\{name\}/g, siteName);
  const stats = Array.isArray(data.stats) ? data.stats : [];

  return (
    <section className="section-padding bg-white dark:bg-surface-900">
      <Container size="wide">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Image */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            viewport={{ once: true, amount: 0.3 }}
            className="relative"
          >
            <div className="relative rounded-3xl overflow-hidden aspect-[4/3] shadow-card-hover dark:shadow-card-dark-hover">
              <img
                src={data.image}
                alt={withName(data.imageAlt)}
                loading="lazy"
                decoding="async"
                width={900}
                height={675}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            </div>
            {/* Floating heritage badge — only the shop's own figure. */}
            {data.badgeValue && (
              <div className="absolute -bottom-6 left-6 lg:left-8 flex items-center gap-3 rounded-2xl bg-white dark:bg-surface-850 border border-surface-200 dark:border-surface-800 shadow-card-hover dark:shadow-card-dark-hover px-5 py-4">
                <span className="font-display font-bold text-display-sm leading-none text-brand-500">{data.badgeValue}</span>
                <span className="text-body-sm font-medium leading-tight text-surface-600 dark:text-surface-300">
                  {data.badgeLabel}
                </span>
              </div>
            )}
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            viewport={{ once: true, amount: 0.3 }}
          >
            <span className="inline-flex items-center gap-2 mb-4 text-label font-bold uppercase tracking-widest text-brand-500">
              <Sparkles size={16} />
              {data.eyebrow}
            </span>
            <h2 className="font-display font-bold text-display-sm sm:text-display-md text-surface-900 dark:text-surface-50 text-balance">
              {data.titlePrefix} <span className="text-gradient-brand">{data.titleHighlight}</span> {data.titleSuffix}
            </h2>
            <p className="mt-5 text-body-lg text-surface-500 dark:text-surface-400">
              {withName(data.body)}
            </p>

            {/* Highlights */}
            <ul className="mt-6 space-y-3">
              {data.highlights.map((h) => {
                const Icon = getIcon(h.icon, Star);
                return (
                  <li key={h.id} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
                      <Icon size={18} className="text-brand-500" />
                    </span>
                    <span className="text-body-md text-surface-700 dark:text-surface-300">{h.text}</span>
                  </li>
                );
              })}
            </ul>

            {/* Stats — the shop's own figures, or nothing. */}
            {stats.length > 0 && (
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-surface-200 dark:border-surface-800 pt-6">
                {stats.map((s) => (
                  <div key={s.id}>
                    <div className="font-display font-bold text-heading-md text-brand-500">{s.value}</div>
                    <div className="mt-0.5 text-caption text-surface-500 dark:text-surface-400">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* CTA */}
            <div className="mt-8">
              <Link to={safeLink(data.ctaLink) ?? '/about'}>
                <Button size="lg" className="group">
                  {data.ctaLabel}
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
