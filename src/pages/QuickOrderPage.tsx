import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, ArrowRight,
  Zap, Filter, ChevronDown, VolumeX, X,
  ArrowUpDown, Award, Crown, Check, Sparkles, Flame,
  LayoutGrid, Rocket, Disc3, Gift, Package,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { QuantityInput } from '@/components/atoms/QuantityInput.tsx';
import { VideoBadge, VideoLightbox } from '@/components/product/VideoLightbox.tsx';
import { SEO } from '@/components/SEO.tsx';
import { useCartStore } from '@/store/cart.ts';
import { useSiteStore } from '@/store/site.ts';
import { getProducts, getCategories } from '@/services/products.ts';
import type { CategoryItem } from '@/services/products.ts';
import { orderMinimum } from '@/lib/orderMinimum.ts';
import { formatPrice, cn } from '@/lib/utils.ts';
import { useContentSection } from '@/hooks/useContent.ts';
import type { Product } from '@/types/index.ts';

/**
 * Quick Order runs edge-to-edge rather than inside the 1200px `Container` the
 * rest of the site uses. On a desktop monitor that container left ~350px of
 * dead gutter down each side of a page whose whole job is showing a dense
 * table — so the gutters now carry the filter rail and the live cart instead.
 */
const SHELL = 'mx-auto w-full max-w-[1760px] px-3 sm:px-4 lg:px-5';

/** Per-line ceiling, shared by the steppers and the typed quantity boxes. */
const QTY_MAX = 99;

/** Shared by every typed quantity box so the three of them stay identical. */
const QTY_FIELD =
  'rounded-lg text-center bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-700 font-bold tabular-nums text-surface-900 dark:text-surface-100 focus:outline-none focus:border-brand-500 transition-colors';

type SortOption =
  /**
   * The arrangement the admin set by dragging rows on Admin → Products.
   *
   * The default, and the only one that is not sorted here at all — the server
   * has already returned the rows in `displayOrder`, and the comparator leaves
   * them where they are. Quick Order used to ask for no particular order and
   * then sort by review count, so the shop could rearrange its catalogue all
   * afternoon and this screen would never show it.
   */
  | 'featured'
  | 'bestselling'
  | 'price-asc'
  | 'price-desc'
  | 'newest'
  | 'rating'
  | 'name'
  | 'discount';
type NoiseFilter = 'low' | 'medium' | 'high';
type StockFilter = 'in' | 'out';

interface SortOptionItem { value: SortOption; label: string; }
interface DiscountBand { id: string; label: string; min: number; max: number; }

interface QuickOrderContent {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  searchPlaceholder: string;
  allProductsLabel: string;
  categoriesLabel: string;
  filtersLabel: string;
  sortLabel: string;
  noiseLevelLabel: string;
  noiseLowLabel: string;
  noiseMediumLabel: string;
  noiseHighLabel: string;
  priceRangeLabel: string;
  stockAvailabilityLabel: string;
  discountFilterLabel: string;
  discountBands: DiscountBand[];
  clearAllLabel: string;
  applyLabel: string;
  noiseTagLabel: string;
  sortOptions: SortOptionItem[];
  colProduct: string;
  colLabel: string;
  colStock: string;
  colPrice: string;
  colQuantity: string;
  colTotal: string;
  bestSellerLabel: string;
  premiumLabel: string;
  newLabel: string;
  limitedLabel: string;
  lowNoiseLabel: string;
  inStockLabel: string;
  outOfStockLabel: string;
  lowStockTemplate: string;
  unavailableLabel: string;
  addLabel: string;
  productWord: string;
  productsWord: string;
  itemWord: string;
  itemsWord: string;
  selectedWord: string;
  emptyResultsText: string;
  resetFiltersLabel: string;
  cartTitle: string;
  cartEmptyText: string;
  subtotalLabel: string;
  savingsLabel: string;
  checkoutLabel: string;
  viewCartLabel: string;
  [key: string]: unknown;
}

const defaultQuickOrderContent: QuickOrderContent = {
  heroEyebrow: 'Rapid Ordering',
  heroTitle: 'Quick Order',
  heroSubtitle: 'Add quantities directly from the table — no need to visit each product page. Perfect for bulk and repeat orders.',
  searchPlaceholder: 'Search products...',
  allProductsLabel: 'All Products',
  categoriesLabel: 'Categories',
  filtersLabel: 'Filters',
  sortLabel: 'Sort',
  noiseLevelLabel: 'Noise Level',
  noiseLowLabel: 'Low',
  noiseMediumLabel: 'Medium',
  noiseHighLabel: 'High',
  priceRangeLabel: 'Price Range',
  stockAvailabilityLabel: 'Stock Availability',
  discountFilterLabel: 'Discount',
  discountBands: [
    { id: 'd1', label: '50% & Above', min: 50, max: 100 },
    { id: 'd2', label: '30% - 50%', min: 30, max: 49 },
    { id: 'd3', label: 'Less than 30%', min: 0, max: 29 },
  ],
  clearAllLabel: 'Clear All',
  applyLabel: 'Apply',
  noiseTagLabel: 'Noise:',
  sortOptions: [
    { value: 'featured', label: 'Shop Order' },
    { value: 'bestselling', label: 'Best Selling' },
    { value: 'price-asc', label: 'Price: Low → High' },
    { value: 'price-desc', label: 'Price: High → Low' },
    { value: 'rating', label: 'Top Rated' },
    { value: 'discount', label: 'Biggest Savings' },
    { value: 'newest', label: 'Newest First' },
    { value: 'name', label: 'Name: A → Z' },
  ],
  colProduct: 'Product',
  colLabel: 'Label',
  colStock: 'Stock',
  colPrice: 'Price',
  colQuantity: 'Quantity',
  colTotal: 'Total',
  bestSellerLabel: 'Best Seller',
  premiumLabel: 'Premium',
  newLabel: 'New',
  limitedLabel: 'Limited',
  lowNoiseLabel: 'Low Noise',
  inStockLabel: 'In Stock',
  outOfStockLabel: 'Out of Stock',
  lowStockTemplate: '{count} left',
  unavailableLabel: 'Unavailable',
  addLabel: 'Add',
  productWord: 'product',
  productsWord: 'products',
  itemWord: 'item',
  itemsWord: 'items',
  selectedWord: 'selected',
  emptyResultsText: 'No products match your filters',
  resetFiltersLabel: 'Reset all filters',
  cartTitle: 'Your Cart',
  cartEmptyText: 'No items yet — press Add on any product and it lands here.',
  subtotalLabel: 'Subtotal',
  savingsLabel: 'You save',
  checkoutLabel: 'Proceed to Checkout',
  viewCartLabel: 'View Cart',
};

/**
 * Every badge the Product schema allows, so a value added on the backend shows
 * up here instead of silently falling through to the "—" placeholder. Keyed by
 * the stored value; `label` names the field on QuickOrderContent so the text
 * stays editable from the admin content panel.
 */
/**
 * Named explicitly rather than derived from `keyof QuickOrderContent`: that
 * interface carries a `[key: string]: unknown` index signature, so keyof widens
 * to `string` and indexing with it yields `unknown` instead of the label text.
 */
