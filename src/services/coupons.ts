/**
 * Coupon + influencer service.
 *
 * Storefront and POS only ever send a CODE — never a discount amount. The
 * server decides what a code is worth on both the quote and the charge, so
 * whatever comes back here is display only.
 */
import api from '@/lib/api.ts';
import type {
  AppliedCoupon,
  Coupon,
  CouponInput,
  CouponOverview,
  CouponRedemption,
  CouponStats,
  Influencer,
  InfluencerDetail,
  InfluencerInput,
} from '@/types/coupon.ts';

/**
 * A raw document straight off the API, before a mapper normalises it. Every
 * read below goes through a `Number(...)`/`?? ''` guard, so `any` here is the
 * honest type for "whatever the server sent" rather than a shortcut.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function mapInfluencerRef(i: Raw | string | null | undefined) {
  if (!i || typeof i === 'string') return null;
  return {
    id: (i._id || i.id) as string,
    name: (i.name as string) || '',
    instagram: (i.instagram as string) || '',
    platform: i.platform,
    commissionPercent: Number(i.commissionPercent) || 0,
    phone: (i.phone as string) || '',
  };
}

function mapCoupon(c: Raw): Coupon {
  return {
    id: (c._id || c.id) as string,
    code: (c.code as string) || '',
    description: (c.description as string) || '',
    influencer: mapInfluencerRef(c.influencer),
    discountType: c.discountType === 'flat' ? 'flat' : 'percent',
    discountValue: Number(c.discountValue) || 0,
    maxDiscount: Number(c.maxDiscount) || 0,
    minOrderValue: Number(c.minOrderValue) || 0,
    usageLimit: Number(c.usageLimit) || 0,
    perUserLimit: Number(c.perUserLimit) || 0,
    validFrom: (c.validFrom as string) || null,
    validTo: (c.validTo as string) || null,
    isActive: c.isActive !== false,
    channels: {
      online: c.channels?.online !== false,
      pos: c.channels?.pos !== false,
    },
    usedCount: Number(c.usedCount) || 0,
    totalDiscountGiven: Number(c.totalDiscountGiven) || 0,
    totalSales: Number(c.totalSales) || 0,
    createdAt: (c.createdAt as string) || '',
  };
}

function mapRedemption(r: Raw): CouponRedemption {
  const order = r.order && typeof r.order === 'object' ? r.order : null;
  const bill = r.bill && typeof r.bill === 'object' ? r.bill : null;
  return {
    id: (r._id || r.id) as string,
    code: (r.code as string) || '',
    source: r.source === 'pos' ? 'pos' : 'online',
    // A signed-in order carries the account name; a counter sale only has what
    // the cashier typed.
    customerName: (r.user?.displayName as string) || (r.customerName as string) || 'Guest',
    customerPhone: (r.user?.phone as string) || (r.customerPhone as string) || '',
    orderSubtotal: Number(r.orderSubtotal) || 0,
    discountAmount: Number(r.discountAmount) || 0,
    netSales: Number(r.netSales) || 0,
    commissionAmount: Number(r.commissionAmount) || 0,
    status: r.status === 'reverted' ? 'reverted' : 'active',
    reference: bill?.billNumber || (order?._id ? `#${String(order._id).slice(0, 8).toUpperCase()}` : '—'),
    createdAt: (r.createdAt as string) || '',
  };
}

function mapInfluencer(i: Raw): Influencer {
  const commissionEarned = Number(i.commissionEarned) || 0;
  return {
    id: (i._id || i.id) as string,
    name: (i.name as string) || '',
    phone: (i.phone as string) || '',
    email: (i.email as string) || '',
    instagram: (i.instagram as string) || '',
    platform: i.platform || 'instagram',
    followers: Number(i.followers) || 0,
    commissionPercent: Number(i.commissionPercent) || 0,
    totalPaidOut: Number(i.totalPaidOut) || 0,
    notes: (i.notes as string) || '',
    isActive: i.isActive !== false,
    createdAt: (i.createdAt as string) || '',
    coupons: (i.coupons ?? []).map((c: Raw) => ({
      id: (c._id || c.id) as string,
      code: (c.code as string) || '',
      isActive: c.isActive !== false,
      usedCount: Number(c.usedCount) || 0,
      usageLimit: Number(c.usageLimit) || 0,
    })),
    uses: Number(i.uses) || 0,
    netSales: Number(i.netSales) || 0,
    discountGiven: Number(i.discountGiven) || 0,
    commissionEarned,
    commissionDue: Number(i.commissionDue) || 0,
  };
}

// =====================
// STOREFRONT / POS
// =====================

/**
 * Check a code against the live cart. Rejections come back as an API error with
 * a message written for the customer ("This coupon has reached its usage
 * limit"), so callers should surface `err.message` rather than a generic one.
 */
