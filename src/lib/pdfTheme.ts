/** Shared presentation helpers for the invoice/order PDF templates (OrderPDF, BillPDF). */

/**
 * The website printed on a document, without its scheme or trailing slash.
 *
 * Prefers what the admin typed in Content → Invoice / PDF so the printed
 * address can be changed without a redeploy, and falls back to the canonical
 * site URL from Site Settings. Returns '' when neither is set, and callers omit
 * the line rather than printing a dangling separator.
 */
export function pdfWebsite(website: string | undefined, siteUrl: string | undefined): string {
  return (website || siteUrl || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

/** Join the header/footer bits that are actually present, so a blank one leaves no ' | '. */
export function pdfJoin(parts: (string | undefined)[], separator = '  |  '): string {
  return parts.map((p) => (p || '').trim()).filter(Boolean).join(separator);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const h = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(h || 'B91C1C', 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('');
}

function mix(hex: string, target: [number, number, number], amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r + (target[0] - r) * amount, g + (target[1] - g) * amount, b + (target[2] - b) * amount]);
}

export const lighten = (hex: string, amount: number) => mix(hex, [255, 255, 255], amount);
const darken = (hex: string, amount: number) => mix(hex, [0, 0, 0], amount);

export interface PdfColors {
  primary: string;
  /** Tagline text sitting directly on the primary-colored header band. */
  primaryTintStrong: string;
  /** Address/contact/meta text sitting on the primary-colored header band — lighter than the tagline. */
  primaryTintSoft: string;
  /** Deep shade of the accent, used for the amount-in-words band. */
  primaryDeep: string;
  dark: string;
  text: string;
  muted: string;
  light: string;
  border: string;
  white: string;
}

/** Derive the full PDF color set from a single admin-chosen accent color. */
export function buildPdfColors(accentColor: string | undefined): PdfColors {
  const primary = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accentColor || '') ? (accentColor as string) : '#B91C1C';
  return {
    primary,
    primaryTintStrong: lighten(primary, 0.55),
    primaryTintSoft: lighten(primary, 0.7),
    primaryDeep: darken(primary, 0.4),
    dark: '#1F2937',
    text: '#374151',
    muted: '#6B7280',
    light: '#F9FAFB',
    border: '#E5E7EB',
    white: '#FFFFFF',
  };
}
