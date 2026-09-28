/**
 * The icon set derived from the admin's uploaded logo.
 *
 * One upload in Admin → Content → Company Info is expanded server-side (see
 * the backend's `logo.service.ts`) into every size and format the site needs.
 * This module is the single place that decides which of those variants a given
 * placement gets, so a component asks for `logoSrc(config, 'header')` rather
 * than reaching for a URL and hoping it is the right one.
 *
 * Every accessor degrades to the plain `logo` field. An admin who pastes an
 * external URL instead of uploading a file gets exactly the behaviour the site
 * had before this pipeline existed, rather than a broken image.
 */

/** Bumped by the backend when the variant set changes. */
export const LOGO_ASSETS_VERSION = 1;

export interface LogoAssets {
  version: number;
  /** Square transparent master, 512px. */
  master: string;
  /** Natural aspect ratio, 256px tall, transparent. */
  wordmark: string;
  /** Multi-size .ico (16/32/48). */
  favicon: string;
  favicon32: string;
  favicon48: string;
  /** 180px, flattened — iOS will not honour transparency here. */
  appleTouch: string;
  icon192: string;
  icon512: string;
  /** 512px full-bleed with an Android safe zone. */
  maskable: string;
  /** 128px transparent — navbar, footer and login mark. */
  header: string;
  /** 256px transparent — the route-transition loading screen. */
  loader: string;
  /** 1200x630 share card. */
  og: string;
  /** Backdrop used by the variants that cannot be transparent. */
  background: string;
  /** Whether a background was actually keyed out. */
  transparent: boolean;
  removedColor: string | null;
  generatedAt: string;
}

/** Which variant each placement wants. */
export type LogoKind =
  | 'header'
  | 'loader'
  | 'master'
  | 'wordmark'
  | 'favicon'
  | 'appleTouch'
  | 'og';

interface BrandLike {
  logo?: string;
  logoAssets?: LogoAssets | null;
}

/**
 * A variant set is only trustworthy if it was generated from the logo currently
 * on display. The backend sets `logo` to the master on upload, so comparing the
 * two catches the case where an admin later pasted a bare URL over it and the
 * stale set would otherwise keep serving the previous company's favicon.
 */
export function assetsFor(brand: BrandLike | null | undefined): LogoAssets | null {
  const assets = brand?.logoAssets;
  if (!assets || !assets.master) return null;
  if (brand?.logo && brand.logo !== assets.master) return null;
  return assets;
}

/** The right file for a given placement, falling back to the raw logo. */
export function logoSrc(brand: BrandLike | null | undefined, kind: LogoKind): string {
  const assets = assetsFor(brand);
  return (assets?.[kind] as string | undefined) || brand?.logo || '';
}
