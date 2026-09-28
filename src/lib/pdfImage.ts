/**
 * Arbitrary admin-supplied images, in a form the PDF renderer can draw.
 *
 * The constraint `pdfLogo.ts` documents at length applies to the two emblems on
 * the wholesale invoice: `@react-pdf/renderer` decodes only PNG and JPEG, and
 * anything else renders as nothing at all with no error.
 *
 * That matters more here than anywhere else, because the admin uploader
 * re-encodes EVERY image to WebP — so an emblem uploaded through the normal
 * button would always have been invisible. Two conversions handle it:
 *
 *   1. Images on our own bucket go through `/content/image-proxy`, which
 *      re-encodes to PNG server-side with sharp. This also means the browser
 *      never has to satisfy the bucket's CORS policy.
 *   2. Anything else (a URL the admin pasted from elsewhere) is fetched and, if
 *      it is not already drawable, transcoded to PNG on a canvas. That needs the
 *      remote host to allow cross-origin reads, which is why the proxy is
 *      preferred whenever it applies.
 *
 * Kept separate from `pdfLogo.ts` because that module is about *the* logo — it
 * knows the brand, the pipeline's PNG variants and the bundled fallback. This
 * one takes a URL and nothing else.
 */

export type PdfImageSrc = { uri: string };

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

const cache = new Map<string, PdfImageSrc | null>();
const inFlight = new Map<string, Promise<PdfImageSrc | null>>();

/** Formats the renderer can decode as-is. */
const DRAWABLE = /^image\/(png|jpe?g)$/i;

function blobToDataUri(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Re-encode a blob the renderer cannot read (WebP, AVIF, GIF…) into a PNG data
 * URI, using the browser's own decoder. `createImageBitmap` is used rather than
 * an `<img>` because it decodes a blob directly and never taints the canvas.
 */
async function transcodeToPng(blob: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL('image/png');
  } catch {
    // An undecodable format, or a canvas tainted despite the bitmap path.
    return null;
  }
}

/** Why an image could not be resolved, for the message the admin actually sees. */
const reasons = new Map<string, string>();

async function toDrawable(blob: Blob): Promise<PdfImageSrc | null> {
  if (!blob.size) return null;
  // Trust the served bytes over the extension — a host returning WebP from a
  // .png key is exactly the case that fails silently inside the renderer.
  const uri = DRAWABLE.test(blob.type) ? await blobToDataUri(blob) : await transcodeToPng(blob);
  return uri ? { uri } : null;
}

/**
 * Fetch through the API's converting proxy.
 *
 * Returns `'not-ours'` when the proxy declines the URL as off-bucket, which is
 * the one case where falling back to a direct fetch is legitimate. Every other
 * failure returns a reason: attempting a direct fetch after those would just
 * produce a CORS error in the console that looks like the real fault and is not.
 */
async function viaProxy(
  url: string,
): Promise<{ src: PdfImageSrc } | { notOurs: true } | { reason: string }> {
  const endpoint = `${API_BASE}/content/image-proxy?url=${encodeURIComponent(url)}`;
  let response: Response;
  try {
    response = await fetch(endpoint);
  } catch {
    return { reason: 'the image service could not be reached' };
  }

  if (response.status === 400) return { notOurs: true };

  if (!response.ok) {
    return {
      reason:
        response.status === 404
          ? 'the image conversion endpoint is missing — the backend needs to be restarted or redeployed'
          : `the image service replied ${response.status}`,
    };
  }

  // An older backend has no /image-proxy route, so this URL falls into the
  // /:sectionId catch-all and answers 200 with JSON. Checking the content type
  // is what tells that apart from a real image.
  const type = response.headers.get('content-type') || '';
  if (!/^image\//i.test(type)) {
    return {
      reason:
        'the image conversion endpoint is missing — the backend needs to be restarted or redeployed',
    };
  }

  const src = await toDrawable(await response.blob()).catch(() => null);
  return src ? { src } : { reason: 'the converted image could not be read' };
}

/** Direct fetch, for a URL the admin pasted from somewhere that is not our bucket. */
async function direct(url: string): Promise<{ src: PdfImageSrc } | { reason: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) return { reason: `that URL replied ${response.status}` };
    const src = await toDrawable(await response.blob());
    return src ? { src } : { reason: 'that file could not be read as an image' };
  } catch {
    return { reason: "that host does not allow this site to read its images (CORS)" };
  }
}

async function resolve(url: string): Promise<PdfImageSrc | null> {
  reasons.delete(url);

  const proxied = await viaProxy(url);
  if ('src' in proxied) return proxied.src;

  if ('reason' in proxied) {
    reasons.set(url, proxied.reason);
    return null;
  }

  // The proxy declined it as off-bucket, so it is an external URL and a direct
  // read is the only option left.
  const fetched = await direct(url);
  if ('src' in fetched) return fetched.src;

  reasons.set(url, fetched.reason);
  // The document still renders, just without the image — which beats failing
  // the whole invoice over a decoration.
  return null;
}

/** Why {@link preparePdfImage} gave up on this URL, or '' if it did not. */
export function pdfImageFailureReason(url: string | undefined | null): string {
  if (!url?.trim()) return '';
  return reasons.get(url.trim()) ?? '';
}

/**
 * Resolve an image once, ahead of rendering. Safe to call repeatedly — the
 * result is memoised and concurrent callers share one fetch.
 */
export async function preparePdfImage(url: string | undefined | null): Promise<PdfImageSrc | null> {
  if (!url?.trim()) return null;
  const key = url.trim();
  if (cache.has(key)) return cache.get(key) ?? null;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = resolve(key)
    .then((src) => {
      cache.set(key, src);
      return src;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

/** Resolve several at once, in the order given. */
export async function preparePdfImages(urls: (string | undefined)[]): Promise<(PdfImageSrc | null)[]> {
  return Promise.all(urls.map((u) => preparePdfImage(u)));
}

/**
 * Forget a resolved image so the next render re-fetches it. Needed when an admin
 * replaces an emblem and previews again — without this they would keep seeing
 * the one they just replaced.
 */
export function forgetPdfImage(url: string | undefined | null): void {
  if (!url?.trim()) return;
  cache.delete(url.trim());
}

/**
 * The resolved image, read synchronously while a PDF component renders.
 * Undefined when it was never prepared or every attempt failed — callers lay
 * out without it rather than reserving a gap for an image that will not arrive.
 */
export function pdfImageSrc(url: string | undefined | null): PdfImageSrc | undefined {
  if (!url?.trim()) return undefined;
  return cache.get(url.trim()) ?? undefined;
}
