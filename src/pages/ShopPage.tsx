import { useState, useEffect, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SlidersHorizontal, Grid2X2, LayoutList, Search, Loader2 } from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { CategoryChip } from '@/components/molecules/CategoryChip.tsx';
import { ProductCard } from '@/components/molecules/ProductCard.tsx';
import { SEO } from '@/components/SEO.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { getProducts, getCategories } from '@/services/products.ts';
import type { CategoryItem } from '@/services/products.ts';
import { cn } from '@/lib/utils.ts';
import type { Product } from '@/types/index.ts';

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest';

const PAGE_SIZE = 12;

/** Where the chosen density is remembered. Per browser, not per account. */
const LS_VIEW = 'ak_shop_view';

/**
 * True below Tailwind's `sm` breakpoint — the only width where a two-up column
 * is too narrow for the full product card.
 *
 * A media query rather than a container measurement: the grid's column count is
 * itself set by Tailwind breakpoints, so this has to agree with them exactly or
 * the compact card would switch on at a different width than the second column
 * appears.
 */
const NARROW_QUERY = '(max-width: 639px)';

function subscribeToNarrow(onChange: () => void): () => void {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function useIsNarrow(): boolean {
  // `useSyncExternalStore` rather than state-plus-effect: a media query IS an
  // external store, and reading it through this avoids the render-then-correct
  // pass that setting state from an effect costs.
  return useSyncExternalStore(
    subscribeToNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    // Server render / prerender: assume a wide screen, so nothing renders as
    // compact and then jumps.
    () => false,
  );
}

interface ShopContent {
  eyebrow: string;
  title: string;
  subtitle: string;
  seoTitle: string;
  seoDescription: string;
  sortFeatured: string;
  sortPriceAsc: string;
  sortPriceDesc: string;
  sortRating: string;
  sortNewest: string;
  allProductsLabel: string;
  emptyHeading: string;
  emptySubtext: string;
}

interface ShopSectionData {
  shop: ShopContent;
  [key: string]: unknown;
}

const shopDefaults: ShopSectionData = {
  shop: {
    eyebrow: 'Our Collection',
    title: 'Premium Fireworks',
    subtitle: 'Explore our complete range of fireworks for every occasion',
    seoTitle: 'Shop Premium Fireworks Online — Aerial Shells, Rockets, Sparklers',
    seoDescription:
      'Browse our complete collection of fireworks — aerial shells, rockets, sparklers, fountains, Roman candles, and combo packs.',
    sortFeatured: 'Featured',
    sortPriceAsc: 'Price: Low to High',
    sortPriceDesc: 'Price: High to Low',
    sortRating: 'Highest Rated',
    sortNewest: 'Newest First',
    allProductsLabel: 'All Products',
    emptyHeading: 'No products found',
    emptySubtext: 'Try a different category, search, or filter',
  },
};

export function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Read straight off the URL rather than mirrored into state. `useState(param)`
  // only takes the param as an INITIAL value, so arriving at /shop and then
  // picking a category from the navbar changed the URL and nothing else — which
  // is why the Shop and Collections menus appeared to filter nothing.
  const activeCategory = searchParams.get('category') ?? 'all';
  const activeOccasion = searchParams.get('occasion') ?? '';
  const [sortBy, setSortBy] = useState<SortOption>('featured');
  /**
   * How many products fit across, remembered between visits.
   *
   * People pick a density once and expect it to stick — having to set it again
   * on every visit is what makes the control feel like it does not work.
   * Per-browser is the right scope: it is about this screen, not this account.
   */
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem(LS_VIEW) === 'list' ? 'list' : 'grid';
    } catch {
      // Private browsing, or storage blocked. Two-up is the better default.
      return 'grid';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LS_VIEW, viewMode);
    } catch {
      /* not worth telling anyone about */
    }
  }, [viewMode]);
  /** True on phones, where the two-up column is too narrow for the full card. */
  const isNarrow = useIsNarrow();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<{ id: string; label: string; count: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const shop = shopDefaults.shop;

  // Category list (with counts) — loaded once.
  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((categoriesRes) => {
        if (cancelled) return;
        setCategories([
          { id: 'all', label: '', count: 0 },
          ...categoriesRes.map((c: CategoryItem) => ({ id: c.slug, label: c.name, count: c.productCount })),
        ]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // A different category or collection is a different list, so start at page 1
  // again — otherwise page 3 of the old filter is requested for the new one.
  useEffect(() => { setPage(1); }, [activeCategory, activeOccasion]);

  // Debounce the search box; any new search resets to the first page.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch a page from the server. page 1 replaces; higher pages append (Load more).
  useEffect(() => {
    let cancelled = false;
    const replace = page === 1;
    (async () => {
      if (replace) setIsLoading(true); else setIsLoadingMore(true);
      try {
        const res = await getProducts({
          ...(activeCategory !== 'all' ? { category: activeCategory } : {}),
          // Collections in the navbar are occasions, and this was never sent —
          // every collection showed the unfiltered catalogue.
          ...(activeOccasion ? { occasion: activeOccasion } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          sort: sortBy,
          page,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        setProducts((prev) => (replace ? res.data : [...prev, ...res.data]));
        setTotal(res.total);
        setHasMore(res.hasMore);
      } catch {
        if (!cancelled && replace) { setProducts([]); setTotal(0); setHasMore(false); }
      } finally {
        if (!cancelled) { setIsLoading(false); setIsLoadingMore(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [activeCategory, activeOccasion, sortBy, debouncedSearch, page]);

  const handleCategoryChange = (id: string) => {
    setPage(1);
    // The URL is the only place the choice is kept, so writing it here is what
    // re-runs the fetch above — no separate state to fall out of step.
    const next = new URLSearchParams(searchParams);
    if (id === 'all') next.delete('category');
    else next.set('category', id);
    // Picking a category from the in-page rail is a fresh browse; leaving a
    // collection applied would silently narrow it to near-nothing.
    next.delete('occasion');
    setSearchParams(next);
  };

  const handleSortChange = (v: SortOption) => { setSortBy(v); setPage(1); };

  return (
    <div className="pt-16 lg:pt-18">
      <SEO
        title={shop.seoTitle}
        description={shop.seoDescription}
        canonical="/shop"
      />
      {/* Page Header — single compact line */}
      <section className="py-4 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800">
        <Container size="wide">
          <div className="flex items-baseline justify-center gap-2.5 text-center">
            <h1 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">
              {shop.title}
            </h1>
            <span className="text-body-sm text-surface-400 dark:text-surface-500 truncate hidden sm:inline">
              {shop.subtitle}
            </span>
          </div>
        </Container>
      </section>

      <section className="py-10 lg:py-14 bg-surface-50 dark:bg-surface-950">
        <Container size="wide">
          {/* Filters Bar — categories, search, sort, and view together; pinned under the navbar while scrolling */}
          <div className="sticky top-[calc(var(--announcement-h,0px)+4rem)] lg:top-[calc(var(--announcement-h,0px)+4.5rem)] z-30 py-3 mb-8 flex flex-col gap-2.5 bg-surface-50/95 dark:bg-surface-950/95 backdrop-blur-sm border-b border-surface-200 dark:border-surface-800">
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-0.5">
              {categories.map((cat) => (
                <CategoryChip
                  key={cat.id}
                  label={cat.id === 'all' ? shop.allProductsLabel : cat.label}
                  count={cat.id === 'all' ? total : cat.count}
                  isActive={activeCategory === cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                />
              ))}
            </div>

            {/* Search + Sort + View — never wraps, so it stays one row on mobile too */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  placeholder="Search fireworks..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-3 h-10 w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
                />
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <SlidersHorizontal size={16} className="text-surface-500 hidden sm:block" />
                <Select
                  value={sortBy}
                  onChange={(v) => handleSortChange(v as SortOption)}
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  options={[
                    { value: 'featured', label: shop.sortFeatured },
                    { value: 'price-asc', label: shop.sortPriceAsc },
                    { value: 'price-desc', label: shop.sortPriceDesc },
                    { value: 'rating', label: shop.sortRating },
                    { value: 'newest', label: shop.sortNewest },
                  ]}
                />
              </div>

              {/* Visible on PHONES too. It used to be `hidden sm:flex`, which
                  hid it on exactly the screen where it matters most: a phone
                  showed one product per row and there was no way to ask for
                  more. */}
              <div className="flex items-center gap-1 bg-surface-200 dark:bg-surface-800 rounded-xl p-1 flex-shrink-0">
                <button
                  onClick={() => setViewMode('grid')}
                  aria-label="Two products per row"
                  aria-pressed={viewMode === 'grid'}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 shadow-sm'
                      : 'text-surface-500',
                  )}
                >
                  <Grid2X2 size={16} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  aria-label="One product per row"
                  aria-pressed={viewMode === 'list'}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    viewMode === 'list'
                      ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 shadow-sm'
                      : 'text-surface-500',
                  )}
                >
                  <LayoutList size={16} />
                </button>
              </div>

              <span className="hidden sm:inline text-body-sm text-surface-500 flex-shrink-0">
                {total} product{total !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Product Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
            </div>
          ) : products.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-20 text-center"
            >
              <p className="font-display font-semibold text-heading-md text-surface-500">
                {shop.emptyHeading}
              </p>
              <p className="mt-2 text-body-md text-surface-400">
                {shop.emptySubtext}
              </p>
            </motion.div>
          ) : (
            <>
              {/* On a phone the toggle is literally how many fit across: two
                  to browse, one to read. Above `sm` both settings keep their
                  old desktop behaviour, where the choice is about card size
                  rather than about fitting at all. */}
              <div
                className={cn(
                  'grid gap-3 sm:gap-6',
                  viewMode === 'grid'
                    ? 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                    : 'grid-cols-1 sm:grid-cols-2',
                )}
              >
                {products.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    index={index}
                    // Only the two-up phone column is genuinely narrow. From
                    // `sm` up every column is wide enough for the full card,
                    // and `useIsCompactGrid` stops watching once it is.
                    compact={viewMode === 'grid' && isNarrow}
                  />
                ))}
              </div>

              {hasMore && (
                <div className="mt-10 flex justify-center">
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={isLoadingMore}
                    className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 disabled:opacity-60 transition-colors shadow-sm shadow-brand-500/20"
                  >
                    {isLoadingMore ? <Loader2 size={16} className="animate-spin" /> : null}
                    {isLoadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </Container>
      </section>
    </div>
  );
}
