/**
 * Colour arithmetic — hex parsing, WCAG contrast, and OKLCh conversion.
 *
 * VENDORED from Akashcrackersbackend/src/utils/color.ts. It has no imports
 * at all, deliberately, so copying it carries nothing with it. The server and
 * the browser must agree to the byte on every derived colour: the same palette
 * paints the storefront, the emails and the PDFs, and a divergence here shows
 * up as an invoice that is a slightly different gold from the site it came
 * from. If you change this file, change it in both places.
 *
 * The backend counterpart is the source of truth; this copy exists so the
 * admin's colour picker can preview a palette without a round trip, and so
 * lib/pdfTheme.ts can derive invoice colours the same way the server does.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Lightness 0-1, chroma (roughly 0-0.4 within sRGB), hue in degrees. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Hex
// ---------------------------------------------------------------------------

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value: string | undefined): boolean {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

/** Strict: null for anything that is not #RGB or #RRGGBB. */
export function parseHex(hex: string | undefined): Rgb | null {
  if (!hex) return null;
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  const raw = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

const clampChannel = (v: number) => Math.max(0, Math.min(255, v));

/**
 * Clamps before rounding. The clamp is load-bearing: mix() extrapolates when
 * handed an amount above 1, and an unclamped channel serialises to a
 * three-digit hex that is not a colour at all.
 */
export function toHex({ r, g, b }: Rgb): string {
  const channel = (v: number) =>
    Math.round(clampChannel(v))
      .toString(16)
      .padStart(2, '0');
  return '#' + channel(r) + channel(g) + channel(b);
}

/** Uppercase #RRGGBB, or null. Palette seeds are compared as strings. */
export function normalizeHex(hex: string | undefined): string | null {
  const rgb = parseHex(hex);
  return rgb ? toHex(rgb).toUpperCase() : null;
}

export const distance = (a: Rgb, b: Rgb): number =>
  Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);

// ---------------------------------------------------------------------------
// WCAG
// ---------------------------------------------------------------------------

/** WCAG relative luminance — drives every light-or-dark decision here. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast between two hex strings; 1 (no contrast) if either is malformed. */
export function contrastHex(a: string, b: string): number {
  const ra = parseHex(a);
  const rb = parseHex(b);
  return ra && rb ? contrastRatio(ra, rb) : 1;
}

/**
 * The readable ink for text sitting on `background`.
 *
 * No fixed foreground is right for every accent a shop owner might pick — gold
 * needs near-black (9.4:1, against 2.1:1 for white) and navy needs white
 * (10.4:1, against 1.9:1 for near-black). Ties go to the dark ink, which is
 * what the buttons in this codebase already use.
 */
export function readableInk(background: string, dark = '#111111', light = '#FFFFFF'): string {
  return contrastHex(background, dark) >= contrastHex(background, light) ? dark : light;
}

// ---------------------------------------------------------------------------
// Mixing, in plain sRGB — what the PDF theme has always used
// ---------------------------------------------------------------------------

export function mix(hex: string, target: [number, number, number], amount: number): string {
  const rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  return toHex({
    r: rgb.r + (target[0] - rgb.r) * amount,
    g: rgb.g + (target[1] - rgb.g) * amount,
    b: rgb.b + (target[2] - rgb.b) * amount,
  });
}

export const lighten = (hex: string, amount: number): string => mix(hex, [255, 255, 255], amount);
export const darken = (hex: string, amount: number): string => mix(hex, [0, 0, 0], amount);

// ---------------------------------------------------------------------------
// OKLCh
//
// Why not HSL: HSL's L is not perceptual. hsl(60 100% 50%) and
// hsl(240 100% 50%) both claim L=50% while measuring 0.97 and 0.45 in actual
// lightness, so a ramp built on fixed HSL steps has contrast that depends
// entirely on which hue the shop owner happened to pick. OKLCh's L is
// perceptually uniform, which is the only reason a colour picker can be handed
// to a non-designer with a straight face.
//
// Matrices are Ottosson's published Oklab constants.
// ---------------------------------------------------------------------------

const srgbToLinear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (v: number): number => {
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return s * 255;
};

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

/** Raw conversion — may return channels outside 0-255. Use oklchToRgb. */
function oklchToRgbUnclamped({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);

  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;

  return {
    r: linearToSrgb(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: linearToSrgb(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: linearToSrgb(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  };
}

const inGamut = ({ r, g, b }: Rgb, tolerance = 0.5): boolean =>
  r >= -tolerance &&
  r <= 255 + tolerance &&
  g >= -tolerance &&
  g <= 255 + tolerance &&
  b >= -tolerance &&
  b <= 255 + tolerance;

const clampRgb = ({ r, g, b }: Rgb): Rgb => ({
  r: clampChannel(r),
  g: clampChannel(g),
  b: clampChannel(b),
});

/**
 * Convert to sRGB, reducing chroma until the colour actually fits.
 *
 * Naive per-channel clipping rotates the hue visibly — a saturated orange
 * clipped at high lightness comes back pink. Binary-searching chroma while
 * holding L and H sacrifices only saturation, which is the one of the three
 * that a ramp is not judged on.
 */
export function oklchToRgb(colour: Oklch): Rgb {
  const direct = oklchToRgbUnclamped(colour);
  if (inGamut(direct)) return clampRgb(direct);

  let lo = 0;
  let hi = colour.c;
  let best = oklchToRgbUnclamped({ ...colour, c: 0 });
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const candidate = oklchToRgbUnclamped({ ...colour, c: mid });
    if (inGamut(candidate)) {
      best = candidate;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return clampRgb(best);
}

export function hexToOklch(hex: string): Oklch | null {
  const rgb = parseHex(hex);
  return rgb ? rgbToOklch(rgb) : null;
}

export const oklchToHex = (colour: Oklch): string => toHex(oklchToRgb(colour));
