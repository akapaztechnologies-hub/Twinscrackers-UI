import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Phone, Mail, MapPin, Clock, Send, MessageSquare,
  ChevronRight, CheckCircle, AlertCircle, Instagram, Facebook, Youtube,
} from 'lucide-react';
import { TelegramIcon } from '@/components/atoms/BrandIcons.tsx';
import { Container } from '@/components/atoms/Container.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { SEO } from '@/components/SEO.tsx';
import { localBusinessSchema } from '@/lib/seo.ts';
import { useSiteStore } from '@/store/site.ts';
import type { SiteConfig } from '@/store/site.ts';
import { useContentSection } from '@/hooks/useContent.ts';
import { cn } from '@/lib/utils.ts';
import { submitContactEnquiry } from '@/services/enquiries.ts';
import { safeLink } from '@/components/safeLink.ts';

type ContactMethodType = 'phone' | 'email' | 'whatsapp' | 'address';
interface ContactMethod { id: string; type: ContactMethodType; label: string; valueOverride: string; desc: string; }
interface SubjectOpt { id: string; value: string; label: string; }
interface HoursRow { id: string; day: string; time: string; }
interface QuickLink { id: string; label: string; href: string; }

interface ContactPageData {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  methods: ContactMethod[];
  formHeading: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  phonePlaceholder: string;
  messagePlaceholder: string;
  submitLabel: string;
  subjectPlaceholder: string;
  subjectOptions: SubjectOpt[];
  successTitle: string;
  successMessage: string;
  successResetLabel: string;
  hoursHeading: string;
  hours: HoursRow[];
  socialHeading: string;
  quickLinksHeading: string;
  quickLinks: QuickLink[];
  [key: string]: unknown;
}

const defaults: ContactPageData = {
  heroEyebrow: 'Get in Touch',
  heroTitle: "We'd Love to Hear From You",
  heroSubtitle: "Whether you need help choosing the right fireworks, have a bulk inquiry, or just want to say hello — we're here.",
  methods: [
    { id: 'm1', type: 'phone', label: 'Call Us', valueOverride: '', desc: 'Mon-Sat, 9 AM - 8 PM IST' },
    { id: 'm2', type: 'email', label: 'Email Us', valueOverride: '', desc: 'We reply within 24 hours' },
    { id: 'm3', type: 'whatsapp', label: 'WhatsApp', valueOverride: 'Chat with us', desc: 'Instant support on WhatsApp' },
    { id: 'm4', type: 'address', label: 'Visit Us', valueOverride: '', desc: 'Open during festival season' },
  ],
  formHeading: 'Send Us a Message',
  namePlaceholder: 'Your name',
  emailPlaceholder: 'Email address',
  phonePlaceholder: 'Phone number',
  messagePlaceholder: 'Your message...',
  submitLabel: 'Send Message',
  subjectPlaceholder: 'Select subject',
  subjectOptions: [
    { id: 'so1', value: 'general', label: 'General Inquiry' },
    { id: 'so2', value: 'bulk', label: 'Bulk Order Inquiry' },
    { id: 'so3', value: 'support', label: 'Order Support' },
    { id: 'so4', value: 'safety', label: 'Safety Question' },
    { id: 'so5', value: 'partnership', label: 'Business Partnership' },
  ],
  successTitle: 'Message Sent!',
  successMessage: "We'll get back to you within 24 hours.",
  successResetLabel: 'Send another message',
  hoursHeading: 'Business Hours',
  hours: [
    { id: 'hr1', day: 'Monday - Saturday', time: '9:00 AM - 8:00 PM' },
    { id: 'hr2', day: 'Sunday', time: '10:00 AM - 6:00 PM' },
    { id: 'hr3', day: 'Festival Season', time: '8:00 AM - 10:00 PM' },
  ],
  socialHeading: 'Follow Us',
  quickLinksHeading: 'Quick Links',
  quickLinks: [
    { id: 'ql1', label: 'Track Your Order', href: '/track-order' },
    { id: 'ql2', label: 'Bulk Order Inquiry', href: '/bulk-orders' },
    { id: 'ql3', label: 'FAQ', href: '/faq' },
    { id: 'ql4', label: 'Safety Guidelines', href: '/safety' },
  ],
};

const methodIconMap = { phone: Phone, email: Mail, whatsapp: MessageSquare, address: MapPin } as const;
const methodColorMap = {
  phone: 'bg-emerald-500/10 text-emerald-500',
  email: 'bg-blue-500/10 text-blue-500',
  whatsapp: 'bg-green-500/10 text-green-500',
  address: 'bg-brand-500/10 text-brand-500',
} as const;

