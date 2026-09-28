/**
 * Collection points — where a customer picks their parcel up.
 *
 * Fireworks are Class 1 explosives and cannot be couriered to a door, so every
 * online order ends at a transport line's branch office. This lets the customer
 * choose that office at checkout, from the ones actually near them, instead of
 * finding out by phone call after the order.
 *
 * The shop turns the whole thing on and off in Settings → Checkout; `suggest`
 * reports that alongside the results so the checkout page needs one call to
 * know whether to render the step at all.
 */
import api from '@/lib/api.ts';
import type { PaginatedResult } from '@/types/admin.ts';

export interface DropPoint {
  id: string;
  name: string;
  address: string;
  area?: string;
  city: string;
  district?: string;
  state: string;
  pincode: string;
  /** The branch's own number. On collection day this is who the customer rings. */
  phone?: string;
  /** These offices run on names — "ask for Ramesh" — not on ticket numbers. */
  contactPerson?: string;
  landmark?: string;
}

export interface ParcelServiceSummary {
  id: string;
  slug: string;
  name: string;
  trackingMode: 'auto' | 'deeplink' | 'manual';
  note?: string;
  /** Only on the admin list; the public one returns active lines alone. */
  isActive?: boolean;
  trackUrl?: string;
  phone?: string;
  sortOrder?: number;
}

/** How closely the suggestions matched — used to label the group on screen. */
export type MatchLevel = 'pincode' | 'city' | 'district' | 'state';

export interface DropPointSuggestion {
  /** False when the shop has the feature switched off — render nothing. */
  enabled: boolean;
  /** False lets the customer skip choosing; the shop picks a line later. */
  required: boolean;
  matchLevel: MatchLevel | null;
  /** "In your area", "In your city", … Absent when nothing was found. */
  label?: string;
  /**
   * One group per transport line, closest first.
   *
   * Each carries its OWN match level, because each line widens independently:
   * a line whose branch list has pincodes can match "In your area" while one
   * that only has city names matches "In your city" for the same customer.
   * Reporting a single level for all of them would be a lie about one of them.
   */
  groups: {
    service: ParcelServiceSummary;
    matchLevel: MatchLevel;
    label: string;
    points: DropPoint[];
  }[];
}

/**
 * Offices near this address, grouped by transport line.
 *
 * Widens pincode → city → district → state server-side and stops at the first
 * level that finds anything, so what comes back is the closest set available
 * rather than everything in the state mixed together.
 *
 * An empty `groups` with `enabled: true` is a real answer, not an error: the
 * shop has no line serving that address, and the checkout says so and lets the
 * order through anyway.
 */
export async function suggestDropPoints(address: {
  pincode?: string;
  city?: string;
  district?: string;
  state?: string;
}): Promise<DropPointSuggestion> {
  const params: Record<string, string> = {};
  if (address.pincode?.trim()) params.pincode = address.pincode.trim();
  if (address.city?.trim()) params.city = address.city.trim();
  if (address.district?.trim()) params.district = address.district.trim();
  if (address.state?.trim()) params.state = address.state.trim();

  return (await api.get('/delivery/suggest', { params })) as DropPointSuggestion;
}

// =====================
// ADMIN
// =====================

export interface AdminDropPoint extends DropPoint {
  parcelService: { _id: string; name: string; slug: string } | string;
  /** 'import' rows came from a published branch list; 'manual' were typed in. */
  source: 'import' | 'manual';
  /** True once an admin has edited it, which pins it against a re-import. */
  editedByAdmin: boolean;
  isActive: boolean;
}

export interface DropPointListParams {
  page?: number;
  limit?: number;
  search?: string;
  parcelService?: string;
  state?: string;
  city?: string;
}

export async function getDropPoints(options: DropPointListParams = {}): Promise<PaginatedResult<AdminDropPoint>> {
  const params: Record<string, string | number> = {};
  if (options.page) params.page = options.page;
  if (options.limit) params.limit = options.limit;
  if (options.search?.trim()) params.search = options.search.trim();
  if (options.parcelService) params.parcelService = options.parcelService;
  if (options.state) params.state = options.state;
  if (options.city) params.city = options.city;

  const result: Record<string, unknown> = await api.get('/admin/delivery/points', { params });
  const rows = (result.data ?? []) as Record<string, unknown>[];
  const pagination = (result.pagination ?? {}) as Record<string, number>;
  return {
    data: rows.map((r) => ({ ...r, id: (r._id || r.id) as string })) as unknown as AdminDropPoint[],
    total: pagination.total ?? rows.length,
    hasMore: (pagination.page ?? 1) < (pagination.pages ?? 1),
    page: pagination.page,
    totalPages: pagination.pages,
  };
}

export interface DropPointStats {
  total: number;
  active: number;
  services: number;
  states: number;
}

export async function getDropPointStats(): Promise<DropPointStats> {
  return (await api.get('/admin/delivery/points/stats')) as DropPointStats;
}

export async function getParcelServices(includeInactive = false): Promise<ParcelServiceSummary[]> {
  const rows = (await api.get(
    includeInactive ? '/admin/delivery/services' : '/delivery/services',
  )) as Record<string, unknown>[];
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    ...r,
    id: (r._id || r.id) as string,
  })) as unknown as ParcelServiceSummary[];
}

export interface ParcelServiceInput {
  name?: string;
  phone?: string;
  /** The line's own tracking page. Blank for a line that publishes none. */
  trackUrl?: string;
  isActive?: boolean;
}

/** Add a transport line. Its key is made from the name and never changes. */
export async function createParcelService(input: ParcelServiceInput): Promise<void> {
  await api.post('/admin/delivery/services', input);
}

export async function updateParcelService(id: string, input: ParcelServiceInput): Promise<void> {
  await api.patch(`/admin/delivery/services/${id}`, input);
}

/** Refused by the server while the line still has collection points. */
export async function deleteParcelService(id: string): Promise<void> {
  await api.delete(`/admin/delivery/services/${id}`);
}

/** Add the common Sivakasi lines the shop does not have yet. Returns how many were added. */
export async function addStandardParcelServices(): Promise<number> {
  const result = (await api.post('/admin/delivery/services/standard')) as { created?: number };
  return result?.created ?? 0;
}

export type DropPointInput = Partial<Omit<DropPoint, 'id'>> & {
  parcelService?: string;
  isActive?: boolean;
  /* Carried when a branch list happens to include coordinates. Nothing sorts by
     distance yet — these lists give a pincode and a city and little else — but
     throwing the numbers away on import would mean asking for the file again. */
  lat?: number;
  lng?: number;
};

export async function createDropPoint(input: DropPointInput): Promise<AdminDropPoint> {
  return (await api.post('/admin/delivery/points', input)) as AdminDropPoint;
}

export async function updateDropPoint(id: string, input: DropPointInput): Promise<AdminDropPoint> {
  return (await api.patch(`/admin/delivery/points/${id}`, input)) as AdminDropPoint;
}

export async function deleteDropPoint(id: string): Promise<void> {
  await api.delete(`/admin/delivery/points/${id}`);
}

/**
 * Bulk load branches — from a spreadsheet file.
 *
 * The import route takes an uploaded .xlsx/.csv (multipart `file`), not a JSON
 * array of rows; the upload lives with the other spreadsheet transfers and is
 * re-exported here so there is one way to call it. Rows the admin has edited
 * are left untouched, so taking an updated list from a transport line never
 * undoes the shop's own corrections.
 */
export { importDropPoints } from '@/services/transfer.ts';
