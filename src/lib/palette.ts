/**
 * The shop's colour palette, derived from three seed colours the admin picks.
 *
 * This is the single canonical deriver. The storefront's pre-paint boot script,
 * the admin panel, every email and every PDF all paint from the ramps produced
 * here — shipped whole on `/content/branding` — so none of them does colour
 * maths of its own and none of them can drift from the others.
 *
 * The admin stores only the three seeds (~90 bytes). Ramps are a pure function
 * of those seeds, so there is no way for a stored ramp to go stale.
 *
 * VENDORED from Akashcrackersbackend/src/modules/content/palette.service.ts,
 * which is the canonical deriver — what the site actually paints comes from
 * the server, in the /content/branding payload. This copy exists so the admin
 * colour picker can preview a palette live, without a round trip per keystroke
 * and without waiting out the 60s edge cache after a save.
 *
 * The two files are identical apart from the import path above, so `diff` them
 * if you suspect drift. Both are pinned by a golden-vector test asserting the
 * default seeds reproduce tailwind.config.js exactly.
 */
import {
  contrastHex,
  hexToOklch,
  luminance,
  normalizeHex,
  oklchToHex,
  parseHex,
  readableInk,
} from '@/lib/color.ts';

export interface PaletteSeeds {
  /** Drives the `brand` ramp — buttons, links, prices, focus rings. */
  accent: string;
  /** Drives the `fire` ramp — sale badges, urgency, the Quick Order button. */
  secondary: string;
  /**
   * Hue and chroma source for the `surface` ramp. Its LIGHTNESS is ignored:
   * the neutral ramp keeps a locked lightness curve so that every
   * `bg-white dark:bg-surface-900` pair in the app keeps exactly the contrast
   * it has today. An achromatic seed leaves the greys untouched.
   */
  neutral: string;
}

export type BrandStop = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
export type SurfaceStop =
  | 0
  | 50
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 850
  | 900
  | 950;

export type Ramp = Record<BrandStop, string>;
export type SurfaceRamp = Record<SurfaceStop, string>;

export interface DerivedPalette {
  seeds: PaletteSeeds;
  brand: Ramp;
  fire: Ramp;
  surface: SurfaceRamp;
  /** Readable ink for text on a solid `brand[500]` / `fire[500]` fill. */
  onBrand: string;
  onFire: string;
  /**
   * Whether a seed was too light or too dark to build a ramp around and had to
   * be pulled back into range — meaning stop 500 is NOT the hex the admin
   * picked. The admin UI must say so; silently ignoring someone's choice is
   * the worst outcome here.
   */
  clamped: { accent: boolean; secondary: boolean };
}

