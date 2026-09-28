import type { RolePermission } from '@/config/admin-screens.ts';

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  price: number;
  originalPrice?: number;
  /** Per-piece wholesale rate — used for POS billing when Wholesale is selected. */
  wholesalePrice?: number;
  /** Wholesale rate for one full case — the "Rate Per Case" column on the case invoice. */
  wholesalePricePerCase?: number;
  /** Pieces packed in one case. Converts between piece and case billing, and drives stock. */
  quantityPerCase?: number;
  images: string[];
  category: ProductCategory;
  occasion: ProductOccasion[];
  badge?: ProductBadge;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  stockCount?: number;
  features: string[];
  safetyRating: 'family' | 'standard' | 'professional';
  noiseLevel: 'low' | 'medium' | 'high';
  effects: string[];
  duration?: string;
  isNew?: boolean;
  isFeatured?: boolean;
  videoUrl?: string;
  /** Linked component products shown as "What's Inside" for combo-pack products. Display-only — cart/checkout still treat the combo as a single product. */
  comboItems?: ComboItem[];
  /** Combo packs sit outside the browsing category taxonomy — `category` is empty for them. */
  isCombo?: boolean;
  /**
   * The combo offer's sale window, as ISO instants. Either end may be absent —
   * no start means it sells as soon as it is published, no end means it sells
   * until the shop turns it off. See `lib/comboWindow.ts`; unrelated to
   * `duration`, which is burn time.
   */
  offerStartsAt?: string | null;
  offerEndsAt?: string | null;
  /** Manual storefront position, lowest first. 0 means "never placed" and sorts first. */
  displayOrder?: number;
  createdAt?: string;
}

export interface ComboItem {
  product: { id: string; name: string; slug: string; images: string[]; price: number; originalPrice?: number; stockCount?: number } | string;
  quantity: number;
}

/**
 * A category slug. Categories are admin-managed (Admin → Categories), so this is an
 * open string rather than a fixed union — any slug the admin creates is valid.
 */
export type ProductCategory = string;

export type ProductOccasion =
  | 'diwali'
  | 'new-year'
  | 'wedding'
  | 'birthday'
  | 'festival'
  | 'professional';

export type ProductBadge =
  | 'new'
  | 'bestseller'
  | 'limited'
  | 'premium'
  | 'low-noise';

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface CategoryFilter {
  id: ProductCategory;
  label: string;
  icon: string;
  count: number;
}

export interface OccasionFilter {
  id: ProductOccasion;
  label: string;
  image: string;
}

export interface NavLink {
  label: string;
  href: string;
  children?: NavLink[];
  highlight?: boolean;
}

export interface HeroSlide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  image: string;
  gradient: string;
}

export interface Testimonial {
  id: string;
  name: string;
  location: string;
  rating: number;
  text: string;
  avatar: string;
}

// =====================
// AUTH & USER TYPES
// =====================

export type UserRole = 'user' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  phone: string;
  role?: UserRole;
  isActive?: boolean;
  /**
   * True on a passwordless record created by guest checkout, keyed on phone.
   *
   * The confirmation page reads it to decide whether to offer an account: a
   * guest is signed in as this record, so `isAuthenticated` alone cannot tell
   * them apart from a real customer.
   */
  isGuest?: boolean;
  /**
   * The orders a guest-order token can open, from `/auth/me`. A guest holds no
   * account session — only these orders, their tracking and their payment proof.
   */
  guestOrderIds?: string[];
  /**
   * Effective Admin Portal access, resolved server-side from the user's role and
   * returned by login and `/auth/me`. Absent for customers, and absent when
   * talking to a backend that predates RBAC — callers must treat that as "no
   * screens" and fall back to the legacy `role === 'admin'` check.
   */
  permissions?: RolePermission[];
  isSuperAdmin?: boolean;
  /** Staff only: the role's id, plus the profile fields the Employees screen edits. */
  staffRole?: string | { _id?: string; id?: string; name?: string } | null;
  employeeCode?: string;
  designation?: string;
  joinedAt?: string;
  city?: string;
  state?: string;
  /** Address/phone from the customer's most recent order (online accounts have
   *  no profile address — this is derived server-side for admin display). */
  latestShippingAddress?: {
    name?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    pincode?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

/**
 * `awaiting_verification` — the customer paid by direct UPI / bank transfer and
 * submitted proof; an admin still has to check it. Distinct from `pending`,
 * which means nothing has been paid at all.
 */
/**
 * `refund_due`: the shop cancelled an order the customer had already paid for.
 * Nothing is refunded automatically — the shop pays it back by hand and then
 * marks the order `refunded`.
 */
export type PaymentStatus = 'paid' | 'pending' | 'awaiting_verification' | 'failed' | 'refund_due' | 'refunded';

export type PaymentMethod = 'razorpay' | 'cod' | 'upi_manual';

/** Proof the customer submitted for a direct UPI / bank transfer. */
export interface ManualPayment {
  utr: string;
  screenshotUrl: string;
  screenshotHash?: string;
  claimedAmount?: number;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  attempts: number;
}

/** Bank details shown when direct bank transfer is enabled. */
export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
}

