import { preparePdfImages } from '@/lib/pdfImage.ts';
import { prepareTamilFont } from '@/lib/pdfTamilFont.ts';
import { toLetterhead, type InvoiceLetterhead } from '@/types/invoiceLetterhead.ts';

/**
 * Fetch what the letterhead needs before a render starts.
 *
 * `InvoiceLetterheadPdf` reads the emblems and the Tamil font synchronously, so
 * anything not resolved by the time `pdf()` runs is simply absent from the
 * page — an empty emblem slot, and Tamil rendered in Helvetica, which comes out
 * as mojibake rather than as an error anyone would notice in code review.
 *
 * It lives here because there are two callers and they are easy to forget
 * separately: the real print/download path, and the Preview button in
 * Content -> Invoice. The preview was written first and missed both, which is
 * exactly the failure this module exists to stop.
 *
 */
export async function prepareLetterheadAssets(
  template: { useLetterhead?: boolean; letterhead?: Partial<InvoiceLetterhead> } | null | undefined,
): Promise<void> {
  // Nothing to fetch when the coloured band is printing instead, so the plain
  // invoice pays for no requests it will not use.
  if (!template?.useLetterhead) return;
  const head = toLetterhead(template.letterhead);
  await Promise.all([
    preparePdfImages([head.leftEmblemUrl, head.rightEmblemUrl]),
    prepareTamilFont(),
  ]);
}