export const BRAND_STOPS: BrandStop[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
export const SURFACE_STOPS: SurfaceStop[] = [
  0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 850, 900, 950,
];

/**
 * The palette the site shipped with, and the values every derivation is
 * checked against. Deliberately NOT env-backed: these have to stay in lockstep
 * with AkashCrackers/tailwind.config.js, and a deploy-time environment
 * variable is exactly the wrong home for a value that must match a
 * checked-in file.
 */
export const DEFAULT_PALETTE_SEEDS: PaletteSeeds = {
  accent: '#D4AF37',
  secondary: '#FF6B35',
  neutral: '#737373',
};

/**
 * The hand-picked ramps the site has always used.
 *
 * These were drawn by eye, not derived, so re-deriving them produces something
 * close but not identical — a visible shift on shades 100-400. Returning the
 * originals verbatim for the original seeds is what makes shipping this
 * feature a no-op for every existing shop. Without it, everyone's gold moves
 * on the deploy that adds a colour picker nobody has touched yet.
 */
const LEGACY_RAMPS: Record<string, Ramp> = {
  '#D4AF37': {
    50: '#FFF9E6',
    100: '#FFF0BF',
    200: '#FFE699',
    300: '#FFDB73',
    400: '#F4D03F',
    500: '#D4AF37',
    600: '#B8960B',
    700: '#8B7209',
    800: '#5E4D06',
    900: '#312803',
  },
  '#FF6B35': {
    50: '#FFF3ED',
    100: '#FFE0CC',
    200: '#FFBF99',
    300: '#FF9E66',
    400: '#FF7D33',
    500: '#FF6B35',
    600: '#E55A2B',
    700: '#CC4A22',
    800: '#993718',
    900: '#66250F',
  },
};

/** Today's neutral ramp. Also the output whenever the neutral seed is grey. */
const SURFACE_LOCKED: string[] = [
  '#FFFFFF',
  '#FAFAFA',
  '#F5F5F5',
  '#E5E5E5',
  '#D4D4D4',
  '#A3A3A3',
  '#737373',
  '#525252',
  '#404040',
  '#262626',
  '#1A1A1A',
  '#111111',
  '#0A0A0A',
];

// ---------------------------------------------------------------------------
// Derivation constants
// ---------------------------------------------------------------------------

/** Lightness of stop 50 and stop 900. Measured off the existing gold ramp. */
const L_LIGHTEST = 0.972;
const L_DARKEST = 0.262;

/**
 * A seed outside this band has no room for four tints above it or four shades
 * below it — an almost-black accent would otherwise produce ten identical
 * blacks. Clamping is reported back so the UI can admit it happened.
 */
const L_SEED_MIN = 0.32;
const L_SEED_MAX = 0.88;

/**
 * Chroma as a fraction of the seed's, per stop. Pale tints read as neon if
 * they keep full chroma, and deep shades physically cannot hold it in sRGB.
 */
const C_SCALE = [0.26, 0.42, 0.6, 0.78, 0.92, 1.0, 1.0, 0.94, 0.78, 0.58];

/** Past this a "neutral" stops reading as neutral and starts being a colour. */
const MAX_NEUTRAL_C = 0.045;

/** A neutral seed below this chroma is treated as pure grey. */
const ACHROMATIC_C = 0.002;

/**
 * How far a tinted neutral may move the WCAG luminance of its locked stop.
 *
 * Locking OKLab lightness only approximately locks contrast: relative
 * luminance is green-weighted, so rotating hue at fixed L nudges it. The tint
 * is decoration and the contrast is the contract, so when they conflict the
 * tint gives way.
 */
const MAX_LUMINANCE_DRIFT = 0.06;

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Ramps
// ---------------------------------------------------------------------------

function deriveBrandRamp(seed: string): { ramp: Ramp; clamped: boolean } {
  const normalized = normalizeHex(seed) ?? DEFAULT_PALETTE_SEEDS.accent;

  const legacy = LEGACY_RAMPS[normalized];
  if (legacy) return { ramp: { ...legacy }, clamped: false };

  const base = hexToOklch(normalized)!;
  const seedL = Math.max(L_SEED_MIN, Math.min(L_SEED_MAX, base.l));
  const clamped = Math.abs(seedL - base.l) > 1e-6;

  const ramp = {} as Ramp;
  BRAND_STOPS.forEach((stop, i) => {
    let l: number;
    if (i < 5) {
      l = lerp(L_LIGHTEST, seedL, smoothstep(i / 5));
    } else if (i === 5) {
      l = seedL; // the seed appears verbatim, which is what makes the picker honest
    } else {
      l = lerp(seedL, L_DARKEST, smoothstep((i - 5) / 4));
    }
    ramp[stop] = oklchToHex({ l, c: base.c * C_SCALE[i], h: base.h });
  });

  // Only the derived path can drift; the legacy path returned above.
  ramp[500] = clamped ? ramp[500] : normalized;
  return { ramp, clamped };
}

function deriveSurfaceRamp(seed: string): SurfaceRamp {
  const ramp = {} as SurfaceRamp;
  const base = hexToOklch(normalizeHex(seed) ?? DEFAULT_PALETTE_SEEDS.neutral);

  // A grey seed returns the originals verbatim rather than round-tripping them
  // through the maths and hoping the rounding agrees.
  if (!base || base.c < ACHROMATIC_C) {
    SURFACE_STOPS.forEach((stop, i) => {
      ramp[stop] = SURFACE_LOCKED[i];
    });
    return ramp;
  }

  const cap = Math.min(base.c, MAX_NEUTRAL_C);

  SURFACE_STOPS.forEach((stop, i) => {
    const locked = SURFACE_LOCKED[i];

    // Stop 0 is paper. It stays #FFFFFF because 298 call sites pair it with
    // Tailwind's own `bg-white`, which we deliberately do not remap.
    if (i === 0) {
      ramp[stop] = locked;
      return;
    }

    const lockedRgb = parseHex(locked)!;
    const lockedL = hexToOklch(locked)!.l;
    const targetY = luminance(lockedRgb);
    // The tint reads strongest in the mid greys and fades out at both ends,
    // where it would either muddy the paper or disappear into the ink.
    const weight = 0.4 + 0.6 * (1 - Math.abs(2 * lockedL - 1));

    let chroma = cap * weight;
    let hex = oklchToHex({ l: lockedL, c: chroma, h: base.h });

    // Shed chroma until the stop's real (green-weighted) luminance is back
    // within tolerance of the grey it replaces.
    for (let attempt = 0; attempt < 8; attempt++) {
      const drift =
        Math.abs(luminance(parseHex(hex)!) - targetY) / Math.max(targetY, 0.02);
      if (drift <= MAX_LUMINANCE_DRIFT) break;
      chroma *= 0.75;
      hex = oklchToHex({ l: lockedL, c: chroma, h: base.h });
    }

    ramp[stop] = hex;
  });

  return ramp;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

const cache = new Map<string, DerivedPalette>();

/** Fill in anything missing or malformed with the shipped default. */
export function resolveSeeds(seeds: Partial<PaletteSeeds> | undefined): PaletteSeeds {
  // `||` rather than `??`, matching how every other branding field resolves:
  // a value an admin cleared to an empty string means "use the default".
  return {
    accent: normalizeHex(seeds?.accent || '') || DEFAULT_PALETTE_SEEDS.accent,
    secondary: normalizeHex(seeds?.secondary || '') || DEFAULT_PALETTE_SEEDS.secondary,
    neutral: normalizeHex(seeds?.neutral || '') || DEFAULT_PALETTE_SEEDS.neutral,
  };
}

export function derivePalette(input: Partial<PaletteSeeds> | undefined): DerivedPalette {
  const seeds = resolveSeeds(input);
  const key = `${seeds.accent}|${seeds.secondary}|${seeds.neutral}`;

  const hit = cache.get(key);
  if (hit) return hit;

  const brand = deriveBrandRamp(seeds.accent);
  const fire = deriveBrandRamp(seeds.secondary);

  const palette: DerivedPalette = {
    seeds,
    brand: brand.ramp,
    fire: fire.ramp,
    surface: deriveSurfaceRamp(seeds.neutral),
    onBrand: readableInk(brand.ramp[500]),
    onFire: readableInk(fire.ramp[500]),
    clamped: { accent: brand.clamped, secondary: fire.clamped },
  };

  cache.set(key, palette);
  return palette;
}

// ---------------------------------------------------------------------------
// Email colours
// ---------------------------------------------------------------------------

/**
 * The slots the HTML email templates paint with.
 *
 * This lives here rather than in utils/email.ts because settings.service.ts
 * needs it too, and email.ts and settings.service.ts already form an import
 * cycle that only works because the uses are inside function bodies.
 */
export interface EmailColors {
  accent: string;
  onAccent: string;
  heading: string;
  body: string;
  muted: string;
  rule: string;
  panel: string;
  panelSoft: string;
  strong: string;
}

export function emailColors(palette: DerivedPalette): EmailColors {
  return {
    accent: palette.brand[500],
    onAccent: palette.onBrand,
    heading: palette.surface[900],
    body: palette.surface[600],
    muted: palette.surface[500],
    rule: palette.surface[200],
    panel: palette.surface[100],
    panelSoft: palette.surface[50],
    strong: palette.surface[700],
  };
}

/** Contrast of the accent against the two grounds an email actually uses. */
export function paletteContrast(palette: DerivedPalette) {
  return {
    accentOnWhite: contrastHex(palette.brand[500], '#FFFFFF'),
    accentOnPaper: contrastHex(palette.brand[500], palette.surface[50]),
    inkOnAccent: contrastHex(palette.onBrand, palette.brand[500]),
  };
}
