import { DEFAULT_LETTERHEAD, type InvoiceLetterhead } from '@/types/invoiceLetterhead.ts';

/**
 * The quotation's pre-printed stationery.
 *
 * Two separate editable things, exactly as the wholesale pad splits them, and
 * confusing the two is the mistake to avoid:
 *
 *  - `QuotationTemplate` (here) is what is identical on EVERY quotation — the
 *    letterhead, the standing terms, the default validity, the wording of the
 *    title. It lives in the `Content` collection under `quotation-template` and
 *    is edited once, in Settings → Quotation Template.
 *
 *  - `QuotationLayout` (in `quotation.ts`) is what is filled into that
 *    stationery for ONE quotation — its number, date, party, transport, notes.
 *    It is edited per quotation and stored on the quotation itself.
 *
 * The letterhead half is shared with the tax invoice and the wholesale pad, so
 * the shop keeps one address and one GSTIN rather than three that drift.
 */
export interface QuotationTemplate extends InvoiceLetterhead {
  /** How many days a new quotation stands for, unless the counter says otherwise. */
  validityDays: number;
  /** The standing terms printed under the totals. Overridable per quotation. */
  terms: string;
  hsnCode: string;
  /** Ruled rows in the grid, filled with blanks so the sheet always looks full. */
  rowCount: number;
  /** Bottom-right, above the signatory line. */
  forLabel: string;
  signatoryLabel: string;
  /**
   * Printed across the page so nobody mistakes a quotation for an invoice.
   * A quotation that reads like a tax invoice is the one way this document can
   * cause the shop real trouble, so the wording is explicit and on by default.
   */
  showEstimateNotice: boolean;
  estimateNotice: string;
  /** Wording of the tax note in the totals stack. */
  eoeLabel: string;
}

export const DEFAULT_QUOTATION_TEMPLATE: QuotationTemplate = {
  ...DEFAULT_LETTERHEAD,
  docTitle: 'QUOTATION',
  validityDays: 15,
  terms: 'Prices are subject to availability. Goods once sold will not be taken back.',
  hsnCode: '3604',
  rowCount: 13,
  forLabel: '',
  signatoryLabel: 'Partner',
  showEstimateNotice: true,
  estimateNotice: 'This is a quotation / estimate only — not a tax invoice.',
  eoeLabel: 'E.&O.E.',
};
