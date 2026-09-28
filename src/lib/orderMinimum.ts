import { formatPrice } from '@/lib/utils.ts';

/**
 * The minimum-order rule, in one place.
 *
 * The cart drawer and the checkout screen both have to answer "can this order
 * be placed, and if not, by how much is it short" — and they have to answer it
 * identically, or a customer gets waved through one screen only to be stopped
 * on the next. The server enforces the same rule in `priceOrder`; this is what
 * keeps the customer from ever reaching that error.
 *
 * Measured on the goods subtotal, matching the server: before shipping (not
 * merchandise) and before any coupon (or a discount code would let a cart drop
 * back under the floor).
 */

export interface OrderMinimum {
  /** The configured floor, or 0 when the admin has not set one. */
  minimum: number;
  /** How much more the customer needs. 0 once the minimum is met. */
  shortfall: number;
  /** Whether checkout is allowed to proceed. */
  meetsMinimum: boolean;
  /** Ready-to-render nudge, or '' when there is nothing to say. */
  message: string;
}

interface ConfigLike {
  minOrderValue?: number;
}

export function orderMinimum(config: ConfigLike | null | undefined, subtotal: number): OrderMinimum {
  const raw = config?.minOrderValue;
  // A missing, negative or non-numeric value reads as "no minimum" rather than
  // as a floor nobody can clear.
  const minimum = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;

  if (!minimum || subtotal >= minimum) {
    return { minimum, shortfall: 0, meetsMinimum: true, message: '' };
  }

  const shortfall = minimum - subtotal;
  return {
    minimum,
    shortfall,
    meetsMinimum: false,
    // The shortfall leads, because it is the part the customer can act on.
    message: `Add ${formatPrice(shortfall)} more to reach the ${formatPrice(minimum)} minimum order`,
  };
}
