import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import { getIcon, unwrapData } from '@/lib/content.ts';
import {
  Package, CheckCircle, AlertCircle, Send, ArrowRight,
} from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { SEO } from '@/components/SEO.tsx';
import { cn } from '@/lib/utils.ts';
import api from '@/lib/api.ts';
import type { FunctionalPagesData } from '@/pages/admin/FunctionalPagesTab.tsx';
import { submitBulkEnquiry } from '@/services/enquiries.ts';

/*
 * Fallbacks until the shop saves its own (Admin -> Content -> Functional
 * Pages) — the same starter text that editor opens with, so the two agree.
 *
 * They used to promise "up to 30% off", fixed discount tiers, a dedicated
 * account manager and skip-the-queue support: one shop's terms, published by
 * every shop that had not written its own. Nothing here is a rate or a
 * service level anyone would be held to.
 */
const defaultBenefits = [
  { id: '1', icon: 'Percent', title: 'Wholesale Pricing', desc: 'Better rates on larger orders — send us your list and we will quote.' },
  { id: '2', icon: 'Package', title: 'Custom Packages', desc: 'Tell us the occasion and budget, and we will suggest an assortment.' },
  { id: '3', icon: 'Users', title: 'Personal Help', desc: 'We call you back to go through quantities, delivery and payment.' },
  { id: '4', icon: 'Headphones', title: 'Direct Contact', desc: 'Reach us by phone or WhatsApp while you plan your order.' },
];

const defaultTiers = [
  { id: '1', range: '₹10,000 – ₹24,999', discount: 'On request', label: 'Starter' },
  { id: '2', range: '₹25,000 – ₹49,999', discount: 'On request', label: 'Business' },
  { id: '3', range: '₹50,000 – ₹99,999', discount: 'On request', label: 'Premium' },
  { id: '4', range: '₹1,00,000+', discount: 'On request', label: 'Enterprise' },
];

/**
 * `fx_ref` is a honeypot: rendered off-screen, never filled in by a real
 * visitor, and filed as spam by the server when a bot fills it in.
 *
 * NOT named `website`, which is what it was called first: Chrome matches that
 * against the saved profile and autofills it, which flagged real people as bots.
 * The name has to be one no browser or password manager recognises, hence the
 * `data-*` opt-outs on the input itself.
 */
const emptyForm = {
  name: '', email: '', phone: '', company: '', eventType: '', budget: '', message: '', fx_ref: '',
};

const inputClass = cn(
  'w-full px-4 py-3 rounded-xl text-body-md',
  'bg-white dark:bg-surface-850',
  'border border-surface-200 dark:border-surface-700',
  'text-surface-900 dark:text-surface-100',
  'placeholder:text-surface-400 dark:placeholder:text-surface-500',
  'focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500',
  'transition-colors',
);

