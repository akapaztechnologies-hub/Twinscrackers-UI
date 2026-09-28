/**
 * GSTIN parsing and validation, shared by the customer module and anything that
 * prints a tax invoice.
 *
 * Mirrored verbatim from the backend at `src/utils/gstin.ts` so the counter form
 * rejects a bad number before it is typed into a bill, and the server rejects it
 * again for anything that does not come through that form. Keep the two in sync.
 */

/** 22AAAAA0000A1Z5 — state code, PAN, entity code, fixed 'Z', checksum. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const CHECKSUM_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * The 15th character is a mod-36 check digit over the first 14.
 *
 * Worth computing rather than trusting the pattern alone: the shapes that a
 * regex accepts but the checksum rejects are exactly the ones a human produces
 * — a transposed pair of PAN characters, or one digit mistyped. Those would
 * otherwise reach a printed tax invoice and be wrong on the customer's return.
 */
export function gstinChecksumChar(first14: string): string | null {
  if (first14.length !== 14) return null;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHECKSUM_ALPHABET.indexOf(first14[i]);
    if (value < 0) return null;
    // Alternating weights 1,2,1,2… then fold anything >= 36 back into range.
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHECKSUM_ALPHABET[(36 - (sum % 36)) % 36];
}

/** Uppercased with every space and dash removed — how a GSTIN is always stored. */
export function normalizeGstin(value: string | undefined | null): string {
  return (value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function isValidGstin(value: string | undefined | null): boolean {
  const gstin = normalizeGstin(value);
  if (!GSTIN_PATTERN.test(gstin)) return false;
  return gstinChecksumChar(gstin.slice(0, 14)) === gstin[14];
}

/** GST state codes, used to fill in State and to decide CGST+SGST vs IGST. */
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh',
  '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
};

export function gstinStateCode(value: string | undefined | null): string {
  return normalizeGstin(value).slice(0, 2);
}

export function gstinStateName(value: string | undefined | null): string {
  return GST_STATE_CODES[gstinStateCode(value)] ?? '';
}

/**
 * Which tax split applies. Same state as the seller means CGST+SGST; anywhere
 * else means IGST — the reason the case invoice prints all three rows and fills
 * in only the pair that applies.
 *
 * An unreadable or missing buyer GSTIN falls back to 'intra': an unregistered
 * walk-in wholesale buyer is a local sale, and CGST+SGST is what the shop has
 * always printed.
 */
export function taxKindFor(
  sellerGstin: string | undefined | null,
  buyerGstin: string | undefined | null,
): 'intra' | 'inter' {
  const seller = gstinStateCode(sellerGstin);
  const buyer = gstinStateCode(buyerGstin);
  if (!seller || !buyer) return 'intra';
  return seller === buyer ? 'intra' : 'inter';
}

/** Customer types the shop must hold a GSTIN for before a tax invoice is raised. */
export const GSTIN_REQUIRED_TYPES = ['wholesale'];
