import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { SectionHeading } from '@/components/atoms/SectionHeading.tsx';
import api from '@/lib/api.ts';
import { cn } from '@/lib/utils.ts';
import { useCategories } from '@/hooks/useCategories.ts';
import { unwrapData } from '@/lib/content.ts';

// The bento layout assigns a larger tile to the first item and a wide tile to
// the fourth — applied to both admin-curated and live-derived fallback tiles.
const spanFor = (i: number) =>
  i === 0 ? 'lg:col-span-2 lg:row-span-2' : i === 3 ? 'lg:col-span-2' : '';

const defaultShowcase = {
  heading: { eyebrow: 'Shop by Category', title: 'Find Your Perfect Fireworks', subtitle: 'Explore our curated collection across every category' },
  exploreLabel: 'Explore',
  categories: [
    { id: '1', title: 'Aerial Shells', description: 'Sky-painting masterpieces', image: 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=600&q=80', href: '/shop?category=aerial', span: 'lg:col-span-2 lg:row-span-2' },
    { id: '2', title: 'Sparklers', description: 'Elegant hand-held magic', image: 'https://images.unsplash.com/photo-1482575832494-771f74bf6857?w=600&q=80', href: '/shop?category=sparklers', span: '' },
    { id: '3', title: 'Rockets', description: 'Soaring performances', image: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=600&q=80', href: '/shop?category=rockets', span: '' },
    { id: '4', title: 'Combo Packs', description: 'Complete celebration kits', image: 'https://images.unsplash.com/photo-1533230408708-8f9f91d1235a?w=600&q=80', href: '/combo-packs', span: 'lg:col-span-2' },
  ],
};

export function CategoryShowcase() {
  const liveCategories = useCategories();
  // `categories: null` means the admin content had no categoryShowcase tiles,
  // so the render should use the live-derived fallback (or hardcoded defaults).
  const [showcase, setShowcase] = useState<{
    heading: typeof defaultShowcase.heading;
    exploreLabel: string;
    categories: typeof defaultShowcase.categories | null;
  }>({ heading: defaultShowcase.heading, exploreLabel: defaultShowcase.exploreLabel, categories: null });

  useEffect(() => {
    (api.get('/content/homepage-sections') as Promise<Record<string, unknown> | null>)
      .then((result) => {
        if (!result) return;
        const data = unwrapData<{
          categoryShowcase?: {
            categories?: typeof defaultShowcase.categories;
            heading?: Partial<typeof defaultShowcase.heading>;
            exploreLabel?: string;
          };
        }>(result);
        if (data?.categoryShowcase) {
          const dynamicCats = (data.categoryShowcase.categories || []).map((c, i) => ({
            ...c,
            span: spanFor(i)
          }));

          setShowcase({
            heading: { ...defaultShowcase.heading, ...data.categoryShowcase.heading },
            exploreLabel: data.categoryShowcase.exploreLabel || defaultShowcase.exploreLabel,
            categories: dynamicCats.length > 0 ? dynamicCats : null
          });
        }
      })
      .catch(() => {});
  }, []);

  // Fallback tiles when admin content has no categoryShowcase categories:
  // derive from live categories, keeping the hardcoded array as a last resort.
  const fallbackCategories = liveCategories.length > 0
    ? liveCategories.map((c, i) => ({
        id: c.id,
        title: c.name,
        description: c.description || '',
        image: c.image || '',
        href: `/shop?category=${c.slug}`,
        span: spanFor(i),
      }))
    : defaultShowcase.categories;

  const categories = showcase.categories ?? fallbackCategories;

  return (
    <section className="section-padding bg-white dark:bg-surface-900">
      <Container size="wide">
        <SectionHeading
          eyebrow={showcase.heading.eyebrow}
          title={showcase.heading.title}
          subtitle={showcase.heading.subtitle}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 auto-rows-[240px] lg:auto-rows-[200px]">
          {categories.map((category, index) => (
            <motion.div
              key={category.id || category.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className={cn('relative', category.span)}
            >
              <Link
                to={category.href}
                className="group block relative h-full rounded-2xl overflow-hidden"
              >
                {/* No `<img>` at all when the category has no picture.
                    These tiles are built from live categories, and one with no
                    image was rendering `src=""` — which the browser resolves
                    against the current URL and so re-downloads the whole page,
                    once per tile. A shop with twenty unillustrated categories
                    was fetching its own homepage twenty extra times on every
                    visit. The gradient below is drawn either way, so the tile
                    still reads as a tile. */}
                {category.image ? (
                  <img
                    src={category.image}
                    alt={category.title}
                    loading="lazy"
                    decoding="async"
                    width={600}
                    height={400}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-br from-fire-500/70 via-brand-600/60 to-surface-900"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 group-hover:from-black/90 transition-all duration-300" />
                <div className="absolute inset-0 flex flex-col justify-end p-6">
                  <h3 className="font-display font-bold text-heading-md lg:text-heading-lg text-white">
                    {category.title}
                  </h3>
                  <p className="mt-1 text-body-sm text-white/70">{category.description}</p>
                  <div className="mt-3 flex items-center gap-1 text-brand-400 text-body-sm font-medium">
                    <span>{showcase.exploreLabel}</span>
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
