import type { Bill } from '@/types/admin.ts';
import { preparePdfLogo } from '@/lib/pdfLogo.ts';
import { preparePdfImages } from '@/lib/pdfImage.ts';
import { prepareTamilFont } from '@/lib/pdfTamilFont.ts';
import { useSiteStore } from '@/store/site.ts';
import { toLetterhead } from '@/types/invoiceLetterhead.ts';
import { DEFAULT_QUOTATION_TEMPLATE, type QuotationTemplate } from '@/types/quotationTemplate.ts';
import type { EstimateChrome } from '@/components/admin/BillPDF.tsx';

/**
 * Print / download helpers for the regular tax invoice (`BillPDF`).
 *
 * The same twenty lines — load the renderer, resolve the logo, make a blob,
 * open a popup with a hidden-iframe fallback — were copied into the billing
 * page, the bills list, the bill detail page and the quotations page. Four
 * copies meant four places to forget, which is how case bills ended up printing
 * the wrong document from three of them.
 *
 * Callers should normally use `billDocument.ts` instead, which picks between
 * this and the wholesale case invoice. Use these directly only when the document
 * is known to be a tax invoice regardless of the bill (a quotation, a preview).
 */

/**
 * The quotation stationery, fetched only when a quotation is being printed.
 *
 * Content → Quotation Template holds the parts identical on every quotation:
 * the boxed title, the standing terms and the "not a tax invoice" line.
 * `overrides` is what the ONE quotation says — its own validity date, and terms
 * typed in its layout editor — and wins over the template where present.
 *
 * An invoice never pays for this fetch, and a quotation printed before the shop
 * has saved a template falls back to sensible defaults rather than blanks.
 */
async function estimateChrome(overrides?: Partial<EstimateChrome>): Promise<EstimateChrome> {
  const { getContentSection } = await import('@/services/admin.ts');
  const tpl =
    (await getContentSection<Partial<QuotationTemplate>>('quotation-template').catch(() => null)) ?? {};
  const merged = { ...DEFAULT_QUOTATION_TEMPLATE, ...tpl };
  return {
    docTitle: merged.docTitle,
    terms: merged.terms,
    notice: merged.showEstimateNotice ? merged.estimateNotice : undefined,
    // Dropping undefined keys so a quotation that sets none of these keeps the
    // template's answer instead of blanking it.
    ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([, v]) => v !== undefined && v !== '')),
  };
}

async function loadBlob(bill: Bill, isEstimate: boolean, estimate?: EstimateChrome): Promise<Blob> {
  // When the shop prints its classic letterhead, the emblems and the Tamil font
  // have to be resolved before the render starts — the component reads both
  // synchronously, and an unprepared emblem silently lays out as an empty slot.
  // Skipped entirely when the letterhead is off, so the plain invoice does not
  // pay for two fetches it will not use.
  const tpl = useSiteStore.getState().config.invoiceTemplate;
  const letterhead = tpl?.useLetterhead ? toLetterhead(tpl.letterhead) : null;

  // The logo resolves alongside the chunk loads rather than after them: they are
  // independent, and the renderer reads it synchronously once it starts.
  const [{ pdf }, { BillPDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/admin/BillPDF.tsx'),
    preparePdfLogo(),
    ...(letterhead
      ? [preparePdfImages([letterhead.leftEmblemUrl, letterhead.rightEmblemUrl]), prepareTamilFont()]
      : []),
  ]);
  return pdf(BillPDF({ bill, isEstimate, estimate })).toBlob();
}

export async function downloadTaxInvoice(
  bill: Bill,
  isEstimate = false,
  estimate?: Partial<EstimateChrome>,
): Promise<void> {
  const blob = await loadBlob(bill, isEstimate, isEstimate ? await estimateChrome(estimate) : undefined);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${bill.billNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Open the invoice in a print dialog, falling back to a hidden iframe when the
 * popup is blocked so printing never silently no-ops.
 */
export async function printTaxInvoice(
  bill: Bill,
  isEstimate = false,
  estimate?: Partial<EstimateChrome>,
): Promise<void> {
  const blob = await loadBlob(bill, isEstimate, isEstimate ? await estimateChrome(estimate) : undefined);
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.addEventListener('load', () => printWindow.print());
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };
  document.body.appendChild(iframe);
  setTimeout(() => {
    iframe.remove();
    URL.revokeObjectURL(url);
  }, 60000);
}