type QuickOrderTextKey =
  | 'bestSellerLabel'
  | 'premiumLabel'
  | 'newLabel'
  | 'limitedLabel'
  | 'lowNoiseLabel';

const BADGE_STYLES: Record<
  string,
  { icon: LucideIcon; pill: string; icon_: string; text: string; label: QuickOrderTextKey }
> = {
  bestseller: {
    icon: Award,
    pill: 'bg-amber-500/10 border-amber-500/20',
    icon_: 'text-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'bestSellerLabel',
  },
  premium: {
    icon: Crown,
    pill: 'bg-violet-500/10 border-violet-500/20',
    icon_: 'text-violet-500',
    text: 'text-violet-600 dark:text-violet-400',
    label: 'premiumLabel',
  },
  new: {
    icon: Sparkles,
    pill: 'bg-emerald-500/10 border-emerald-500/20',
    icon_: 'text-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    label: 'newLabel',
  },
  limited: {
    icon: Flame,
    pill: 'bg-rose-500/10 border-rose-500/20',
    icon_: 'text-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    label: 'limitedLabel',
  },
  'low-noise': {
    icon: VolumeX,
    pill: 'bg-sky-500/10 border-sky-500/20',
    icon_: 'text-sky-500',
    text: 'text-sky-600 dark:text-sky-400',
    label: 'lowNoiseLabel',
  },
};

/**
 * Categories are admin-created, so there is no fixed slug list to hand-pick
 * icons from. Match on the words a fireworks category actually uses, and fall
 * back to a name-hashed pick so an unrecognised category still gets a stable
 * icon rather than a different one on every render.
 */
const CATEGORY_ICON_RULES: { match: RegExp; icon: LucideIcon; color: string }[] = [
  { match: /spark/i, icon: Sparkles, color: 'text-amber-500' },
  { match: /flower|pot|fountain/i, icon: Flame, color: 'text-orange-500' },
  { match: /rocket|sky|aerial|shot/i, icon: Rocket, color: 'text-rose-500' },
  { match: /wheel|chakkar|chakra|ground/i, icon: Disc3, color: 'text-emerald-500' },
  { match: /gift|box/i, icon: Gift, color: 'text-sky-500' },
  { match: /combo|pack|bundle/i, icon: Package, color: 'text-violet-500' },
  { match: /sound|bomb|ultra|cracker|atom/i, icon: Zap, color: 'text-red-500' },
];

const CATEGORY_ICON_FALLBACKS: { icon: LucideIcon; color: string }[] = [
  { icon: Sparkles, color: 'text-amber-500' },
  { icon: Flame, color: 'text-orange-500' },
  { icon: Rocket, color: 'text-rose-500' },
  { icon: Disc3, color: 'text-emerald-500' },
  { icon: Gift, color: 'text-sky-500' },
  { icon: Package, color: 'text-violet-500' },
];

function categoryIcon(id: string, label: string) {
  if (id === 'all') return { icon: LayoutGrid, color: 'text-surface-500' };
  const haystack = `${id} ${label}`;
  const hit = CATEGORY_ICON_RULES.find((r) => r.match.test(haystack));
  if (hit) return { icon: hit.icon, color: hit.color };
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 997;
  return CATEGORY_ICON_FALLBACKS[hash % CATEGORY_ICON_FALLBACKS.length];
}

function getDiscount(p: Product) {
  if (!p.originalPrice) return 0;
  return Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100);
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

/**
 * Two native range inputs stacked over one track. Native inputs rather than
 * pointer maths so keyboard and screen-reader users get real slider semantics
 * for free; the inputs are click-through with only their thumbs re-enabled, or
 * the upper one would swallow every drag aimed at the lower one.
 */
const RANGE_THUMB = cn(
  'pointer-events-none absolute inset-x-0 top-0 h-1.5 w-full appearance-none bg-transparent focus:outline-none',
  '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-transparent',
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none',
  '[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:-mt-1',
  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-600',
  '[&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-grab',
  '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:border-none',
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5',
  '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-red-600',
  '[&::-moz-range-thumb]:cursor-grab',
);

