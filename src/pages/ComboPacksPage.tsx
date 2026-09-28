import { useState, useEffect } from 'react';
import { Gift, Loader2 } from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { ProductCard } from '@/components/molecules/ProductCard.tsx';
import { SEO } from '@/components/SEO.tsx';
import { getProducts } from '@/services/products.ts';
import type { Product } from '@/types/index.ts';

/** Dedicated "choose a combo pack" screen — a focused browse page for
 *  isCombo products, separate from the general Shop page. */
export function ComboPacksPage() {
  const [combos, setCombos] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        // 'manual-newest' is the arrangement set on Admin → Combos. Until a
        // combo is dragged there it resolves to newest-first, as before.
        const { data } = await getProducts({ isCombo: true, limit: 48, sort: 'manual-newest' });
        setCombos(data);
      } catch {
        setCombos([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    // The navbar is `fixed`, so every page below it has to reserve its height.
    // Without this the hero starts underneath it and its top is clipped.
    <div className="pt-16 lg:pt-18">
      <SEO
        title="Combo Packs — Ready-Made Celebration Kits"
        description="Browse ready-made fireworks combo packs — hand-picked bundles for Diwali, weddings, birthdays and more, at one combo price."
      />

      {/* Hero */}
      <div className="bg-gradient-to-br from-fire-500 to-brand-500 text-white">
        <Container>
          <div className="py-12 lg:py-16 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 mb-4">
              <Gift size={28} />
            </div>
            <h1 className="font-display font-bold text-display-sm lg:text-display-md">Combo Packs</h1>
            <p className="mt-3 text-body-lg text-white/85 max-w-xl mx-auto">
              Ready-made celebration kits — hand-picked bundles at one combo price. Pick a pack and add it to your cart.
            </p>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-10 lg:py-14">
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={28} className="animate-spin text-brand-500" />
            </div>
          ) : combos.length === 0 ? (
            <div className="text-center py-24">
              <Gift size={40} className="mx-auto text-surface-300 dark:text-surface-700 mb-3" />
              <h2 className="font-display font-semibold text-heading-md text-surface-900 dark:text-surface-50">No combo packs available right now</h2>
              <p className="mt-1.5 text-body-md text-surface-500">Check back soon — new combos are added regularly.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6">
              {combos.map((combo, i) => (
                <ProductCard key={combo.id} product={combo} index={i} />
              ))}
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}
