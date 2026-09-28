import { create } from 'zustand';

interface WishlistState {
  items: Set<string>;
  isLoaded: boolean;

  /** Fetch wishlist from backend for logged-in user */
  fetchWishlist: () => Promise<void>;

  /** Toggle a product in the wishlist (add if absent, remove if present) */
  toggle: (productId: string) => Promise<void>;

  /** Check if a product is in the wishlist */
  has: (productId: string) => boolean;

  /** Clear local state on logout */
  clear: () => void;
}

// Lazy-load firestore service to keep it out of the initial bundle
const getFirestoreModule = () => import('@/services/firestore.ts');

export const useWishlistStore = create<WishlistState>()((set, get) => ({
  items: new Set<string>(),
  isLoaded: false,

  fetchWishlist: async () => {
    try {
      const { getWishlist } = await getFirestoreModule();
      const list = await getWishlist('');
      set({ items: new Set(list.map((i) => i.productId)), isLoaded: true });
    } catch {
      set({ isLoaded: true });
    }
  },

  toggle: async (productId) => {
    const { items } = get();
    const next = new Set(items);
    const { addToWishlist, removeFromWishlist } = await getFirestoreModule();

    if (next.has(productId)) {
      next.delete(productId);
      set({ items: next });
      await removeFromWishlist('', productId).catch(() => {
        const rollback = new Set(get().items);
        rollback.add(productId);
        set({ items: rollback });
      });
    } else {
      next.add(productId);
      set({ items: next });
      await addToWishlist('', productId).catch(() => {
        const rollback = new Set(get().items);
        rollback.delete(productId);
        set({ items: rollback });
      });
    }
  },

  has: (productId) => get().items.has(productId),

  clear: () => set({ items: new Set(), isLoaded: false }),
}));
