/**
 * Shared brand lookup for the Pages Functions.
 *
 * The storefront is a static SPA, so nothing in the shipped HTML knows the
 * shop's current name. These functions run at the edge on every request and
 * read the live brand straight from the API, which is what lets a rename in the
 * admin show up in the served markup — including for crawlers and link
 * unfurlers, which never execute the client-side script.
 *
 * Set API_BASE_URL in Cloudflare Pages → Settings → Environment variables
 * (falls back to VITE_API_URL, which the build already needs).
 */

const CACHE_TTL_SECONDS = 60;
const LOOKUP_TIMEOUT_MS = 2000;

function apiBase(env) {
  const raw = (env && (env.API_BASE_URL || env.VITE_API_URL)) || '';
  return raw.replace(/\/+$/, '');
}

/**
 * Look up the brand, cached at the edge for a minute.
 *
 * Returns null on any failure — every caller must degrade to the static asset
 * rather than serve an error, because a slow API must never take the shop down.
 */
export async function fetchBranding(env, ctx) {
  const base = apiBase(env);
  if (!base) return null;

  const cacheKey = new Request(`${base}/content/branding`, { method: 'GET' });
  const cache = caches.default;

  try {
    const hit = await cache.match(cacheKey);
    if (hit) return normalize(await hit.json());
  } catch {
    /* Cache unavailable — fall through to a live read. */
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(cacheKey.url, { signal: abort.signal });
    if (!res.ok) return null;

    const body = await res.text();
    const cacheable = new Response(body, {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
    }
    return normalize(JSON.parse(body));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalize(payload) {
  const raw = payload && (payload.data || payload);
  if (!raw || !raw.name) return null;

  const url = (raw.url || '').replace(/\/+$/, '');
  const logoPath = raw.logoPath || raw.logo || '';
  const logo = /^(https?:|data:)/i.test(logoPath) ? logoPath : `${url}${logoPath}`;

  // The derived icon set, but only while it still belongs to the logo on
  // display — the master is stored as the logo on upload, so a mismatch means
  // the admin has since pasted a bare URL over it.
  const assets =
    raw.logoAssets && raw.logoAssets.master && raw.logoAssets.master === logoPath
      ? raw.logoAssets
      : null;

  return {
    name: raw.name,
    tagline: raw.tagline || '',
    description: raw.description || '',
    title: raw.tagline ? `${raw.name} — ${raw.tagline}` : raw.name,
    logoPath,
    logo,
    assets,
    /** What an unfurler should show: the 1200x630 card when we have one. */
    share: (assets && assets.og) || logo,
    url,
    themeColor: raw.themeColor || '',
    // Straight through — the edge does no colour maths. Whitelisted like
    // everything else here, so forgetting this line silently leaves every
    // first-time visitor on the default palette with nothing in the logs.
    palette: raw.palette && raw.palette.brand ? raw.palette : null,
  };
}

const RAMP_STOPS = {
  brand: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
  fire: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
  surface: [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 850, 900, 950],
};

/**
 * The palette as a :root rule, for stamping into the HTML at the edge.
 *
 * This is what makes a first-ever visitor — and every crawler screenshot — see
 * the shop's real colours in the raw bytes, rather than the compiled default
 * for one frame until the boot script's fetch lands.
 *
 * Every value is validated as six hex digits before it is interpolated, so
 * there is no way for branding data to inject markup here.
 */
export function paletteCss(palette) {
  if (!palette) return '';
  const decls = [];

  const push = (name, hex) => {
    const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return;
    const n = parseInt(m[1], 16);
    decls.push(`--${name}:${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`);
  };

  for (const group of Object.keys(RAMP_STOPS)) {
    const ramp = palette[group];
    if (!ramp) continue;
    for (const stop of RAMP_STOPS[group]) push(`${group}-${stop}`, ramp[stop]);
  }
  push('brand-on', palette.onBrand);
  push('fire-on', palette.onFire);

  return decls.length ? `:root{${decls.join(';')}}` : '';
}

/** Prefer what the admin configured; fall back to the domain actually serving us. */
export function siteOrigin(branding, request) {
  return (branding && branding.url) || new URL(request.url).origin;
}
