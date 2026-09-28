import { preparePdfLogo } from '@/lib/pdfLogo.ts';
import { prepareTamilFont, tamilFamily } from '@/lib/pdfTamilFont.ts';
import { ensurePdfEmoji } from '@/lib/pdfEmoji.ts';
import { preparePdfImages } from '@/lib/pdfImage.ts';
import { useSiteStore } from '@/store/site.ts';
import type {
  PriceListMode,
  PriceListOptions,
  PriceListPhotos,
  PriceListSection,
  PriceListShop,
} from '@/components/admin/PriceListPDF.tsx';
import type { AdminProduct, Category } from '@/types/admin.ts';

/**
 * Build and hand over the shop's price list PDF.
 *
 * Same shape as `orderPdf.ts` — the renderer and the document are both loaded
 * on demand, because `@react-pdf/renderer` is the heaviest thing in the admin
 * and almost nobody opens this screen.
 */

export interface PriceListInput {
  mode: PriceListMode;
  photos: PriceListPhotos;
  products: AdminProduct[];
  categories: Category[];
  title: string;
  note?: string;
  terms?: string[];
  /** Overrides the invoice accent for this document. Set on Admin → Price List. */
  accentColor?: string;
  /**
   * Where to send the money, from Settings → Payment.
   *
   * Passed in rather than read here because these live in the admin settings,
   * not in the public site config this module otherwise builds the shop from.
   */
  bank?: PriceListShop['bank'];
  /** Called as images are fetched, so a 186-product run can show progress. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Group products under their category, in the order both are arranged for the
 * storefront.
 *
 * Products with no category (or one that no longer exists) are not dropped —
 * they go under "Other", because a product missing from the price list is a
 * sale missing from the season, and an odd heading is easy to notice and fix.
 */
function buildSections(products: AdminProduct[], categories: Category[]): PriceListSection[] {
  const nameBySlug = new Map(categories.map((c) => [c.slug, c.name]));
  const order = new Map(categories.map((c, i) => [c.slug, c.displayOrder ?? i]));

  const grouped = new Map<string, AdminProduct[]>();
  for (const product of products) {
    const slug = product.category || '';
    const list = grouped.get(slug);
    if (list) list.push(product);
    else grouped.set(slug, [product]);
  }

  return [...grouped.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 9999) - (order.get(b[0]) ?? 9999))
    .map(([slug, items]) => ({
      category: nameBySlug.get(slug) || slug || 'Other',
      products: items.map((p) => ({
        name: p.name,
        price: p.price,
        originalPrice: p.originalPrice,
        wholesalePrice: p.wholesalePrice,
        wholesalePricePerCase: p.wholesalePricePerCase,
        quantityPerCase: p.quantityPerCase,
      })),
    }));
}

/** Shop identity for the masthead, read from the live site config. */
async function buildShop(
  accentColor?: string,
  bank?: PriceListShop['bank'],
): Promise<PriceListShop> {
  const { config } = useSiteStore.getState();
  const logo = await preparePdfLogo(config).catch(() => null);
  return {
    name: config.name,
    tagline: config.tagline,
    phone: config.contact?.phone,
    // Stored as a wa.me link; the sheet wants the number.
    whatsapp: config.social?.whatsapp?.replace(/^.*wa\.me\//, '').trim() || undefined,
    address: config.contact?.address,
    gstin: config.gstin || undefined,
    logo,
    website: config.invoiceTemplate?.website || undefined,
    // The price list's own accent when one is set, otherwise the invoice accent
    // so an untouched shop still sends out documents that match each other.
    accentColor: accentColor || config.invoiceTemplate?.accentColor,
    bank,
  };
}

/**
 * Convert every product photo the list needs.
 *
 * The admin uploader stores WebP, which `@react-pdf/renderer` cannot decode, so
 * each one is routed through the image proxy or transcoded — see pdfImage.ts.
 * That is a request per product, which is exactly why the text-only list is
 * the default and this reports progress.
 */
async function attachImages(
  sections: PriceListSection[],
  products: AdminProduct[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const byName = new Map(products.map((p) => [p.name, p.images?.[0]]));
  const flat = sections.flatMap((s) => s.products);
  const urls = flat.map((p) => byName.get(p.name));
  const total = urls.filter(Boolean).length;

  onProgress?.(0, total);
  const resolved = await preparePdfImages(urls);

  let done = 0;
  resolved.forEach((image, i) => {
    flat[i].image = image;
    if (urls[i]) onProgress?.(++done, total);
  });
}

async function renderBlob(input: PriceListInput): Promise<Blob> {
  // Before the render, or the emoji in the bank panel come out as empty boxes.
  ensurePdfEmoji();

  const [{ pdf }, { PriceListPDF }, shop] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/admin/PriceListPDF.tsx'),
    buildShop(input.accentColor, input.bank),
  ]);

  // Embedding the face is what lets the list print a real ₹ instead of naming
  // the unit "Rs." — and it is deliberately not awaited alongside the render's
  // own imports above, because a failure here must not take the document down
  // with it. It resolves false and the list prints in Helvetica.
  await prepareTamilFont();

  const sections = buildSections(input.products, input.categories);
  if (input.photos !== 'none') {
    await attachImages(sections, input.products, input.onProgress);
  }

  const options: PriceListOptions = {
    mode: input.mode,
    photos: input.photos,
    title: input.title,
    note: input.note,
    terms: input.terms,
    fontFamily: tamilFamily(),
  };

  return pdf(PriceListPDF({ sections, shop, options })).toBlob();
}

function filenameFor(input: PriceListInput): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${input.mode === 'wholesale' ? 'wholesale' : 'retail'}-price-list-${stamp}.pdf`;
}

export async function downloadPriceList(input: PriceListInput): Promise<void> {
  const blob = await renderBlob(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameFor(input);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Open the list in the browser's print dialog. */
export async function printPriceList(input: PriceListInput): Promise<void> {
  const blob = await renderBlob(input);
  const url = URL.createObjectURL(blob);

  const win = window.open(url, '_blank');
  if (win) {
    win.addEventListener('load', () => win.print());
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }

  // Popup blocked — print through a hidden iframe instead, same fallback the
  // order and invoice documents use.
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  iframe.onload = () => iframe.contentWindow?.print();
  document.body.appendChild(iframe);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Hand the file to the phone's share sheet, so it goes straight into a WhatsApp
 * chat rather than via the downloads folder.
 *
 * Only some browsers can share files — Chrome and Safari on mobile can, most
 * desktops cannot. The caller gets `false` back and falls through to a plain
 * download, which is the honest outcome rather than a share button that
 * quietly does nothing.
 */
export async function sharePriceList(input: PriceListInput): Promise<boolean> {
  const blob = await renderBlob(input);
  const file = new File([blob], filenameFor(input), { type: 'application/pdf' });

  if (!navigator.canShare?.({ files: [file] })) return false;

  try {
    await navigator.share({ files: [file], title: input.title });
    return true;
  } catch {
    // A cancelled share sheet is not a failure worth reporting.
    return true;
  }
}
