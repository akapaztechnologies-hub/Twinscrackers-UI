/**
 * Typed access to the brand kit that `brand-boot.js` installs on `window`
 * before React mounts.
 *
 * The boot script owns every write into <head> — title, favicon, Open Graph,
 * PWA manifest — so there is exactly one implementation of "what does this site
 * call itself", shared by the pre-paint pass and by later admin edits. This
 * module just gives the app a typed door into it, plus the same localStorage
 * cache so the store can render the right name on the first frame instead of
 * flashing a fallback.
 */

import type { LogoAssets } from '@/lib/logoAssets.ts';
import type { DerivedPalette } from '@/lib/palette.ts';

export interface Brand {
  name: string;
  tagline: string;
  description: string;
  /** As stored by the admin — a site-root path or an absolute CDN URL. */
  logo: string;
  /**
   * The sizes derived from that logo. The boot script prefers these when
   * writing <head> — a 16px favicon slot should not be handed a 512px master —
   * and falls back to `logo` when the admin pasted a bare URL.
   */
  logoAssets?: LogoAssets | null;
  /** Canonical site URL, no trailing slash. */
  url: string;
  themeColor?: string;
  /**
   * Every ramp, already derived server-side. The boot script writes these
   * straight onto <html> as custom properties, so it never has to do colour
   * maths on the render-blocking path.
   */
  palette?: DerivedPalette | null;
}

interface BrandKit {
  cacheKey: string;
  apply: (brand: Brand) => void;
  read: () => Brand | null;
  write: (brand: Brand) => void;
  normalize: (raw: unknown) => Brand | null;
  applyPalette: (palette: DerivedPalette | null | undefined) => void;
  normalizePalette: (raw: unknown) => DerivedPalette | null;
  current: Brand | null;
}

declare global {
  interface Window {
    __brandKit?: BrandKit;
  }
}

const FALLBACK_CACHE_KEY = 'akash-crackers-brand';

function kit(): BrandKit | undefined {
  return typeof window === 'undefined' ? undefined : window.__brandKit;
}

/** The brand this visitor saw last, available synchronously on first render. */
export function readCachedBrand(): Brand | null {
  const boot = kit();
  if (boot) return boot.read();
  try {
    const raw = localStorage.getItem(FALLBACK_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Brand) : null;
    return parsed?.name ? parsed : null;
  } catch {
    return null;
  }
}

/** Push a brand into <head> and remember it for the next visit. */
export function applyBrand(brand: Brand): void {
  const boot = kit();
  if (boot) {
    boot.current = brand;
    boot.apply(brand);
    boot.write(brand);
    return;
  }
  // No boot script (a test harness, or an embedding host) — the title is the
  // one thing worth keeping correct without it.
  if (typeof document !== 'undefined' && brand.name) {
    document.title = brand.tagline ? `${brand.name} — ${brand.tagline}` : brand.name;
  }
}

/**
 * Repaint the whole site with a palette, without a reload.
 *
 * Writes inline custom properties on <html>; every Tailwind colour in the app
 * reads them, so the storefront and the admin shell both re-tint in the same
 * style recalc with no React re-render. Cheap enough to call on every
 * keystroke of the admin colour picker — it is ~35 setProperty calls and the
 * browser coalesces the recalc.
 */
export function applyPalette(palette: DerivedPalette | null | undefined): void {
  kit()?.applyPalette(palette);
}
