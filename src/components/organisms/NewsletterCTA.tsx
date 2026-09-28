import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Container } from '@/components/atoms/Container.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { Send } from 'lucide-react';
import api from '@/lib/api.ts';

interface NewsletterContent {
  eyebrow: string;
  heading: string;
  description: string;
  successMessage: string;
  backgroundImage: string;
  placeholder: string;
  buttonLabel: string;
}

const defaultContent: NewsletterContent = {
  eyebrow: 'Stay Updated',
  heading: 'Get Early Access to Seasonal Collections',
  description: 'Join 25,000+ celebration enthusiasts. Be the first to know about new arrivals, exclusive deals, and seasonal offers.',
  successMessage: "You're in! Watch your inbox.",
  backgroundImage: 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=1920&q=30',
  placeholder: 'Enter your email',
  buttonLabel: 'Subscribe',
};

export function NewsletterCTA() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [content, setContent] = useState<NewsletterContent>(defaultContent);

  useEffect(() => {
    (api.get('/content/homepage-sections') as Promise<Record<string, unknown> | null>)
      .then((result) => {
        if (!result) return;
        const data = (result.data || result) as Record<string, unknown>;
        if (data && data.newsletter) {
          const nl = data.newsletter as Partial<NewsletterContent>;
          setContent({
            eyebrow: nl.eyebrow || defaultContent.eyebrow,
            heading: nl.heading || defaultContent.heading,
            description: nl.description || defaultContent.description,
            successMessage: nl.successMessage || defaultContent.successMessage,
            backgroundImage: nl.backgroundImage || defaultContent.backgroundImage,
            placeholder: nl.placeholder || defaultContent.placeholder,
            buttonLabel: nl.buttonLabel || defaultContent.buttonLabel,
          });
        }
      })
      .catch(() => {});
  }, []);

  /**
   * Actually subscribe them.
   *
   * This used to set `submitted` and clear the box — the address was never sent
   * anywhere, so every person who signed up since the site opened was told
   * "thanks" and then forgotten. A failure now says so rather than claiming
   * success a second time.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address || isSaving) return;

    setError('');
    setIsSaving(true);
    try {
      const { subscribeToNewsletter } = await import('@/services/enquiries.ts');
      await subscribeToNewsletter(address);
      setSubmitted(true);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you up just now. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-surface-900 via-surface-950 to-black dark:from-brand-900/20 dark:via-surface-950 dark:to-surface-950" />
      {content.backgroundImage && (
        <div className="absolute inset-0 bg-cover bg-center opacity-10" style={{ backgroundImage: `url('${content.backgroundImage}')` }} />
      )}

      <Container size="narrow">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="relative py-20 lg:py-28 text-center"
        >
          <span className="inline-block mb-4 text-label font-bold uppercase tracking-widest text-brand-400">
            {content.eyebrow}
          </span>
          <h2 className="font-display font-bold text-display-sm sm:text-display-md text-white text-balance">
            {content.heading}
          </h2>
          <p className="mt-4 text-body-lg text-white/60 max-w-xl mx-auto">
            {content.description}
          </p>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
            >
              <span className="text-body-md font-medium">{content.successMessage}</span>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col sm:flex-row items-center gap-3 max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={content.placeholder}
                required
                className="flex-1 w-full px-5 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-body-md focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
              />
              <Button type="submit" size="lg" disabled={isSaving} className="w-full sm:w-auto">
                <Send size={18} />
                {isSaving ? 'Signing you up…' : content.buttonLabel}
              </Button>
            </form>
          )}

          {error && <p className="mt-3 text-body-sm text-red-400">{error}</p>}
        </motion.div>
      </Container>
    </section>
  );
}