export async function validateCoupon(
  code: string,
  items: { productId: string; quantity: number }[],
): Promise<AppliedCoupon> {
  return api.post('/coupons/validate', { code, items });
}

/** Counter sale: check a code against a subtotal already on the cashier's screen. */
/**
 * `billId` is the saved bill being corrected, if any. Its own coupon is then
 * re-worked for the new cart without counting the bill's own use against the
 * coupon's limits, so editing a bill can't lose a discount it already had.
 */
export async function validateCounterCoupon(
  code: string,
  subtotal: number,
  customerPhone?: string,
  billId?: string,
): Promise<AppliedCoupon> {
  return api.post('/admin/coupons/validate-counter', { code, subtotal, customerPhone, billId });
}

// =====================
// ADMIN — COUPONS
// =====================

export async function getCoupons(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  influencer?: string;
  sort?: string;
} = {}): Promise<{ data: Coupon[]; total: number; page: number; totalPages: number }> {
  const res: Raw = await api.get('/admin/coupons', { params });
  return {
    data: (res?.data ?? []).map(mapCoupon),
    total: Number(res?.total) || 0,
    page: Number(res?.page) || 1,
    totalPages: Number(res?.totalPages) || 1,
  };
}

export async function getCouponOverview(range: { from?: string; to?: string } = {}): Promise<CouponOverview> {
  return api.get('/admin/coupons/overview', { params: range });
}

export async function getCouponById(id: string): Promise<Coupon> {
  const c: Raw = await api.get(`/admin/coupons/${id}`);
  return mapCoupon(c);
}

export async function getCouponStats(
  id: string,
  params: { page?: number; limit?: number } = {},
): Promise<CouponStats> {
  const res: Raw = await api.get(`/admin/coupons/${id}/stats`, { params });
  return {
    coupon: mapCoupon(res.coupon),
    summary: res.summary,
    timeline: res.timeline ?? [],
    redemptions: {
      data: (res.redemptions?.data ?? []).map(mapRedemption),
      total: Number(res.redemptions?.total) || 0,
      page: Number(res.redemptions?.page) || 1,
      totalPages: Number(res.redemptions?.totalPages) || 1,
    },
  };
}

export async function createCoupon(input: CouponInput): Promise<Coupon> {
  return mapCoupon(await api.post('/admin/coupons', input));
}

export async function updateCoupon(id: string, input: Partial<CouponInput>): Promise<Coupon> {
  return mapCoupon(await api.put(`/admin/coupons/${id}`, input));
}

export async function deleteCoupon(id: string): Promise<void> {
  await api.delete(`/admin/coupons/${id}`);
}

// =====================
// ADMIN — INFLUENCERS
// =====================

export async function getInfluencers(params: { search?: string; status?: string } = {}): Promise<Influencer[]> {
  const res: Raw[] = await api.get('/admin/influencers', { params });
  return (Array.isArray(res) ? res : []).map(mapInfluencer);
}

export async function getInfluencerById(
  id: string,
  params: { page?: number; limit?: number } = {},
): Promise<InfluencerDetail> {
  const res: Raw = await api.get(`/admin/influencers/${id}`, { params });
  return {
    influencer: mapInfluencer(res.influencer),
    coupons: (res.coupons ?? []).map(mapCoupon),
    summary: res.summary,
    timeline: res.timeline ?? [],
    redemptions: {
      data: (res.redemptions?.data ?? []).map(mapRedemption),
      total: Number(res.redemptions?.total) || 0,
      page: Number(res.redemptions?.page) || 1,
      totalPages: Number(res.redemptions?.totalPages) || 1,
    },
  };
}

export async function createInfluencer(input: InfluencerInput): Promise<Influencer> {
  return mapInfluencer(await api.post('/admin/influencers', input));
}

export async function updateInfluencer(id: string, input: Partial<InfluencerInput>): Promise<Influencer> {
  return mapInfluencer(await api.put(`/admin/influencers/${id}`, input));
}

/** Record money handed over. A negative amount corrects an earlier mistake. */
export async function recordPayout(id: string, amount: number): Promise<Influencer> {
  return mapInfluencer(await api.post(`/admin/influencers/${id}/payout`, { amount }));
}

export async function deleteInfluencer(id: string): Promise<void> {
  await api.delete(`/admin/influencers/${id}`);
}
