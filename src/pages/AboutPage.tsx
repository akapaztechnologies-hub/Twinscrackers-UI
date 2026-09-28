import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { getIcon, unwrapData } from '@/lib/content.ts';
import {
  ArrowRight, Sparkles, Factory
} from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { SEO } from '@/components/SEO.tsx';
import { organizationSchema } from '@/lib/seo.ts';
import { useSiteStore } from '@/store/site.ts';
import { cn } from '@/lib/utils.ts';
import { safeLink } from '@/components/safeLink.ts';
import api from '@/lib/api.ts';
import type { AboutPageData } from '@/pages/admin/AboutTab.tsx';

/*
 * Fallbacks for Admin -> Content -> About, used for any field or list the shop
 * has not saved.
 *
 * They used to be one shop's own history — founded 1999, 25 years, 50,000
 * customers, a 50,000 sq ft facility — and this same build serves more than
 * one shop, so every other shop's About page told that history as its own.
 * What remains says nothing a shop would have to be able to prove: the name
 * comes from Company Info, and the dated or counted sections (stats, the
 * timeline, the facility facts) are left out until the shop writes its own.
 */
const defaultValues = [
  { id: '1', icon: 'Shield', title: 'Safety First', desc: 'Safety guidance with every order, and packing that follows the rules for carrying fireworks.' },
  { id: '2', icon: 'Award', title: 'Premium Quality', desc: 'Fireworks from Sivakasi, chosen for colour, reliability and value.' },
  { id: '3', icon: 'Heart', title: 'Customer Obsession', desc: 'Dedicated support team available through the season. Your celebration is our priority.' },
  { id: '4', icon: 'Target', title: 'Something for Everyone', desc: 'Low-noise, low-smoke and family-friendly options alongside the showpieces.' },
];

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.6, ease: 'easeOut' as const },
};

