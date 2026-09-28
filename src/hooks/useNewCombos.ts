import { useState, useEffect } from 'react';
import { getProducts } from '@/services/products.ts';
import { isWithinWindow } from '@/lib/comboAnnounce.ts';
import type { Product } from '@/types/index.ts';

/** Enough to cover a shop publishing a whole festive set in one sitting. */
const ANNOUNCE_LIMIT = 8;

/**
 * Every combo pack still inside its "just published" window, newest first.
 *
 * Fetching one — which is what the announcements used to do — is wrong the
 * moment the shop builds its Diwali packs in an afternoon: the last one saved
 * took the banner and the other five were announced nowhere. The storefront
 * already filters out anything outside its offer window, so a pack scheduled
 * for next week is not in here until it starts.
 */
export function useNewCombos(): { combos: Product[]; isLoading: boolean } {
  const [combos, setCombos] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getProducts({ isCombo: true, sort: 'newest', limit: ANNOUNCE_LIMIT });
        setCombos(data.filter((c) => isWithinWindow(c.createdAt, undefined, c.offerStartsAt)));
      } catch {
        setCombos([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return { combos, isLoading };
}

/**
 * A stable name for the current set of new combos.
 *
 * The announcement modal remembers what it has already shown. Keyed on one id
 * it would stay quiet after a second pack was added, since the id it stored is
 * still among them — so it is keyed on all of them, and any new pack makes a
 * new key and earns one more showing.
 */
export function newCombosKey(combos: Product[]): string {
  return combos.map((c) => c.id).join(',');
}
