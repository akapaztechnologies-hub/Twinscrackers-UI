/**
 * Quotation service.
 *
 * Quotations used to live in `localStorage` under `ak_quotations`: per browser,
 * per device, capped at 30 and gone with the cache. They are now real rows on
 * the server, which is what makes Edit meaningful (a quote keeps its number
 * when it is changed, instead of a second one appearing beside it) and what lets
 * every counter see the same quotations.
 *
 * The server owns the number, the totals and the status. Nothing here computes
 * money — it posts what the counter entered and takes back what the server
 * priced.
 */
import api from '@/lib/api.ts';
import type { Bill, BillPayment, PaginatedResult } from '@/types/admin.ts';
import type { Quotation, QuotationLayout, QuotationStatus } from '@/types/quotation.ts';

function mapQuotation(q: Record<string, unknown>): Quotation {
  const rawItems = (q.items as Record<string, unknown>[] | undefined) || [];
  return {
    ...q,
    id: (q._id || q.id) as string,
    items: rawItems.map((it) => ({ ...it, productId: (it.productId ?? it.product ?? '') as string })),
  } as unknown as Quotation;
}

/** What the billing screen sends to raise or re-price a quotation. */
export interface QuotationPayload {
  items: Array<{
    productId: string;
    name: string;
    image?: string;
    quantity: number;
    unitPrice: number;
    unit?: 'piece' | 'case';
    piecesPerCase?: number;
  }>;
  discount?: { percent?: number };
  customer?: { id?: string; name?: string; phone?: string; address?: string; gstin?: string };
  deliveryCharge?: number;
  courierDelivery?: boolean;
  salesperson?: string;
  gst?: { mode?: 'percent' | 'flat'; rate?: number; amount?: number };
  couponCode?: string;
  couponDiscount?: number;
  billingMode?: 'retail' | 'wholesale-piece' | 'wholesale-case';
  taxKind?: 'intra' | 'inter';
  layout?: Partial<QuotationLayout>;
}

export async function createQuotation(payload: QuotationPayload): Promise<Quotation> {
  const result: Record<string, unknown> = await api.post('/admin/quotations', payload);
  return mapQuotation(result);
}

/**
 * Re-price a quotation in place — it keeps its number.
 *
 * Fields the payload leaves out keep what the stored layout already had, so
 * saving from the billing screen never wipes notes typed in the layout editor.
 */
export async function updateQuotation(id: string, payload: QuotationPayload): Promise<Quotation> {
  const result: Record<string, unknown> = await api.patch(`/admin/quotations/${id}`, payload);
  return mapQuotation(result);
}

/** Save the printed page only. Never re-prices — the layout editor's route. */
export async function updateQuotationLayout(
  id: string,
  layout: Partial<QuotationLayout>,
): Promise<Quotation> {
  const result: Record<string, unknown> = await api.patch(`/admin/quotations/${id}/layout`, layout);
  return mapQuotation(result);
}

export interface QuotationListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: QuotationStatus | 'all';
  billingMode?: 'retail' | 'wholesale' | 'wholesale-piece' | 'wholesale-case' | 'all';
  customerPhone?: string;
  salesperson?: string;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
}

export async function getQuotations(options: QuotationListParams = {}): Promise<PaginatedResult<Quotation>> {
  const params: Record<string, string | number> = {};
  if (options.page) params.page = options.page;
  if (options.limit) params.limit = options.limit;
  if (options.search?.trim()) params.search = options.search.trim();
  if (options.status && options.status !== 'all') params.status = options.status;
  if (options.billingMode && options.billingMode !== 'all') params.billingMode = options.billingMode;
  if (options.customerPhone) params.customerPhone = options.customerPhone;
  if (options.salesperson) params.salesperson = options.salesperson;
  if (options.minAmount !== undefined) params.minAmount = options.minAmount;
  if (options.maxAmount !== undefined) params.maxAmount = options.maxAmount;
  if (options.dateFrom) params.dateFrom = options.dateFrom;
  if (options.dateTo) params.dateTo = options.dateTo;
  if (options.sort) params.sort = options.sort;

  const result: Record<string, unknown> = await api.get('/admin/quotations', { params });
  const rawData = (result.data || result) as Record<string, unknown>[];
  const data = (Array.isArray(rawData) ? rawData : []).map(mapQuotation);
  const pagination = (result.pagination ?? {}) as Record<string, number>;

  return {
    data,
    total: pagination.total ?? data.length,
    hasMore: (pagination.page ?? 1) < (pagination.pages ?? 1),
    page: pagination.page,
    totalPages: pagination.pages,
  };
}