/** Everything the payment screen needs to render one manual payment. */
export interface ManualPaymentInstructions {
  orderId: string;
  amount: number;
  /** Short human reference echoed in the UPI note, for reconciliation. */
  reference: string;
  expiresAt: string | null;
  instructions: string;
  upi: {
    /** `upi://pay?...` — opens the customer's UPI app with the amount filled in. */
    link: string;
    /** Data-URI PNG of the same link, for scanning from another device. */
    qr: string;
    id: string;
    payeeName: string;
  } | null;
  /** Bank transfers have no QR standard, so these are shown as copyable text. */
  bank: BankDetails | null;
}

/** Which payment options the storefront may offer (GET /payments/methods). */
export interface AvailablePaymentMethods {
  razorpay: { enabled: boolean };
  cod: { enabled: boolean; limit: number };
  manual: {
    enabled: boolean;
    instructions: string;
    windowMins: number;
    upi: { id: string; payeeName: string } | null;
    bank: BankDetails | null;
  };
}

export interface OrderItem {
  productId: string;
  name: string;
  slug: string;
  image: string;
  price: number;
  quantity: number;
}

export interface OrderStatusHistory {
  status: OrderStatus;
  changedAt: string;
  changedBy: string;
  note?: string;
}

/** A single scanned event from the courier (via trackcourier.io). */
export interface TrackingEvent {
  description: string;
  location?: string;
  timestamp?: string;
}

/** Public tracking payload (GET /orders/:id/track) — no auth required. */
export interface OrderTracking {
  id: string;
  status: OrderStatus;
  trackingId?: string;
  courier?: string;
  courierName?: string;
  trackingEvents?: TrackingEvent[];
  lastTrackedAt?: string;
  statusHistory?: OrderStatusHistory[];
  trackingUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/** Response from a "check status" / tracking-refresh call. */
export interface TrackingResult {
  orderId: string;
  status: OrderStatus;
  courier?: string;
  courierName?: string;
  trackingId?: string;
  trackingUrl?: string;
  scraped: boolean;
  statusChanged: boolean;
  lastTrackedAt?: string;
  events: TrackingEvent[];
}

export interface Order {
  id: string;
  /**
   * `ORD-YYMM-#####` — what the customer and the shop both quote.
   *
   * Optional because orders placed before the series existed have none until
   * the backfill runs. Render it through `orderRef`, which falls back to a
   * slice of the id for those.
   */
  orderNumber?: string;
  userId: string;
  items: OrderItem[];
  subtotal: number;
  /** Influencer/promo code applied to this order, if any. */
  couponCode?: string;
  /** Rupees taken off the subtotal by that code. */
  discount?: number;
  shipping: number;
  gstRate?: number;
  gstAmount?: number;
  total: number;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  shippingAddress: Address;
  /**
   * Where this parcel is collected from, snapshotted when the order was placed.
   *
   * Fireworks cannot be couriered to a door, so every one of these orders ends
   * at a transport office rather than an address. A copy rather than a
   * reference: offices move and close, and an old order must keep saying where
   * its parcel actually went.
   *
   * Absent on orders placed before the feature existed, and on any taken while
   * the shop has the chooser switched off.
   */
  deliveryPoint?: {
    parcelServiceName?: string;
    parcelServiceSlug?: string;
    name?: string;
    address?: string;
    area?: string;
    city?: string;
    district?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    contactPerson?: string;
    landmark?: string;
  };
  paymentMethod: string;
  /**
   * Where this order's receipt and updates go. Sent with the order because a
   * guest has no account email, and a signed-in customer may want it elsewhere.
   */
  customerEmail?: string;
  paymentId?: string;
  razorpayOrderId?: string;
  /** Direct UPI / bank transfer only: the proof the customer submitted. */
  manualPayment?: ManualPayment;
  /** Direct UPI / bank transfer only: when an unpaid order is auto-cancelled. */
  paymentExpiresAt?: string;
  trackingId?: string;
  courier?: string;
  courierName?: string;
  trackingEvents?: TrackingEvent[];
  lastTrackedAt?: string;
  statusHistory?: OrderStatusHistory[];
  createdAt: string;
  updatedAt: string;
}

export interface WishlistItem {
  productId: string;
  addedAt: string;
}

export interface NotificationPreferences {
  emailOrderUpdates: boolean;
  emailPromotions: boolean;
  /** Order updates on WhatsApp, to the number the order was placed with. */
  whatsappOrderUpdates: boolean;
}

// =====================
// RAZORPAY TYPES
// =====================

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id?: string;
  prefill: {
    name: string;
    email: string;
    contact: string;
  };
  theme: {
    color: string;
  };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
    escape?: boolean;
    confirm_close?: boolean;
  };
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

export interface RazorpayInstance {
  open: () => void;
  close: () => void;
  on: (event: string, callback: () => void) => void;
}