function methodValue(m: ContactMethod, siteConfig: SiteConfig): string {
  if (m.valueOverride) return m.valueOverride;
  if (m.type === 'phone') return siteConfig.contact.phone;
  if (m.type === 'email') return siteConfig.contact.email;
  if (m.type === 'address') return siteConfig.contact.address;
  return 'Chat with us';
}

function methodHref(m: ContactMethod, siteConfig: SiteConfig): string {
  if (m.type === 'phone') return `tel:${siteConfig.contact.phone.replace(/\s/g, '')}`;
  if (m.type === 'email') return `mailto:${siteConfig.contact.email}`;
  // Built from shop settings, so it goes through the same filter as every
  // other staff-entered link; a value that is not a web address goes nowhere.
  if (m.type === 'whatsapp') return safeLink(siteConfig.social.whatsapp) ?? '#';
  return '#';
}

/**
 * `fx_ref` is a honeypot: rendered off-screen, never filled in by a real
 * visitor, and filed as spam by the server when a bot fills it in.
 *
 * NOT named `website`, which is what it was called first: Chrome matches that
 * against the saved profile and autofills it, which flagged real people as bots.
 * The name has to be one no browser or password manager recognises, hence the
 * `data-*` opt-outs on the input itself.
 */
const emptyForm = { name: '', email: '', phone: '', subject: '', message: '', fx_ref: '' };

const inputClass = cn(
  'w-full px-4 py-3 rounded-xl text-body-md',
  'bg-white dark:bg-surface-850',
  'border border-surface-200 dark:border-surface-700',
  'text-surface-900 dark:text-surface-100',
  'placeholder:text-surface-400 dark:placeholder:text-surface-500',
  'focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500',
  'transition-colors',
);

