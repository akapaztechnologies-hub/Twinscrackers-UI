import api from '@/lib/api.ts';
import type { GuestSession } from '@/lib/guestOrder.ts';
import type {
  UserProfile,
  UserRole,
  Address,
  Order,
  WishlistItem,
  NotificationPreferences,
  TrackingResult,
  OrderTracking,
} from '@/types/index.ts';

// =====================
// ID MAPPING HELPERS
// =====================

function mapAddress(a: Record<string, unknown>): Address {
  return { ...a, id: (a._id || a.id) as string } as Address;
}

export function mapOrder(o: Record<string, unknown>): Order {
  const items = (o.items as Record<string, unknown>[]) || [];
  return {
    ...o,
    id: (o._id || o.id) as string,
    userId: (o.user || o.userId) as string,
    items: items.map((item) => ({
      ...item,
      productId: (item.product || item.productId) as string,
    })),
  } as Order;
}

// =====================
// USER PROFILE
// =====================

export async function getUserProfile(_uid: string): Promise<UserProfile | null> {
  return api.get('/auth/me');
}

export async function createUserProfile(_profile: UserProfile): Promise<void> {
  // No-op — registration is handled by POST /api/auth/register
}

export async function getUserRole(_uid: string): Promise<UserRole> {
  const user: UserProfile = await api.get('/auth/me');
  return user.role ?? 'user';
}

export async function updateUserProfile(
  _uid: string,
  data: Partial<Pick<UserProfile, 'displayName' | 'phone' | 'photoURL'>>,
): Promise<void> {
  await api.put('/auth/profile', data);
}

// =====================
// ADDRESSES
// =====================

export async function getAddresses(_uid: string): Promise<Address[]> {
  const data: Record<string, unknown>[] = await api.get('/addresses');
  return (data || []).map(mapAddress);
}

export async function addAddress(_uid: string, address: Omit<Address, 'id'>): Promise<string> {
  const result: Record<string, unknown> = await api.post('/addresses', address);
  return (result._id || result.id) as string;
}

export async function updateAddress(
  _uid: string,
  addressId: string,
  data: Partial<Address>,
): Promise<void> {
  await api.put(`/addresses/${addressId}`, data);
}

export async function deleteAddress(_uid: string, addressId: string): Promise<void> {
  await api.delete(`/addresses/${addressId}`);
}

// =====================
// ORDERS
// =====================

export async function getOrders(_uid: string): Promise<Order[]> {
  const result: Record<string, unknown> = await api.get('/orders');
  const data = (result.data || result) as Record<string, unknown>[];
  return (Array.isArray(data) ? data : []).map(mapOrder);
}

/**
 * Paginated variant of the user's own orders (data + total + hasMore).
 * `statuses` filters server-side so pagination + hasMore stay accurate per tab.
 */
export async function getOrdersPaged(
  _uid: string,
  page = 1,
  limit = 10,
  statuses?: string[],
): Promise<{ data: Order[]; total: number; hasMore: boolean }> {
  const params: Record<string, unknown> = { page, limit };
  if (statuses && statuses.length) params.status = statuses.join(',');
  const result: Record<string, unknown> = await api.get('/orders', { params });
  const raw = (result.data || result) as Record<string, unknown>[];
  const data = (Array.isArray(raw) ? raw : []).map(mapOrder);
  return {
    data,
    total: (result.total as number) ?? data.length,
    hasMore: (result.hasMore as boolean) ?? false,
  };
}

export async function getOrderById(
  _uid: string,
  orderId: string,
): Promise<Order | null> {
  const result: Record<string, unknown> = await api.get(`/orders/${orderId}`);
  return result ? mapOrder(result) : null;
}

/**
 * Place an order.
 *
 * Returns a guest-order token alongside the id when this was a GUEST order:
 * the server attached the order to a passwordless customer keyed on the phone
 * number and issued a token that opens only that browser's guest orders — the
 * confirmation page, tracking and payment proof — and nothing else. Absent when
 * the customer was already signed in.
 */
export async function createOrder(
  _uid: string,
  orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>,
  _customerName?: string,
  _customerEmail?: string,
): Promise<{ id: string; guestSession?: GuestSession }> {
  const result: Record<string, unknown> = await api.post('/orders', orderData);
  return {
    id: (result._id || result.id) as string,
    guestSession: result.guestSession as GuestSession | undefined,
  };
}

/** Customer "Check delivery status": scrape the courier and update this order. */
export async function refreshOrderTracking(_uid: string, orderId: string): Promise<TrackingResult> {
  return api.post(`/orders/${orderId}/track/refresh`, {});
}

/**
 * Public order tracking (no login) — used by the /track-order page.
 *
 * Customers copy the order number as it is printed, "#AK-1234" included, and a
 * raw "#" in a URL path starts the fragment — the request went out without the
 * order number at all. The "#" is dropped and the rest encoded.
 */
export async function trackOrderPublic(orderId: string): Promise<OrderTracking> {
  const ref = orderId.trim().replace(/^#+/, '').trim();
  const result: Record<string, unknown> = await api.get(`/orders/${encodeURIComponent(ref)}/track`);
  return { ...result, id: (result._id || result.id || ref) as string } as OrderTracking;
}

// =====================
// WISHLIST
// =====================

export async function getWishlist(_uid: string): Promise<WishlistItem[]> {
  const result: Record<string, unknown> = await api.get('/wishlist');
  const products = (result.products || result) as Record<string, unknown>[];
  return (Array.isArray(products) ? products : []).map((p) => ({
    productId: (p._id || p.id) as string,
    addedAt: (p.addedAt as string) || new Date().toISOString(),
  }));
}

export async function addToWishlist(_uid: string, productId: string): Promise<void> {
  await api.post(`/wishlist/${productId}`);
}

export async function removeFromWishlist(_uid: string, productId: string): Promise<void> {
  await api.delete(`/wishlist/${productId}`);
}

// =====================
// NOTIFICATION PREFERENCES
// =====================

/** Mirrors the server's own defaults — what somebody who has never opened the
 *  preferences screen is treated as having chosen. */
const defaultPrefs: NotificationPreferences = {
  emailOrderUpdates: true,
  emailPromotions: false,
  whatsappOrderUpdates: true,
};

export async function getNotificationPrefs(
  _uid: string,
): Promise<NotificationPreferences> {
  try {
    const result: NotificationPreferences = await api.get('/notifications/preferences');
    return result || defaultPrefs;
  } catch {
    return defaultPrefs;
  }
}

export async function updateNotificationPrefs(
  _uid: string,
  prefs: Partial<NotificationPreferences>,
): Promise<void> {
  await api.put('/notifications/preferences', prefs);
}
