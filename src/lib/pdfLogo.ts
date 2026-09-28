import { assetsFor, type LogoAssets } from '@/lib/logoAssets.ts';

/**
 * The logo, in a form the PDF renderer can actually draw.
 *
 * `@react-pdf/renderer` decodes exactly three formats — its own `isValidFormat`
 * accepts only `png`, `jpg` and `jpeg`. Everything else is rejected and the
 * `<Image>` renders as nothing, with no error surfaced to the page.
 *
 * That is why the invoice and packing slip printed a bare wordmark: the generic
 * admin uploader re-encodes every image to WebP, so the stored logo URL was a
 * format the renderer cannot read. The logo pipeline now emits PNG variants, and
 * this module makes sure a PDF is only ever handed one of those.
 *
 * It also inlines the bytes as a data URI rather than passing a URL. A remote
 * URL is fetched by the renderer itself, which makes the logo depend on the
 * asset host sending permissive CORS headers — and a cross-origin failure looks
 * exactly like the bug we just fixed. Fetching it here means a failure is
 * something we can fall back from, and the first candidate is the API's own
 * logo route, which fetches from object storage server-side so the browser
 * never has to satisfy the bucket's CORS policy at all.
 */

/** Formats the renderer can decode. Anything else must not reach it. */
const PDF_SAFE = /\.(png|jpe?g)(\?|#|$)/i;

/** Bundled with the app, same-origin, and known to be a PNG. */
const BUNDLED_FALLBACK = '/logo.png';

/** Reads the logo out of object storage for us, with CORS headers we control. */
const API_LOGO = `${(import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '')}/content/branding/logo`;

type PdfImageSrc = { uri: string };

/**
 * Memoised against the brand that produced it, so an admin's new logo appears in
 * the very next PDF without anything having to remember to invalidate.
 *
 * The key is the brand's own identity rather than the candidate URLs: when the
 * stored logo is a format we cannot use, every logo produces the same candidate
 * list (the API route and the bundled fallback), and keying on that list would
 * serve the previous logo's bytes after a re-upload.
 */
let cached: { key: string; src: PdfImageSrc | null } | null = null;
let inFlight: { key: string; promise: Promise<PdfImageSrc | null> } | null = null;

function absolute(pathOrUrl: string): string {
  if (/^(https?:|data:)/i.test(pathOrUrl)) return pathOrUrl;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

interface BrandLike {
  logo?: string;
  logoAssets?: LogoAssets | null;
}

/**
 * The best PDF-safe source available, most specific first.
 *
 * `header` is the 128px transparent PNG the pipeline generates — the right size
 * for the 40pt box the header band draws it into, rather than a 512px master
 * the renderer would have to scale down.
 */
function candidates(config: BrandLike): string[] {
  const assets = assetsFor(config);

  return [
    // Proxied by our own API, so a bucket without a CORS policy still works.
    // Listed first precisely because it is the one that cannot be blocked.
    assets || config.logo ? API_LOGO : undefined,
    assets?.header,
    assets?.master,
    // A logo the admin pasted or uploaded before the pipeline existed. Usable
    // only if it happens to already be a PNG or JPEG.
    config.logo && PDF_SAFE.test(config.logo) ? config.logo : undefined,
    BUNDLED_FALLBACK,
  ]
    .filter((c): c is string => Boolean(c))
    .map(absolute);
}

async function toDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    // Trust the bytes over the file extension — a misconfigured host serving
    // WebP from a .png key would otherwise fail silently inside the renderer.
    if (blob.type && !/^image\/(png|jpe?g)$/i.test(blob.type)) return null;

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    // Offline, blocked by CORS, or the host is down. The next candidate — and
    // ultimately the bundled logo — still has a chance.
    return null;
  }
}

/**
 * Resolve the logo once, ahead of rendering a PDF.
 *
 * Safe to call repeatedly: the result is memoised for the page's lifetime, and
 * concurrent callers share one in-flight resolution rather than each fetching.
 */
export async function preparePdfLogo(config?: BrandLike): Promise<PdfImageSrc | null> {
  // Imported lazily so the store can warm this module on boot without the two
  // files importing each other at module scope.
  const brand = config ?? (await import('@/store/site.ts')).useSiteStore.getState().config;
  const sources = candidates(brand);
  const key = `${brand.logo ?? ''}|${brand.logoAssets?.generatedAt ?? ''}|${sources.join('|')}`;

  if (cached?.key === key) return cached.src;
  if (inFlight?.key === key) return inFlight.promise;

  const promise = (async () => {
    for (const url of sources) {
      const uri = await toDataUri(url);
      if (uri) return { uri };
    }
    // Every candidate failed. The PDF still renders, just without a mark —
    // which beats failing the whole document over a decoration.
    return null;
  })()
    .then((src) => {
      cached = { key, src };
      return src;
    })
    .finally(() => {
      if (inFlight?.key === key) inFlight = null;
    });

  inFlight = { key, promise };
  return promise;
}

/**
 * The resolved logo, read synchronously while a PDF component renders.
 *
 * Returns undefined when `preparePdfLogo()` has not run or found nothing, and
 * the header is expected to lay itself out without a mark rather than reserve
 * an empty gap.
 */
export function pdfLogoSrc(): PdfImageSrc | undefined {
  return cached?.src ?? undefined;
}
