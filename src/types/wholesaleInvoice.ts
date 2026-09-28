import { DEFAULT_LETTERHEAD, type InvoiceLetterhead } from '@/types/invoiceLetterhead.ts';

/**
 * The wholesale full-case invoice.
 *
 * The letterhead half of this — shop name, GSTIN, emblems, the Tamil lines —
 * is shared with the regular tax invoice; see `InvoiceLetterhead`. What stays
 * here is what only the ruled pad has.
 *
 * Two separate things are editable and they must not be confused:
 *
 *  - `WholesaleInvoiceTemplate` is the pre-printed stationery — the parts that
 *    are identical on every copy (shop name, GSTIN, the Tamil invocation lines,
 *    the emblems, how many ruled rows the grid has). It lives in the `Content`
 *    collection under `wholesale-invoice-template` and is edited once, in
 *    Content -> Wholesale Invoice.
 *
 *  - `CaseInvoiceDraft` is what gets written into that stationery for one sale.
 *    It is edited per invoice and saved onto the Bill.
 */

export interface WholesaleInvoiceTemplate extends InvoiceLetterhead {
  hsnCode: string;
  /** Ruled rows in the grid, filled with blanks so the sheet always looks full. */
  rowCount: number;
  /** Bottom-right, above the signatory line. */
  forLabel: string;
  signatoryLabel: string;
  showIgstRow: boolean;
  /** Wording of the tax note in the totals stack. */
  eoeLabel: string;
  /**
   * The conditions printed bottom-left, one per line. Free text because the
   * jurisdiction and the interest rate are the shop's to state.
   */
  terms: string;
  /** The two signing slots beneath the terms. Blank hides one. */
  checkedByLabel: string;
  preparedByLabel: string;
}

export const DEFAULT_WHOLESALE_TEMPLATE: WholesaleInvoiceTemplate = {
  ...DEFAULT_LETTERHEAD,
  hsnCode: '3604',
  rowCount: 13,
  forLabel: '',
  signatoryLabel: 'Partner',
  showIgstRow: true,
  eoeLabel: 'E.&O.E.',
  terms: [
    'Goods once sold cannot be taken back',
    'Interest @24% per annum on bills not paid on date',
    'Subject to Sivakasi Jurisdiction only',
  ].join('\n'),
  checkedByLabel: 'Checked by',
  preparedByLabel: 'Prepared by',
};

/** One printed line of the grid. */
export interface CaseInvoiceLine {
  productId?: string;
  /**
   * What goes in the "No. of Cases" column — free text, because the pad takes a
   * range ("15 to 30") as readily as a count. Absent on the shop's own invoice,
   * which prints no such column.
   */
  caseLabel?: string;
  /** The PARTICULARS cell. Free text — an admin may retype what the catalogue called it. */
  name: string;
  /** Number of full cases (or pieces, if the line was switched to piece billing). */
  quantity: number;
  /** The "Rate Per Case" cell. */
  unitPrice: number;
  unit: 'piece' | 'case';
  piecesPerCase?: number;
}

/** Everything the admin can change about one printed invoice. */
export interface CaseInvoiceDraft {
  displayNumber: string;
  /** yyyy-mm-dd, as the date input holds it. */
  invoiceDate: string;
  customerName: string;
  customerAddress: string;
  customerState: string;
  partyGstin: string;
  transport: string;
  /**
   * The carrier's own reference, printed on its own line beside the name.
   * Absent on the shop's pad, which only ever names the parcel service.
   */
  transportId?: string;
  hsnCode: string;
  lines: CaseInvoiceLine[];
  discountPercent: number;
  gstRate: number;
  /** 'inter' prints IGST in place of CGST+SGST. */
  taxKind: 'intra' | 'inter';
  deliveryCharge: number;
  /** Blank means "use the derived round-off"; a number overrides it. */
  manualRoundOff: string;
  notes: string;
}
