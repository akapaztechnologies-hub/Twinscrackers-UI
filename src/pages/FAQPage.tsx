import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, MessageSquare, Phone } from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { SEO } from '@/components/SEO.tsx';
import { useSiteStore } from '@/store/site.ts';
import { faqSchema } from '@/lib/seo.ts';
import { cn } from '@/lib/utils.ts';
import { safeLink } from '@/components/safeLink.ts';
import api from '@/lib/api.ts';

interface FAQItem {
  q: string;
  a: string;
}

interface FAQCategory {
  title: string;
  icon: string;
  items: FAQItem[];
}

/*
 * Answers shown until the shop saves its own FAQ.
 *
 * They used to quote one shop's terms — free delivery above ₹999, ₹99 and ₹199
 * fees, cash on delivery up to ₹25,000 with a ₹49 charge, a 2-hour cancellation
 * window, "all 28 states" — and they also go into the page's search-result
 * markup, so every shop running this build told search engines the same. Each
 * answer now points to where the real figure lives (checkout, which reads
 * Settings) and matches the starter policy text.
 */
const defaultFaqData: FAQCategory[] = [
  {
    title: 'Ordering & Payment',
    icon: '🛒',
    items: [
      { q: 'What payment methods do you accept?', a: 'The ways to pay for your order are shown at checkout, before you pay. Online payments are handled by our payment provider; we never see or store your full card details.' },
      { q: 'Is there a minimum order amount?', a: 'If a minimum order value applies, your cart and checkout say so — and how much more to add — before you pay.' },
      { q: 'Can I modify or cancel my order after placing it?', a: 'Contact us as soon as you can with your order number and we will do our best to help. Once an order has been dispatched it can no longer be changed.' },
      { q: 'Do you offer cash on delivery?', a: 'If cash on delivery is available for your order, you will see it as a payment option at checkout.' },
    ],
  },
  {
    title: 'Shipping & Delivery',
    icon: '🚚',
    items: [
      { q: 'How long does delivery take?', a: 'The estimated time for your order is shown at checkout. During the festival rush it can take a little longer — we will keep you updated.' },
      { q: 'Do you ship across India?', a: 'Enter your PIN code at checkout to see whether we can deliver to you. Some states restrict transporting fireworks at certain times of the year; if your order is affected, we will contact you before sending it.' },
      { q: 'Is shipping free?', a: 'The delivery charge for your order is shown at checkout, before you pay.' },
      { q: 'How are fireworks shipped safely?', a: 'Fireworks are packed in sturdy cartons, following the Indian rules for transporting explosives, and handed only to transport operators licensed to carry them.' },
    ],
  },
];

const defaultHeader = {
  eyebrow: 'Help Center',
  title: 'Frequently Asked Questions',
  subtitle: 'Everything you need to know about ordering, safety, shipping, and more.',
  searchPlaceholder: 'Search for answers...',
  ctaHeading: 'Still have questions?',
  ctaSubtitle: 'Our team is happy to help. Reach out anytime.',
  ctaButtonLabel: 'Contact Us',
  ctaButtonLink: '/contact',
};

