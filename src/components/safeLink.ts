/**
 * A link typed in by staff (Settings, Content), or null when it is not a web,
 * mail or phone address.
 *
 * These values go straight into an `href`. React 19 already refuses a bare
 * `javascript:` URL, but it lets `data:`, `vbscript:` and anything else through,
 * and values saved before the server began checking them are still stored — so
 * every link built from shop data is filtered here as well.
 *
 * Parsed with the browser's own URL rules, which strip the tabs, newlines and
 * leading control characters that turn `java\tscript:` into a script link. A
 * relative path (`/combo-packs`, `faq`, `#top`) resolves against this site and
 * is kept as written.
 */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function safeLink(link: string | null | undefined): string | null {
  const value = (link ?? '').trim();
  if (!value) return null;
  const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  try {
    return SAFE_PROTOCOLS.has(new URL(value, base).protocol) ? value : null;
  } catch {
    return null;
  }
}
