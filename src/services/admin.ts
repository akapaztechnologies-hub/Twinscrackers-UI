/**
 * Admin service layer — backed by real backend API calls.
 * All reads/writes go through the API client at @/lib/api.ts.
 */
import api from '@/lib/api.ts';
import type { Order, OrderStatus, UserProfile, UserRole, TrackingResult } from '@/types/index.ts';
import { mapComboItems } from '@/services/products.ts';
import type {
  AdminProduct,
  AdminOrder,
  Category,
  SiteSettings,
  HeroSettings,
  PaginatedResult,
  Bill,
  BillItem,
  BillPayment,
  Customer,
  CustomerInput,
  CustomerStats,
  CreditLedger,
  BillingMode,
} from '@/types/admin.ts';
import type { LogoAssets } from '@/lib/logoAssets.ts';

// =====================
// IMAGE UPLOADS
// =====================

export type UploadFolder = 'products' | 'categories' | 'content' | 'general';

/**
 * Upload a single image file to the backend (Cloudflare R2, resized + re-encoded
 * to WebP server-side) and return its hosted URL. Used by every admin image
 * field — category photo, hero/about/newsletter images, testimonial avatars,
 * logo — anywhere the admin picks a file instead of pasting a URL.
 */
export async function uploadAdminImage(file: File, folder: UploadFolder = 'general'): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const result: Record<string, unknown> = await api.post('/admin/uploads', form, {
    params: { folder },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return result.url as string;
}

/**
 * Upload the site logo.
 *
 * Separate from `uploadAdminImage` because the logo is not an ordinary content
 * image: the backend keys its background out, trims it, and renders the whole
 * icon set the site consumes — favicon, apple-touch, PWA icons, header mark,
 * loading screen and share card. The returned set is stored alongside the logo
 * so each placement can pick the variant that fits it.
 *
 * `removeBackground` is the admin's escape hatch — auto-keying is reliable for
 * a mark on a flat backdrop and hopeless against a photographic one.
 */
export async function uploadSiteLogo(
  file: File,
  removeBackground = true,
): Promise<LogoAssets> {
  const form = new FormData();
  form.append('image', file);
  return api.post('/admin/uploads/logo', form, {
    params: { removeBackground: String(removeBackground) },
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as Promise<LogoAssets>;
}

// =====================
// ID MAPPING HELPERS
// =====================

/**
 * Map backend _id to frontend id for a single record.
 * Leaves records untouched if _id is not present.
 */
function mapId<T extends Record<string, unknown>>(record: T): T {
  if (!record) return record;
  const mapped: Record<string, unknown> = { ...record };
  if (mapped._id) {
    mapped.id = mapped._id;
    delete mapped._id;
  }
  return mapped as T;
}

/**
 * Map backend _id → id for an array of records.
 */
function mapIds<T extends Record<string, unknown>>(records: T[]): T[] {
  if (!Array.isArray(records)) return [];
  return records.map(mapId);
}

/**
 * Map a backend product to an AdminProduct, handling _id → id
 * and categorySlug → category.
 */
function mapAdminProduct(p: Record<string, unknown>): AdminProduct {
  return {
    ...p,
    id: (p._id || p.id) as string,
    isNew: (p.isNewArrival ?? p.isNew ?? false) as boolean,
    category: (p.categorySlug || (typeof p.category === 'string' ? p.category : '')) as AdminProduct['category'],
    // Deleted components stay in as '' so the combo form can say they are gone.
    comboItems: mapComboItems(p.comboItems, { keepMissing: true }),
  } as unknown as AdminProduct;
}

/**
 * Map a backend order to an AdminOrder, handling _id → id.
 */
/**
 * Same `product` → `productId` bridge as {@link mapBill} — Order items have the
 * identical Mongoose-field-vs-frontend-type mismatch (backend stores `product`,
 * frontend `OrderItem` type expects `productId`).
 */
function mapOrderItems(items: unknown): Record<string, unknown>[] {
  const raw = (items as Record<string, unknown>[] | undefined) || [];
  return raw.map((it) => ({ ...it, productId: (it.productId ?? it.product ?? '') as string }));
}

function mapAdminOrder(o: Record<string, unknown>): AdminOrder {
  return {
    ...o,
    id: (o._id || o.id) as string,
    items: mapOrderItems(o.items),
  } as unknown as AdminOrder;
}

/**
 * Map a backend category to a Category, handling _id → id.
 */
function mapCategory(c: Record<string, unknown>): Category {
  return {
    ...c,
    id: (c._id || c.id) as string,
  } as unknown as Category;
}

/**
 * Map a backend bill to a Bill, handling _id → id. Also bridges each line
 * item's Mongoose field name `product` to the `productId` the frontend types
 * (and reorder/product-history features) expect — without this, every item
 * read back from the API has `productId: undefined`, even though the DB value
 * is fine, which silently breaks Reorder and Product History.
 */
function mapBill(b: Record<string, unknown>): Bill {
  const rawItems = (b.items as Record<string, unknown>[] | undefined) || [];
  const items = rawItems.map((it) => ({
    ...it,
    productId: (it.productId ?? it.product ?? '') as string,
  }));
  return {
    ...b,
    id: (b._id || b.id) as string,
    items,
  } as unknown as Bill;
}

// =====================
// PRODUCTS
// =====================

export interface ProductListParams {
  category?: string;
  search?: string;
  /** Friendly sort key resolved server-side (newest, price-asc, name, stock, …). */
  sort?: string;
  /** 'all' (default) shows active+inactive on the admin endpoint. */
  status?: 'all' | 'active' | 'inactive';
  /** Stock bucket filter. */
  stock?: 'all' | 'in' | 'low' | 'out';
  /** Combo packs only (true) or non-combo products only (false); omit for "all". */
  isCombo?: boolean;
  /**
   * Where a combo sits in its offer window. Omit for "all" — the Combos screen
   * has to keep showing ended combos, since extending one starts from that row.
   */
  offer?: 'all' | 'live' | 'scheduled' | 'ended';
  page?: number;
  limit?: number;
}

/**
 * Admin product list — hits the admin-only /admin/products endpoint (can return
 * inactive products) and pushes search / filters / sort / paging to the server.
 * Nothing is filtered or paginated in the browser.
 */
export async function getAllProducts(options?: ProductListParams): Promise<PaginatedResult<AdminProduct>> {
  const params: Record<string, string | number | boolean> = {};
  if (options?.category && options.category !== 'all') params.category = options.category;
  if (options?.search?.trim()) params.search = options.search.trim();
  if (options?.sort) params.sort = options.sort;
  if (options?.stock && options.stock !== 'all') params.stock = options.stock;
  if (options?.isCombo !== undefined) params.isCombo = options.isCombo;
  if (options?.offer && options.offer !== 'all') params.offer = options.offer;
  if (options?.status === 'active') params.isActive = 'true';
  else if (options?.status === 'inactive') params.isActive = 'false';
  if (options?.page) params.page = options.page;
  if (options?.limit) params.limit = options.limit;

  const result: Record<string, unknown> = await api.get('/admin/products', { params });
  const rawData = (result.data || result) as Record<string, unknown>[];
  const data = (Array.isArray(rawData) ? rawData : []).map(mapAdminProduct);

  return {
    data,
    total: (result.total as number) ?? data.length,
    hasMore: (result.hasMore as boolean) ?? false,
    page: result.page as number | undefined,
    totalPages: result.totalPages as number | undefined,
  };
}

/** Store-wide product KPI counts for the admin Products page (server-side). */
/**
 * KPI counts. Pass `isCombo` to scope them the same way the list beneath is
 * scoped — combos share the products collection, so an unscoped total counts
 * both and the cards stop matching the rows.
 */
export async function getProductStats(options?: { isCombo?: boolean }): Promise<{
  total: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
}> {
  const params = options?.isCombo !== undefined ? { isCombo: options.isCombo } : undefined;
  const d = (await api.get('/admin/products/summary', { params })) as Record<string, unknown>;
  return {
    total: (d.total as number) ?? 0,
    inStock: (d.inStock as number) ?? 0,
    lowStock: (d.lowStock as number) ?? 0,
    outOfStock: (d.outOfStock as number) ?? 0,
  };
}

/**
 * A product for the admin edit forms.
 *
 * Reads the admin endpoint, never the storefront one: the storefront copy hides
 * stock from customers and refuses an ended combo, and a form loaded from it
 * would save that hidden stock back as zero.
 */
export async function getProductById(productId: string): Promise<AdminProduct | null> {
  try {
    const data: Record<string, unknown> = await api.get(`/admin/products/${productId}`);
    return data ? mapAdminProduct(data) : null;
  } catch {
    return null;
  }
}

/**
 * Map frontend product fields to backend field names before sending to API.
 * Frontend uses: category (slug string), isNew
 * Backend expects: categorySlug, isNewArrival
 */
function toBackendProduct(data: Record<string, unknown>): Record<string, unknown> {
  const mapped = { ...data };
  if ('category' in mapped) {
    mapped.categorySlug = mapped.category;
    delete mapped.category;
  }
  if ('isNew' in mapped) {
    mapped.isNewArrival = mapped.isNew;
    delete mapped.isNew;
  }
  return mapped;
}

export async function createProduct(
  product: Omit<AdminProduct, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>,
  _adminUid: string,
): Promise<string> {
  const result: Record<string, unknown> = await api.post('/products', toBackendProduct(product as unknown as Record<string, unknown>));
  return (result._id || result.id) as string;
}

export async function updateProduct(
  productId: string,
  data: Partial<AdminProduct>,
): Promise<void> {
  await api.put(`/products/${productId}`, toBackendProduct(data as unknown as Record<string, unknown>));
}

export async function deleteProduct(productId: string): Promise<void> {
  await api.delete(`/products/${productId}`);
}

/**
 * Save a drag-and-drop reorder of the storefront.
 *
 * `ids` are the rows currently on screen, in their new top-to-bottom order.
 * The server only permutes the positions those rows already hold, so this is
 * safe to call with a filtered or searched list — the rest of the catalogue
 * stays where it is.
 */
export async function reorderProducts(ids: string[], isCombo?: boolean): Promise<void> {
  await api.put('/admin/products/reorder', { ids, isCombo });
}

// =====================
// ORDERS
// =====================

export interface OrderListParams {
  status?: OrderStatus;
  paymentStatus?: string;
  search?: string;
  /** ISO date strings — the page derives these from its date-range preset. */
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

/** Admin order list — search / status / payment / date-range / sort / paging all server-side. */
export async function getAllOrders(options?: OrderListParams): Promise<PaginatedResult<AdminOrder>> {
  const params: Record<string, string | number | boolean> = {};
  if (options?.status) params.status = options.status;
  if (options?.paymentStatus) params.paymentStatus = options.paymentStatus;
  if (options?.search?.trim()) params.search = options.search.trim();
  if (options?.dateFrom) params.dateFrom = options.dateFrom;
  if (options?.dateTo) params.dateTo = options.dateTo;
  if (options?.sort) params.sort = options.sort;
  if (options?.page) params.page = options.page;
  if (options?.limit) params.limit = options.limit;

  const result: Record<string, unknown> = await api.get('/admin/orders', { params });
  const rawData = (result.data || result) as Record<string, unknown>[];
  const data = (Array.isArray(rawData) ? rawData : []).map(mapAdminOrder);

  return {
    data,
    total: (result.total as number) ?? data.length,
    hasMore: (result.hasMore as boolean) ?? false,
    page: result.page as number | undefined,
    totalPages: result.totalPages as number | undefined,
  };
}

export async function getAdminOrderById(orderId: string): Promise<AdminOrder | null> {
  try {
    const data: Record<string, unknown> = await api.get(`/admin/orders/${orderId}`);
    return data ? mapAdminOrder(data) : null;
  } catch {
    return null;
  }
}

export async function updateOrderStatus(
  orderId: string,
  _userId: string,
  newStatus: OrderStatus,
  note?: string,
): Promise<void> {
  await api.patch(`/admin/orders/${orderId}/status`, { status: newStatus, note });
}

export async function updateOrderTracking(
  orderId: string,
  _userId: string,
  trackingId: string,
  courier?: string,
  courierName?: string,
): Promise<void> {
  await api.patch(`/admin/orders/${orderId}/tracking`, { trackingId, courier, courierName });
}

/** Admin "Check status": scrape the courier and update the order's delivery status. */
export async function refreshOrderTracking(orderId: string): Promise<TrackingResult> {
  return api.post(`/admin/orders/${orderId}/track/refresh`, {});
}

/**
 * Add a tracking update by hand.
 *
 * For the couriers that publish nothing online — KPN, Surya, Vaigai, ABT,
 * Mettur — this is the only way the customer ever sees progress. The shop
 * already knows where the parcel is, because the booking office phones them;
 * this puts that on the same timeline an auto-tracked courier fills.
 *
 * The server infers the order status from the wording, so "Out for delivery"
 * moves the order to shipped without a second action.
 */
export async function addOrderTrackingEvent(
  orderId: string,
  event: { description: string; location?: string; timestamp?: string },
): Promise<AdminOrder> {
  const result: Record<string, unknown> = await api.post(`/admin/orders/${orderId}/track/events`, event);
  return mapAdminOrder(result);
}

export async function removeOrderTrackingEvent(orderId: string, index: number): Promise<AdminOrder> {
  const result: Record<string, unknown> = await api.delete(`/admin/orders/${orderId}/track/events/${index}`);
  return mapAdminOrder(result);
}

/**
 * Record that a cancelled order the customer had paid for has been paid back.
 *
 * Refunds are made by hand — nothing here moves money. The server accepts this
 * only from `refund_due` and records who marked it, and when.
 */
export async function markOrderRefunded(orderId: string, note?: string): Promise<AdminOrder> {
  const result: Record<string, unknown> = await api.patch(`/admin/orders/${orderId}/refund`, { note });
  return mapAdminOrder(result);
}

// =====================
// CUSTOMERS
// =====================

export interface UserListParams {
  search?: string;
  role?: 'user' | 'admin';
  status?: 'all' | 'active' | 'inactive';
  sort?: string;
  page?: number;
  limit?: number;
}

/** Admin registered-user list (`/admin/users`) — search / role / status / sort / paging server-side. */
export async function getAllCustomers(options?: UserListParams): Promise<PaginatedResult<UserProfile>> {
  const params: Record<string, string | number | boolean> = {};
  if (options?.search?.trim()) params.search = options.search.trim();
  if (options?.role) params.role = options.role;
  if (options?.status === 'active') params.isActive = 'true';
  else if (options?.status === 'inactive') params.isActive = 'false';
  if (options?.sort) params.sort = options.sort;
  if (options?.page) params.page = options.page;
  if (options?.limit) params.limit = options.limit;

  const result: Record<string, unknown> = await api.get('/admin/users', { params });
  const rawData = (result.data || result) as Record<string, unknown>[];
  // Map Mongo `_id` → `uid` so the page's user links (/admin/users/:uid) work.
  const data = (Array.isArray(rawData) ? rawData : []).map((u) => ({
    ...u,
    uid: (u.uid || u._id || u.id) as string,
  })) as unknown as UserProfile[];

  return {
    data,
    total: (result.total as number) ?? data.length,
    hasMore: (result.hasMore as boolean) ?? false,
    page: result.page as number | undefined,
    totalPages: result.totalPages as number | undefined,
  };
}

/** Store-wide user KPI counts for the admin Users page (server-side). */
export async function getUserStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
  admins: number;
}> {
  const d = (await api.get('/admin/users/summary')) as Record<string, unknown>;
  return {
    total: (d.total as number) ?? 0,
    active: (d.active as number) ?? 0,
    inactive: (d.inactive as number) ?? 0,
    admins: (d.admins as number) ?? 0,
  };
}

export async function getCustomerById(uid: string): Promise<UserProfile | null> {
  try {
    const data = (await api.get(`/admin/users/${uid}`)) as Record<string, unknown>;
    if (!data) return null;
    return { ...data, uid: (data.uid || data._id || data.id) as string } as unknown as UserProfile;
  } catch {
    return null;
  }
}

export async function getCustomerOrders(uid: string): Promise<Order[]> {
  const data: Record<string, unknown>[] = await api.get(`/admin/users/${uid}/orders`);
  return mapIds(Array.isArray(data) ? data : []).map((o) => ({
    ...o,
    items: mapOrderItems(o.items),
  })) as unknown as Order[];
}

export async function updateUserRole(uid: string, role: UserRole): Promise<void> {
  await api.patch(`/admin/users/${uid}/role`, { role });
}

export async function updateUserProfile(uid: string, data: {
  displayName?: string;
  phone?: string;
  role?: UserRole;
  isActive?: boolean;
  city?: string;
  state?: string;
}): Promise<void> {
  await api.put(`/admin/users/${uid}`, data);
}

export async function toggleUserStatus(uid: string, isActive: boolean): Promise<void> {
  await api.patch(`/admin/users/${uid}/status`, { isActive });
}

// =====================
// CATEGORIES
// =====================

export async function getAllCategories(options?: {
  isActive?: boolean;
}): Promise<PaginatedResult<Category>> {
  const result: Record<string, unknown> = await api.get('/categories');
  const rawData = (Array.isArray(result) ? result : (result.data || result)) as Record<string, unknown>[];
  let data = (Array.isArray(rawData) ? rawData : []).map(mapCategory);

  if (options?.isActive !== undefined) {
    data = data.filter((c) => c.isActive === options.isActive);
  }

  return {
    data,
    total: data.length,
    hasMore: false,
  };
}

export async function getCategoryById(categoryId: string): Promise<Category | null> {
  try {
    const data: Record<string, unknown> = await api.get(`/categories/${categoryId}`);
    return data ? mapCategory(data) : null;
  } catch {
    return null;
  }
}

export async function createCategory(
  category: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'productCount'>,
  _adminUid: string,
): Promise<string> {
  const result: Record<string, unknown> = await api.post('/categories', category);
  return (result._id || result.id) as string;
}

export async function updateCategory(
  categoryId: string,
  data: Partial<Category>,
): Promise<void> {
  await api.put(`/categories/${categoryId}`, data);
}

export async function deleteCategory(categoryId: string): Promise<void> {
  await api.delete(`/categories/${categoryId}`);
}

export async function toggleCategoryStatus(categoryId: string, isActive: boolean): Promise<void> {
  await api.patch(`/categories/${categoryId}/toggle`, { isActive });
}

// =====================
// SITE SETTINGS
// =====================

/**
 * The admin copy of the settings.
 *
 * Throws rather than returning null when it cannot be read: every section is
 * saved back whole, so a screen that went on to save after a failed load would
 * write empty sections over the real ones. Callers show the error and keep
 * Save disabled.
 */
export async function getSiteSettings(): Promise<SiteSettings | null> {
  const raw: Record<string, unknown> = await api.get('/admin/settings');
  if (!raw) throw new Error('Settings could not be loaded.');
  // The public copy leaves out the email section (and the payment details)
  // entirely; the admin copy always has it. Getting the public one here means
  // the request was not recognised as staff, and saving from it would erase
  // what was left out.
  if (!('email' in raw)) {
    throw new Error('Settings loaded without admin access. Sign in again, then reload this page.');
  }

  // Map backend keys (store, shipping, payment, announcement) to frontend SiteSettings
  const store = (raw.store || {}) as Record<string, unknown>;
  const shipping = (raw.shipping || raw.shippingRates || {}) as Record<string, unknown>;
  const payment = (raw.payment || raw.paymentSettings || {}) as Record<string, unknown>;
  const announcement = (raw.announcement || raw.announcementBar || {}) as Record<string, unknown>;
  const tax = (raw.tax || {}) as Record<string, unknown>;
  const inventory = (raw.inventory || {}) as Record<string, unknown>;
  const counter = (raw.counter || {}) as Record<string, unknown>;
  const orders = (raw.orders || {}) as Record<string, unknown>;
  const checkout = (raw.checkout || {}) as Record<string, unknown>;
  const email = (raw.email || {}) as Record<string, unknown>;
  // Both are admin-only: the anonymous read strips them, so these arrive
  // populated for a signed-in admin and empty for anyone else.
  const notifications = (raw.notifications || {}) as Record<string, unknown>;
  const whatsapp = (raw.whatsapp || {}) as Record<string, unknown>;

  return {
    siteName: (store.name || raw.siteName || '') as string,
    shippingRates: shipping as unknown as SiteSettings['shippingRates'],
    paymentSettings: payment as unknown as SiteSettings['paymentSettings'],
    checkoutSettings: checkout as unknown as SiteSettings['checkoutSettings'],
    inventorySettings: inventory as unknown as SiteSettings['inventorySettings'],
    // Absent on a shop that has never saved this tab; each rule falls back to
    // how the counter worked before it existed.
    counterSettings: {
      autoFillCashReceived: counter.autoFillCashReceived === true,
      requireCustomerPhone: counter.requireCustomerPhone !== false,
      allowSharedCustomerPhone: counter.allowSharedCustomerPhone === true,
    },
    orderRules: orders as unknown as SiteSettings['orderRules'],
    emailSettings: email as unknown as SiteSettings['emailSettings'],
    alertSettings: notifications as unknown as SiteSettings['alertSettings'],
    whatsappSettings: whatsapp as unknown as SiteSettings['whatsappSettings'],
    announcementBar: announcement as unknown as SiteSettings['announcementBar'],
    notificationTemplates: (raw.notificationTemplates || {}) as Record<string, string>,
    gstEnabled: tax.gstEnabled !== false,
    gstRate: typeof tax.gstRate === 'number' ? tax.gstRate : 18,
    gstin: (tax.gstin as string) || '',
  };
}

export async function updateSiteSettings(data: Partial<SiteSettings>): Promise<void> {
  // Map frontend SiteSettings keys back to backend keys
  const mapped: Record<string, unknown> = {};
  if (data.siteName !== undefined) mapped.store = { name: data.siteName };
  if (data.shippingRates) mapped.shipping = data.shippingRates;
  // Each section is stored as a whole document value, so these must always be
  // sent complete — a partial object would drop the fields left out.
  if (data.paymentSettings) mapped.payment = data.paymentSettings;
  if (data.checkoutSettings) mapped.checkout = data.checkoutSettings;
  if (data.inventorySettings) mapped.inventory = data.inventorySettings;
  if (data.counterSettings) mapped.counter = data.counterSettings;
  if (data.orderRules) mapped.orders = data.orderRules;
  if (data.emailSettings) mapped.email = data.emailSettings;
  if (data.alertSettings) mapped.notifications = data.alertSettings;
  if (data.whatsappSettings) mapped.whatsapp = data.whatsappSettings;
  if (data.announcementBar) mapped.announcement = data.announcementBar;
  if (data.notificationTemplates) mapped.notificationTemplates = data.notificationTemplates;
  // The tax value is stored/replaced as a whole, so send all fields together.
  if (data.gstRate !== undefined || data.gstEnabled !== undefined || data.gstin !== undefined) {
    mapped.tax = {
      ...(data.gstRate !== undefined ? { gstRate: data.gstRate } : {}),
      ...(data.gstEnabled !== undefined ? { gstEnabled: data.gstEnabled } : {}),
      ...(data.gstin !== undefined ? { gstin: data.gstin } : {}),
    };
  }
  await api.put('/admin/settings', mapped);
}

export async function getHeroSettings(): Promise<HeroSettings | null> {
  const data = await api.get('/content/hero-section') as Record<string, unknown> | null;
  return data ? (data as unknown as HeroSettings) : null;
}

export async function updateHeroSettings(data: Partial<HeroSettings>): Promise<void> {
  await api.put('/content/hero-section', data as Record<string, unknown>);
}

// =====================
// CONTENT SECTIONS
// =====================

/**
 * One content section, or null when it has never been saved.
 *
 * A failed read throws instead of looking like "never saved": editors save a
 * section back whole, so treating an outage as an empty section and saving
 * would replace the real content with defaults.
 */
export async function getContentSection<T = Record<string, unknown>>(sectionId: string): Promise<T | null> {
  const data = await api.get(`/content/${sectionId}`);
  return data ? (data as T) : null;
}

export async function updateContentSection(sectionId: string, data: Record<string, unknown>): Promise<void> {
  await api.put(`/content/${sectionId}`, data);
}

// =====================
// DASHBOARD STATS
// =====================

export async function getDashboardStats(): Promise<{
  totalRevenue: number;
  ordersToday: number;
  totalCustomers: number;
  lowStockCount: number;
  totalOrders: number;
  avgOrderValue: number;
  statusBreakdown: Record<string, number>;
}> {
  const data: Record<string, unknown> = await api.get('/admin/analytics/dashboard');
  return {
    totalRevenue: (data.totalRevenue as number) ?? 0,
    ordersToday: (data.ordersToday as number) ?? 0,
    totalCustomers: (data.totalCustomers as number) ?? 0,
    lowStockCount: (data.lowStockCount as number) ?? 0,
    totalOrders: (data.totalOrders as number) ?? 0,
    avgOrderValue: (data.avgOrderValue as number) ?? 0,
    statusBreakdown: (data.statusBreakdown as Record<string, number>) ?? {},
  };
}

// =====================
// ANALYTICS AGGREGATIONS (server-side)
// =====================

export interface ProductSalesRow { name: string; count: number; revenue: number }

/** Per-product sales (units + revenue), sorted by revenue — server aggregation. */
export async function getProductSales(opts?: { limit?: number; dateFrom?: string; dateTo?: string }): Promise<ProductSalesRow[]> {
  const params: Record<string, string | number> = {};
  if (opts?.limit) params.limit = opts.limit;
  if (opts?.dateFrom) params.dateFrom = opts.dateFrom;
  if (opts?.dateTo) params.dateTo = opts.dateTo;
  const data = (await api.get('/admin/analytics/product-sales', { params })) as ProductSalesRow[];
  return Array.isArray(data) ? data : [];
}

export interface SalesAnalytics {
  kpis: { revenue: number; orders: number; delivered: number; avgOrderValue: number };
  prev: { revenue: number; orders: number; delivered: number; avgOrderValue: number };
  timeSeries: { date: string; revenue: number; orders: number }[];
  topProducts: ProductSalesRow[];
  customerInsights: { totalCustomers: number; uniqueBuyers: number; newCustomers: number; returningBuyers: number };
  customerGrowth: { month: string; newUsers: number; totalUsers: number }[];
}

/** Full dashboard aggregation for a date window (+ previous window for growth). */
export async function getSalesAnalytics(opts?: {
  dateFrom?: string;
  dateTo?: string;
  prevFrom?: string;
  prevTo?: string;
}): Promise<SalesAnalytics> {
  const params: Record<string, string> = {};
  if (opts?.dateFrom) params.dateFrom = opts.dateFrom;
  if (opts?.dateTo) params.dateTo = opts.dateTo;
  if (opts?.prevFrom) params.prevFrom = opts.prevFrom;
  if (opts?.prevTo) params.prevTo = opts.prevTo;
  return (await api.get('/admin/analytics/sales', { params })) as SalesAnalytics;
}

export interface MonthlyBillSummary {
  year: number;
  months: {
    month: number;
    orders: number;
    sales: number;
    collections: number;
    /** Still owed today on that month's sales (credit bills not yet settled). */
    outstanding?: number;
  }[];
  years: number[];
}

/** Monthly sales/collections for one year, aggregated server-side (IST buckets). */
export async function getMonthlyBillSummary(year: number): Promise<MonthlyBillSummary> {
  const data = (await api.get('/admin/billing/monthly-summary', { params: { year } })) as MonthlyBillSummary;
  return { year: data?.year ?? year, months: data?.months ?? [], years: data?.years ?? [] };
}

export interface ProductAnalytics {
  /** All-time best sellers by units — `_id` is the order-line product name. */
  topProducts: { _id: string; totalSold: number; totalRevenue: number }[];
  /** Per-category rollup of the active catalogue — `_id` is the category slug. */
  categoryBreakdown: { _id: string; count: number; avgPrice: number; totalStock: number }[];
  /** Active products at/below the low-stock threshold, server-sorted stock ascending. */
  lowStock: { _id?: string; name: string; slug: string; stockCount: number; price: number; images: string[] }[];
}

/**
 * Catalogue-side analytics (`/admin/analytics/products`): top sellers by units,
 * per-category product/stock rollups (the only place total sellable units are
 * aggregated server-side) and the lowest-stock active products first — the admin
 * product list has no ascending-stock sort, so this is the only ordered source.
 */
export async function getProductAnalytics(): Promise<ProductAnalytics> {
  const d = ((await api.get('/admin/analytics/products')) ?? {}) as Partial<ProductAnalytics>;
  return {
    topProducts: Array.isArray(d.topProducts) ? d.topProducts : [],
    categoryBreakdown: Array.isArray(d.categoryBreakdown) ? d.categoryBreakdown : [],
    lowStock: Array.isArray(d.lowStock) ? d.lowStock : [],
  };
}

// =====================
// PRODUCT MIGRATION (no-op — handled by backend)
// =====================

export async function migrateStaticProducts(
  _products: Array<Record<string, unknown>>,
  _adminUid: string,
): Promise<number> {
  return 0;
}

// =====================
// BILLING / POS
// =====================

/**
 * Products for the POS picker. Pass `search` to query the server as the cashier
 * types (so it finds items beyond the preloaded working set); with no search it
 * returns a bounded recent working set of active products.
 */
export async function getActiveProducts(search?: string): Promise<AdminProduct[]> {
  const result = await getAllProducts({ status: 'active', search, limit: search ? 50 : 500 });
  return result.data;
}

export async function createBill(
  items: BillItem[],
  payment: BillPayment,
  discount: { percent: number },
  // The GSTIN travels with the sale, not just with the printed invoice: it is
  // what the server compares against the shop's own to decide CGST+SGST vs IGST
  // when the counter has not set the split explicitly.
  // `id` links the bill to the customer record; the server ignores anything
  // that is not one.
  customer: { id?: string; name?: string; phone?: string; address?: string; gstin?: string },
  adminUid: string,
  packagingFee = 0,
  deliveryCharge = 0,
  extra: { courierDelivery?: boolean; salesperson?: string } = {},
  gst: { mode?: 'percent' | 'flat'; rate?: number; amount?: number } = { mode: 'percent', rate: 18 },
  couponCode?: string,
  billing: {
    mode?: BillingMode;
    /** Overrides the GSTIN-derived split for this bill. */
    taxKind?: 'intra' | 'inter';
    caseInvoice?: Record<string, unknown>;
  } = {},
): Promise<Bill> {
  const body = {
    items,
    payment,
    discount,
    customer,
    adminUid,
    packagingFee,
    deliveryCharge,
    courierDelivery: extra.courierDelivery ?? false,
    salesperson: extra.salesperson,
    gst,
    // Only the code — the server re-validates it and decides the rupee amount.
    couponCode,
    // Full-case wholesale bills carry the printed invoice's presentation fields;
    // the server seeds the rest (pad number, HSN, tax kind) and owns the totals.
    billingMode: billing.mode,
    taxKind: billing.taxKind,
    caseInvoice: billing.caseInvoice,
  };
  const result: Record<string, unknown> = await api.post('/admin/billing', body);
  return mapBill(result);
}

/**
 * Save a corrected bill — retail, wholesale per-piece or full-case.
 *
 * The server re-prices the bill from whatever this sends, so the response is
 * the authority on every total — callers must take the returned bill rather
 * than keeping the figures their own preview computed. It also reconciles stock
 * against what the bill used to hold, so an edit that halves a quantity puts the
 * difference back on the shelf.
 */
export async function updateBill(
  billId: string,
  payload: {
    /** Case-pad presentation fields. Ignored on a bill that does not print one. */
    invoice?: Record<string, unknown>;
    items?: Array<{
      productId?: string;
      name: string;
      quantity: number;
      unitPrice: number;
      unit?: 'piece' | 'case';
      piecesPerCase?: number;
    }>;
    discountPercent?: number;
    deliveryCharge?: number;
    gst?: { mode?: 'percent' | 'flat'; rate?: number; amount?: number };
    /** A figure sets it, `null` returns to automatic rounding, absent keeps what is stored. */
    manualRoundOff?: number | null;
    /** A code applies (re-validated), `null` removes the bill's coupon, absent keeps it. */
    couponCode?: string | null;
    /** `id` re-links the bill to a customer record, `null` unlinks it, absent keeps the link. */
    customer?: { id?: string | null; name?: string; phone?: string; address?: string; gstin?: string };
    taxKind?: 'intra' | 'inter';
    payment?: { method?: string; reference?: string };
  },
): Promise<Bill> {
  const result: Record<string, unknown> = await api.patch(`/admin/billing/${billId}`, payload);
  return mapBill(result);
}

/** @deprecated Use {@link updateBill} — the case pad is no longer a special case. */
export const updateCaseInvoice = updateBill;

/** Record a later part-payment against a credit bill (udhaar settlement). */
export async function settleBill(
  id: string,
  amount: number,
  method = 'cash',
  note?: string,
): Promise<Bill> {
  const result: Record<string, unknown> = await api.post(`/admin/billing/${id}/settle`, { amount, method, note });
  return mapBill(result);
}

/**
 * Void a counter bill. The server puts the stock back and frees the coupon slot;
 * the bill itself is kept and marked cancelled so the printed copy still
 * reconciles against something.
 */
export async function cancelBill(id: string, reason?: string): Promise<Bill> {
  const result: Record<string, unknown> = await api.post(`/admin/billing/${id}/cancel`, { reason });
  return mapBill(result);
}

export async function getAllBills(customerPhone?: string): Promise<Bill[]> {
  const result: Record<string, unknown> = await api.get(
    '/admin/billing',
    customerPhone ? { params: { customerPhone, limit: 100 } } : undefined,
  );
  const bills = (result.data || result) as Record<string, unknown>[];
  return (Array.isArray(bills) ? bills : []).map(mapBill);
}

export interface BillListParams {
  search?: string;
  status?: string;
  paymentMethod?: string;
  /** 'retail' | 'wholesale-piece' | 'wholesale-case', or 'wholesale' for either wholesale mode. */
  billingMode?: string;
  salesperson?: string;
  minAmount?: number;
  maxAmount?: number;
  /** ISO date strings — derived from the page's date-range preset. */
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

/** Paged bill list for the admin Bills page — search / filters / sort / paging server-side. */
export async function getBillsPaged(options?: BillListParams): Promise<PaginatedResult<Bill>> {
  const params: Record<string, string | number | boolean> = {};
  if (options?.search?.trim()) params.search = options.search.trim();
  if (options?.status && options.status !== 'all') params.status = options.status;
  if (options?.paymentMethod && options.paymentMethod !== 'all') params.paymentMethod = options.paymentMethod;
  if (options?.billingMode && options.billingMode !== 'all') params.billingMode = options.billingMode;
  if (options?.salesperson) params.salesperson = options.salesperson;
  if (options?.minAmount !== undefined) params.minAmount = options.minAmount;
  if (options?.maxAmount !== undefined) params.maxAmount = options.maxAmount;
  if (options?.dateFrom) params.dateFrom = options.dateFrom;
  if (options?.dateTo) params.dateTo = options.dateTo;
  if (options?.sort) params.sort = options.sort;
  if (options?.page) params.page = options.page;
  if (options?.limit) params.limit = options.limit;

  const result: Record<string, unknown> = await api.get('/admin/billing', { params });
  const bills = (result.data || result) as Record<string, unknown>[];
  const data = (Array.isArray(bills) ? bills : []).map(mapBill);
  return {
    data,
    total: (result.total as number) ?? data.length,
    hasMore: (result.hasMore as boolean) ?? false,
    page: result.page as number | undefined,
    totalPages: result.totalPages as number | undefined,
  };
}

/** Store-wide bill KPIs for the admin Bills page (server-side, not a page slice). */
export async function getBillStats(): Promise<{
  totalBills: number;
  totalRevenue: number;
  todayRevenue: number;
  uniqueCustomers: number;
}> {
  const d = (await api.get('/admin/billing/summary')) as Record<string, unknown>;
  return {
    totalBills: (d.totalBills as number) ?? 0,
    totalRevenue: (d.totalRevenue as number) ?? 0,
    todayRevenue: (d.todayRevenue as number) ?? 0,
    uniqueCustomers: (d.uniqueCustomers as number) ?? 0,
  };
}

export async function getBillById(id: string): Promise<Bill | null> {
  try {
    const result: Record<string, unknown> = await api.get(`/admin/billing/${id}`);
    return result ? mapBill(result) : null;
  } catch {
    return null;
  }
}

/**
 * One customer's bills, newest first — powers the Customer / Product History
 * tabs and the customer page.
 *
 * By `customerId` wherever there is a customer record: the server then returns
 * the bills raised for that record plus older phone-only ones, which keeps two
 * customers who share a phone number apart. By `phone` for anyone else.
 */
export async function getBillsByCustomer(who: { customerId?: string; phone?: string }): Promise<Bill[]> {
  if (!who.customerId) return who.phone ? getAllBills(who.phone) : [];
  const result: Record<string, unknown> = await api.get('/admin/billing', {
    params: { customerId: who.customerId, limit: 100 },
  });
  const bills = (result.data || result) as Record<string, unknown>[];
  return (Array.isArray(bills) ? bills : []).map(mapBill);
}

// =====================
// BILLING CUSTOMERS (directory)
// =====================

function mapCustomer(c: Record<string, unknown>): Customer {
  return {
    ...c,
    id: (c._id || c.id) as string,
    customerType: (c.customerType as Customer['customerType']) || 'retail',
    source: 'customer',
  } as unknown as Customer;
}

export interface CustomerListParams {
  search?: string;
  customerType?: string;
  city?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

/**
 * POS/billing customer directory. `search` / type / city / sort / paging are all
 * forwarded to the server. Returns the row array (unwrapping the {data,total}
 * envelope); use {@link getCustomersPaged} when you need the server total.
 */
export async function getCustomers(search?: string | CustomerListParams): Promise<Customer[]> {
  return (await getCustomersPaged(typeof search === 'string' ? { search } : search)).data;
}

/** Same as {@link getCustomers} but returns the paginated envelope (data + total). */
export async function getCustomersPaged(options?: CustomerListParams): Promise<PaginatedResult<Customer>> {
  const params: Record<string, string | number | boolean> = {};
  if (options?.search?.trim()) params.search = options.search.trim();
  if (options?.customerType && options.customerType !== 'all') params.customerType = options.customerType;
  if (options?.city && options.city !== 'all') params.city = options.city;
  if (options?.sort) params.sort = options.sort;
  if (options?.page) params.page = options.page;
  if (options?.limit) params.limit = options.limit;

  const result: unknown = await api.get('/admin/customers', { params });
  const rec = (result ?? {}) as Record<string, unknown>;
  const raw = (Array.isArray(result) ? result : (rec.data ?? [])) as Record<string, unknown>[];
  const data = (Array.isArray(raw) ? raw : []).map(mapCustomer);
  return {
    data,
    total: (rec.total as number) ?? data.length,
    hasMore: (rec.hasMore as boolean) ?? false,
    page: rec.page as number | undefined,
    totalPages: rec.totalPages as number | undefined,
  };
}

export async function createCustomer(data: CustomerInput): Promise<Customer> {
  const result: Record<string, unknown> = await api.post('/admin/customers', data);
  return mapCustomer(result);
}

export type CustomerDuplicate =
  | { duplicate: false }
  | {
      duplicate: true;
      field: 'phone' | 'gstin';
      customer: { id: string; name: string; phone: string };
      /** True when Settings → Billing allows a shared phone: a warning, not a refusal. */
      allowed?: boolean;
    };

/**
 * Is this phone or GSTIN already on another customer?
 *
 * Called from the Add Customer form as the fields are filled in. The server
 * refuses a duplicate on save regardless — this exists so the counter is told
 * at the field instead of after typing the whole record, and so it can offer
 * the existing customer rather than just saying no.
 *
 * Bills are tied to a customer by PHONE, so a duplicate does not just clutter
 * the list: it splits that customer's history, credit ledger and lifetime value
 * across two rows.
 */
export async function checkCustomerDuplicate(params: {
  phone?: string;
  gstin?: string;
  excludeId?: string;
}): Promise<CustomerDuplicate> {
  const query: Record<string, string> = {};
  if (params.phone) query.phone = params.phone;
  if (params.gstin) query.gstin = params.gstin;
  if (params.excludeId) query.excludeId = params.excludeId;
  if (!query.phone && !query.gstin) return { duplicate: false };

  return (await api.get('/admin/customers/check-duplicate', { params: query })) as CustomerDuplicate;
}

export async function getBillingCustomerById(id: string): Promise<Customer | null> {
  try {
    const result: Record<string, unknown> = await api.get(`/admin/customers/${id}`);
    return result ? mapCustomer(result) : null;
  } catch {
    return null;
  }
}

export async function updateCustomer(id: string, data: Partial<CustomerInput> & { notes?: string }): Promise<Customer> {
  const result: Record<string, unknown> = await api.put(`/admin/customers/${id}`, data);
  return mapCustomer(result);
}

export async function getCustomerStats(id: string): Promise<CustomerStats> {
  return (await api.get(`/admin/customers/${id}/stats`)) as CustomerStats;
}

export async function getCreditLedger(id: string): Promise<CreditLedger> {
  return (await api.get(`/admin/customers/${id}/credit-ledger`)) as CreditLedger;
}

export async function recordCustomerPayment(
  id: string,
  data: { amount: number; method?: string; note?: string },
): Promise<void> {
  await api.post(`/admin/customers/${id}/payments`, data);
}

/**
 * Send a test email through the currently saved SMTP settings.
 *
 * Resolves with the server's own message on success; rejects with the SMTP
 * server's error text ("Invalid login", "Connection timeout") on failure, which
 * is the part an admin needs to fix a wrong app password.
 */
export async function sendTestEmail(to?: string): Promise<string> {
  const res = await api.post('/admin/settings/test-email', { to });
  return (res as unknown as { message?: string })?.message || `Test email sent${to ? ` to ${to}` : ''}.`;
}

// =====================
// WEBSITE TRAFFIC
// =====================

export interface TrafficPoint {
  date: string;
  pageViews: number;
  visitors: number;
}

export interface TrafficSummary {
  series: TrafficPoint[];
  totalPageViews: number;
  uniqueVisitors: number;
  avgSessionSeconds: number;
  topPages: { path: string; views: number }[];
  topReferrers: { source: string; visits: number }[];
  devices: { device: string; visits: number }[];
  /** False until the first beacon lands, so the card can explain the wait. */
  hasData: boolean;
}

const EMPTY_TRAFFIC: TrafficSummary = {
  series: [],
  totalPageViews: 0,
  uniqueVisitors: 0,
  avgSessionSeconds: 0,
  topPages: [],
  topReferrers: [],
  devices: [],
  hasData: false,
};

/** Real first-party traffic, recorded by the beacon in @/lib/track.ts. */
export async function getTraffic(days = 7): Promise<TrafficSummary> {
  try {
    const d = (await api.get('/admin/analytics/traffic', { params: { days } })) as TrafficSummary;
    return d ?? EMPTY_TRAFFIC;
  } catch {
    return EMPTY_TRAFFIC;
  }
}

// =====================
// AUTO-WRITTEN DESCRIPTIONS
// =====================

/**
 * Draft a short + long description for one product WITHOUT saving it.
 *
 * The text is composed on the server so there is only one copy of the wording
 * rules; the caller decides whether to keep what comes back.
 */
export async function describeProduct(input: {
  name: string;
  categorySlug?: string;
  soldPer?: string;
  quantityPerCase?: number;
}): Promise<{ shortDescription: string; description: string }> {
  return api.post('/admin/products/describe', input) as Promise<{
    shortDescription: string;
    description: string;
  }>;
}

/**
 * Fill descriptions across the whole catalogue.
 *
 * `onlyMissing` defaults to true on the server, which is what stops a click
 * from flattening copy the shop wrote by hand. Pass `dryRun` to see the counts
 * without writing.
 */
export async function describeProductsBulk(options: {
  onlyMissing?: boolean;
  dryRun?: boolean;
} = {}): Promise<{ scanned: number; updated: number; skipped: number; dryRun: boolean }> {
  return api.post('/admin/products/describe-bulk', options) as Promise<{
    scanned: number;
    updated: number;
    skipped: number;
    dryRun: boolean;
  }>;
}

// --- Credit (udhaar) --------------------------------------------------------

export interface CreditCustomerRow {
  id: string;
  name: string;
  phone: string;
  outstanding: number;
  billCount: number;
  oldestDate: string | null;
  lastPaymentDate: string | null;
}

/**
 * Everyone who currently owes the shop money, most owed first.
 *
 * Derived from the bills rather than from any balance stored on a customer, so
 * it agrees with what each bill says it is still owed.
 */
export async function getCreditOutstanding(
  search?: string,
): Promise<{ rows: CreditCustomerRow[]; totalOutstanding: number }> {
  const params: Record<string, string> = {};
  if (search?.trim()) params.search = search.trim();
  return (await api.get('/admin/customers/credit/outstanding', { params })) as {
    rows: CreditCustomerRow[];
    totalOutstanding: number;
  };
}
