import { preparePdfImages, forgetPdfImage, pdfImageFailureReason } from '@/lib/pdfImage.ts';
import { prepareTamilFont } from '@/lib/pdfTamilFont.ts';
import type { WholesaleInvoiceTemplate } from '@/types/wholesaleInvoice.ts';
import type { CaseDraft } from '@/lib/caseInvoiceDraft.ts';

/**
 * What could not be drawn on the last render. Empty when everything resolved.
 *
 * Reported rather than swallowed: an emblem that fails to load and a font that
 * fails to register both produce a document that renders perfectly well and is
 * missing something the admin explicitly asked for. Silently handing them that
 * is how "I uploaded an image and it never appears" happens.
 */
export interface CaseInvoiceRenderWarnings {
  /** Which emblems failed, and the specific reason each one did. */
  missingEmblems: { side: 'left' | 'right'; reason: string }[];
  tamilFontUnavailable: boolean;
}

let lastWarnings: CaseInvoiceRenderWarnings = { missingEmblems: [], tamilFontUnavailable: false };

/** Warnings from the most recent render. Read straight after awaiting one. */
export function lastRenderWarnings(): CaseInvoiceRenderWarnings {
  return lastWarnings;
}

/** Human-readable version of {@link lastRenderWarnings}, or '' when all is well. */
export function describeRenderWarnings(w: CaseInvoiceRenderWarnings = lastWarnings): string {
  const parts: string[] = [];
  for (const { side, reason } of w.missingEmblems) {
    // The reason is the whole point: "could not be loaded" sends an admin
    // hunting through their image file when the real answer is that the
    // backend has not been restarted.
    parts.push(`The ${side} emblem did not print${reason ? ` — ${reason}` : ''}.`);
  }
  if (w.tamilFontUnavailable) {
    parts.push('The Tamil font could not be loaded, so the invocation lines print in the default font.');
  }
  return parts.join(' ');
}

/**
 * Print / download helpers for the wholesale full-case invoice.
 *
 * Mirrors `lib/orderPdf.ts`: the renderer and the document are both code-split,
 * because `@react-pdf/renderer` plus the Tamil face is by far the heaviest thing
 * the admin bundle can pull in and no other screen needs either.
 *
 * The two emblems are resolved alongside the chunk loads rather than after them.
 * They are independent of each other, and the renderer reads them synchronously
 * once it starts — an emblem that has not resolved by then is simply absent from
 * the document.
 */
async function loadBlob(
  draft: CaseDraft,
  template: Partial<WholesaleInvoiceTemplate>,
  options: { refreshImages?: boolean } = {},
): Promise<Blob> {
  // An admin who just replaced an emblem and hit Preview must see the new one,
  // not the memoised copy of the one they replaced.
  if (options.refreshImages) {
    forgetPdfImage(template.leftEmblemUrl);
    forgetPdfImage(template.rightEmblemUrl);
  }

  const [{ pdf }, { WholesaleCaseInvoicePDF }, emblems, tamilOk] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/admin/WholesaleCaseInvoicePDF.tsx'),
    preparePdfImages([template.leftEmblemUrl, template.rightEmblemUrl]),
    prepareTamilFont(),
  ]);

  const missingEmblems: { side: 'left' | 'right'; reason: string }[] = [];
  if (template.leftEmblemUrl?.trim() && !emblems[0]) {
    missingEmblems.push({ side: 'left', reason: pdfImageFailureReason(template.leftEmblemUrl) });
  }
  if (template.rightEmblemUrl?.trim() && !emblems[1]) {
    missingEmblems.push({ side: 'right', reason: pdfImageFailureReason(template.rightEmblemUrl) });
  }
  lastWarnings = {
    missingEmblems,
    // Only a problem when there is Tamil to draw.
    tamilFontUnavailable: !tamilOk && Boolean(template.tamilLine1 || template.tamilLine2),
  };

  return pdf(WholesaleCaseInvoicePDF({ draft, template })).toBlob();
}

/** `invoice-6.pdf` — named by the number printed on the pad, not the internal id. */
function filename(draft: CaseDraft): string {
  const n = draft.displayNumber?.trim();
  return `invoice-${n ? n.replace(/[^\w-]+/g, '') : 'draft'}.pdf`;
}

export async function downloadCaseInvoice(
  draft: CaseDraft,
  template: Partial<WholesaleInvoiceTemplate>,
  options: { refreshImages?: boolean } = {},
): Promise<void> {
  const blob = await loadBlob(draft, template, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename(draft);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Open the invoice in a print dialog. Falls back to a hidden iframe when the
 * popup is blocked, so printing never silently no-ops — the same guard the
 * order and bill documents use.
 */
export async function printCaseInvoice(
  draft: CaseDraft,
  template: Partial<WholesaleInvoiceTemplate>,
  options: { refreshImages?: boolean } = {},
): Promise<void> {
  const blob = await loadBlob(draft, template, options);
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
