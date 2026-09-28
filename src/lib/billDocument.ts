import type { Bill } from '@/types/admin.ts';
import type { EstimateChrome } from '@/components/admin/BillPDF.tsx';

/**
 * Which printed document a bill gets, decided in ONE place.
 *
 * A full-case wholesale bill prints the ruled wholesale pad
 * (`WholesaleCaseInvoicePDF`); everything else prints the regular tax invoice
 * (`BillPDF`). Retail and wholesale-per-piece both use the regular one.
 *
 * This module exists because that rule was originally written inline on the
 * billing page's confirmation screen, and the Bills list, the bill detail page
 * and the quotations page each kept calling `BillPDF` directly — so a case bill
 * reprinted from anywhere except the moment it was created handed the customer
 * the wrong document. Anything that prints a bill must come through here.
 *
 * QUOTATIONS GO THROUGH THE SAME RULE. They used to be excluded — the chooser
 * read `!isEstimate && isCaseBill(bill)`, and every quotation was printed
 * through `printTaxInvoice` directly besides — so a customer being quoted by
 * the case was handed the retail tax invoice, with per-case rates sitting in a
 * per-piece Qty column. A quotation is now printed on the document the invoice
 * will be printed on, which is the only way the two can agree.
 */

/** True when this bill must print on the wholesale full-case pad. */
export function isCaseBill(bill: Bill): boolean {
  return bill.billingMode === 'wholesale-case';
}

/**
 * The wholesale stationery, loaded only when a case bill actually needs it.
 *
 * When the document is a QUOTATION, the boxed title is taken from the quotation
 * template instead — the pad is the right shape for a full-case quote, but a
 * sheet headed "TAX INVOICE" is not something to hand someone who has not
 * bought anything yet. Everything else about the pad is unchanged: same ruled
 * grid, same letterhead, same columns.
 */
async function caseTemplate(isEstimate: boolean) {
  const { getContentSection } = await import('@/services/admin.ts');
  const wholesale =
    (await getContentSection<Record<string, unknown>>('wholesale-invoice-template').catch(() => null)) ?? {};
  if (!isEstimate) return wholesale;

  const { DEFAULT_QUOTATION_TEMPLATE } = await import('@/types/quotationTemplate.ts');
  const quotation =
    (await getContentSection<Record<string, unknown>>('quotation-template').catch(() => null)) ?? {};
  return {
    ...wholesale,
    docTitle: (quotation.docTitle as string) || DEFAULT_QUOTATION_TEMPLATE.docTitle,
  };
}

/**
 * Print a saved bill — or a quotation, presented as one.
 *
 * `isEstimate` switches the wording to a quotation's, on whichever of the two
 * documents this bill's billing mode calls for. `estimate` carries what that
 * one quotation says about itself (its validity date, its own terms); the rest
 * of the quotation stationery is fetched from Content by the renderer.
 */
/**
 * The case pad for a saved record, printing the figures it was SAVED with.
 *
 * Re-pricing on the way to the printer is how the pad used to hand a customer a
 * grand total the Monthly Report did not have: the draft is for editing, the
 * record is what was sold.
 */
async function savedCaseDraft(bill: Bill) {
  const { billToCaseDraft, billFigures } = await import('@/lib/caseInvoiceDraft.ts');
  const draft = billToCaseDraft(bill);
  return { ...draft, savedFigures: billFigures(bill, draft.taxKind) };
}

export async function printBillDocument(
  bill: Bill,
  isEstimate = false,
  estimate?: Partial<EstimateChrome>,
): Promise<void> {
  if (isCaseBill(bill)) {
    const [{ printCaseInvoice }, draft, template] = await Promise.all([
      import('@/lib/caseInvoicePdf.ts'),
      savedCaseDraft(bill),
      caseTemplate(isEstimate),
    ]);
    return printCaseInvoice(draft, template);
  }

  const { printTaxInvoice } = await import('@/lib/taxInvoicePdf.ts');
  return printTaxInvoice(bill, isEstimate, estimate);
}

/** Download a saved bill as a PDF. */
export async function downloadBillDocument(
  bill: Bill,
  isEstimate = false,
  estimate?: Partial<EstimateChrome>,
): Promise<void> {
  if (isCaseBill(bill)) {
    const [{ downloadCaseInvoice }, draft, template] = await Promise.all([
      import('@/lib/caseInvoicePdf.ts'),
      savedCaseDraft(bill),
      caseTemplate(isEstimate),
    ]);
    return downloadCaseInvoice(draft, template);
  }

  const { downloadTaxInvoice } = await import('@/lib/taxInvoicePdf.ts');
  return downloadTaxInvoice(bill, isEstimate, estimate);
}
