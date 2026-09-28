/**
 * Spreadsheet import/export for products and categories.
 *
 * Exports come back as styled .xlsx in two shapes — `full` carries every field
 * (backup, migration), `quick` only the columns a shop edits week to week.
 * Imports accept either shape, as .xlsx or .csv.
 *
 * These go through the shared client like every other call, so an expired
 * session is refreshed instead of failing the export outright. Downloads ask
 * for the raw response (`rawResponse`) — the unwrapping interceptor would
 * otherwise turn the Blob into `undefined` and hide the filename header — and
 * uploads name multipart explicitly, because the client's JSON default would
 * serialise the FormData instead of sending the file.
 */
import type { AxiosResponse } from 'axios';
import api from '@/lib/api.ts';

/** Filename from Content-Disposition, so the saved file matches what the server named it. */
function filenameFrom(disposition: string | undefined, fallback: string): string {
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

async function download(path: string, fallbackName: string): Promise<void> {
  const res = await api.get<Blob, AxiosResponse<Blob>>(path, {
    responseType: 'blob',
    rawResponse: true,
  });

  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFrom(res.headers['content-disposition'] as string | undefined, fallbackName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ImportRowError {
  row: number;
  slug?: string;
  message: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: ImportRowError[];
  dryRun: boolean;
  /** Anything else worth saying about the file, one line each, shown under the counts. */
  notices?: string[];
}

async function upload(
  path: string,
  file: File,
  dryRun: boolean,
  params: Record<string, string | undefined> = {},
): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);

  const query: Record<string, string> = { dryRun: String(dryRun) };
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query[key] = value;
      // Sent as a form field as well: an upload route may read its options
      // from either place, and a flag it misses is a silently different import.
      form.append(key, value);
    }
  }

  // Rejections are ApiRequestError carrying the server's message ("Row 4: bad
  // price"), which is what the import dialog shows.
  return api.post(path, form, {
    params: query,
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as Promise<ImportResult>;
}

// --- Products ---------------------------------------------------------------

export interface ProductExportOptions {
  /** 'true' exports combos only, 'false' excludes them, omit for everything. */
  isCombo?: boolean;
  category?: string;
  isActive?: boolean;
}

/** Which shape of sheet to hand out. See the module docblock. */
export type TransferMode = 'full' | 'quick';

export function exportProducts(
  options: ProductExportOptions = {},
  mode: TransferMode = 'full',
): Promise<void> {
  const params = new URLSearchParams();
  if (options.isCombo !== undefined) params.set('isCombo', String(options.isCombo));
  if (options.isActive !== undefined) params.set('isActive', String(options.isActive));
  if (options.category && options.category !== 'all') params.set('category', options.category);
  params.set('mode', mode);
  return download(`/admin/products/export?${params.toString()}`, `products-${mode}.xlsx`);
}

export function downloadProductTemplate(mode: TransferMode = 'full'): Promise<void> {
  return download(`/admin/products/export/template?mode=${mode}`, `products-template-${mode}.xlsx`);
}

/**
 * `updateStock` is off unless the admin asks for it: a sheet exported last week
 * carries last week's stock, and importing it for a price change must not roll
 * every product's stock back to that.
 */
export function importProducts(
  file: File,
  dryRun = false,
  options: { updateStock?: boolean } = {},
): Promise<ImportResult> {
  return upload('/admin/products/import', file, dryRun, {
    updateStock: options.updateStock ? 'true' : undefined,
  });
}

// --- Categories -------------------------------------------------------------

export function exportCategories(): Promise<void> {
  return download('/categories/admin/export', 'categories.xlsx');
}

export function downloadCategoryTemplate(): Promise<void> {
  return download('/categories/admin/export/template', 'categories-template.xlsx');
}

export function importCategories(file: File, dryRun = false): Promise<ImportResult> {
  return upload('/categories/admin/import', file, dryRun);
}

// --- Inventory --------------------------------------------------------------

export function exportInventory(): Promise<void> {
  return download('/admin/inventory/export', 'inventory.xlsx');
}

export function exportStockMovements(params: Record<string, string | undefined> = {}): Promise<void> {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v && v !== 'all') as [string, string][],
  ).toString();
  return download(`/admin/inventory/movements/export${qs ? `?${qs}` : ''}`, 'stock-movements.xlsx');
}

// --- Collection points ------------------------------------------------------

export function exportDropPoints(parcelService?: string): Promise<void> {
  const qs = parcelService ? `?parcelService=${encodeURIComponent(parcelService)}` : '';
  return download(`/admin/delivery/points/export${qs}`, 'collection-points.xlsx');
}

export function downloadDropPointTemplate(): Promise<void> {
  return download('/admin/delivery/points/export/template', 'collection-points-template.xlsx');
}

/**
 * `parcelService` is the line chosen in the dialog, and it is a fallback, not
 * an override: a sheet that names the line per row keeps doing so, which is how
 * one file can carry several lines. It fills the gap for the common case — a
 * list handed over by one company, with no column saying whose it is.
 */
export function importDropPoints(
  file: File,
  dryRun = false,
  parcelService?: string,
): Promise<ImportResult & { newLines?: { slug: string; name: string }[] }> {
  return upload('/admin/delivery/points/import', file, dryRun, { parcelService });
}
