import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Gift, ChevronLeft, Loader2, Clock } from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { QuantitySelector } from '@/components/atoms/QuantitySelector.tsx';
import { SEO } from '@/components/SEO.tsx';
import { ComboGallery } from '@/components/molecules/ComboGallery.tsx';
import { BackInStockNotify } from '@/components/product/BackInStockNotify.tsx';
import { getProductBySlugWithStatus } from '@/services/products.ts';
import { useCartStore } from '@/store/cart.ts';
import { formatPrice, calculateDiscount } from '@/lib/utils.ts';
import { offerBadge, formatOfferDate } from '@/lib/comboWindow.ts';
import type { Product } from '@/types/index.ts';

/** Dedicated "pick the combo" screen — shows a single combo pack's contents
 *  and lets the customer add it to their cart. Separate from the general
 *  product detail page. */
export function ComboDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [combo, setCombo] = useState<Product | null>(null);
  const [offerEnded, setOfferEnded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);

  useEffect(() => {
    if (!slug) return;
    // Opening another pack from the announcement or the pop-up while this one
    // is still loading must not let this one's answer land on top of it.
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { product: found, offerEnded: ended } = await getProductBySlugWithStatus(slug);
      if (cancelled) return;
      setCombo(found);
      setOfferEnded(ended);
      setIsLoading(false);
      setQuantity(1);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (isLoading) {
    return (
      <div className="pt-16 lg:pt-18 flex items-center justify-center py-32">
        <Loader2 size={28} className="animate-spin text-brand-500" />
      </div>
    );
  }

  if (!combo) {
    return (
      <Container>
        <div className="pt-16 lg:pt-18 py-24 text-center">
          <Gift size={40} className="mx-auto text-surface-300 dark:text-surface-700 mb-3" />
          <h1 className="font-display font-semibold text-heading-md text-surface-900 dark:text-surface-50">
            {offerEnded ? 'This combo offer has ended' : 'Combo not found'}
          </h1>
          {offerEnded && (
            <p className="mt-2 text-body-sm text-surface-500 dark:text-surface-400">
              The pack you followed a link to is no longer on offer. Our current packs are below.
            </p>
          )}
          <Link to="/combo-packs" className="inline-block mt-4 text-brand-600 dark:text-brand-400 font-medium hover:underline">
            {offerEnded ? 'See current Combo Packs' : 'Back to Combo Packs'}
          </Link>
        </div>
      </Container>
    );
  }

  const discount = combo.originalPrice ? calculateDiscount(combo.price, combo.originalPrice) : null;
  // "Valid till 5 Nov" through the run, a countdown in the last week.
  const offer = offerBadge(combo);

  // The pack's contents, flattened for the slideshow. A comboItem whose product
  // was not populated comes back as a bare id string and has no photo to show.
  const galleryItems = (combo.comboItems ?? []).flatMap((item) =>
    typeof item.product === 'string'
      ? []
      : [{ name: item.product.name, image: item.product.images[0], quantity: item.quantity }],
  );

  const soldOut = combo.inStock === false;

  const handleAddToCart = () => {
    if (soldOut) return;
    addItem(combo, quantity);
    openCart();
  };

  return (
    // Same navbar clearance as every other page — without it the top of the
    // combo sits behind the fixed header.
    <div className="pt-16 lg:pt-18">
      <SEO title={`${combo.name} — Combo Pack`} description={combo.shortDescription} ogType="product" />

      <Container>
        <div className="py-6">
          <Link to="/combo-packs" className="inline-flex items-center gap-1.5 text-body-sm text-surface-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
            <ChevronLeft size={16} />
            Back to Combo Packs
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pb-16">
          {/* A combo's own photo shows none of what is in it, so the gallery
              plays through the items too — see ComboGallery. */}
          <ComboGallery images={combo.images} items={galleryItems} discount={discount} />

          {/* Info */}
          <div>
            <p className="flex items-center gap-1.5 text-label font-bold uppercase tracking-widest text-brand-500 mb-2">
              <Gift size={14} />
              Combo Pack
            </p>
            <h1 className="font-display font-bold text-display-sm lg:text-display-md text-surface-900 dark:text-surface-50">
              {combo.name}
            </h1>

            {offer && (
              <p
                className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-body-sm font-semibold ${
                  offer.urgent
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300'
                }`}
              >
                <Clock size={15} />
                {offer.text}
                {offer.urgent && combo.offerEndsAt && (
                  <span className="font-normal text-amber-600/80 dark:text-amber-400/70">
                    · until {formatOfferDate(combo.offerEndsAt)}
                  </span>
                )}
              </p>
            )}

            <div className="mt-5 flex items-baseline gap-3">
              <span className="font-display font-bold text-display-sm text-brand-600 dark:text-brand-400">
                {formatPrice(combo.price)}
              </span>
              {combo.originalPrice && (
                <>
                  <span className="text-heading-sm text-surface-400 line-through">{formatPrice(combo.originalPrice)}</span>
                  <span className="text-body-sm font-bold text-emerald-600 dark:text-emerald-400">Save {discount}%</span>
                </>
              )}
            </div>

            <p className="mt-5 text-body-lg text-surface-600 dark:text-surface-400 leading-relaxed">
              {combo.description}
            </p>

            {/* What's Inside */}
            {combo.comboItems && combo.comboItems.length > 0 && (
              <div className="mt-6 p-4 rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900">
                <p className="flex items-center gap-2 text-body-sm font-bold text-surface-900 dark:text-surface-50 mb-3">
                  <Gift size={16} className="text-brand-500" />
                  What's Inside ({combo.comboItems.length} item{combo.comboItems.length === 1 ? '' : 's'})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {combo.comboItems.map((item, i) => {
                    const comp = typeof item.product === 'string' ? null : item.product;
                    if (!comp) return null;
                    return (
                      <Link
                        key={i}
                        to={`/product/${comp.slug}`}
                        className="flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-surface-850 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                      >
                        <img src={comp.images[0] || undefined} alt={comp.name} className="w-11 h-11 rounded-lg object-contain bg-surface-100 dark:bg-surface-800 p-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-body-sm font-medium text-surface-800 dark:text-surface-200 truncate">{comp.name}</p>
                          <p className="text-caption text-surface-500">Qty: {item.quantity}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Buy — closed for a pack that is out of stock, as on the product
                page; the order would otherwise be refused at payment. */}
            <div className="mt-8 flex items-center gap-4">
              <QuantitySelector quantity={quantity} onChange={setQuantity} />
              <Button
                variant="primary"
                size="lg"
                onClick={handleAddToCart}
                disabled={soldOut}
                className="flex-1 flex items-center justify-center gap-2"
              >
                <ShoppingCart size={18} />
                {soldOut ? 'Out of Stock' : 'Add to Cart'}
              </Button>
            </div>
            {!soldOut && (
              <button
                onClick={() => { handleAddToCart(); navigate('/checkout'); }}
                className="mt-3 w-full py-3 rounded-xl border-2 border-surface-300 dark:border-surface-700 text-surface-700 dark:text-surface-300 font-semibold hover:border-brand-500 hover:text-brand-500 transition-colors"
              >
                Buy Now
              </button>
            )}
            {soldOut && (
              <div className="mt-3">
                <BackInStockNotify slug={combo.slug} productName={combo.name} />
              </div>
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}
