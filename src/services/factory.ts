/**
 * Factory billing — backed by /api/admin/factory.
 *
 * Separate from `services/products.ts` and the shop's billing on purpose: the
 * factory is its own firm, and none of these calls touch the catalogue, stock
 * or counter takings.
 */
import api from '@/lib/api.ts';
import type { FactoryBill, FactoryProduct, FactoryProductInput } from '@/types/factory.ts';

function mapProduct(p: Record<string, unknown>): FactoryProduct {
  return {
    ...(p as unknown as FactoryProduct),
    id: (p._id || p.id) as string,
    rate: Number(p.rate ?? 0),
    per: String(p.per ?? 'CASE'),
    isActive: p.isActive !== false,
  };
}

function mapBill(b: Record<string, unknown>): FactoryBill {
  return {
    ...(b as unknown as FactoryBill),
    id: (b._id || b.id) as string,
  };
}

// ---- Products ----

export async function getFactoryProducts(options: { search?: string; includeInactive?: boolean } = {}): Promise<FactoryProduct[]> {
  const data: Record<string, unknown>[] = await api.get('/admin/factory/products', {
    params: {
      ...(options.search ? { search: options.search } : {}),
      ...(options.includeInactive ? { includeInactive: 'true' } : {}),
    },
  });
  return (Array.isArray(data) ? data : []).map(mapProduct);
}

export async function createFactoryProduct(input: FactoryProductInput): Promise<FactoryProduct> {
  const data: Record<string, unknown> = await api.post('/admin/factory/products', input);
  return mapProduct(data);
}

export async function updateFactoryProduct(id: string, patch: Partial<FactoryProductInput>): Promise<FactoryProduct> {
  const data: Record<string, unknown> = await api.put(`/admin/factory/products/${id}`, patch);
  return mapProduct(data);
}

export async function deleteFactoryProduct(id: string): Promise<void> {
  await api.delete(`/admin/factory/products/${id}`);
}

// ---- Numbering ----

export interface NextInvoiceNumber {
  seq: number;
  invoiceNumber: string;
}

export async function getNextFactoryNumber(): Promise<NextInvoiceNumber> {
  return api.get('/admin/factory/bills/next-number');
}

/** Carry on from a paper pad: the next bill raised takes `startNumber`. */
export async function setNextFactoryNumber(startNumber: number): Promise<NextInvoiceNumber> {
  return api.put('/admin/factory/bills/next-number', { startNumber });
}

// ---- Bills ----

export interface FactoryBillListResult {
  bills: FactoryBill[];
  total: number;
  page: number;
  pages: number;
}

export async function getFactoryBills(
  options: { page?: number; limit?: number; search?: string; status?: string; from?: string; to?: string } = {},
): Promise<FactoryBillListResult> {
  const data: { bills?: Record<string, unknown>[]; total?: number; page?: number; pages?: number } = await api.get(
    '/admin/factory/bills',
    { params: options },
  );
  return {
    bills: (data.bills ?? []).map(mapBill),
    total: data.total ?? 0,
    page: data.page ?? 1,
    pages: data.pages ?? 1,
  };
}

export async function getFactoryBillById(id: string): Promise<FactoryBill> {
  const data: Record<string, unknown> = await api.get(`/admin/factory/bills/${id}`);
  return mapBill(data);
}

export async function createFactoryBill(payload: unknown): Promise<FactoryBill> {
  const data: Record<string, unknown> = await api.post('/admin/factory/bills', payload);
  return mapBill(data);
}

export async function updateFactoryBill(id: string, payload: unknown): Promise<FactoryBill> {
  const data: Record<string, unknown> = await api.put(`/admin/factory/bills/${id}`, payload);
  return mapBill(data);
}

export async function cancelFactoryBill(id: string, reason?: string): Promise<FactoryBill> {
  const data: Record<string, unknown> = await api.post(`/admin/factory/bills/${id}/cancel`, { reason });
  return mapBill(data);
}

export interface FactoryBillStats {
  /** True when the figures cover a filtered range rather than this month. */
  ranged: boolean;
  totals: { count: number; total: number; taxable: number; gst: number };
}

export async function getFactoryBillStats(
  options: { from?: string; to?: string } = {},
): Promise<FactoryBillStats> {
  return api.get('/admin/factory/bills/stats', { params: options });
}
