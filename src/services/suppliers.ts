/**
 * Supplier directory — backed by /api/admin/suppliers.
 *
 * This screen used to persist to localStorage, which meant a supplier entered
 * on the shop's desktop did not exist on anyone else's machine. The API is now
 * the only store; the localStorage helpers at the bottom survive purely to
 * offer a one-time lift of whatever a browser is still holding.
 */
import api from '@/lib/api.ts';
import type { Supplier, SupplierInput } from '@/types/admin.ts';

function mapSupplier(s: Record<string, unknown>): Supplier {
  return {
    ...s,
    id: (s._id || s.id) as string,
    productsSupplied: Array.isArray(s.productsSupplied) ? (s.productsSupplied as string[]) : [],
  } as unknown as Supplier;
}

/** Excel "Balance (Auto ₹)" = Total Ordered − Amount Paid. Positive = owed to supplier. */
export function supplierBalance(s: { totalOrdered: number; amountPaid: number }): number {
  return Math.round(((s.totalOrdered || 0) - (s.amountPaid || 0)) * 100) / 100;
}

export async function getSuppliers(): Promise<Supplier[]> {
  const data: Record<string, unknown>[] = await api.get('/admin/suppliers');
  return (Array.isArray(data) ? data : []).map(mapSupplier);
}

export async function getSupplierById(id: string): Promise<Supplier | null> {
  try {
    const data: Record<string, unknown> = await api.get(`/admin/suppliers/${id}`);
    return data ? mapSupplier(data) : null;
  } catch {
    return null;
  }
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  // supplierCode is allocated server-side, so it is not sent.
  const data: Record<string, unknown> = await api.post('/admin/suppliers', input);
  return mapSupplier(data);
}

export async function updateSupplier(id: string, patch: Partial<SupplierInput>): Promise<Supplier> {
  const data: Record<string, unknown> = await api.put(`/admin/suppliers/${id}`, patch);
  return mapSupplier(data);
}

export async function deleteSupplier(id: string): Promise<void> {
  await api.delete(`/admin/suppliers/${id}`);
}

// =====================
// ONE-TIME MIGRATION OFF localStorage
// =====================

const LS_KEY = 'ak_suppliers';

/**
 * Suppliers this browser is still holding from before the API existed.
 *
 * The old code seeded three sample rows (Standard Fireworks, Sri Kaliswari,
 * Cock Brand) on first visit, so this is NOT automatically worth keeping —
 * the admin is shown what it found and decides. Nothing is uploaded silently.
 */
export function readLocalSuppliers(): Supplier[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Supplier[]).filter((s) => s?.companyName) : [];
  } catch {
    return [];
  }
}

/** Push this browser's leftovers to the server. Refused once the API has rows. */
export async function importLocalSuppliers(rows: Supplier[]): Promise<number> {
  const result: Record<string, unknown> = await api.post('/admin/suppliers/import', {
    suppliers: rows.map((s) => ({
      supplierCode: s.supplierCode,
      companyName: s.companyName,
      contactPerson: s.contactPerson,
      phone: s.phone,
      city: s.city,
      productsSupplied: s.productsSupplied ?? [],
      totalOrdered: s.totalOrdered ?? 0,
      amountPaid: s.amountPaid ?? 0,
      pesoLicensed: Boolean(s.pesoLicensed),
      notes: s.notes,
    })),
  });
  return (result.imported as number) ?? 0;
}

/** Drop the browser copy once it has been dealt with, either way. */
export function clearLocalSuppliers(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* nothing to clean up */
  }
}