export function ContactPage() {
  const siteConfig = useSiteStore(s => s.config);
  const content = useContentSection<ContactPageData>('contact-page', defaults);

  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    // The subject is a custom dropdown with no native `required`, so a missed
    // pick used to make Send do nothing at all.
    if (!form.subject) {
      setError('Choose what your message is about.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await submitContactEnquiry(form);
      // Cleared only once the server has it, so a failed send leaves the
      // visitor's message on screen to retry rather than losing what they typed.
      setForm(emptyForm);
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not send your message. Please try again, or call us instead.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pt-16 lg:pt-18 min-h-screen">
      <SEO
        title={`Contact Us — ${siteConfig.name} Support & Inquiries`}
        description={`Get in touch with ${siteConfig.name}. Call ${siteConfig.contact.phone}, email ${siteConfig.contact.email}, or visit us in ${siteConfig.contact.address}.`}
        canonical="/contact"
        jsonLd={localBusinessSchema()}
      />
      {/* Header */}
      <section className="pt-8 pb-10 lg:pt-10 lg:pb-14 bg-white dark:bg-surface-900">
        <Container size="wide">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-brand-500">{content.heroEyebrow}</span>
            <h1 className="font-display font-bold text-display-sm sm:text-display-md text-surface-900 dark:text-surface-50">
              {content.heroTitle}
            </h1>
            <p className="mt-4 text-body-lg text-surface-500 dark:text-surface-400">
              {content.heroSubtitle}
            </p>
          </div>
        </Container>
      </section>

      {/* Contact Cards + Form + Social */}
      <section className="py-10 lg:py-14 bg-surface-50 dark:bg-surface-950">
        <Container size="wide">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {content.methods.map((method, i) => {
              const Icon = methodIconMap[method.type] || Phone;
              const href = methodHref(method, siteConfig);
              return (
                <motion.a
                  key={method.id}
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  viewport={{ once: true }}
                  className="group p-6 rounded-2xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 hover:border-brand-500/30 hover:shadow-glow transition-all duration-300"
                >
                  <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center mb-4', methodColorMap[method.type])}>
                    <Icon size={22} />
                  </div>
                  <p className="text-label font-bold uppercase tracking-wider text-surface-400 mb-1">{method.label}</p>
                  <p className="font-display font-semibold text-body-lg text-surface-900 dark:text-surface-100 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors">
                    {methodValue(method, siteConfig)}
                  </p>
                  <p className="mt-1 text-body-sm text-surface-500 dark:text-surface-400">{method.desc}</p>
                </motion.a>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16">
            {/* Form */}
            <div className="lg:col-span-3">
              <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 lg:p-8 border border-surface-200 dark:border-surface-800">
                {submitted ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-16 text-center"
                  >
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle size={32} className="text-emerald-500" />
                    </div>
                    <h3 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">{content.successTitle}</h3>
                    <p className="mt-2 text-body-md text-surface-500">{content.successMessage}</p>
                    <button onClick={() => setSubmitted(false)} className="mt-4 text-body-sm text-brand-500 hover:underline">
                      {content.successResetLabel}
                    </button>
                  </motion.div>
                ) : (
                  <>
                    <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50 mb-6">
                      {content.formHeading}
                    </h2>
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

                      {/* Honeypot. Hidden from people and from screen readers;
                          only a bot filling in every field will touch it. */}
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
                        <input name="name" value={form.name} onChange={handleChange} placeholder={content.namePlaceholder} required className={inputClass} />
                        <input name="email" type="email" value={form.email} onChange={handleChange} placeholder={content.emailPlaceholder} required className={inputClass} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <input name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder={content.phonePlaceholder} className={inputClass} />
                        <Select
                          name="subject"
                          value={form.subject}
                          onChange={(v) => setForm((f) => ({ ...f, subject: v }))}
                          size="lg"
                          placeholder={content.subjectPlaceholder}
                          options={content.subjectOptions.map((o) => ({ value: o.value, label: o.label }))}
                        />
                      </div>
                      <textarea
                        name="message"
                        value={form.message}
                        onChange={handleChange}
                        placeholder={content.messagePlaceholder}
                        required
                        rows={5}
                        className={cn(inputClass, 'resize-none')}
                      />
                      <Button type="submit" size="lg" fullWidth isLoading={isSubmitting} disabled={isSubmitting}>
                        <Send size={18} />
                        {isSubmitting ? 'Sending...' : content.submitLabel}
                      </Button>
                    </form>
                  </>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-2 space-y-6">
              {/* Hours */}
              <div className="p-6 rounded-2xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
                <div className="flex items-center gap-3 mb-4">
                  <Clock size={20} className="text-brand-500" />
                  <h3 className="font-display font-semibold text-heading-sm text-surface-900 dark:text-surface-50">{content.hoursHeading}</h3>
                </div>
                <div className="space-y-2 text-body-sm">
                  {content.hours.map((h) => (
                    <div key={h.id} className="flex justify-between">
                      <span className="text-surface-500 dark:text-surface-400">{h.day}</span>
                      <span className="font-medium text-surface-900 dark:text-surface-100">{h.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Social */}
              <div className="p-6 rounded-2xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
                <h3 className="font-display font-semibold text-heading-sm text-surface-900 dark:text-surface-50 mb-4">{content.socialHeading}</h3>
                <div className="flex gap-3">
                  {/* Staff-entered URLs: one that is not a web address is dropped (see safeLink). */}
                  {[
                    { icon: Instagram, href: safeLink(siteConfig.social.instagram) ?? undefined, label: 'Instagram' },
                    { icon: Facebook, href: safeLink(siteConfig.social.facebook) ?? undefined, label: 'Facebook' },
                    { icon: Youtube, href: safeLink(siteConfig.social.youtube) ?? undefined, label: 'YouTube' },
                    // WhatsApp is deliberately absent: it already has a row of
                    // its own in the contact methods above this card.
                    { icon: TelegramIcon, href: safeLink(siteConfig.social.telegram) ?? undefined, label: 'Telegram' },
                  ].filter(({ href }) => Boolean(href)).map(({ icon: Icon, href, label }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center w-12 h-12 rounded-xl bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-brand-500 hover:text-surface-950 transition-all duration-200"
                      aria-label={label}
                    >
                      <Icon size={20} />
                    </a>
                  ))}
                </div>
              </div>

              {/* Quick Links */}
              <div className="p-6 rounded-2xl bg-brand-500/5 border border-brand-500/20">
                <h3 className="font-display font-semibold text-heading-sm text-surface-900 dark:text-surface-50 mb-3">{content.quickLinksHeading}</h3>
                <div className="space-y-2">
                  {/* Editable in Admin -> Content, so filtered like any other staff link. */}
                  {content.quickLinks.flatMap((link) => {
                    const to = safeLink(link.href);
                    return to ? [{ ...link, href: to }] : [];
                  }).map((link) => (
                    <Link key={link.id} to={link.href} className="flex items-center gap-2 text-body-sm text-brand-600 dark:text-brand-400 hover:underline">
                      <ChevronRight size={14} />
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
