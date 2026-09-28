import { useEffect, useState } from 'react';
import { getCategories, type CategoryItem } from '@/services/products.ts';

// Module-level cache so the categories are fetched once and shared across
// navbar, footer, product page, etc. — no repeated /categories requests.
let cache: CategoryItem[] | null = null;
let inflight: Promise<CategoryItem[]> | null = null;

async function load(): Promise<CategoryItem[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = getCategories()
      .then((list) => {
        cache = list;
        return list;
      })
      .catch(() => {
        inflight = null;
        return [];
      });
  }
  return inflight;
}

/**
 * Live, admin-managed categories — active only, sorted by display order.
 * The single source the storefront should use to build category menus/links,
 * so adding/renaming/reordering a category in Admin → Categories updates everything.
 */
export function useCategories(): CategoryItem[] {
  const [cats, setCats] = useState<CategoryItem[]>(cache ?? []);

  useEffect(() => {
    let cancelled = false;
    load().then((list) => {
      if (!cancelled) setCats(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return cats
    .filter((c) => c.isActive !== false)
    .slice()
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}