export function FAQPage() {
  const siteConfig = useSiteStore(s => s.config);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [faqData, setFaqData] = useState<FAQCategory[]>(defaultFaqData);
  const [header, setHeader] = useState(defaultHeader);

  useEffect(() => {
    (api.get('/content/faq') as Promise<Record<string, unknown> | null>)
      .then((result) => {
        if (!result) return;
        const data = (result.data || result) as Record<string, unknown>;
        if (data && Array.isArray(data.categories) && data.categories.length > 0) {
          const mapped = data.categories.map((cat: { name?: string; icon?: string; items?: Array<{ question?: string; answer?: string }> }) => ({
            title: cat.name || '',
            icon: cat.icon || '',
            items: (cat.items || []).map((item: { question?: string; answer?: string }) => ({
              q: item.question || '',
              a: item.answer || '',
            }))
          }));
          setFaqData(mapped);
        }
        if (data.header && typeof data.header === 'object') {
          setHeader((h) => ({ ...h, ...(data.header as typeof defaultHeader) }));
        }
      })
      .catch(() => {});
  }, []);

  const toggleItem = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return [faqData[activeCategory]];
    const term = search.toLowerCase();
    return faqData
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) => item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [faqData, activeCategory, search]);

  const faqJsonLd = useMemo(
    () => faqSchema(faqData.flatMap((cat) => cat.items.map((item) => ({ question: item.q, answer: item.a })))),
    [faqData],
  );

  return (
    <div className="pt-16 lg:pt-18 min-h-screen">
      <SEO
        title="Frequently Asked Questions (FAQ) — Fireworks Buying Guide"
        description={`Find answers to common questions about ordering fireworks, payment methods, shipping, safety ratings, returns, and bulk orders at ${siteConfig.name}.`}
        canonical="/faq"
        jsonLd={faqJsonLd}
      />
      {/* Header */}
      <section className="pt-8 pb-10 lg:pt-10 lg:pb-14 bg-white dark:bg-surface-900">
        <Container size="narrow">
          <div className="text-center">
            <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-brand-500">{header.eyebrow}</span>
            <h1 className="font-display font-bold text-display-sm sm:text-display-md text-surface-900 dark:text-surface-50">
              {header.title}
            </h1>
            <p className="mt-4 text-body-lg text-surface-500 dark:text-surface-400">
              {header.subtitle}
            </p>

            {/* Search */}
            <div className="relative mt-8 max-w-lg mx-auto">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={header.searchPlaceholder}
                className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-700 text-body-md text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
              />
            </div>
          </div>
        </Container>
      </section>

      <section className="section-padding bg-surface-50 dark:bg-surface-950">
        <Container size="wide">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Category Tabs (sidebar) */}
            {!search.trim() && (
              <div className="lg:col-span-1">
                <div className="sticky top-24 space-y-1">
                  {faqData.map((cat, i) => (
                    <button
                      key={cat.title}
                      onClick={() => setActiveCategory(i)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-body-sm font-medium transition-all duration-200',
                        activeCategory === i
                          ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20'
                          : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800',
                      )}
                    >
                      <span className="text-lg">{cat.icon}</span>
                      {cat.title}
                      <span className="ml-auto text-caption text-surface-400">{cat.items.length}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* FAQ Accordion */}
            <div className={cn(search.trim() ? 'lg:col-span-4' : 'lg:col-span-3')}>
              {filteredCategories.map((cat) => (
                <div key={cat.title} className="mb-8 last:mb-0">
                  {search.trim() && (
                    <h3 className="flex items-center gap-2 font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50 mb-4">
                      <span>{cat.icon}</span> {cat.title}
                    </h3>
                  )}
                  <div className="space-y-3">
                    {cat.items.map((item, i) => {
                      const key = `${cat.title}-${i}`;
                      const isOpen = openItems.has(key);
                      return (
                        <div
                          key={key}
                          className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 overflow-hidden transition-all duration-200 hover:border-brand-500/20"
                        >
                          <button
                            onClick={() => toggleItem(key)}
                            className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                          >
                            <span className="font-display font-semibold text-body-lg text-surface-900 dark:text-surface-100">
                              {item.q}
                            </span>
                            <ChevronDown
                              size={20}
                              className={cn(
                                'flex-shrink-0 text-surface-400 transition-transform duration-200',
                                isOpen && 'rotate-180 text-brand-500',
                              )}
                            />
                          </button>
                          <AnimatePresence>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <div className="px-6 pb-5 text-body-md text-surface-500 dark:text-surface-400 leading-relaxed">
                                  {item.a}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-16 bg-white dark:bg-surface-900 border-t border-surface-200 dark:border-surface-800">
        <Container size="narrow">
          <div className="text-center">
            <h2 className="font-display font-bold text-heading-lg text-surface-900 dark:text-surface-50">
              {header.ctaHeading}
            </h2>
            <p className="mt-2 text-body-lg text-surface-500 dark:text-surface-400">
              {header.ctaSubtitle}
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to={safeLink(header.ctaButtonLink) ?? '/contact'}>
                <Button size="lg">
                  <MessageSquare size={18} />
                  {header.ctaButtonLabel}
                </Button>
              </Link>
              <a href={`tel:${siteConfig.contact.phone.replace(/\s/g, '')}`}>
                <Button variant="outline" size="lg">
                  <Phone size={18} />
                  {siteConfig.contact.phone}
                </Button>
              </a>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
