import api from '@/lib/api.ts';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface AdminReview {
  _id: string;
  product?: { _id: string; name: string; slug: string; images: string[] } | null;
  name: string;
  phone?: string;
  email?: string;
  rating: number;
  title?: string;
  body: string;
  verifiedPurchase: boolean;
  status: ReviewStatus;
  moderationNote?: string;
  reply?: string;
  createdAt: string;
}

export interface AdminReviewPage {
  data: AdminReview[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

export async function getReviews(options: {
  status?: ReviewStatus | 'all';
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AdminReviewPage> {
  const params: Record<string, string | number> = {};
  if (options.status) params.status = options.status;
  if (options.search?.trim()) params.search = options.search.trim();
  if (options.page) params.page = options.page;
  if (options.limit) params.limit = options.limit;

  const result: Record<string, unknown> = await api.get('/admin/reviews', { params });
  return {
    data: (result.data as AdminReview[]) ?? [],
    total: (result.total as number) ?? 0,
    page: (result.page as number) ?? 1,
    totalPages: (result.totalPages as number) ?? 1,
  };
}

export async function getReviewStats(): Promise<ReviewStats> {
  return (await api.get('/admin/reviews/stats')) as unknown as ReviewStats;
}

/** Approve, reject, and optionally answer — one call, because the shop does both at once. */
export async function moderateReview(
  id: string,
  input: { status: ReviewStatus; moderationNote?: string; reply?: string },
): Promise<void> {
  await api.patch(`/admin/reviews/${id}`, input);
}

export async function deleteReview(id: string): Promise<void> {
  await api.delete(`/admin/reviews/${id}`);
}
