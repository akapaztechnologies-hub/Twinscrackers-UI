import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingCart, Heart, Gift, Clock } from 'lucide-react';
import { Badge } from '@/components/atoms/Badge.tsx';
import { StarRating } from '@/components/atoms/StarRating.tsx';
import { cn, formatPrice, calculateDiscount } from '@/lib/utils.ts';
import { offerBadge } from '@/lib/comboWindow.ts';
import { useCartStore } from '@/store/cart.ts';
import { useAuthStore } from '@/store/auth.ts';
import { useWishlistStore } from '@/store/wishlist.ts';
import type { Product } from '@/types/index.ts';

interface ProductCardProps {
  product: Product;
  index?: number;
  /**
   * Two cards to a row on a phone.
   *
   * At that width a card is about 200px across, and the full card does not fit
   * into it — the description alone takes two lines, then the star row, then a
   * price and an Add button side by side. Rather than let all of that squeeze
   * and wrap, the compact card drops what a shopper scanning a grid does not
   * read (the blurb, the review count) and keeps what they decide on: the
   * picture, the name, the price and a way to add it.
   */
  compact?: boolean;
}

export function ProductCard({ product, index = 0, compact = false }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);
  const user = useAuthStore((s) => s.user);
  const toggleWishlist = useWishlistStore((s) => s.toggle);
  const isWishlisted = useWishlistStore((s) => s.items.has(product.id));
  const navigate = useNavigate();

  /*
   * Out of stock means out of the cart, as on the product page and Quick
   * Order. The card used to add it anyway, and with stock enforcement on the
   * order was then refused — after a Razorpay payment had already gone through.
   * The tap falls through to the card's link instead, which opens the product
   * page and its "notify me when it's back".
   */
  const soldOut = product.inStock === false;

  const handleAddToCart = (e: React.MouseEvent) => {
    if (soldOut) return;
    e.preventDefault();
    e.stopPropagation();
    addItem(product);
    openCart();
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // A guest is signed in to their orders only — the wishlist needs an
    // account, and the server refuses a guest token. Sent to sign in like any
    // visitor, rather than a heart that fills and silently empties again.
    if (!user || user.isGuest) {
      navigate('/login');
      return;
    }
    toggleWishlist(product.id);
  };

  const discount = product.originalPrice
    ? calculateDiscount(product.price, product.originalPrice)
    : null;
  const offer = offerBadge(product);
  const hasComboItems = !!product.comboItems?.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: 'easeOut' }}
      viewport={{ once: true, amount: 0.2 }}
    >
      <Link
        to={`/product/${product.slug}`}
        className="group block"
      >
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl',
            'bg-white dark:bg-surface-900',
            'border border-surface-200/60 dark:border-surface-800/60',
            'shadow-card dark:shadow-card-dark',
            'hover:shadow-card-hover dark:hover:shadow-card-dark-hover',
            'transition-all duration-300 ease-out',
          )}
        >
          {/* Image */}
          <div className="relative aspect-square overflow-hidden bg-white dark:bg-surface-850">
            <img
              src={product.images[0] || undefined}
              alt={product.name}
              loading="lazy"
              decoding="async"
              width={400}
              height={300}
              // contain, not cover: the shop's photos are tall box shots, and
              // cover fills this 4:3 frame by cutting the top and bottom off —
              // which on a firework box is the brand name and the safety marks.
              // The padding keeps the artwork off the frame's edge.
              className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-105"
            />

            {/* Badges */}
            {product.badge && (
              <div className="absolute top-3 left-3">
                <Badge type={product.badge} />
              </div>
            )}

            {/* Discount Badge */}
            {discount && (
              <div className="absolute top-3 right-3">
                <span className="inline-flex items-center px-2 py-1 rounded-lg bg-red-600 text-white text-label font-bold">
                  -{discount}%
                </span>
              </div>
            )}

            {/* Both chips share one wrapping row along the bottom. Pinned to
                opposite corners they ran into each other the moment a combo had
                contents AND dates — which is every combo the shop publishes. */}
            {(hasComboItems || offer) && (
              <div className="absolute bottom-3 inset-x-3 flex flex-wrap items-center gap-1.5">
                {hasComboItems && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-950/70 backdrop-blur-sm text-white text-label font-semibold">
                    <Gift size={12} />
                    {product.comboItems!.length} items inside
                  </span>
                )}
                {/* Amber once the offer is closing, so the grid carries urgency
                    only where there is some. */}
                {offer && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-label font-bold',
                      offer.urgent
                        ? 'bg-amber-500 text-surface-950'
                        : 'bg-surface-950/70 backdrop-blur-sm text-white',
                    )}
                  >
                    <Clock size={12} />
                    {offer.text.replace('Offer ends', 'Ends').replace('Valid till', 'Till')}
                  </span>
                )}
              </div>
            )}

            {/* Hover Overlay */}
            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center gap-3',
                'bg-surface-950/0 group-hover:bg-surface-950/40',
                'transition-all duration-300',
                'opacity-0 group-hover:opacity-100',
              )}
            >
              <button
                onClick={handleAddToCart}
                className={cn(
                  'flex items-center justify-center w-12 h-12 rounded-full bg-brand-500 text-surface-950 hover:bg-brand-400 transition-all duration-200 translate-y-4 group-hover:translate-y-0 shadow-lg',
                  soldOut && 'opacity-50',
                )}
                aria-label={soldOut ? 'Out of stock' : 'Add to cart'}
              >
                <ShoppingCart size={20} />
              </button>
              <button
                onClick={handleToggleWishlist}
                className={cn(
                  'flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200 translate-y-4 group-hover:translate-y-0 delay-75 shadow-lg',
                  isWishlisted
                    ? 'bg-red-500 text-white'
                    : 'bg-white/90 dark:bg-surface-800/90 text-surface-700 dark:text-surface-200 hover:text-red-500',
                )}
                aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
              >
                <Heart size={20} className={isWishlisted ? 'fill-current' : ''} />
              </button>
            </div>
          </div>

          {/* Info */}
          <div className={cn(compact ? 'p-2.5' : 'p-4 lg:p-5')}>
            {/* Category */}
            <p
              className={cn(
                'text-label font-semibold uppercase tracking-wider text-brand-500',
                compact ? 'mb-1 truncate' : 'mb-1.5',
              )}
            >
              {product.isCombo ? 'Combo Pack' : product.category.replace('-', ' ')}
            </p>

            {/* Name — two lines when compact, because a one-line clamp at this
                width cuts most names off after three or four words. */}
            <h3
              className={cn(
                'font-display font-semibold text-surface-900 dark:text-surface-50 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors',
                compact ? 'text-body-sm leading-snug line-clamp-2 min-h-[2.4em]' : 'text-heading-sm line-clamp-1',
              )}
            >
              {product.name}
            </h3>

            {/* Description — the first thing to go at half width. */}
            {!compact && (
              <p className="mt-1.5 text-body-sm text-surface-500 dark:text-surface-400 line-clamp-2">
                {product.shortDescription}
              </p>
            )}

            {/* Rating. Compact keeps the stars but drops the review count, which
                is the part that pushes this row past the card's width. */}
            <div className={compact ? 'mt-1.5' : 'mt-3'}>
              <StarRating
                rating={product.rating}
                reviewCount={compact ? undefined : product.reviewCount}
              />
            </div>

            {/* Price + CTA. Compact stacks them: a price and a button side by
                side at 200px leaves the button too narrow to hit reliably. */}
            <div
              className={cn(
                compact ? 'mt-2 flex items-center justify-between gap-2' : 'mt-4 flex items-end justify-between',
              )}
            >
              <div className={cn('flex items-baseline gap-1.5 min-w-0', !compact && 'gap-2')}>
                <span
                  className={cn(
                    'font-display font-bold text-brand-600 dark:text-brand-400',
                    compact ? 'text-body-md' : 'text-heading-md',
                  )}
                >
                  {formatPrice(product.price)}
                </span>
                {product.originalPrice && (
                  <span
                    className={cn(
                      'text-surface-400 line-through truncate',
                      compact ? 'text-caption' : 'text-body-sm',
                    )}
                  >
                    {formatPrice(product.originalPrice)}
                  </span>
                )}
              </div>
              <button
                onClick={handleAddToCart}
                aria-label={soldOut ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-xl flex-shrink-0',
                  'bg-surface-900 dark:bg-surface-100 text-surface-50 dark:text-surface-900',
                  'hover:bg-brand-500 hover:text-surface-950',
                  'font-medium transition-all duration-200',
                  // 36px square in compact — still a comfortable touch target,
                  // and square rather than a label so it cannot squeeze the price.
                  compact ? 'h-9 w-9' : 'px-4 py-2 text-body-sm',
                  soldOut && 'opacity-50',
                )}
              >
                <ShoppingCart size={15} />
                {!compact && <span className="hidden sm:inline">{soldOut ? 'Sold out' : 'Add'}</span>}
              </button>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