function PriceRangeSlider({
  bounds,
  value,
  onChange,
  label,
}: {
  bounds: [number, number];
  value: [number, number];
  onChange: (v: [number, number]) => void;
  label: string;
}) {
  const [min, max] = bounds;
  const [low, high] = value;
  const span = Math.max(1, max - min);
  const leftPct = ((low - min) / span) * 100;
  const rightPct = ((high - min) / span) * 100;

  return (
    <div>
      <div className="relative h-1.5 mb-2">
        <div className="absolute inset-x-0 top-0 h-1.5 rounded-full bg-surface-200 dark:bg-surface-700" />
        <div
          className="absolute top-0 h-1.5 rounded-full bg-red-600"
          style={{ left: `${leftPct}%`, width: `${Math.max(0, rightPct - leftPct)}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={low}
          aria-label={`${label} — minimum`}
          // Clamping rather than swapping keeps the thumb being dragged the one
          // that moves; a swap makes the handle jump out from under the cursor.
          onChange={(e) => onChange([Math.min(Number(e.target.value), high), high])}
          className={cn(RANGE_THUMB, 'z-10')}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={high}
          aria-label={`${label} — maximum`}
          onChange={(e) => onChange([low, Math.max(Number(e.target.value), low)])}
          className={cn(RANGE_THUMB, 'z-20')}
        />
      </div>
      <div className="flex items-center justify-between text-caption text-surface-500 dark:text-surface-400">
        <span>{formatPrice(low)}</span>
        <span>{formatPrice(high)}</span>
      </div>
    </div>
  );
}

function FacetCheckbox({
  label,
  count,
  checked,
  onToggle,
}: {
  label: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
}) {
  // A facet with nothing behind it stays visible but disabled. Dropping empty
  // rows makes the list reshuffle every time the shopper narrows the results,
  // which costs more than a greyed-out row.
  const empty = count === 0 && !checked;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={empty}
      aria-pressed={checked}
      className={cn(
        'group w-full flex items-center gap-2.5 py-1 text-left transition-colors',
        empty ? 'opacity-40 cursor-not-allowed' : 'hover:text-surface-900 dark:hover:text-surface-100',
      )}
    >
      <span
        className={cn(
          'w-4 h-4 flex-shrink-0 rounded flex items-center justify-center border transition-colors',
          checked
            ? 'bg-emerald-600 border-emerald-600 text-white'
            : 'bg-white dark:bg-surface-800 border-surface-300 dark:border-surface-600 group-hover:border-emerald-400',
        )}
      >
        {checked && <Check size={11} strokeWidth={3.5} />}
      </span>
      <span className="flex-1 min-w-0 truncate text-body-sm text-surface-600 dark:text-surface-400">{label}</span>
      <span className="text-caption tabular-nums text-surface-400 flex-shrink-0">({count})</span>
    </button>
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-3 border-t border-surface-100 dark:border-surface-800">
      <p className="mb-1 text-body-sm font-bold text-surface-900 dark:text-surface-100">{title}</p>
      {children}
    </div>
  );
}

interface FilterControlsProps {
  content: QuickOrderContent;
  priceBounds: [number, number];
  priceRange: [number, number];
  setPriceRange: (v: [number, number]) => void;
  stockFilters: Set<StockFilter>;
  toggleStock: (v: StockFilter) => void;
  discountFilters: Set<string>;
  toggleDiscount: (id: string) => void;
  noiseFilters: Set<NoiseFilter>;
  toggleNoise: (level: NoiseFilter) => void;
  counts: {
    stock: Record<StockFilter, number>;
    discount: Record<string, number>;
    noise: Record<NoiseFilter, number>;
  };
}

/**
 * The filter body itself, with no chrome of its own. The left rail renders it
 * open on a wide screen and the toolbar dropdown renders the same markup below
 * `lg`, so the two can never drift apart.
 */
function FilterControls({
  content,
  priceBounds,
  priceRange,
  setPriceRange,
  stockFilters,
  toggleStock,
  discountFilters,
  toggleDiscount,
  noiseFilters,
  toggleNoise,
  counts,
}: FilterControlsProps) {
  const noiseOptions: { value: NoiseFilter; label: string }[] = [
    { value: 'low', label: content.noiseLowLabel },
    { value: 'medium', label: content.noiseMediumLabel },
    { value: 'high', label: content.noiseHighLabel },
  ];

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-body-sm font-bold text-surface-900 dark:text-surface-100">{content.priceRangeLabel}</p>
        <PriceRangeSlider
          bounds={priceBounds}
          value={priceRange}
          onChange={setPriceRange}
          label={content.priceRangeLabel}
        />
      </div>

      <FacetGroup title={content.stockAvailabilityLabel}>
        <FacetCheckbox
          label={content.inStockLabel}
          count={counts.stock.in}
          checked={stockFilters.has('in')}
          onToggle={() => toggleStock('in')}
        />
        <FacetCheckbox
          label={content.outOfStockLabel}
          count={counts.stock.out}
          checked={stockFilters.has('out')}
          onToggle={() => toggleStock('out')}
        />
      </FacetGroup>

      <FacetGroup title={content.discountFilterLabel}>
        {content.discountBands.map((band) => (
          <FacetCheckbox
            key={band.id}
            label={band.label}
            count={counts.discount[band.id] ?? 0}
            checked={discountFilters.has(band.id)}
            onToggle={() => toggleDiscount(band.id)}
          />
        ))}
      </FacetGroup>

      <FacetGroup title={content.noiseLevelLabel}>
        {noiseOptions.map((opt) => (
          <FacetCheckbox
            key={opt.value}
            label={opt.label}
            count={counts.noise[opt.value] ?? 0}
            checked={noiseFilters.has(opt.value)}
            onToggle={() => toggleNoise(opt.value)}
          />
        ))}
      </FacetGroup>
    </div>
  );
}

export function QuickOrderPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('featured');
  const [noiseFilters, setNoiseFilters] = useState<Set<NoiseFilter>>(new Set());
  const [stockFilters, setStockFilters] = useState<Set<StockFilter>>(new Set());
  const [discountFilters, setDiscountFilters] = useState<Set<string>>(new Set());
  const [showCategories, setShowCategories] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  /**
   * The product whose video is playing over the list, if any.
   *
   * Held here rather than per row so only one player is ever mounted — an
   * iframe per row would load a YouTube player for every product on screen.
   */
  const [video, setVideo] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string; count: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // The right rail edits the real cart rather than a staging list, so a row's
  // quantity, the rail and the navbar badge are always the same number.
  const cartItems = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const setCartQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const openCart = useCartStore((s) => s.openCart);
  const siteConfig = useSiteStore((s) => s.config);
  const content = useContentSection<QuickOrderContent>('quick-order', defaultQuickOrderContent);

  /**
   * The sort list, with Shop Order guaranteed to be in it.
   *
   * These options are admin-editable content, and a list saved before Shop
   * Order existed does not carry it — which would leave the screen opening on
   * an option the customer can see is selected but cannot choose again once
   * they have moved off it.
   */
  const sortOptions = useMemo(() => {
    const saved = content.sortOptions ?? [];
    return saved.some((o) => o.value === 'featured')
      ? saved
      : [{ value: 'featured' as SortOption, label: 'Shop Order' }, ...saved];
  }, [content.sortOptions]);

  /**
   * Handed to every product link on this page. Someone who opened a product
   * from Quick Order expects the back arrow to bring them back to the table
   * they were filling in — the product page's default is the shop category,
   * which they never went through.
   */
  const { pathname } = useLocation();
  const backToQuickOrder = { from: pathname, fromLabel: content.heroTitle };

  const bottomBarRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  useClickOutside(categoryRef, () => setShowCategories(false));
  useClickOutside(filterRef, () => setShowFilters(false));
  useClickOutside(sortRef, () => setShowSort(false));

  // Categories (with counts) — loaded once.
  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((categoriesRes) => {
        if (cancelled) return;
        const allCount = categoriesRes.reduce((sum, c: CategoryItem) => sum + (c.productCount || 0), 0);
        setCategories([
          { id: 'all', label: 'All Products', count: allCount },
          ...categoriesRes.map((c: CategoryItem) => ({ id: c.slug, label: c.name, count: c.productCount })),
        ]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Debounce the search box for server queries.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Products — category + search go to the server; the finer facets (price,
  // stock, discount, noise) and sort refine the returned working set here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const productsRes = await getProducts({
          ...(activeCategory !== 'all' ? { category: activeCategory } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          // The arrangement set on Admin → Products. Without this the server
          // falls back to newest-first and the shop's own ordering never
          // reaches this screen, however carefully it was dragged.
          sort: 'manual',
          // Quick Order is a single un-paginated table, so it has to ask for the
          // whole catalogue. 500 is the server's ceiling (clampLimit in
          // product.service.ts); a catalogue past that needs paging added here.
          limit: 500,
        });
        if (!cancelled) setProducts(productsRes.data);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeCategory, debouncedSearch]);

  const priceBounds = useMemo<[number, number]>(() => {
    if (products.length === 0) return [0, 5000];
    const prices = products.map((p) => p.price);
    const low = Math.floor(Math.min(...prices));
    const high = Math.ceil(Math.max(...prices));
    // A single-price result set would give a zero-width slider, which cannot be
    // dragged and reads as broken.
    return low === high ? [low, low + 1] : [low, high];
  }, [products]);

  const boundsKey = `${priceBounds[0]}-${priceBounds[1]}`;
  // The selection is stamped with the bounds it was made against, so switching
  // category snaps the slider back to the new full range with no effect and no
  // stale filter left applied to a different catalogue slice.
  const [priceSelection, setPriceSelection] = useState<{ key: string; range: [number, number] } | null>(null);
  const priceActive = priceSelection !== null && priceSelection.key === boundsKey;
  const priceRange = priceActive ? priceSelection.range : priceBounds;
  const setPriceRange = (range: [number, number]) => setPriceSelection({ key: boundsKey, range });

  const discountBandOf = (p: Product) => {
    const d = getDiscount(p);
    return content.discountBands.find((b) => d >= b.min && d <= b.max)?.id;
  };

  const counts = useMemo(() => {
    const acc = {
      stock: { in: 0, out: 0 } as Record<StockFilter, number>,
      discount: {} as Record<string, number>,
      noise: { low: 0, medium: 0, high: 0 } as Record<NoiseFilter, number>,
    };
    for (const p of products) {
      acc.stock[p.inStock ? 'in' : 'out'] += 1;
      if (p.noiseLevel in acc.noise) acc.noise[p.noiseLevel] += 1;
      const band = discountBandOf(p);
      if (band) acc.discount[band] = (acc.discount[band] ?? 0) + 1;
    }
    return acc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, content.discountBands]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (noiseFilters.size > 0) count++;
    if (stockFilters.size > 0) count++;
    if (discountFilters.size > 0) count++;
    if (priceActive) count++;
    return count;
  }, [noiseFilters, stockFilters, discountFilters, priceActive]);

  const filteredProducts = useMemo(() => {
    // Category + search are already applied server-side; refine the rest here.
    const [low, high] = priceRange;
    const result = products.filter((p) => {
      if (noiseFilters.size > 0 && !noiseFilters.has(p.noiseLevel)) return false;
      if (stockFilters.size > 0 && !stockFilters.has(p.inStock ? 'in' : 'out')) return false;
      if (discountFilters.size > 0) {
        const band = discountBandOf(p);
        if (!band || !discountFilters.has(band)) return false;
      }
      if (priceActive && (p.price < low || p.price > high)) return false;
      return true;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        // 'featured' falls through to the default: Array.prototype.sort is
        // stable, so returning 0 for every pair keeps the order the server
        // sent — which IS the shop's arrangement.
        case 'bestselling': return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
        case 'price-asc': return a.price - b.price;
        case 'price-desc': return b.price - a.price;
        case 'rating': return (b.rating ?? 0) - (a.rating ?? 0);
        case 'discount': return getDiscount(b) - getDiscount(a);
        case 'newest': return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
        case 'name': return a.name.localeCompare(b.name);
        default: return 0;
      }
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, sortBy, noiseFilters, stockFilters, discountFilters, priceRange, priceActive, content.discountBands]);

  function toggleIn<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  const clearAllFilters = () => {
    setNoiseFilters(new Set());
    setStockFilters(new Set());
    setDiscountFilters(new Set());
    setPriceSelection(null);
  };

  const quantities = useMemo(() => {
    const map = new Map<string, number>();
    cartItems.forEach((item) => map.set(item.product.id, item.quantity));
    return map;
  }, [cartItems]);

  const getQuantity = (id: string) => quantities.get(id) ?? 0;

  const updateQuantity = (product: Product, qty: number) => {
    // The ceiling is never below what is already in the cart. A line can pass
    // 99 from the product page (each Add adds on), and clamping to 99 here made
    // the − and + steppers both drop a 120-box line straight to 99.
    const capped = Math.min(Math.max(QTY_MAX, getQuantity(product.id)), Math.max(0, qty));
    if (capped === 0) {
      removeItem(product.id);
      return;
    }
    // `addItem` adds to whatever is already there, so it is only correct for a
    // line that does not exist yet; an existing line is set outright.
    if (getQuantity(product.id) === 0) addItem(product, capped);
    else setCartQuantity(product.id, capped);
  };

  const orderTotal = useMemo(() => {
    let total = 0;
    let items = 0;
    let savings = 0;
    cartItems.forEach((item) => {
      total += item.product.price * item.quantity;
      items += item.quantity;
      savings += ((item.product.originalPrice ?? item.product.price) - item.product.price) * item.quantity;
    });
    return { total, items, savings };
  }, [cartItems]);

  // Checkout is gated here for the same reason the cart drawer gates it: sending
  // a customer forward just to stop them a page later is the worse failure.
  const minimum = orderMinimum(siteConfig, orderTotal.total);

  const showBottomBar = orderTotal.items > 0;

  /**
   * Publish the bottom bar's height as `--bottom-bar-h`, the same contract
   * AnnouncementBar uses for `--announcement-h`. The floating WhatsApp button is
   * `z-[1000]` and would otherwise sit on top of the View Cart button; reading
   * the measured height lets it lift clear instead of hard-coding an offset.
   *
   * Measured rather than assumed because the bar is `xl:hidden` — once the cart
   * has its own column the element has no box, `offsetHeight` is 0, and the
   * button drops back to its normal corner with no breakpoint logic here.
   */
  useEffect(() => {
    const root = document.documentElement;
    const el = bottomBarRef.current;
    const clear = () => root.style.setProperty('--bottom-bar-h', '0px');
    if (!el) {
      clear();
      return;
    }
    const update = () => root.style.setProperty('--bottom-bar-h', `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      clear();
    };
  }, [showBottomBar]);

  // When the store hides stock levels the API omits `stockCount` altogether, so
  // there is no availability indicator to draw and the whole column disappears.
  const getStockStatus = (p: Product) => {
    if (p.stockCount === undefined) return null;
    if (!p.inStock) return { label: content.outOfStockLabel, color: 'text-red-500', dot: 'bg-red-500' };
    if (p.stockCount < 20) {
      return { label: content.lowStockTemplate.replace('{count}', String(p.stockCount)), color: 'text-amber-500', dot: 'bg-amber-500' };
    }
    return { label: content.inStockLabel, color: 'text-emerald-500', dot: 'bg-emerald-500' };
  };

  const showStock = filteredProducts.some((p) => p.stockCount !== undefined);

  /**
   * Desktop table tracks: Product | Label | (Stock) | Price | Quantity | Total.
   * Explicit tracks rather than twelfths, because from xl up the filter rail
   * (248px) and the cart rail (340px) leave the table under 600px on a 1280
   * screen: equal twelfths gave the stepper ~150px for ~250px of controls, so
   * the line total was clipped by the card and the savings line ran under the
   * next column. Sizing the data columns to what they actually hold and handing
   * every leftover pixel to the product name keeps a row inside its box at any
   * width — a long name truncates instead of shoving its neighbours out.
   *
   * The roomy set waits for 3xl (1700px) rather than 2xl: with the two rails
   * gone from the count, a 1536px window leaves the table ~820px, which the
   * wider tracks would spend before the product name got its turn.
   *
   * Stock only earns a column of its own in the roomy set; below that the
   * indicator rides under the product name, as it already does on mobile.
   */
  const tableTracks = cn(
    'grid-cols-[minmax(0,1fr)_96px_108px_132px_68px]',
    showStock
      ? '3xl:grid-cols-[minmax(0,1fr)_136px_112px_144px_152px_92px]'
      : '3xl:grid-cols-[minmax(0,1fr)_136px_144px_152px_92px]',
  );

  /**
   * The catalogue-wide offer, stated once in the header instead of stamping the
   * same percentage on all 207 rows. Reads "Flat" only when the whole set really
   * does share one rate — the moment pricing varies it falls back to "Up to",
   * so the claim stays true without anyone having to remember to edit it.
   */
  const offerLabel = useMemo(() => {
    const discounts = products.map(getDiscount).filter((d) => d > 0);
    if (discounts.length === 0) return null;
    const max = Math.max(...discounts);
    const min = Math.min(...discounts);
    return min === max && discounts.length === products.length ? `Flat ${max}% OFF` : `Up to ${max}% OFF`;
  }, [products]);

  const activeCat = categories.find((c) => c.id === activeCategory);
  const activeCatLabel = activeCategory === 'all' ? content.allProductsLabel : (activeCat?.label ?? content.allProductsLabel);
  const { icon: ActiveCatIcon, color: activeCatColor } = categoryIcon(activeCategory, activeCatLabel);

  const filterControls = (
    <FilterControls
      content={content}
      priceBounds={priceBounds}
      priceRange={priceRange}
      setPriceRange={setPriceRange}
      stockFilters={stockFilters}
      toggleStock={(v) => toggleIn(setStockFilters, v)}
      discountFilters={discountFilters}
      toggleDiscount={(id) => toggleIn(setDiscountFilters, id)}
      noiseFilters={noiseFilters}
      toggleNoise={(v) => toggleIn(setNoiseFilters, v)}
      counts={counts}
    />
  );

  return (
    <div className="pt-16 lg:pt-18 min-h-screen bg-surface-50 dark:bg-surface-950">
      <SEO
        title="Quick Order — Fast Fireworks Ordering"
        description="Quickly browse and add fireworks to your cart with our streamlined quick order tool. Filter by category, price, and noise level."
        canonical="/quick-order"
      />
      {/* Header — single compact line */}
      <section className="py-4 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800">
        <div className={SHELL}>
          <div className="flex items-center justify-center gap-2.5 text-center">
            <Zap size={16} className="text-brand-500 flex-shrink-0" />
            <h1 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">
              {content.heroTitle}
            </h1>
            {offerLabel && (
              <span className="flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full bg-red-500/10 text-caption font-bold text-red-600 dark:text-red-400">
                {offerLabel}
              </span>
            )}
            <span className="text-body-sm text-surface-400 dark:text-surface-500 truncate hidden sm:inline">
              {content.heroSubtitle}
            </span>
          </div>
        </div>
      </section>

      <div className={cn(SHELL, 'flex gap-5 py-4 lg:py-6')}>
        {/* Left rail — filters only. Categories live in the toolbar dropdown so
            this stays short enough to read at a glance.

            The height is measured for the rail's UNSTUCK position: at scroll 0
            it starts ~9.75rem down (fixed header + the Quick Order title band +
            the wrapper's top padding), and sizing it for the stuck position
            instead is what pushed its bottom off-screen. 11.5rem covers that
            offset plus a little breathing room, so the whole rail is on screen
            both before and after it sticks. */}
        <aside className="hidden lg:block w-[248px] flex-shrink-0">
          <div className="sticky top-[calc(var(--announcement-h,0px)+5.5rem)] h-[calc(100vh-var(--announcement-h,0px)-11.5rem)] overflow-y-auto no-scrollbar">
            <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-3.5">
              <div className="flex items-center justify-between mb-3">
                <p className="flex items-center gap-2 text-body-sm font-bold text-surface-900 dark:text-surface-100">
                  <Filter size={13} className="text-red-600" />
                  {content.filtersLabel}
                </p>
                <button
                  onClick={clearAllFilters}
                  disabled={activeFilterCount === 0}
                  className="text-body-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-40 transition-colors"
                >
                  {content.clearAllLabel}
                </button>
              </div>
              {filterControls}
            </div>
          </div>
        </aside>

        {/* Main column — toolbar and the product table */}
        {/* The mobile cart bar is fixed to the bottom of the viewport, so the
            table needs room to clear it or its last row sits under the bar.
            Reading the measured height covers both "no bar" (0px) and a bar that
            wraps to two lines on a narrow phone. */}
        <main className="flex-1 min-w-0 pb-[calc(var(--bottom-bar-h,0px)+1rem)]">
          {/* Controls Row — pinned under the navbar while scrolling */}
          <div className="sticky top-[calc(var(--announcement-h,0px)+4rem)] lg:top-[calc(var(--announcement-h,0px)+4.5rem)] z-30 py-3 mb-5 flex flex-col gap-2.5 bg-surface-50/95 dark:bg-surface-950/95 backdrop-blur-sm border-b border-surface-200 dark:border-surface-800">
            {/* Category + Search + Filter + Sort.
                One row from lg up; on a phone the search box takes a full row of
                its own (`basis-full`) and the three controls wrap underneath,
                because four controls on one 440px line squeezes the input to
                nothing. `order-*` keeps the desktop arrangement unchanged. */}
            <div className="flex flex-wrap items-center gap-2">
            <div ref={categoryRef} className="relative order-2 lg:order-1 flex-1 min-w-0 basis-0 lg:flex-none lg:basis-auto">
              <button
                onClick={() => { setShowCategories(!showCategories); setShowFilters(false); setShowSort(false); }}
                aria-expanded={showCategories}
                className={cn(
                  'flex items-center gap-2 w-full lg:w-auto lg:max-w-[210px] px-3 py-2 rounded-xl text-body-sm font-medium border transition-colors duration-200',
                  activeCategory !== 'all'
                    ? 'bg-red-700 text-white border-red-700'
                    : 'bg-white dark:bg-surface-900 text-surface-600 dark:text-surface-400 border-surface-200 dark:border-surface-700 hover:border-red-400',
                )}
              >
                <ActiveCatIcon
                  size={15}
                  className={cn('flex-shrink-0', activeCategory !== 'all' ? 'text-white' : activeCatColor)}
                />
                <span className="flex-1 min-w-0 text-left truncate">{activeCatLabel}</span>
                {activeCat && (
                  <span
                    className={cn(
                      'text-caption tabular-nums flex-shrink-0',
                      activeCategory !== 'all' ? 'text-white/75' : 'text-surface-400',
                    )}
                  >
                    ({activeCat.count})
                  </span>
                )}
                <ChevronDown
                  size={14}
                  className={cn('flex-shrink-0 transition-transform duration-200', showCategories && 'rotate-180')}
                />
              </button>

              <AnimatePresence>
                {showCategories && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[340px] overflow-y-auto bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 shadow-xl z-50 p-1.5"
                  >
                    {categories.map((cat) => {
                      const isActive = activeCategory === cat.id;
                      const { icon: CatIcon, color } = categoryIcon(cat.id, cat.label);
                      return (
                        <button
                          key={cat.id}
                          onClick={() => { setActiveCategory(cat.id); setShowCategories(false); }}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-body-sm font-medium transition-colors duration-200',
                            isActive
                              ? 'bg-red-700 text-white'
                              : 'text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850',
                          )}
                        >
                          <CatIcon size={16} className={cn('flex-shrink-0', isActive ? 'text-white' : color)} />
                          <span className="flex-1 min-w-0 truncate">
                            {cat.id === 'all' ? content.allProductsLabel : cat.label}
                          </span>
                          <span
                            className={cn(
                              'text-caption tabular-nums flex-shrink-0',
                              isActive ? 'text-white/75' : 'text-surface-400',
                            )}
                          >
                            ({cat.count})
                          </span>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative order-1 lg:order-2 w-full basis-full min-w-0 lg:w-auto lg:basis-0 lg:flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={content.searchPlaceholder}
                className="w-full pl-10 pr-28 py-2 rounded-xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-700 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
              />
              {/* The result count rides inside the field: it answers the search
                  box directly, and parking it here keeps the toolbar to one row
                  instead of spending a line on a single number. `pr-28` above
                  reserves the space so a long query never slides under it. */}
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-caption tabular-nums text-surface-400 pointer-events-none">
                {filteredProducts.length} {filteredProducts.length !== 1 ? content.productsWord : content.productWord}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 order-3">
              {/* Filter Dropdown — the left rail replaces this from lg up */}
              <div ref={filterRef} className="relative lg:hidden">
                <button
                  onClick={() => { setShowFilters(!showFilters); setShowSort(false); setShowCategories(false); }}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-full text-body-sm font-medium border transition-all duration-200',
                    showFilters || activeFilterCount > 0
                      ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/30'
                      : 'bg-white dark:bg-surface-900 text-surface-600 dark:text-surface-400 border-surface-200 dark:border-surface-700 hover:border-brand-500/50',
                  )}
                >
                  <Filter size={14} />
                  {content.filtersLabel}
                  {activeFilterCount > 0 && (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-500 text-[10px] font-bold text-surface-950">
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronDown size={14} className={cn('transition-transform duration-200', showFilters && 'rotate-180')} />
                </button>

                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-xl z-50 p-5"
                    >
                      {filterControls}

                      <div className="flex items-center justify-between pt-4 mt-5 border-t border-surface-200 dark:border-surface-800">
                        <button
                          onClick={clearAllFilters}
                          className="text-body-sm font-semibold text-red-600 hover:text-red-700 transition-colors"
                        >
                          {content.clearAllLabel}
                        </button>
                        <button
                          onClick={() => setShowFilters(false)}
                          className="px-4 py-2 rounded-lg bg-brand-500 text-surface-950 text-body-sm font-bold hover:bg-brand-600 transition-colors"
                        >
                          {content.applyLabel}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Sort Dropdown */}
              <div ref={sortRef} className="relative">
                <button
                  onClick={() => { setShowSort(!showSort); setShowFilters(false); setShowCategories(false); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-body-sm font-medium bg-white dark:bg-surface-900 text-surface-600 dark:text-surface-400 border border-surface-200 dark:border-surface-700 hover:border-brand-500/50 transition-colors"
                >
                  <ArrowUpDown size={14} />
                  <span className="hidden sm:inline">{sortOptions.find((s) => s.value === sortBy)?.label}</span>
                  <span className="sm:hidden">{content.sortLabel}</span>
                  <ChevronDown size={14} className={cn('transition-transform duration-200', showSort && 'rotate-180')} />
                </button>

                <AnimatePresence>
                  {showSort && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 shadow-xl z-50 py-2"
                    >
                      {sortOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => { setSortBy(opt.value); setShowSort(false); }}
                          className={cn(
                            'w-full flex items-center justify-between px-4 py-2.5 text-body-sm font-medium transition-colors text-left',
                            sortBy === opt.value
                              ? 'text-brand-600 dark:text-brand-400 bg-brand-500/5'
                              : 'text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850',
                          )}
                        >
                          {opt.label}
                          {sortBy === opt.value && <Check size={14} />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            </div>
          </div>

          {/* Active Filter Tags */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {priceActive && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-500/10 text-body-sm text-brand-600 dark:text-brand-400">
                  {formatPrice(priceRange[0])} – {formatPrice(priceRange[1])}
                  <button onClick={() => setPriceSelection(null)} className="hover:text-red-500 ml-0.5"><X size={12} /></button>
                </span>
              )}
              {stockFilters.size > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-500/10 text-body-sm text-brand-600 dark:text-brand-400">
                  {[...stockFilters].map((s) => (s === 'in' ? content.inStockLabel : content.outOfStockLabel)).join(', ')}
                  <button onClick={() => setStockFilters(new Set())} className="hover:text-red-500 ml-0.5"><X size={12} /></button>
                </span>
              )}
              {discountFilters.size > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-body-sm text-red-600 dark:text-red-400">
                  {content.discountBands.filter((b) => discountFilters.has(b.id)).map((b) => b.label).join(', ')}
                  <button onClick={() => setDiscountFilters(new Set())} className="hover:text-red-500 ml-0.5"><X size={12} /></button>
                </span>
              )}
              {noiseFilters.size > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-500/10 text-body-sm text-brand-600 dark:text-brand-400">
                  {content.noiseTagLabel} {[...noiseFilters].join(', ')}
                  <button onClick={() => setNoiseFilters(new Set())} className="hover:text-red-500 ml-0.5"><X size={12} /></button>
                </span>
              )}
              <button onClick={clearAllFilters} className="text-caption text-surface-400 hover:text-red-500 transition-colors">
                {content.clearAllLabel}
              </button>
            </div>
          )}

          {/* Product Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
            </div>
          ) : (
          <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 overflow-hidden">
            {/* Table Header */}
            <div className={cn('hidden md:grid gap-x-3 3xl:gap-x-4 px-4 3xl:px-6 py-3 bg-surface-50 dark:bg-surface-850 border-b border-surface-200 dark:border-surface-800 text-label font-bold uppercase tracking-wider text-surface-500', tableTracks)}>
              <div className="min-w-0 truncate">{content.colProduct}</div>
              <div className="text-center">{content.colLabel}</div>
              {showStock && <div className="hidden 3xl:block text-center">{content.colStock}</div>}
              <div className="text-right">{content.colPrice}</div>
              <div className="text-center">{content.colQuantity}</div>
              <div className="text-right">{content.colTotal}</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-surface-100 dark:divide-surface-800">
              {filteredProducts.map((product) => {
                const qty = getQuantity(product.id);
                const stock = getStockStatus(product);
                // Rupees, not percent: the percentage is the same on every row
                // and lives in the header, but the money saved differs per item.
                const savings = (product.originalPrice ?? product.price) - product.price;
                const badge = product.badge ? BADGE_STYLES[product.badge] : undefined;
                const BadgeIcon = badge?.icon;
                return (
                  <motion.div
                    key={product.id}
                    layout
                    className={cn(
                      'transition-colors',
                      qty > 0 && 'bg-brand-500/5 dark:bg-brand-500/10',
                      !product.inStock && 'opacity-50',
                    )}
                  >
                    {/* Desktop Row */}
                    <div className={cn('hidden md:grid gap-x-3 3xl:gap-x-4 px-4 3xl:px-6 py-4 items-center', tableTracks)}>
                      <div className="flex items-center gap-3 3xl:gap-4 min-w-0">
                        {/* `overflow-hidden` would clip the play badge, so the
                            rounding moves to the image and the wrapper keeps
                            only the positioning the badge needs. */}
                        <Link to={`/product/${product.slug}`} state={backToQuickOrder} className="relative w-12 h-12 3xl:w-14 3xl:h-14 rounded-xl bg-surface-100 dark:bg-surface-850 flex-shrink-0 hover:opacity-80 transition-opacity">
                          <img src={product.images[0] || undefined} alt={product.name} className="h-full w-full object-contain p-1 rounded-xl" loading="lazy" />
                          {product.videoUrl && (
                            <VideoBadge size="sm" onClick={() => setVideo(product)} />
                          )}
                        </Link>
                        <div className="min-w-0">
                          <Link
                            to={`/product/${product.slug}`}
                            state={backToQuickOrder}
                            className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-100 hover:text-brand-500 dark:hover:text-brand-400 transition-colors truncate block"
                          >
                            {product.name}
                          </Link>
                          {stock && (
                            <span className={cn('3xl:hidden flex items-center gap-1.5 mt-0.5 text-caption font-medium whitespace-nowrap', stock.color)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', stock.dot)} />
                              {stock.label}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-center min-w-0">
                        {badge && BadgeIcon ? (
                          <span className={cn('inline-flex items-center gap-1 3xl:gap-1.5 px-2 3xl:px-2.5 py-1 rounded-full border max-w-full', badge.pill)}>
                            <BadgeIcon size={13} className={cn('flex-shrink-0', badge.icon_)} />
                            <span className={cn('text-caption font-bold truncate', badge.text)}>{content[badge.label]}</span>
                          </span>
                        ) : (
                          <span className="text-surface-300 dark:text-surface-700">—</span>
                        )}
                      </div>

                      {showStock && (
                        <div className="hidden 3xl:flex items-center justify-center gap-1.5 min-w-0">
                          {stock && (
                            <>
                              <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', stock.dot)} />
                              <span className={cn('text-caption font-medium truncate', stock.color)}>{stock.label}</span>
                            </>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col items-end gap-0.5 min-w-0">
                        <div className="flex items-baseline gap-1.5 3xl:gap-2 whitespace-nowrap">
                          <span className="font-display font-bold text-body-md 3xl:text-body-lg text-brand-600 dark:text-brand-400 tabular-nums">
                            {formatPrice(product.price)}
                          </span>
                          {product.originalPrice && (
                            <span className="text-caption text-surface-400 line-through tabular-nums">
                              {formatPrice(product.originalPrice)}
                            </span>
                          )}
                        </div>
                        {savings > 0 && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {content.savingsLabel} {formatPrice(savings)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-center gap-2 min-w-0">
                        {!product.inStock ? (
                          <span className="text-body-sm text-surface-400 font-medium">{content.unavailableLabel}</span>
                        ) : qty === 0 ? (
                          <button
                            onClick={() => updateQuantity(product, 1)}
                            className="flex items-center gap-2 px-4 3xl:px-5 py-2 3xl:py-2.5 rounded-xl bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-brand-500 hover:text-surface-950 text-body-sm font-medium transition-all duration-200"
                          >
                            <Plus size={16} />
                            {content.addLabel}
                          </button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateQuantity(product, qty - 1)}
                              className="w-8 h-8 3xl:w-9 3xl:h-9 flex-shrink-0 rounded-lg flex items-center justify-center bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                            >
                              {qty === 1 ? <Trash2 size={15} /> : <Minus size={15} />}
                            </button>
                            <QuantityInput
                              value={qty}
                              onCommit={(next) => updateQuantity(product, next)}
                              label={`Quantity for ${product.name}`}
                              max={QTY_MAX}
                              className={cn('w-12 3xl:w-14 h-8 3xl:h-9 flex-shrink-0 text-body-sm', QTY_FIELD)}
                            />
                            <button
                              onClick={() => updateQuantity(product, qty + 1)}
                              className="w-8 h-8 3xl:w-9 3xl:h-9 flex-shrink-0 rounded-lg flex items-center justify-center bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-brand-500/10 hover:text-brand-500 transition-colors"
                            >
                              <Plus size={15} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Line total — price × quantity. A column of its own, so
                          the amounts line up down the table instead of drifting
                          with the width of the stepper next to them, and every
                          row carries one whether or not it is in the cart. */}
                      <div className="text-right min-w-0">
                        <span
                          className={cn(
                            'text-body-sm font-semibold tabular-nums whitespace-nowrap',
                            qty > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-surface-300 dark:text-surface-700',
                          )}
                        >
                          {formatPrice(product.price * qty)}
                        </span>
                      </div>
                    </div>

                    {/* Mobile Card */}
                    <div className="md:hidden flex gap-3 px-4 py-3">
                      <Link to={`/product/${product.slug}`} state={backToQuickOrder} className="relative w-16 h-16 rounded-xl bg-surface-100 dark:bg-surface-850 flex-shrink-0 hover:opacity-80 transition-opacity">
                        <img src={product.images[0] || undefined} alt={product.name} className="h-full w-full object-contain p-1 rounded-xl" loading="lazy" />
                        {product.videoUrl && <VideoBadge onClick={() => setVideo(product)} />}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to={`/product/${product.slug}`}
                            state={backToQuickOrder}
                            className="font-display font-semibold text-body-sm text-surface-900 dark:text-surface-100 hover:text-brand-500 transition-colors line-clamp-1"
                          >
                            {product.name}
                          </Link>
                          {stock && (
                            <span className={cn('flex items-center gap-1 text-caption font-medium whitespace-nowrap', stock.color)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', stock.dot)} />
                              {stock.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {badge && BadgeIcon && (
                            <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold', badge.pill, badge.icon_)}>
                              <BadgeIcon size={10} /> {content[badge.label]}
                            </span>
                          )}
                          {/* Line total shares the badge row rather than taking
                              one of its own: it costs the card no extra height,
                              and `ml-auto` parks it right whether or not the
                              product carries a badge. */}
                          <span
                            className={cn(
                              'ml-auto text-[10px] font-bold tabular-nums whitespace-nowrap',
                              qty > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-surface-400 dark:text-surface-600',
                            )}
                          >
                            {content.colTotal} {formatPrice(product.price * qty)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="font-display font-bold text-body-md text-brand-600 dark:text-brand-400">
                                {formatPrice(product.price)}
                              </span>
                              {product.originalPrice && (
                                <span className="text-caption text-surface-400 line-through">
                                  {formatPrice(product.originalPrice)}
                                </span>
                              )}
                            </div>
                            {savings > 0 && (
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                {content.savingsLabel} {formatPrice(savings)}
                              </span>
                            )}
                          </div>
                          {!product.inStock ? (
                            <span className="text-caption text-surface-400">{content.unavailableLabel}</span>
                          ) : qty === 0 ? (
                            <button
                              onClick={() => updateQuantity(product, 1)}
                              className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-brand-500 hover:text-surface-950 text-body-sm font-medium transition-all"
                            >
                              <Plus size={15} />
                              {content.addLabel}
                            </button>
                          ) : (
                            /* 36px targets rather than 28: these are the controls
                               a thumb hits repeatedly while building an order. */
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => updateQuantity(product, qty - 1)}
                                aria-label={`Decrease ${product.name}`}
                                className="w-9 h-9 rounded-lg flex items-center justify-center bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                              >
                                {qty === 1 ? <Trash2 size={15} /> : <Minus size={15} />}
                              </button>
                              <QuantityInput
                                value={qty}
                                onCommit={(next) => updateQuantity(product, next)}
                                label={`Quantity for ${product.name}`}
                                max={QTY_MAX}
                                className={cn('w-11 h-9 flex-shrink-0 text-body-sm', QTY_FIELD)}
                              />
                              <button
                                onClick={() => updateQuantity(product, qty + 1)}
                                aria-label={`Increase ${product.name}`}
                                className="w-9 h-9 rounded-lg flex items-center justify-center bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-brand-500/10 hover:text-brand-500 transition-colors"
                              >
                                <Plus size={15} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {filteredProducts.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-body-lg text-surface-500 font-medium">{content.emptyResultsText}</p>
                <button
                  onClick={() => { clearAllFilters(); setSearch(''); setActiveCategory('all'); }}
                  className="mt-2 text-body-sm text-brand-500 hover:underline"
                >
                  {content.resetFiltersLabel}
                </button>
              </div>
            )}
          </div>
          )}
        </main>

        {/* Right rail — the live cart, so the running order is never off-screen.
            A fixed height rather than a max height: the panel always runs to the
            bottom of the viewport, which keeps the totals and the checkout
            button parked there no matter how few lines the cart holds. Only the
            item list in between scrolls. */}
        <aside className="hidden xl:block w-[340px] flex-shrink-0">
          <div className="sticky top-[calc(var(--announcement-h,0px)+5.5rem)] flex flex-col h-[calc(100vh-var(--announcement-h,0px)-11.5rem)] bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 overflow-hidden">
            <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-200 dark:border-surface-800">
              <p className="flex items-center gap-2 font-display font-bold text-body-lg text-surface-900 dark:text-surface-50">
                <ShoppingCart size={18} className="text-brand-500" />
                {content.cartTitle}
                <span className="text-body-sm font-medium text-surface-400">({orderTotal.items})</span>
              </p>
              {cartItems.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-body-sm text-surface-400 hover:text-red-500 transition-colors"
                >
                  {content.clearAllLabel}
                </button>
              )}
            </div>

            {cartItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <div className="w-14 h-14 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
                  <ShoppingCart size={22} className="text-surface-400" />
                </div>
                <p className="text-body-sm text-surface-500">{content.cartEmptyText}</p>
              </div>
            ) : (
                <ul className="flex-1 min-h-0 overflow-y-auto px-4 divide-y divide-surface-100 dark:divide-surface-800">
                  {cartItems.map((item) => (
                    <li key={item.product.id} className="flex items-center gap-2.5 py-3">
                      <Link
                        to={`/product/${item.product.slug}`}
                        state={backToQuickOrder}
                        className="w-10 h-10 rounded-lg overflow-hidden bg-surface-100 dark:bg-surface-850 flex-shrink-0"
                      >
                        <img src={item.product.images?.[0] || undefined} alt={item.product.name} className="h-full w-full object-contain p-1" loading="lazy" />
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/product/${item.product.slug}`}
                          state={backToQuickOrder}
                          className="block truncate text-body-sm font-semibold text-surface-900 dark:text-surface-100 hover:text-brand-500 transition-colors"
                        >
                          {item.product.name}
                        </Link>
                        <span className="text-caption text-surface-400">
                          {item.quantity} × {formatPrice(item.product.price)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => updateQuantity(item.product, item.quantity - 1)}
                          aria-label={`Decrease ${item.product.name}`}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-surface-500 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                        >
                          {item.quantity === 1 ? <Trash2 size={12} /> : <Minus size={12} />}
                        </button>
                        <QuantityInput
                          value={item.quantity}
                          onCommit={(next) => updateQuantity(item.product, next)}
                          label={`Quantity for ${item.product.name}`}
                          max={QTY_MAX}
                          className={cn('w-9 h-6 flex-shrink-0 text-caption', QTY_FIELD)}
                        />
                        <button
                          onClick={() => updateQuantity(item.product, item.quantity + 1)}
                          aria-label={`Increase ${item.product.name}`}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-surface-500 hover:bg-brand-500/10 hover:text-brand-500 transition-colors"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <span className="w-[62px] text-right text-body-sm font-semibold tabular-nums text-brand-600 dark:text-brand-400 flex-shrink-0">
                        {formatPrice(item.product.price * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
            )}

            {/* Always rendered, never scrolled — the running total and the
                checkout button stay parked at the foot of the panel whether the
                cart holds nothing or fifty lines. */}
            <div className="flex-shrink-0 border-t border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-850 p-4 space-y-3">
              {orderTotal.savings > 0 && (
                <div className="flex items-center justify-between text-body-sm text-emerald-600 dark:text-emerald-400">
                  <span>{content.savingsLabel}</span>
                  <span className="font-semibold tabular-nums">{formatPrice(orderTotal.savings)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-body-md font-bold text-surface-900 dark:text-surface-100">
                  {content.subtotalLabel}
                </span>
                <span className="font-display font-bold text-heading-sm tabular-nums text-brand-600 dark:text-brand-400">
                  {formatPrice(orderTotal.total)}
                </span>
              </div>

              {/* An empty cart is short of the minimum by definition; saying so
                  before anything has been added is noise, not guidance. */}
              {cartItems.length > 0 && !minimum.meetsMinimum && (
                <p className="text-caption text-amber-600 dark:text-amber-400">{minimum.message}</p>
              )}

              {(() => {
                const canCheckout = cartItems.length > 0 && minimum.meetsMinimum;
                return (
                  <Link
                    to="/checkout"
                    aria-disabled={!canCheckout}
                    onClick={(e) => { if (!canCheckout) e.preventDefault(); }}
                    className={cn(
                      'group w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-display font-bold text-body-md transition-all duration-200',
                      canCheckout
                        ? 'bg-brand-500 text-surface-950 hover:bg-brand-400 active:scale-[0.98]'
                        : 'bg-surface-200 dark:bg-surface-800 text-surface-400 cursor-not-allowed pointer-events-none',
                    )}
                  >
                    {content.checkoutLabel}
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </Link>
                );
              })()}
            </div>
          </div>
        </aside>
      </div>

      {/* Below xl the cart has no column of its own, so it stays a bottom bar
          into the existing drawer. */}
      {showBottomBar && (
        <motion.div
          ref={bottomBarRef}
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="xl:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-surface-900 border-t border-surface-200 dark:border-surface-800 shadow-2xl"
        >
          <div className={cn(SHELL, 'flex items-center justify-between py-4 gap-4')}>
            <div>
              <p className="text-body-sm text-surface-500">
                {orderTotal.items} {orderTotal.items !== 1 ? content.itemsWord : content.itemWord} {content.selectedWord}
              </p>
              <p className="font-display font-bold text-heading-md text-brand-600 dark:text-brand-400">
                {formatPrice(orderTotal.total)}
              </p>
            </div>
            <button
              onClick={openCart}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-500 text-surface-950 font-display font-bold text-body-md hover:bg-brand-400 active:scale-[0.98] transition-all duration-200"
            >
              <ShoppingCart size={18} />
              {content.viewCartLabel}
              <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Plays over the list and closes back to the same spot — losing a
          twenty-item basket to watch a ten-second clip is not a trade. */}
      <VideoLightbox
        url={video?.videoUrl ?? null}
        title={video?.name}
        onClose={() => setVideo(null)}
      />
    </div>
  );
}
