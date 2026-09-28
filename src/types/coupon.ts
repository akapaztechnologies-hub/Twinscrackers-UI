export type CouponDiscountType = 'percent' | 'flat';

export type InfluencerPlatform = 'instagram' | 'youtube' | 'facebook' | 'whatsapp' | 'other';

export const INFLUENCER_PLATFORMS: { value: InfluencerPlatform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'other', label: 'Other' },
];

export interface InfluencerRef {
  id: string;
  name: string;
  instagram?: string;
  platform?: InfluencerPlatform;
  commissionPercent?: number;
  phone?: string;
}

export interface Coupon {
  id: string;
  code: string;
  description: string;
  influencer: InfluencerRef | null;
  discountType: CouponDiscountType;
  discountValue: number;
  /** Percent coupons only: rupee ceiling. 0 = uncapped. */
  maxDiscount: number;
  minOrderValue: number;
  /** Total redemptions allowed — the "first N customers" cap. 0 = unlimited. */
  usageLimit: number;
  perUserLimit: number;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  channels: { online: boolean; pos: boolean };
  usedCount: number;
  totalDiscountGiven: number;
  totalSales: number;
  createdAt: string;
}

export interface CouponInput {
  code: string;
  description?: string;
  influencer?: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscount?: number;
  minOrderValue?: number;
  usageLimit?: number;
  perUserLimit?: number;
  validFrom?: string | null;
  validTo?: string | null;
  isActive?: boolean;
  channels?: { online: boolean; pos: boolean };
}

export interface CouponRedemption {
  id: string;
  code: string;
  source: 'online' | 'pos';
  customerName: string;
  customerPhone: string;
  orderSubtotal: number;
  discountAmount: number;
  netSales: number;
  commissionAmount: number;
  status: 'active' | 'reverted';
  reference: string;
  createdAt: string;
}

export interface CouponSummary {
  uses: number;
  /** Slots left on a capped coupon; null when unlimited. */
  remaining: number | null;
  usageLimit: number;
  uniqueCustomers: number;
  grossSales: number;
  discountGiven: number;
  netSales: number;
  commission: number;
  avgOrderValue: number;
  onlineUses: number;
  posUses: number;
}

export interface TimelinePoint {
  date: string;
  uses: number;
  netSales: number;
  discountGiven?: number;
}

export interface CouponStats {
  coupon: Coupon;
  summary: CouponSummary;
  timeline: TimelinePoint[];
  redemptions: { data: CouponRedemption[]; total: number; page: number; totalPages: number };
}

export interface Influencer {
  id: string;
  name: string;
  phone: string;
  email: string;
  instagram: string;
  platform: InfluencerPlatform;
  followers: number;
  commissionPercent: number;
  totalPaidOut: number;
  notes: string;
  isActive: boolean;
  createdAt: string;
  /** Present on the list endpoint. */
  coupons: { id: string; code: string; isActive: boolean; usedCount: number; usageLimit: number }[];
  uses: number;
  netSales: number;
  discountGiven: number;
  commissionEarned: number;
  commissionDue: number;
}

export interface InfluencerInput {
  name: string;
  phone?: string;
  email?: string;
  instagram?: string;
  platform?: InfluencerPlatform;
  followers?: number;
  commissionPercent?: number;
  notes?: string;
  isActive?: boolean;
}

export interface InfluencerDetail {
  influencer: Influencer;
  coupons: Coupon[];
  summary: {
    uses: number;
    grossSales: number;
    netSales: number;
    discountGiven: number;
    commissionEarned: number;
    totalPaidOut: number;
    commissionDue: number;
    avgOrderValue: number;
  };
  timeline: TimelinePoint[];
  redemptions: { data: CouponRedemption[]; total: number; page: number; totalPages: number };
}

export interface CouponOverview {
  summary: {
    uses: number;
    netSales: number;
    discountGiven: number;
    commission: number;
    activeCoupons: number;
    totalCoupons: number;
  };
  topCoupons: {
    _id: string;
    code: string;
    influencerName?: string;
    uses: number;
    netSales: number;
    discountGiven: number;
    commission: number;
  }[];
}

/** What the storefront/POS gets back when a code is checked. */
export interface AppliedCoupon {
  code: string;
  discount: number;
  description: string;
  discountType?: CouponDiscountType;
  discountValue?: number;
}

/**
 * A coupon's live state, derived rather than stored — a coupon is never edited
 * just because a date passed or its last slot was taken.
 */
export type CouponState = 'active' | 'inactive' | 'scheduled' | 'expired' | 'exhausted';

export function couponState(c: Coupon): CouponState {
  if (!c.isActive) return 'inactive';
  const now = Date.now();
  if (c.validFrom && new Date(c.validFrom).getTime() > now) return 'scheduled';
  if (c.validTo && new Date(c.validTo).getTime() < now) return 'expired';
  if (c.usageLimit > 0 && c.usedCount >= c.usageLimit) return 'exhausted';
  return 'active';
}

export const COUPON_STATE_LABELS: Record<CouponState, string> = {
  active: 'Active',
  inactive: 'Paused',
  scheduled: 'Scheduled',
  expired: 'Expired',
  exhausted: 'Limit reached',
};
