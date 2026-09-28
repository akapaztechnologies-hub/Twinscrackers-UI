import type { Bill } from '@/types/admin.ts';
import type { CaseInvoiceDraft } from '@/types/wholesaleInvoice.ts';
import { computeBillTotals, type PricedLine, type PricingResult } from '@/lib/billMath.ts';

/**
 * The money a saved bill carries that the pad itself has no box for.
 *
 * The pad used to re-price every invoice as "percent GST at `gstRate`, no
 * coupon, derived round-off". None of those held for a real bill: the counter
 * enters GST as a flat rupee figure by default (so `gstRate` is only a derived,
 * two-decimal display figure), a coupon may have come off, and an admin may
 * have typed a round-off. The printed grand total then disagreed with the one
 * the Monthly Report adds up — and saving the pad rewrote the bill as percent
 * GST, moving its total for an edit that only changed the transport name.
 *
 * Carried through the draft so the pad prices exactly what the server stored.
 * Optional, so a draft built by hand (the template preview) still type-checks
 * and prices as it always did.
 */
export interface CaseDraftMoney {
  /** How the GST was entered. A flat bill keeps its typed rupee figure. */
  gstMode?: 'percent' | 'flat';
  /** The typed GST in rupees, when `gstMode` is 'flat'. */
  gstAmount?: number;
  /** Rupees the bill's coupon took off. Not editable here — the server keeps it. */
  couponDiscount?: number;
  /** Legacy per-bill packaging fee; the counter no longer charges one. */
  packagingFee?: number;
  /**
   * The figures to print as they were SAVED, when reprinting a bill or a
   * quotation untouched. Set only by `billDocument` — never by the editor, whose
   * whole job is to preview a change — so a reprint carries exactly the totals
   * on the record even for a bill priced by older rounding rules.
   */
  savedFigures?: CaseDraftFigures;
}

export type CaseDraft = CaseInvoiceDraft & CaseDraftMoney;

/** Every money figure the pad prints. */
export interface CaseDraftFigures {
  taxableAmount: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  packagingFee: number;
  deliveryCharge: number;
  roundOff: number;
  grandTotal: number;
  /** The Amount column: taxable value per priced line, in the draft's line order. */
  lineAmounts: number[];
}

/**
 * A figure set's tax, printed under the split the page says.
 *
 * The split is presentation — the same rupees either way — and a quotation's
 * layout can be switched after it was priced without re-pricing it. Printing
 * the stored CGST+SGST under an "IGST" heading would show IGST as nil.
 */
function underSplit(f: CaseDraftFigures, taxKind: 'intra' | 'inter'): CaseDraftFigures {
  const tax = f.totalCgst + f.totalSgst + f.totalIgst;
  return taxKind === 'inter'
    ? { ...f, totalCgst: 0, totalSgst: 0, totalIgst: tax }
    : { ...f, totalCgst: tax / 2, totalSgst: tax / 2, totalIgst: 0 };
}

/** The figures a saved bill (or a quotation read as one) actually carries. */
export function billFigures(bill: Bill, taxKind: 'intra' | 'inter'): CaseDraftFigures {
  return underSplit(
    {
      // Rows from before the field was stored have none; it is what is left of
      // the subtotal after the discount and the coupon.
      taxableAmount: bill.taxableAmount ?? bill.subtotal - (bill.totalDiscount ?? 0) - (bill.couponDiscount ?? 0),
      totalCgst: bill.totalCgst ?? 0,
      totalSgst: bill.totalSgst ?? 0,
      totalIgst: bill.totalIgst ?? 0,
      packagingFee: bill.packagingFee ?? 0,
      deliveryCharge: bill.deliveryCharge ?? 0,
      roundOff: bill.roundOff ?? 0,
      grandTotal: bill.grandTotal,
      lineAmounts: bill.items.filter(isPricedLine).map((it) => it.taxableValue ?? it.unitPrice * it.quantity),
    },
    taxKind,
  );
}

/** What the pad prints: the saved figures on an untouched reprint, else the draft priced live. */
export function draftFigures(draft: CaseDraft): CaseDraftFigures {
  if (draft.savedFigures) return draft.savedFigures;
  const { totals } = caseDraftTotals(draft);
  return {
    taxableAmount: totals.taxableAmount,
    totalCgst: totals.totalCgst,
    totalSgst: totals.totalSgst,
    totalIgst: totals.totalIgst,
    packagingFee: draft.packagingFee ?? 0,
    deliveryCharge: totals.deliveryCharge,
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal,
    lineAmounts: totals.lines.map((l) => l.taxableValue),
  };
}

/** A line the server will price: a description and a quantity. Anything else is a row being filled in. */
export function isPricedLine(line: { name?: string; quantity: number }): boolean {
  return Boolean(line.name?.trim()) && line.quantity > 0;
}

