import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/atoms/Button.tsx';
import { EmptyState } from '@/components/atoms/EmptyState.tsx';
import { useAuthStore } from '@/store/auth.ts';
import { useCartStore } from '@/store/cart.ts';
import { removeFromWishlist } from '@/services/firestore.ts';
import api from '@/lib/api.ts';
import { formatPrice } from '@/lib/utils.ts';
import type { Product } from '@/types/index.ts';

function mapWishlistProduct(p: Record<string, unknown>): Product {
  return {
    ...p,
    id: (p._id || p.id) as string,
    isNew: (p.isNewArrival ?? p.isNew ?? false) as boolean,
    category: (p.categorySlug || (typeof p.category === 'string' ? p.category : '')) as Product['category'],
  } as Product;
}

export function WishlistPage() {
  const user = useAuthStore((s) => s.user);
  const addToCart = useCartStore((s) => s.addItem);
  const [wishlistProducts, setWishlistProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show loader before fetching the wishlist
    setIsLoading(true);
    (api.get('/wishlist') as Promise<Record<string, unknown>>)
      .then((result) => {
        if (cancelled) return;
        const products = (result.products || result) as Record<string, unknown>[];
        const mapped = (Array.isArray(products) ? products : [])
          .filter((p) => p && typeof p === 'object' && (p._id || p.id))
          .map(mapWishlistProduct);
        setWishlistProducts(mapped);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const handleRemove = async (productId: string) => {
    if (!user) return;
    await removeFromWishlist(user.uid, productId);
    setWishlistProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50 mb-6">
        Wishlist
      </h2>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : wishlistProducts.length === 0 ? (
        <EmptyState
          icon={<Heart size={36} className="text-surface-400" />}
          title="Your wishlist is empty"
          description="Save products you love and come back to them later."
          action={<Link to="/shop"><Button>Browse Products</Button></Link>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {wishlistProducts.map((product) => {
            if (!product) return null;
            return (
              <motion.div
                key={product.id}
                layout
                className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 overflow-hidden group"
              >
                <Link to={`/product/${product.slug}`} className="block aspect-square overflow-hidden bg-white dark:bg-surface-850">
                  <img src={product.images[0] || undefined} alt={product.name} className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                </Link>
                <div className="p-4">
                  <Link to={`/product/${product.slug}`} className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-100 hover:text-brand-500 transition-colors line-clamp-1">
                    {product.name}
                  </Link>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-display font-bold text-body-lg text-brand-600 dark:text-brand-400">{formatPrice(product.price)}</span>
                    {product.originalPrice && <span className="text-caption text-surface-400 line-through">{formatPrice(product.originalPrice)}</span>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    {/* Out of stock stays out of the cart here too, as on the
                        product page — the order would be refused otherwise. */}
                    <Button
                      size="sm"
                      fullWidth
                      onClick={() => addToCart(product)}
                      disabled={product.inStock === false}
                    >
                      <ShoppingCart size={14} /> {product.inStock === false ? 'Out of Stock' : 'Add to Cart'}
                    </Button>
                    <button
                      onClick={() => handleRemove(product.id)}
                      className="w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center border border-surface-200 dark:border-surface-700 text-surface-400 hover:text-red-500 hover:border-red-500/30 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
