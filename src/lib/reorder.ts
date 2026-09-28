import { getProductBySlug } from '@/services/products.ts';
import { useCartStore } from '@/store/cart.ts';
import type { OrderItem } from '@/types/index.ts';

export interface ReorderResult {
  added: number;
  /** Named so the customer is told which lines could not be brought back, and why. */
  unavailable: string[];
}

/**
 * Put a past order back in the cart.
 *
 * Diwali is a repeat purchase — the same customer buys a similar box every
 * year, and rebuilding it by hand from twenty lines is the reason they do not
 * bother. This re-fetches each product rather than trusting the order's own
 * copy, because the price, the stock and whether it is still sold at all have
 * all moved on since. The order is a shopping list, not a price quote.
 *
 * Anything gone is reported by name rather than silently dropped: a cart that
 * quietly comes back three items short is worse than being told.
 */
export async function reorderItems(items: OrderItem[]): Promise<ReorderResult> {
  const addItem = useCartStore.getState().addItem;
  const unavailable: string[] = [];
  let added = 0;

  // Sequential on purpose. A twenty-line order fired at the API at once is a
  // burst this shop's own server has no reason to absorb, and the customer is
  // watching a spinner either way.
  for (const item of items) {
    const product = item.slug ? await getProductBySlug(item.slug) : null;

    if (!product) {
      unavailable.push(item.name);
      continue;
    }
    if (product.inStock === false) {
      unavailable.push(`${product.name} (out of stock)`);
      continue;
    }

    addItem(product, item.quantity);
    added += 1;
  }

  return { added, unavailable };
}
