import { X } from 'lucide-react';
import { QuantitySelector } from '@/components/atoms/QuantitySelector.tsx';
import { formatPrice } from '@/lib/utils.ts';
import { useCartStore } from '@/store/cart.ts';
import type { CartItem } from '@/types/index.ts';

interface CartItemCardProps {
  item: CartItem;
}

export function CartItemCard({ item }: CartItemCardProps) {
  const { updateQuantity, removeItem } = useCartStore();
  const { product, quantity } = item;

  return (
    <div className="flex gap-4 py-4 border-b border-surface-200 dark:border-surface-800 last:border-0">
      {/* Image */}
      <div className="w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-surface-100 dark:bg-surface-850">
        <img
          src={product.images?.[0] || undefined}
          alt={product.name}
          className="h-full w-full object-contain p-1.5"
        />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-100 line-clamp-1">
              {product.name}
            </h4>
            {/* Guarded: a cart line rebuilt from the server's cart carried only
                a handful of product fields, and reading `category` off one
                threw during render — which, with nothing to catch it, blanked
                the whole site whenever the cart opened. */}
            {product.category && (
              <p className="text-body-sm text-surface-500 dark:text-surface-400 mt-0.5">
                {product.category.replace(/-/g, ' ')}
              </p>
            )}
          </div>
          <button
            onClick={() => removeItem(product.id)}
            className="flex-shrink-0 p-1 text-surface-400 hover:text-red-500 transition-colors"
            aria-label="Remove item"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <QuantitySelector
            quantity={quantity}
            onChange={(q) => updateQuantity(product.id, q)}
            label={`Quantity for ${product.name}`}
          />
          <span className="font-display font-bold text-body-lg text-brand-600 dark:text-brand-400">
            {formatPrice(product.price * quantity)}
          </span>
        </div>
      </div>
    </div>
  );
}
