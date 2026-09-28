import { useState, useEffect } from 'react';
import { Container } from '@/components/atoms/Container.tsx';
import { SectionHeading } from '@/components/atoms/SectionHeading.tsx';
import { ProductCard } from '@/components/molecules/ProductCard.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { getFeaturedProducts, getProductBySlug } from '@/services/products.ts';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Product } from '@/types/index.ts';
import api from '@/lib/api.ts';
import { unwrapData } from '@/lib/content.ts';
import { safeLink } from '@/components/safeLink.ts';

const defaultHeading = {
  eyebrow: 'Curated Selection',
  title: 'Featured Products',
  subtitle: 'Hand-picked premium fireworks for unforgettable celebrations'
};

const defaultCta = { label: 'View All Products', link: '/shop' };

export function FeaturedProducts() {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [heading, setHeading] = useState(defaultHeading);
  const [cta, setCta] = useState(defaultCta);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const content = await (api.get('/content/homepage-sections') as Promise<Record<string, unknown> | null>).catch(() => null);
      const data = unwrapData<{
        featuredProducts?: {
          heading?: Partial<typeof defaultHeading>;
          ctaLabel?: string;
          ctaLink?: string;
          productIds?: string[];
        };
      }>(content);

      if (data?.featuredProducts?.heading) {
        setHeading({ ...defaultHeading, ...data.featuredProducts.heading });
      }
      if (data?.featuredProducts?.ctaLabel || data?.featuredProducts?.ctaLink) {
        setCta({
          label: data.featuredProducts.ctaLabel || defaultCta.label,
          link: data.featuredProducts.ctaLink || defaultCta.link,
        });
      }

      // Honour the admin-selected products from Content → Featured Products.
      // Fall back to the backend "featured" flag when no products are picked.
      const productIds: string[] = Array.isArray(data?.featuredProducts?.productIds)
        ? data.featuredProducts.productIds
        : [];

      let products: Product[] = [];
      if (productIds.length > 0) {
        const fetched = await Promise.all(
          productIds.map((id) => getProductBySlug(id).catch(() => null)),
        );
        // Keep the admin's chosen order; drop any that failed to load.
        products = fetched.filter((p): p is Product => p !== null);
      }
      if (products.length === 0) {
        products = await getFeaturedProducts().catch(() => []);
      }

      if (cancelled) return;
      setFeaturedProducts(products);
      setIsLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <section className="section-padding bg-surface-50 dark:bg-surface-950">
      <Container size="wide">
        <SectionHeading
          eyebrow={heading.eyebrow}
          title={heading.title}
          subtitle={heading.subtitle}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {featuredProducts.slice(0, 8).map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <Link to={safeLink(cta.link) ?? '/shop'}>
            <Button variant="outline" size="lg" className="group">
              {cta.label}
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>
      </Container>
    </section>
  );
}