export function BulkOrdersPage() {
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [data, setData] = useState<FunctionalPagesData | null>(null);

  useEffect(() => {
    (api.get('/content/functional-pages') as Promise<{ data: FunctionalPagesData }>)
      .then(res => {
        const data = unwrapData<FunctionalPagesData>(res);
        if (data) setData(data);
      })
      .catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    // Both are custom dropdowns with no native `required`, so a missed pick
    // used to make Submit do nothing at all.
    if (!form.eventType || !form.budget) {
      setError(!form.eventType ? 'Choose the type of event.' : 'Choose your approximate budget.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await submitBulkEnquiry(form);
      // Cleared only once the server has it, so a failed send leaves the
      // enquiry on screen to retry rather than losing what they typed.
      setForm(emptyForm);
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not send your enquiry. Please try again, or call us instead.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const heroTitle = data?.bulkHeroTitle || 'Bulk & Wholesale Orders';
  const heroSubtitle = data?.bulkHeroSubtitle || 'Special pricing, custom packages, and dedicated support for large orders. Perfect for events, retailers, and businesses.';
  const bulkHeroBgImage = data?.bulkHeroBgImage || 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=1920&q=30';
  const tiers = data?.bulkTiers?.length ? data.bulkTiers : defaultTiers;
  const benefits = data?.bulkBenefits?.length ? data.bulkBenefits : defaultBenefits;

  return (
    <div className="pt-16 lg:pt-18 min-h-screen">
      <SEO
        title="Bulk & Wholesale Fireworks Orders"
        description="Order fireworks in bulk for weddings, Diwali, corporate events, and retail. Send us your list for wholesale pricing and a custom quote."
        canonical="/bulk-orders"
      />
      {/* Hero */}
      <section className="relative py-16 lg:py-24 overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-10" 
          style={{ backgroundImage: `url('${bulkHeroBgImage}')` }}
        />
        <Container size="narrow" className="relative z-10">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-6">
              <Package size={16} className="text-white" />
              <span className="text-body-sm font-medium text-white">For Events, Retailers & Wholesalers</span>
            </span>
            <h1 className="font-display font-bold text-display-sm sm:text-display-md text-white">
              {heroTitle}
            </h1>
            <p className="mt-4 text-body-lg text-white/70 max-w-xl mx-auto">
              {heroSubtitle}
            </p>
          </div>
        </Container>
      </section>

      {/* Pricing Tiers */}
      <section className="py-12 bg-white dark:bg-surface-900">
        <Container size="wide">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {tiers.map((tier, i) => (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="text-center p-6 rounded-2xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-800"
              >
                <p className="text-label font-bold uppercase tracking-wider text-brand-500">{tier.label}</p>
                <p className="mt-2 font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">{tier.discount}</p>
                {/* "10% discount" reads right; "On request discount" does not. */}
                <p className="text-body-sm text-surface-500">{/\d/.test(tier.discount) ? 'discount' : 'pricing'}</p>
                <p className="mt-3 text-body-sm text-surface-400">{tier.range}</p>
              </motion.div>
            ))}
          </div>
        </Container>
      </section>

      {/* Benefits */}
      <section className="section-padding bg-surface-50 dark:bg-surface-950">
        <Container size="wide">
          <div className="text-center mb-12">
            <h2 className="font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">Why Order in Bulk?</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((b, i) => {
              const Icon = getIcon(b.icon, LucideIcons.Info);
              return (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  viewport={{ once: true }}
                  className="p-6 rounded-2xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800"
                >
                  <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center mb-4">
                    <Icon size={24} className="text-brand-500" />
                  </div>
                  <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">{b.title}</h3>
                  <p className="mt-2 text-body-sm text-surface-500 dark:text-surface-400">{b.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Inquiry Form */}
      <section className="section-padding bg-white dark:bg-surface-900">
        <Container size="narrow">
          <div className="bg-surface-50 dark:bg-surface-850 rounded-2xl p-6 lg:p-10 border border-surface-200 dark:border-surface-800">
            {submitted ? (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} className="text-emerald-500" />
                </div>
                <h3 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">Inquiry Submitted!</h3>
                <p className="mt-2 text-body-md text-surface-500">We will be in touch soon with a custom quote.</p>
                <button onClick={() => setSubmitted(false)} className="mt-4 text-body-sm text-brand-500 hover:underline">Submit another inquiry</button>
              </motion.div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h2 className="font-display font-bold text-heading-lg text-surface-900 dark:text-surface-50">Request a Quote</h2>
                  <p className="mt-2 text-body-md text-surface-500">Tell us about your needs and we'll prepare a custom offer.</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20"
                    >
                      <AlertCircle size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                      <p className="text-body-sm text-red-700 dark:text-red-300">{error}</p>
                    </div>
                  )}

                  {/* Honeypot. Hidden from people and from screen readers; only
                      a bot filling in every field will touch it. */}
                  <input
                    type="text"
                    name="fx_ref"
                    value={form.fx_ref}
                    onChange={handleChange}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    data-lpignore="true"
                    data-1p-ignore=""
                    data-form-type="other"
                    className="absolute w-px h-px -left-[9999px] opacity-0 pointer-events-none"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input name="name" value={form.name} onChange={handleChange} placeholder="Your name" required className={inputClass} />
                    <input name="company" value={form.company} onChange={handleChange} placeholder="Company / Event name" className={inputClass} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="Email address" required className={inputClass} />
                    <input name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="Phone number" required className={inputClass} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select
                      name="eventType"
                      aria-label="Event type"
                      value={form.eventType}
                      onChange={(v) => setForm((prev) => ({ ...prev, eventType: v }))}
                      placeholder="Event type"
                      size="lg"
                      options={[
                        { value: 'wedding', label: 'Wedding / Reception' },
                        { value: 'festival', label: 'Festival / Diwali' },
                        { value: 'corporate', label: 'Corporate Event' },
                        { value: 'retail', label: 'Retail / Resale' },
                        { value: 'other', label: 'Other' },
                      ]}
                    />
                    <Select
                      name="budget"
                      aria-label="Estimated budget"
                      value={form.budget}
                      onChange={(v) => setForm((prev) => ({ ...prev, budget: v }))}
                      placeholder="Estimated budget"
                      size="lg"
                      options={[
                        { value: '10k-25k', label: '₹10,000 – ₹25,000' },
                        { value: '25k-50k', label: '₹25,000 – ₹50,000' },
                        { value: '50k-1l', label: '₹50,000 – ₹1,00,000' },
                        { value: '1l+', label: '₹1,00,000+' },
                      ]}
                    />
                  </div>
                  <textarea name="message" value={form.message} onChange={handleChange} placeholder="Tell us more about your requirements..." rows={4} className={cn(inputClass, 'resize-none')} />
                  <Button type="submit" size="lg" fullWidth isLoading={isSubmitting} disabled={isSubmitting}>
                    <Send size={18} />
                    {isSubmitting ? 'Sending...' : 'Submit Inquiry'}
                  </Button>
                </form>
              </>
            )}
          </div>
        </Container>
      </section>

      {/* Quick Order CTA */}
      <section className="py-12 bg-surface-50 dark:bg-surface-950 border-t border-surface-200 dark:border-surface-800">
        <Container size="narrow">
          <div className="text-center">
            <p className="text-body-lg text-surface-500 dark:text-surface-400">Know exactly what you need?</p>
            <Link to="/quick-order" className="inline-flex items-center gap-2 mt-2 text-brand-500 font-semibold hover:underline">
              Use our Quick Order tool <ArrowRight size={16} />
            </Link>
          </div>
        </Container>
      </section>
    </div>
  );
}
