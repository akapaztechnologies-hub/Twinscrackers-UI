import api from '@/lib/api.ts';
import type { Product, ProductCategory, ComboItem } from '@/types/index.ts';

export interface ProductListResponse {
  data: Product[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  icon: string;
  displayOrder: number;
  isActive: boolean;
  productCount: number;
}

/**
 * Map a populated comboItems[].product sub-document (backend _id) to the
 * frontend id shape.
 *
 * A component product that has since been deleted outright populates as `null`.
 * Reading `_id` off that threw, and the whole combo then showed "could not be
 * loaded". The storefront skips such a line, so the pack still opens with the
 * remaining contents. The admin form passes `keepMissing`: the line stays, as an
 * empty-string product, so the form can warn that saving will take it out
 * instead of dropping it without a word.
 */
export function mapComboItems(
  comboItems: unknown,
  options: { keepMissing?: boolean } = {},
): ComboItem[] | undefined {
  if (!Array.isArray(comboItems)) return undefined;
  const mapped: ComboItem[] = [];
  for (const item of comboItems) {
    const raw = (item ?? {}) as Record<string, unknown>;
    const rawProduct = raw.product as Record<string, unknown> | string | null | undefined;
    if (!rawProduct) {
      if (options.keepMissing) mapped.push({ product: '', quantity: raw.quantity as number });
      continue;
    }
    const product = typeof rawProduct === 'string'
      ? rawProduct
      : { ...rawProduct, id: (rawProduct._id || rawProduct.id) as string } as ComboItem['product'];
    mapped.push({ product, quantity: raw.quantity as number });
  }
  return mapped;
}

// Map backend product to frontend Product type
export function mapProduct(p: Record<string, unknown>): Product {
  return {
    ...p,
    id: (p._id || p.id) as string,
    // Backend isNewArrival → Frontend isNew
    isNew: (p.isNewArrival ?? p.isNew ?? false) as boolean,
    // Backend categorySlug → Frontend category (ProductCategory string)
    category: (p.categorySlug || (typeof p.category === 'string' ? p.category : '')) as ProductCategory,
    comboItems: mapComboItems(p.comboItems),
  } as Product;
}

export async function getProducts(
  params?: Record<string, string | number | boolean>,
): Promise<ProductListResponse> {
  const result: Record<string, unknown> = await api.get('/products', { params });
  const data = (result.data || result) as Record<string, unknown>[];
  return {
    data: (Array.isArray(data) ? data : []).map(mapProduct),
    total: (result.total as number) || 0,
    page: (result.page as number) || 1,
    totalPages: (result.totalPages as number) || 1,
    hasMore: (result.hasMore as boolean) || false,
  };
}

/** The server's page cap, and so the most ids one request can ask for. */
const IDS_PER_REQUEST = 100;

/**
 * Current products for a set of ids, in as few requests as possible.
 *
 * Checkout re-reads every cart line's live price before charging; asking one
 * product at a time was a request per line. Ids go up in batches of 100 (the
 * list's page cap). A product the storefront no longer sells — delisted, or a
 * combo past its offer window — is simply absent from the result, which is
 * how the caller tells it has gone.
 *
 * Throws when the server did not apply the `ids` filter (a backend without it
 * ignores the unknown parameter and answers with an ordinary catalogue page).
 * Reading that page as the answer would mark every cart line not on it as
 * gone, so callers must treat a throw as "could not refresh prices" and leave
 * the cart as it is — never as "items unavailable".
 */
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += IDS_PER_REQUEST) {
    batches.push(unique.slice(i, i + IDS_PER_REQUEST));
  }

  const pages = await Promise.all(
    batches.map(async (batch) => {
      const { data } = await getProducts({ ids: batch.join(','), limit: IDS_PER_REQUEST });
      // A product this batch did not ask for means the filter was not applied.
      const asked = new Set(batch);
      if (data.some((product) => !asked.has(product.id))) {
        throw new Error("Product lookup by id isn't available");
      }
      return data;
    }),
  );
  return pages.flat();
}

export async function getFeaturedProducts(): Promise<Product[]> {
  const data: Record<string, unknown>[] = await api.get('/products/featured');
  return (Array.isArray(data) ? data : []).map(mapProduct);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    const data: Record<string, unknown> = await api.get(`/products/${slug}`);
    return data ? mapProduct(data) : null;
  } catch {
    return null;
  }
}

/**
 * A product by slug, telling a finished combo offer apart from a bad link.
 *
 * Both come back empty from {@link getProductBySlug}, but they are different
 * things to say: a combo is reached from WhatsApp forwards that outlive the
 * offer, and "this pack's offer has ended" with a way through to the current
 * packs is worth more than "not found". The server answers 410 for it.
 */
export async function getProductBySlugWithStatus(
  slug: string,
): Promise<{ product: Product | null; offerEnded: boolean }> {
  try {
    const data: Record<string, unknown> = await api.get(`/products/${slug}`);
    return { product: data ? mapProduct(data) : null, offerEnded: false };
  } catch (err) {
    return { product: null, offerEnded: (err as { status?: number })?.status === 410 };
  }
}

export async function getCategories(): Promise<CategoryItem[]> {
  const data: Record<string, unknown>[] = await api.get('/categories');
  return (Array.isArray(data) ? data : []).map((c) => ({
    ...c,
    id: (c._id || c.id || c.slug) as string,
  })) as CategoryItem[];
}