/** Blank means "use the derived round-off"; anything else is the admin's figure. */
function roundOffInput(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Price a draft exactly as the server will price it on save.
 *
 * Only the lines `draftToUpdatePayload` sends are priced, so a coupon's
 * remainder lands on the same line it will on the server. `lineFor` maps a
 * draft row back to its priced line, or undefined for a row that is not sent.
 */
export function caseDraftTotals(draft: CaseDraft): {
  totals: PricingResult;
  lineFor: (index: number) => PricedLine | undefined;
} {
  const pricedIndexes: number[] = [];
  draft.lines.forEach((line, index) => {
    if (isPricedLine(line)) pricedIndexes.push(index);
  });

  const totals = computeBillTotals({
    lines: pricedIndexes.map((i) => ({ unitPrice: draft.lines[i].unitPrice, quantity: draft.lines[i].quantity })),
    discountPercent: draft.discountPercent,
    couponDiscount: draft.couponDiscount ?? 0,
    packagingFee: draft.packagingFee ?? 0,
    deliveryCharge: draft.deliveryCharge,
    gst:
      draft.gstMode === 'flat'
        ? { mode: 'flat', amount: draft.gstAmount ?? 0 }
        : { mode: 'percent', rate: draft.gstRate },
    taxKind: draft.taxKind,
    manualRoundOff: roundOffInput(draft.manualRoundOff),
  });

  const byIndex = new Map(pricedIndexes.map((draftIndex, k) => [draftIndex, totals.lines[k]]));
  return { totals, lineFor: (index) => byIndex.get(index) };
}

/**
 * Read a saved bill back into the editable draft the invoice editor works on.
 *
 * The one place that decides what "editing this invoice" starts from, so the
 * editor, the reprint and the POS confirmation all open the same document.
 *
 * A line's PARTICULARS text comes straight off the bill item. `updateCaseInvoice`
 * writes whatever the admin typed back onto `items[].name`, so a description
 * retyped on an invoice that has been handed to a customer reprints as printed
 * without a second copy of the same string to drift out of step.
 */
export function billToCaseDraft(bill: Bill): CaseDraft {
  const inv = bill.caseInvoice;

  const draft: CaseDraft = {
    displayNumber: inv?.displayNumber || bill.billNumber,
    invoiceDate: toDateInput(inv?.invoiceDate || bill.createdAt),
    customerName: bill.customerName ?? '',
    customerAddress: bill.customerAddress ?? '',
    customerState: inv?.partyState ?? '',
    partyGstin: inv?.partyGstin ?? '',
    transport: inv?.transport ?? '',
    hsnCode: inv?.hsnCode ?? '',
    lines: bill.items.map((item) => ({
      productId: item.productId || undefined,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unit: item.unit ?? 'case',
      piecesPerCase: item.piecesPerCase,
    })),
    discountPercent: bill.discountPercent ?? 0,
    gstRate: bill.gstRate ?? 18,
    gstMode: bill.gstMode ?? 'percent',
    gstAmount: bill.gstAmount,
    couponDiscount: bill.couponDiscount ?? 0,
    packagingFee: bill.packagingFee ?? 0,
    taxKind: inv?.taxKind ?? bill.taxKind ?? ((bill.totalIgst ?? 0) > 0 ? 'inter' : 'intra'),
    deliveryCharge: bill.deliveryCharge ?? 0,
    manualRoundOff: '',
    notes: inv?.notes ?? '',
  };

  draft.manualRoundOff = storedManualRoundOff(bill, draft);
  return draft;
}

/**
 * The round-off the admin typed on this bill, or '' when it was derived.
 *
 * Left blank for a derived one, so the editor keeps re-deriving it — a saved
 * derived figure fed back as an override would stop tracking the lines it is
 * supposed to balance. But a round-off the admin DID type used to be dropped
 * the same way, so every reprint printed a different grand total from the one
 * saved. The server's own flag wins when it sends one; otherwise the stored
 * figure counts as typed exactly when deriving misses the stored total and the
 * stored round-off hits it.
 */
function storedManualRoundOff(bill: Bill, draft: CaseDraft): string {
  const flagged = bill.manualRoundOff;
  if (typeof flagged === 'number' && Number.isFinite(flagged)) return String(flagged);
  if (flagged === null) return '';

  const derived = caseDraftTotals(draft).totals;
  if (Math.abs(derived.grandTotal - bill.grandTotal) < 0.005) return '';
  const typed = caseDraftTotals({ ...draft, manualRoundOff: String(bill.roundOff ?? 0) }).totals;
  return Math.abs(typed.grandTotal - bill.grandTotal) < 0.005 ? String(bill.roundOff ?? 0) : '';
}

/**
 * The payload `updateCaseInvoice` expects, built from a draft.
 *
 * GST goes back in the mode it came in — flat stays flat at the typed amount —
 * and the round-off travels explicitly: a number keeps the admin's figure,
 * `null` clears it back to derived (contract C7: an omitted one is kept). The
 * coupon is left out on purpose: the pad cannot change it, and absent means
 * "keep the bill's own".
 */
export function draftToUpdatePayload(draft: CaseDraft) {
  return {
    invoice: {
      displayNumber: draft.displayNumber,
      invoiceDate: draft.invoiceDate,
      transport: draft.transport,
      partyGstin: draft.partyGstin,
      partyState: draft.customerState,
      hsnCode: draft.hsnCode,
      taxKind: draft.taxKind,
      notes: draft.notes,
    },
    items: draft.lines
      .filter(isPricedLine)
      .map((l) => ({
        productId: l.productId,
        name: l.name.trim(),
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        unit: l.unit,
        piecesPerCase: l.piecesPerCase,
      })),
    discountPercent: draft.discountPercent,
    deliveryCharge: draft.deliveryCharge,
    gst:
      draft.gstMode === 'flat'
        ? { mode: 'flat' as const, amount: draft.gstAmount ?? 0 }
        : { mode: 'percent' as const, rate: draft.gstRate },
    manualRoundOff: roundOffInput(draft.manualRoundOff) ?? null,
    customer: { name: draft.customerName, address: draft.customerAddress },
  };
}

/** `yyyy-mm-dd` in IST, which is what a `<input type="date">` holds. */
function toDateInput(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  // Formatted in the shop's zone rather than sliced off the UTC ISO string —
  // an invoice raised after 18:30 IST would otherwise show the previous day.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return parts;
}
