import { useMemo } from 'react';
import { HeroSection } from '@/components/organisms/HeroSection.tsx';
import { TrustBar } from '@/components/organisms/TrustBar.tsx';
import { CategoryShowcase } from '@/components/organisms/CategoryShowcase.tsx';
import { NewCombosSection } from '@/components/organisms/NewCombosSection.tsx';
import { FeaturedProducts } from '@/components/organisms/FeaturedProducts.tsx';
import { AboutPreview } from '@/components/organisms/AboutPreview.tsx';
import { Testimonials } from '@/components/organisms/Testimonials.tsx';
import { NewsletterCTA } from '@/components/organisms/NewsletterCTA.tsx';
import { SEO } from '@/components/SEO.tsx';
import { useSiteStore } from '@/store/site.ts';
import { organizationSchema, websiteSchema } from '@/lib/seo.ts';

export function HomePage() {
  const siteConfig = useSiteStore(s => s.config);
  const jsonLd = useMemo(() => [organizationSchema(), websiteSchema()], []);

  return (
    <>
      <SEO
        description={siteConfig.description}
        canonical="/"
        jsonLd={jsonLd}
      />
      <HeroSection />
      <TrustBar />
      <CategoryShowcase />
      <NewCombosSection />
      <FeaturedProducts />
      <AboutPreview />
      <Testimonials />
      <NewsletterCTA />
    </>
  );
}