export function AboutPage() {
  const siteConfig = useSiteStore(s => s.config);
  const [data, setData] = useState<AboutPageData | null>(null);

  useEffect(() => {
    (api.get('/content/about-page') as Promise<{ data: AboutPageData }>)
      .then(res => {
        const data = unwrapData<AboutPageData>(res);
        if (data) setData(data);
      })
      .catch(() => {});
  }, []);

  const heroEyebrow = data?.heroEyebrow || 'Our Story';
  const heroTitle = data?.heroTitle || 'Crafting';
  const heroHighlight = data?.heroHighlight || 'Unforgettable Celebrations';
  const heroSubtitle =
    data?.heroSubtitle ||
    `${siteConfig.name} brings premium fireworks from Sivakasi, India's fireworks capital, to your celebrations — every spark chosen for colour, safety and wonder.`;
  const heroImage = data?.heroImage || 'https://images.unsplash.com/photo-1533604100650-3bf1c8b3e8e8?w=1920&q=30';
  const aboutSideImage = data?.aboutSideImage || 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=800&q=80';
  // Counted and dated claims have no neutral default: shown only once saved.
  const stats = data?.stats ?? [];
  const values = data?.values?.length ? data.values : defaultValues;
  const milestones = data?.milestones ?? [];
  const missionEyebrow = data?.missionEyebrow || 'Our Mission';
  const missionTitle = data?.missionTitle || 'To make every celebration unforgettable with fireworks that are safe, stunning, and accessible to all.';
  const missionBody = data?.missionBody || "We believe celebrations are the moments that define our lives. Whether it's a child's first Diwali, a dream wedding, or a community gathering — the right fireworks transform an event into a memory that lasts forever.";
  const valuesEyebrow = data?.valuesEyebrow || 'What Drives Us';
  const valuesTitle = data?.valuesTitle || 'Our Core Values';
  const timelineEyebrow = data?.timelineEyebrow || 'Our Journey';
  const timelineTitle = data?.timelineTitle || 'Milestones';
  const craftEyebrow = data?.craftEyebrow || 'The Craft';
  const craftTitle = data?.craftTitle || 'From the Fireworks Capital';
  const craftBody = data?.craftBody || 'Sivakasi, Tamil Nadu — the fireworks capital of India, where generations of craft meet modern safety standards.';
  const craftBullets = data?.craftBullets ?? [];
  const ctaTitle = data?.ctaTitle || 'Ready to Create Unforgettable Moments?';
  const ctaSubtitle = data?.ctaSubtitle || 'Browse our premium collection or reach out for custom event packages.';
  const ctaPrimaryLabel = data?.ctaPrimaryLabel || 'Shop Now';
  // Staff-entered links are filtered (see safeLink); a bad one falls back to the default.
  const ctaPrimaryLink = safeLink(data?.ctaPrimaryLink) ?? '/shop';
  const ctaSecondaryLabel = data?.ctaSecondaryLabel || 'Contact Us';
  const ctaSecondaryLink = safeLink(data?.ctaSecondaryLink) ?? '/contact';
  const ctaBgImage = data?.ctaBgImage || 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=1920&q=30';

  return (
    <div className="pt-16 lg:pt-18">
      <SEO
        title="About Us — Premium Fireworks from Sivakasi"
        description={`Learn about ${siteConfig.name} — premium fireworks from Sivakasi, Tamil Nadu, the fireworks capital of India.`}
        canonical="/about"
        jsonLd={organizationSchema()}
      />
      {/* Hero */}
      <section className="relative min-h-[70vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Fireworks craftsmanship"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
        </div>
        <Container size="wide" className="relative z-10 py-20 lg:py-32">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-2xl"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-500/30 bg-brand-500/10 backdrop-blur-sm mb-6">
              <Sparkles size={16} className="text-brand-400" />
              <span className="text-body-sm font-medium text-brand-300">{heroEyebrow}</span>
            </span>
            <h1 className="font-display font-black text-display-md sm:text-display-lg text-white">
              {heroTitle} <span className="text-gradient-brand">{heroHighlight}</span>
            </h1>
            <p className="mt-6 text-body-lg text-white/70 max-w-xl">
              {heroSubtitle}
            </p>
          </motion.div>
        </Container>
      </section>

      {/* Stats Bar — only the shop's own figures, never a stand-in set. */}
      {stats.length > 0 && (
      <section className="bg-white dark:bg-surface-900 border-y border-surface-200 dark:border-surface-800">
        <Container size="wide">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-surface-200 dark:divide-surface-800">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="flex flex-col items-center text-center py-8 lg:py-10"
              >
                <span className="font-display font-bold text-display-sm text-brand-500">{stat.value}</span>
                <span className="mt-1 text-body-sm text-surface-500 dark:text-surface-400">{stat.label}</span>
              </motion.div>
            ))}
          </div>
        </Container>
      </section>
      )}

      {/* Mission */}
      <section className="section-padding bg-surface-50 dark:bg-surface-950">
        <Container size="narrow">
          <motion.div {...fadeUp} className="text-center">
            <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-brand-500">{missionEyebrow}</span>
            <h2 className="font-display font-bold text-display-sm sm:text-display-md text-surface-900 dark:text-surface-50 text-balance">
              {missionTitle}
            </h2>
            <p className="mt-6 text-body-lg text-surface-500 dark:text-surface-400 max-w-2xl mx-auto">
              {missionBody}
            </p>
          </motion.div>
        </Container>
      </section>

      {/* Values */}
      <section className="section-padding bg-white dark:bg-surface-900">
        <Container size="wide">
          <motion.div {...fadeUp} className="text-center mb-12 lg:mb-16">
            <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-brand-500">{valuesEyebrow}</span>
            <h2 className="font-display font-bold text-display-sm sm:text-display-md text-surface-900 dark:text-surface-50">{valuesTitle}</h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, i) => {
              const Icon = getIcon(value.icon, LucideIcons.Star);
              return (
                <motion.div
                  key={value.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  viewport={{ once: true }}
                  className="group p-6 lg:p-8 rounded-2xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-800 hover:border-brand-500/30 hover:shadow-glow transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center mb-4 group-hover:bg-brand-500/20 transition-colors">
                    <Icon size={24} className="text-brand-500" />
                  </div>
                  <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">{value.title}</h3>
                  <p className="mt-2 text-body-sm text-surface-500 dark:text-surface-400">{value.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Timeline — the shop's own dates only; hidden until some are saved. */}
      {milestones.length > 0 && (
      <section className="section-padding bg-surface-50 dark:bg-surface-950">
        <Container size="narrow">
          <motion.div {...fadeUp} className="text-center mb-12 lg:mb-16">
            <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-brand-500">{timelineEyebrow}</span>
            <h2 className="font-display font-bold text-display-sm sm:text-display-md text-surface-900 dark:text-surface-50">{timelineTitle}</h2>
          </motion.div>
          <div className="relative">
            {/* Center line */}
            <div className="absolute left-6 lg:left-1/2 top-0 bottom-0 w-px bg-surface-200 dark:bg-surface-800 lg:-translate-x-px" />
            <div className="space-y-10 lg:space-y-12">
              {milestones.map((ms, i) => (
                <motion.div
                  key={ms.id}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5 }}
                  viewport={{ once: true }}
                  className={cn(
                    'relative flex items-start gap-6',
                    'lg:items-center',
                    i % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse',
                  )}
                >
                  {/* Dot */}
                  <div className="absolute left-6 lg:left-1/2 w-3 h-3 rounded-full bg-brand-500 -translate-x-1.5 mt-2 lg:mt-0 z-10 shadow-glow" />
                  {/* Content */}
                  <div className={cn('flex-1 ml-14 lg:ml-0', i % 2 === 0 ? 'lg:text-right lg:pr-12' : 'lg:text-left lg:pl-12')}>
                    <span className="text-label font-bold uppercase tracking-widest text-brand-500">{ms.year}</span>
                    <h3 className="mt-1 font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">{ms.title}</h3>
                    <p className="mt-1 text-body-sm text-surface-500 dark:text-surface-400">{ms.desc}</p>
                  </div>
                  <div className="hidden lg:block flex-1" />
                </motion.div>
              ))}
            </div>
          </div>
        </Container>
      </section>
      )}

      {/* Factory / Craft Section */}
      <section className="section-padding bg-white dark:bg-surface-900">
        <Container size="wide">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <motion.div {...fadeUp}>
              <div className="relative rounded-2xl overflow-hidden aspect-[4/3]">
                <img
                  src={aboutSideImage}
                  alt="Our craftsmanship"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-brand-500">{craftEyebrow}</span>
              <h2 className="font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">
                {craftTitle}
              </h2>
              <p className="mt-4 text-body-lg text-surface-500 dark:text-surface-400">
                {craftBody}
              </p>
              {craftBullets.length > 0 && (
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {craftBullets.map((bullet) => {
                  const Icon = getIcon(bullet.icon, Factory);
                  return (
                    <div key={bullet.id} className="flex items-center gap-3">
                      <Icon size={18} className="text-brand-500 flex-shrink-0" />
                      <span className="text-body-sm text-surface-700 dark:text-surface-300">{bullet.text}</span>
                    </div>
                  );
                })}
              </div>
              )}
            </motion.div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-surface-900 via-surface-950 to-black" />
        {ctaBgImage && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-10"
            style={{ backgroundImage: `url('${ctaBgImage}')` }}
          />
        )}
        <Container size="narrow">
          <motion.div {...fadeUp} className="relative py-20 lg:py-28 text-center">
            <h2 className="font-display font-bold text-display-sm sm:text-display-md text-white text-balance">
              {ctaTitle}
            </h2>
            <p className="mt-4 text-body-lg text-white/60 max-w-xl mx-auto">
              {ctaSubtitle}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to={ctaPrimaryLink}>
                <Button size="xl" className="group">
                  {ctaPrimaryLabel}
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link to={ctaSecondaryLink}>
                <Button variant="outline" size="xl" className="border-white/30 text-white hover:border-brand-400 hover:text-brand-400">
                  {ctaSecondaryLabel}
                </Button>
              </Link>
            </div>
          </motion.div>
        </Container>
      </section>
    </div>
  );
}
