import api from '@/lib/api.ts';

export interface ProductReview {
  _id: string;
  name: string;
  rating: number;
  title?: string;
  body: string;
  verifiedPurchase: boolean;
  reply?: string;
  repliedAt?: string;
  createdAt: string;
}

export interface ReviewPage {
  data: ProductReview[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
  average: number;
  /** How many gave each star, 1–5, for the bar chart above the list. */
  breakdown: Record<number, number>;
}

export interface SubmitReviewInput {
  rating: number;
  body: string;
  title?: string;
  name?: string;
  phone?: string;
  email?: string;
}

const EMPTY: ReviewPage = {
  data: [],
  total: 0,
  page: 1,
  totalPages: 1,
  hasMore: false,
  average: 0,
  breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/**
 * Approved reviews for one product.
 *
 * Failure returns the empty page rather than throwing: reviews sit below the
 * fold of a product page, and a request that fails should cost the shop a
 * section, not the whole page the customer came to buy from.
 */
export async function getProductReviews(slug: string, page = 1): Promise<ReviewPage> {
  try {
    const result: Record<string, unknown> = await api.get(`/products/${slug}/reviews`, {
      params: { page },
    });
    return { ...EMPTY, ...(result as unknown as ReviewPage) };
  } catch {
    return EMPTY;
  }
}

/** What this visitor said last time, so the form opens on it. */
export async function getMyReview(
  slug: string,
  phone?: string,
): Promise<(ProductReview & { status: string }) | null> {
  try {
    const result = await api.get(`/products/${slug}/reviews/mine`, {
      params: phone ? { phone } : undefined,
    });
    return (result as unknown as (ProductReview & { status: string }) | null) ?? null;
  } catch {
    return null;
  }
}

export async function submitReview(slug: string, input: SubmitReviewInput): Promise<void> {
  await api.post(`/products/${slug}/reviews`, {
    ...input,
    // Honeypot — the form renders it off-screen and no real visitor fills it.
    fx_ref: '',
  });
}
