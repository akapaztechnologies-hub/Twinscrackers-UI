import type { Bill, BillItem, BillingMode } from '@/types/admin.ts';

/**
 * A price quotation — the document a customer is handed before they commit.
 *
 * Shaped like a Bill on purpose: everything that prints a bill takes a `Bill`,
 * and `quotationToBill` turns one of these into that shape so a quotation
 * prints through exactly the same path an invoice does. That is what stops a
 * wholesale quote coming out on the retail template.
 *
 * It carries the SAME number series as invoices (`AK-YYMM-#####`). A quotation
 * is issued with the number the invoice will have, and converting keeps it.
 */

export type QuotationStatus = 'open' | 'converted' | 'expired' | 'cancelled';

/**
 * The editable printed face of one quotation.
 *
 * The counterpart of `CaseInvoice` on a Bill. Everything here is either
 * presentational or an input to the totals — never a second copy of a figure
 * the quotation already holds.
 */
export interface QuotationLayout {
  /** The "No :" printed on the page. Editable; `quotationNumber` stays the key. */
  displayNumber: string;
  /** ISO date. */
  quotationDate: string;
  /** ISO date. Printed as "Valid until". */
  validUntil?: string;
  transport?: string;
  partyGstin?: string;
  partyState?: string;
  hsnCode?: string;
  taxKind: 'intra' | 'inter';
  /** Free text under the party block. */
  notes?: string;
  /** Overrides the template's standing terms, for this quotation only. */
  terms?: string;
  editedAt?: string;
  editedBy?: string;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  status: QuotationStatus;
  customerName?: string;
  customerPhone?: string;
  /** The customer record it was quoted to, when one was picked. */
  customer?: string;
  customerAddress?: string;
  customerGstin?: string;
  items: BillItem[];
  discountPercent: number;
  couponCode?: string;
  couponDiscount?: number;
  subtotal: number;
  totalDiscount: number;
  packagingFee: number;
  deliveryCharge?: number;
  courierDelivery?: boolean;
  salesperson?: string;
  taxableAmount: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst?: number;
  taxKind?: 'intra' | 'inter';
  billingMode?: BillingMode;
  totalCases?: number;
  gstMode?: 'percent' | 'flat';
  gstRate?: number;
  gstAmount?: number;
  grandTotal: number;
  roundOff: number;
  itemCount: number;
  totalQuantity: number;
  layout?: QuotationLayout;
  convertedBill?: string;
  convertedAt?: string;
  createdBy: string;
  editedAt?: string;
  editedBy?: string;
  createdAt: string;
}

/**
 * Read a quotation as the Bill the printers expect.
 *
 * Every document helper in the app — `billDocument.ts`, `BillPDF`,
 * `WholesaleCaseInvoicePDF`, the preview modal — takes a `Bill`. Rather than
 * teaching each of them about a second shape, a quotation is presented as one
 * here, once. `billingMode` survives the trip, which is the whole reason a
 * wholesale-case quotation now prints on the case pad instead of the retail
 * tax invoice.
 *
 * The `payment` block is a stub: a quotation has taken no money, and nothing
 * that prints an estimate reads it.
 */
/**
 * What THIS quotation says about itself, for the printed page.
 *
 * The rest of the quotation stationery — the boxed title, the standing terms,
 * the "not a tax invoice" line — is the same on every quotation and comes from
 * Content → Quotation Template. Only these two are per-quotation, so only these
 * two travel with it. Anything left undefined keeps the template's answer.
 */
export function quotationEstimate(q: Quotation): { validUntil?: string; terms?: string } {
  return {
    validUntil: q.layout?.validUntil,
    terms: q.layout?.terms,
  };
}

export function quotationToBill(q: Quotation): Bill {
  return {
    id: q.id,
    billNumber: q.layout?.displayNumber || q.quotationNumber,
    status: 'completed',
    customerName: q.customerName,
    customerPhone: q.customerPhone,
    customerAddress: q.customerAddress,
    items: q.items,
    discountPercent: q.discountPercent,
    subtotal: q.subtotal,
    totalDiscount: q.totalDiscount,
    packagingFee: q.packagingFee,
    deliveryCharge: q.deliveryCharge,
    courierDelivery: q.courierDelivery,
    salesperson: q.salesperson,
    taxableAmount: q.taxableAmount,
    totalCgst: q.totalCgst,
    totalSgst: q.totalSgst,
    totalIgst: q.totalIgst,
    taxKind: q.taxKind,
    billingMode: q.billingMode,
    totalCases: q.totalCases,
    // The case pad reads its party block and its "No :" from here, so the
    // quotation's own editable layout is handed straight to it.
    caseInvoice: q.layout
      ? {
          displayNumber: q.layout.displayNumber,
          invoiceDate: q.layout.quotationDate,
          transport: q.layout.transport,
          partyGstin: q.layout.partyGstin,
          partyState: q.layout.partyState,
          hsnCode: q.layout.hsnCode,
          taxKind: q.layout.taxKind,
          notes: q.layout.notes,
        }
      : undefined,
    gstMode: q.gstMode,
    gstRate: q.gstRate,
    gstAmount: q.gstAmount,
    grandTotal: q.grandTotal,
    roundOff: q.roundOff,
    payment: { method: 'cash', amount: 0 },
    itemCount: q.itemCount,
    totalQuantity: q.totalQuantity,
    couponCode: q.couponCode,
    couponDiscount: q.couponDiscount,
    createdAt: q.createdAt,
    createdBy: q.createdBy,
  };
}
