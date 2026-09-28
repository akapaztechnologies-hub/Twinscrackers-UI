/**
 * Storefront enquiries — the contact form and the bulk-order quote request.
 *
 * Both live in one collection on the server, selected with `?type=`, and are
 * presented as two admin screens. The two `submit*` calls are the only ones a
 * signed-out visitor makes; everything else is admin-only.
 */
import api from '@/lib/api.ts';
import type {
  Enquiry,
  EnquiryListResult,
  EnquiryPatch,
  EnquiryStats,
  EnquiryStatus,
  EnquiryType,
} from '@/types/admin.ts';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function mapEnquiry(e: Record<string, unknown>): Enquiry {
  // `handledBy` arrives populated ({ displayName, email }) or as a bare id when
  // the admin account has since been removed. Flatten to the one thing the UI
  // shows, so neither shape reaches a component.
  const handledBy = e.handledBy as Record<string, unknown> | string | null | undefined;
  const handledByName =
    handledBy && typeof handledBy === 'object'
      ? str(handledBy.displayName) || str(handledBy.email)
      : '';

  return {
    id: (e._id || e.id) as string,
    type: (e.type as EnquiryType) || 'contact',
    name: str(e.name),
    email: str(e.email),
    phone: str(e.phone),
    message: str(e.message),
    subject: str(e.subject),
    company: str(e.company),
    eventType: str(e.eventType),
    budget: str(e.budget),
    quotedAmount: Number(e.quotedAmount) || 0,
    status: (str(e.status) || 'new') as EnquiryStatus,
    adminNotes: str(e.adminNotes),
    handledByName,
    handledAt: str(e.handledAt),
    createdAt: str(e.createdAt),
    updatedAt: str(e.updatedAt),
  };
}

// ─── Public (storefront forms) ───────────────────────────────────────────────

export interface ContactSubmission {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  /**
   * Honeypot. Rendered off-screen and left empty by every real visitor; the
   * server files anything that arrives with it filled in as spam.
   */
  fx_ref?: string;
}

export interface BulkSubmission {
  name: string;
  email: string;
  phone: string;
  company?: string;
  eventType?: string;
  budget?: string;
  message?: string;
  fx_ref?: string;
}

export async function submitContactEnquiry(input: ContactSubmission): Promise<void> {
  await api.post('/enquiries/contact', input);
}

export async function submitBulkEnquiry(input: BulkSubmission): Promise<void> {
  await api.post('/enquiries/bulk', input);
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface EnquiryQuery {
  type: EnquiryType;
  status?: string;
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export async function getEnquiries(query: EnquiryQuery): Promise<EnquiryListResult> {
  const params: Record<string, string> = { type: query.type };
  // 'all' is the list screen's own word for "no filter" — it must not travel to
  // the server, which would read it as a status nothing matches.
  if (query.status && query.status !== 'all') params.status = query.status;
  if (query.search?.trim()) params.search = query.search.trim();
  if (query.sort) params.sort = query.sort;
  if (query.page) params.page = String(query.page);
  if (query.limit) params.limit = String(query.limit);

  const res: Record<string, unknown> = await api.get(
    `/admin/enquiries?${new URLSearchParams(params).toString()}`,
  );
  const rows = Array.isArray(res?.data) ? (res.data as Record<string, unknown>[]) : [];
  return {
    data: rows.map(mapEnquiry),
    total: Number(res?.total) || 0,
    page: Number(res?.page) || 1,
    totalPages: Number(res?.totalPages) || 1,
    hasMore: Boolean(res?.hasMore),
  };
}

export async function getEnquiryStats(type: EnquiryType): Promise<EnquiryStats> {
  const res: Record<string, unknown> = await api.get(`/admin/enquiries/stats?type=${type}`);
  return {
    total: Number(res?.total) || 0,
    thisWeek: Number(res?.thisWeek) || 0,
    wonValue: Number(res?.wonValue) || 0,
    byStatus: (res?.byStatus as Record<string, number>) || {},
  };
}

export async function updateEnquiry(id: string, patch: EnquiryPatch): Promise<Enquiry> {
  const e: Record<string, unknown> = await api.patch(`/admin/enquiries/${id}`, patch);
  return mapEnquiry(e);
}

export async function deleteEnquiry(id: string): Promise<void> {
  await api.delete(`/admin/enquiries/${id}`);
}

/**
 * Read a display label out of one of the ENQUIRY_*_LABEL maps, falling back to a
 * prettified version of the raw value.
 *
 * The fallback matters: the contact page's subject options are admin-editable
 * content, so a shop that adds "Franchise enquiry" would otherwise see the bare
 * slug `franchise-enquiry` on every row of the list.
 */
export function enquiryLabel(map: Record<string, string>, value: string): string {
  if (!value) return '';
  if (map[value]) return map[value];
  const words = value.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

/**
 * Join the offers list.
 *
 * The footer form used to set a "subscribed" flag in React state and throw the
 * address away — no request, nothing stored. This is that form doing what it
 * has always claimed to do.
 */
export async function subscribeToNewsletter(email: string, source = 'footer'): Promise<void> {
  await api.post('/newsletter/subscribe', { email, source, fx_ref: '' });
}
