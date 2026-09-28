/**
 * The pre-printed letterhead — the part of an invoice that is identical on
 * every copy: the shop's name and address, its GSTIN and licence, the Tamil
 * invocation lines, the deity emblems and the boxed document title.
 *
 * Shared because the shop has ONE letterhead. It was first written for the
 * wholesale full-case pad; the regular tax invoice (retail and wholesale
 * per-piece) now prints the same head, and a second copy of these thirteen
 * fields would be a second thing to keep in step every time the shop changes
 * a phone number.
 *
 * `WholesaleInvoiceTemplate` extends this, so the wholesale pad's stored
 * document is unchanged — it already held exactly these keys.
 */
export interface InvoiceLetterhead {
  /** Ink colour for every rule and every word. The reference pad is blue. */
  inkColor: string;
  /** Printed top-left, above the licence number. The shop's own GSTIN. */
  headerGstin: string;
  licenseNo: string;
  cellNumber: string;
  /** The two devotional lines centred above the title. Blank lines are skipped. */
  tamilLine1: string;
  tamilLine2: string;
  /** Boxed above the shop name. */
  docTitle: string;
  shopName: string;
  addressLine1: string;
  addressLine2: string;
  /**
   * The line of business, printed as a filled band under the address — the
   * ribbon the reference pad carries. Blank prints no band at all.
   */
  tagline: string;
  /** Any common format — converted for the PDF by `preparePdfImages`. */
  leftEmblemUrl: string;
  rightEmblemUrl: string;
  /**
   * Height of each emblem, in points. Width follows from the image's own aspect
   * ratio, so a portrait deity is not squashed into a square.
   */
  emblemSize: number;
}

export const DEFAULT_LETTERHEAD: InvoiceLetterhead = {
  inkColor: '#1D4ED8',
  headerGstin: '',
  licenseNo: '',
  cellNumber: '',
  tamilLine1: '',
  tamilLine2: '',
  docTitle: 'TAX INVOICE',
  shopName: '',
  addressLine1: '',
  addressLine2: '',
  tagline: '',
  leftEmblemUrl: '',
  rightEmblemUrl: '',
  emblemSize: 64,
};

/** The keys that make up a letterhead, for copying one document's head to another. */
export const LETTERHEAD_KEYS = Object.keys(DEFAULT_LETTERHEAD) as (keyof InvoiceLetterhead)[];

/**
 * Pull just the letterhead out of a wider template (or a partial one), filling
 * anything absent from the defaults. Used by "copy from the wholesale invoice"
 * and by every render, so a template saved before these fields existed still
 * produces a complete head instead of `undefined` in the middle of the page.
 */
export function toLetterhead(source: Partial<InvoiceLetterhead> | null | undefined): InvoiceLetterhead {
  const out = { ...DEFAULT_LETTERHEAD };
  if (!source) return out;
  for (const key of LETTERHEAD_KEYS) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
