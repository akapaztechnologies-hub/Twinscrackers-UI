import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { SectionHeading } from '@/components/atoms/SectionHeading.tsx';
import { ProductCard } from '@/components/molecules/ProductCard.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { getProducts } from '@/services/products.ts';
import { isWithinWindow } from '@/lib/comboAnnounce.ts';
import type { Product } from '@/types/index.ts';

/** Homepage showcase for recently published combo packs. Renders nothing at
 *  all (no loading flash, no empty section) unless at least one combo was
 *  published within the "new" window. */
export function NewCombosSection() {
  const [combos, setCombos] = useState<Product[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getProducts({ isCombo: true, sort: 'newest', limit: 8 });
        setCombos(data.filter((p) => isWithinWindow(p.createdAt, undefined, p.offerStartsAt)));
      } catch {
        setCombos([]);
      }
    })();
  }, []);

  if (combos.length === 0) return null;

  return (
    <section className="section-padding bg-white dark:bg-surface-900">
      <Container size="wide">
        <SectionHeading
          eyebrow="Just Published"
          title="New Combo Packs"
          subtitle="Freshly published celebration kits — get them while they're new"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {combos.slice(0, 4).map((combo, index) => (
            <ProductCard key={combo.id} product={combo} index={index} />
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link to="/combo-packs">
            <Button variant="outline" size="lg" className="group">
              View All Combo Packs
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>
      </Container>
    </section>
  );
}
