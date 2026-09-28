import { getContentSection } from '@/services/admin.ts';
import { DEFAULT_WHOLESALE_TEMPLATE, type WholesaleInvoiceTemplate } from '@/types/wholesaleInvoice.ts';
import type { CaseDraft } from '@/lib/caseInvoiceDraft.ts';
import type { FactoryBill } from '@/types/factory.ts';

/**
 * The factory's own letterhead — its name, GSTIN and address are not the
 * shop's. Same shape as the wholesale pad's stationery so both print through
 * one renderer; only the section it is stored under differs.
 */
export const FACTORY_TEMPLATE_SECTION = 'factory-invoice-template';

/**
 * A saved factory bill, in the shape the pad renderer draws.
 *
 * `savedFigures` carries the totals exactly as the server computed and stored
 * them, so a reprint can never re-derive a different grand total from the one
 * the trader is holding.
 */
export function factoryBillToCaseDraft(bill: FactoryBill): CaseDraft {
  return {
    displayNumber: bill.invoiceNumber,
    invoiceDate: (bill.invoiceDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    customerName: bill.party?.name ?? '',
    customerAddress: bill.party?.address ?? '',
    customerState: bill.party?.state ?? '',
    partyGstin: bill.party?.gstin ?? '',
    transport: bill.transportName ?? '',
    transportId: bill.transportId ?? '',
    hsnCode: '',
    lines: (bill.items ?? []).map((it) => ({
      name: it.name,
      caseLabel: it.cases ? String(it.cases) : '',
      quantity: it.quantity,
      unitPrice: it.rate,
      unit: 'case' as const,
    })),
    discountPercent: 0,
    gstRate: bill.gstRate ?? 18,
    taxKind: bill.taxKind ?? 'intra',
    deliveryCharge: 0,
    manualRoundOff: '',
    notes: bill.notes ?? '',
    savedFigures: {
      taxableAmount: bill.taxableValue ?? 0,
      totalCgst: bill.totalCgst ?? 0,
      totalSgst: bill.totalSgst ?? 0,
      totalIgst: bill.totalIgst ?? 0,
      packagingFee: 0,
      deliveryCharge: 0,
      roundOff: bill.roundOff ?? 0,
      grandTotal: bill.grandTotal ?? 0,
      lineAmounts: (bill.items ?? []).map((it) => it.amount ?? 0),
    },
  };
}

/** The factory letterhead, falling back to the defaults when none is saved yet. */
export async function loadFactoryTemplate(): Promise<Partial<WholesaleInvoiceTemplate>> {
  try {
    const saved = await getContentSection<Partial<WholesaleInvoiceTemplate>>(FACTORY_TEMPLATE_SECTION);
    return saved && Object.keys(saved).length ? saved : DEFAULT_WHOLESALE_TEMPLATE;
  } catch {
    // An unsaved letterhead must not stop a bill printing — the figures are
    // what the trader needs, and the defaults still produce a full document.
    return DEFAULT_WHOLESALE_TEMPLATE;
  }
}

/** Open the print dialog for one saved factory bill. */
export async function printFactoryBill(bill: FactoryBill): Promise<void> {
  const [{ printCaseInvoice }, template] = await Promise.all([
    import('@/lib/caseInvoicePdf.ts'),
    loadFactoryTemplate(),
  ]);
  await printCaseInvoice(factoryBillToCaseDraft(bill), template);
}

/** Save the bill as a PDF file instead of printing it. */
export async function downloadFactoryBill(bill: FactoryBill): Promise<void> {
  const [{ downloadCaseInvoice }, template] = await Promise.all([
    import('@/lib/caseInvoicePdf.ts'),
    loadFactoryTemplate(),
  ]);
  await downloadCaseInvoice(factoryBillToCaseDraft(bill), template);
}
