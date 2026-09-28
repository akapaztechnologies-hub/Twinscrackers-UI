/**
 * Inventory: stock levels and the movement ledger.
 *
 * Stock is operator-only, so every call here is admin-authenticated. The
 * ledger is append-only on the server — nothing in this module edits history,
 * it only adds movements.
 */
import api from '@/lib/api.ts';

export type StockMovementType = 'initial' | 'purchase' | 'sale' | 'return' | 'damage' | 'adjustment';

export const STOCK_MOVEMENT_TYPES: StockMovementType[] = [
  'initial',
  'purchase',
  'sale',
  'return',
  'damage',
  'adjustment',
];

/** Labels and colours shared by the ledger table and the adjust form. */
export const MOVEMENT_META: Record<StockMovementType, { label: string; tone: string }> = {
  initial: { label: 'Opening stock', tone: 'text-surface-600 bg-surface-500/10' },
  purchase: { label: 'Purchase', tone: 'text-green-600 bg-green-500/10' },
  sale: { label: 'Sale', tone: 'text-blue-600 bg-blue-500/10' },
  return: { label: 'Return', tone: 'text-amber-600 bg-amber-500/10' },
  damage: { label: 'Damage', tone: 'text-red-600 bg-red-500/10' },
  adjustment: { label: 'Adjustment', tone: 'text-purple-600 bg-purple-500/10' },
};

export interface InventoryItem {
  _id: string;
  name: string;
  slug: string;
  images?: string[];
  categorySlug?: string;
  price: number;
  wholesalePrice?: number;
  stockCount: number;
  stockValue: number;
  inStock: boolean;
  isActive: boolean;
  updatedAt: string;
}

export interface StockMovement {
  _id: string;
  product: string;
  productName: string;
  productSlug: string;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  createdBy?: { name?: string; email?: string } | null;
  createdAt: string;
}

export interface InventorySummary {
  totalSkus: number;
  totalUnits: number;
  lowStock: number;
  outOfStock: number;
  retailValue: number;
  lowStockThreshold: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface InventoryQuery {
  page?: number;
  limit?: number;
  search?: string;
  stock?: string;
  category?: string;
  sort?: string;
}

function clean(params: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== 'all'),
  );
}

export async function getInventory(query: InventoryQuery = {}): Promise<Paginated<InventoryItem>> {
  const res = (await api.get('/admin/inventory', { params: clean(query) })) as unknown as Paginated<InventoryItem>;
  return res ?? { data: [], pagination: { page: 1, limit: 25, total: 0, pages: 1 } };
}

export async function getInventorySummary(): Promise<InventorySummary> {
  return (await api.get('/admin/inventory/summary')) as unknown as InventorySummary;
}

export interface MovementQuery {
  page?: number;
  limit?: number;
  productId?: string;
  type?: string;
  from?: string;
  to?: string;
}

export async function getStockMovements(query: MovementQuery = {}): Promise<Paginated<StockMovement>> {
  const res = (await api.get('/admin/inventory/movements', {
    params: clean(query),
  })) as unknown as Paginated<StockMovement>;
  return res ?? { data: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 } };
}

/** Add or remove stock by a delta, with a reason that lands in the ledger. */
export async function adjustStock(input: {
  productId: string;
  quantity: number;
  type: StockMovementType;
  reason?: string;
}): Promise<{ productId: string; stockCount: number; inStock: boolean }> {
  return (await api.post('/admin/inventory/adjust', input)) as unknown as {
    productId: string;
    stockCount: number;
    inStock: boolean;
  };
}

/** Set an exact count — what a physical stock-take produces. */
export async function setStock(
  productId: string,
  stockCount: number,
  reason?: string,
): Promise<{ productId: string; stockCount: number; inStock: boolean }> {
  return (await api.post('/admin/inventory/set', { productId, stockCount, reason })) as unknown as {
    productId: string;
    stockCount: number;
    inStock: boolean;
  };
}

export async function bulkSetStock(
  entries: { productId: string; stockCount: number }[],
  reason?: string,
): Promise<{ updated: number; errors: { productId: string; message: string }[] }> {
  return (await api.post('/admin/inventory/bulk', { entries, reason })) as unknown as {
    updated: number;
    errors: { productId: string; message: string }[];
  };
}
