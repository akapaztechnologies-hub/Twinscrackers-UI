import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, ShoppingBag, ArrowLeft } from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { SEO } from '@/components/SEO.tsx';

interface LinkCTA { label: string; link: string; }

interface NotFoundContent {
  code: string;
  headline: string;
  subtitle: string;
  ctaPrimary: LinkCTA;
  ctaSecondary: LinkCTA;
  goBackLabel: string;
  seoTitle: string;
  seoDescription: string;
}

interface StoreFlowData {
  notFound: NotFoundContent;
  [key: string]: unknown;
}

const notFoundDefaults: NotFoundContent = {
  code: '404',
  headline: 'Page Not Found',
  subtitle: "The page you're looking for doesn't exist or has been moved. Let's get you back on track.",
  ctaPrimary: { label: 'Back to Home', link: '/' },
  ctaSecondary: { label: 'Browse Shop', link: '/shop' },
  goBackLabel: 'Go back to previous page',
  seoTitle: 'Page Not Found',
  seoDescription: "The page you're looking for doesn't exist. Browse our premium fireworks collection or return to the homepage.",
};

const storeFlowDefaults: StoreFlowData = { notFound: notFoundDefaults };

export function NotFoundPage() {
  const store = storeFlowDefaults;
  const c = { ...notFoundDefaults, ...store.notFound };

  return (
    <div className="pt-24 min-h-screen flex items-center">
      <SEO
        title={c.seoTitle}
        description={c.seoDescription}
        noIndex
      />
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-lg mx-auto py-20"
        >
          <p className="text-[8rem] leading-none font-display font-black text-brand-500/20">
            {c.code}
          </p>
          <h1 className="mt-4 font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">
            {c.headline}
          </h1>
          <p className="mt-4 text-body-lg text-surface-500 dark:text-surface-400">
            {c.subtitle}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to={c.ctaPrimary.link}>
              <Button size="lg">
                <Home size={18} />
                {c.ctaPrimary.label}
              </Button>
            </Link>
            <Link to={c.ctaSecondary.link}>
              <Button variant="outline" size="lg">
                <ShoppingBag size={18} />
                {c.ctaSecondary.label}
              </Button>
            </Link>
          </div>
          <button
            onClick={() => window.history.back()}
            className="mt-6 inline-flex items-center gap-2 text-body-sm text-surface-500 hover:text-brand-500 transition-colors"
          >
            <ArrowLeft size={16} />
            {c.goBackLabel}
          </button>
        </motion.div>
      </Container>
    </div>
  );
}