export async function getQuotationById(id: string): Promise<Quotation | null> {
  try {
    const result: Record<string, unknown> = await api.get(`/admin/quotations/${id}`);
    return mapQuotation(result);
  } catch {
    return null;
  }
}

export interface QuotationStats {
  total: number;
  totalValue: number;
  open: number;
  openValue: number;
  converted: number;
  convertedValue: number;
}

export async function getQuotationStats(): Promise<QuotationStats> {
  return api.get('/admin/quotations/summary');
}

/**
 * Raise the invoice this quotation was for.
 *
 * The bill comes back carrying the quotation's own number — that is the shared
 * series doing its job, and it is why nothing here asks for a new one.
 */
export async function convertQuotation(
  id: string,
  overrides: {
    payment: BillPayment;
    items?: QuotationPayload['items'];
    discount?: { percent?: number };
    deliveryCharge?: number;
    courierDelivery?: boolean;
    salesperson?: string;
    gst?: { mode?: 'percent' | 'flat'; rate?: number; amount?: number };
    /** A code applies (re-validated), `null` removes the quotation's coupon, absent keeps it. */
    couponCode?: string | null;
    taxKind?: 'intra' | 'inter';
    transport?: string;
  },
): Promise<{ bill: Bill; quotation: Quotation }> {
  const result: Record<string, unknown> = await api.post(`/admin/quotations/${id}/convert`, overrides);
  const rawBill = (result.bill ?? {}) as Record<string, unknown>;
  const rawItems = (rawBill.items as Record<string, unknown>[] | undefined) || [];
  return {
    bill: {
      ...rawBill,
      id: (rawBill._id || rawBill.id) as string,
      items: rawItems.map((it) => ({ ...it, productId: (it.productId ?? it.product ?? '') as string })),
    } as unknown as Bill,
    quotation: mapQuotation((result.quotation ?? {}) as Record<string, unknown>),
  };
}

/**
 * Withdraw a quotation.
 *
 * Cancelled rather than deleted: the number came from the invoice series, so a
 * deleted row would leave an unexplained gap in it. A cancelled quotation IS
 * the explanation.
 */
export async function cancelQuotation(id: string, reason?: string): Promise<Quotation> {
  const result: Record<string, unknown> = await api.post(`/admin/quotations/${id}/cancel`, { reason });
  return mapQuotation(result);
}

/** One invoice number that a quotation is holding, and why. */
export interface InvoiceNumberGap {
  number: string;
  status: QuotationStatus;
  customerName?: string;
  grandTotal: number;
  createdAt: string;
}

/**
 * The gaps this year's unconverted quotations leave in the invoice series.
 *
 * Quotations draw from the same `AK-YYMM-#####` counter as invoices, so a quote
 * nobody takes up is a number that never reaches a bill. GST auditors ask about
 * missing invoice numbers; the Monthly Report shows this so the answer is ready
 * rather than reconstructed.
 */
export interface InvoiceNumberGaps {
  year: number;
  total: number;
  totalValue: number;
  months: { month: number; count: number; value: number; numbers: InvoiceNumberGap[] }[];
}

export async function getInvoiceNumberGaps(year: number): Promise<InvoiceNumberGaps> {
  return (await api.get('/admin/quotations/number-gaps', { params: { year } })) as InvoiceNumberGaps;
}
