import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Product } from '@/types/index.ts';

/**
 * Make a stored or server-supplied cart line safe to render.
 *
 * Lines arrive from two places that do not always carry a whole product: carts
 * saved before the server merge returned full rows, and the merge itself. A
 * line missing `category` or `images` crashed the cart drawer outright, so every
 * line is brought up to the shape the cart UI reads before it is kept.
 */
export function normalizeCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CartItem[] = [];
  for (const row of raw) {
    const line = row as { product?: Partial<Product> & { _id?: string; categorySlug?: string }; quantity?: unknown };
    const p = line?.product;
    const id = p && (p.id || p._id);
    const quantity = Math.floor(Number(line?.quantity));
    if (!p || !id || !Number.isFinite(quantity) || quantity < 1) continue;
    out.push({
      product: {
        ...p,
        id: String(id),
        name: p.name ?? '',
        slug: p.slug ?? '',
        price: Number(p.price) || 0,
        images: Array.isArray(p.images) ? p.images : [],
        category: typeof p.category === 'string' ? p.category : (p.categorySlug ?? ''),
      } as Product,
      quantity,
    });
  }
  return out;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  totalItems: () => number;
  totalPrice: () => number;
  totalSavings: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (product, quantity = 1) => {
        set((state) => {
          const existing = state.items.find((item) => item.product.id === product.id);
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.product.id === product.id
                  ? { ...item, quantity: item.quantity + quantity }
                  : item,
              ),
            };
          }
          return { items: [...state.items, { product, quantity }] };
        });
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((item) => item.product.id !== productId),
        }));
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set((state) => ({
          items: state.items.map((item) =>
            item.product.id === productId ? { ...item, quantity } : item,
          ),
        }));
      },

      clearCart: () => set({ items: [] }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      totalItems: () => get().items.reduce((sum, item) => sum + item.quantity, 0),

      totalPrice: () =>
        get().items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),

      totalSavings: () =>
        get().items.reduce((sum, item) => {
          const saving = (item.product.originalPrice ?? item.product.price) - item.product.price;
          return sum + saving * item.quantity;
        }, 0),
    }),
    {
      name: 'akash-crackers-cart',
      // A cart line keeps a snapshot of the product, so both the id and the
      // price it holds go stale when the catalogue is replaced. The 2026 price
      // list replaced every product, which left saved carts pricing items from
      // the old catalogue and failing at checkout against ids that no longer
      // exist. Bumping the version drops those carts once, on load, instead of
      // letting them break at the payment step.
      // v2 keeps v1 carts but repairs their lines — see normalizeCartItems.
      version: 2,
      migrate: (persisted, version) =>
        version < 1
          ? { items: [] }
          : { items: normalizeCartItems((persisted as { items?: unknown } | null)?.items) },
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
