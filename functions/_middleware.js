import { fetchBranding, paletteCss } from './_brand.js';
import { buildRobots } from './_robots.js';
import { buildSitemap } from './_sitemap.js';
import { buildManifest } from './_manifest.js';

/**
 * Stamp the live brand into the HTML as it leaves the edge.
 *
 * index.html ships with build-time defaults, and the inlined boot script fixes
 * up the <head> once the page is running — but a link unfurler (WhatsApp,
 * Facebook, Slack, Google) never runs that script. It reads the raw markup and
 * caches whatever it finds, which is why a rename kept resurfacing the previous
 * company name in share previews.
 *
 * Rewriting here means the bytes themselves are correct: crawlers get the real
 * name and logo, and a first-time visitor with an empty localStorage sees the
 * right title on the very first frame instead of the fallback.
 *
 * On any failure the original response is returned untouched.
 */
const REWRITE = {
  title: (b) => b.title,
  'meta[name="description"]': (b) => b.description,
  'meta[name="author"]': (b) => b.name,
  'meta[name="theme-color"]': (b) => b.themeColor,
  'meta[property="og:title"]': (b) => b.title,
  'meta[property="og:site_name"]': (b) => b.name,
  'meta[property="og:description"]': (b) => b.description,
  'meta[property="og:image"]': (b) => b.share,
  'meta[property="og:url"]': (b, pageUrl) => pageUrl,
  'meta[name="twitter:title"]': (b) => b.title,
  'meta[name="twitter:description"]': (b) => b.description,
  'meta[name="twitter:image"]': (b) => b.share,
};

/**
 * robots.txt, sitemap.xml and site.webmanifest used to be static files carrying
 * one hard-coded shop name and domain. They are generated here instead of as
 * their own route files so this middleware — which runs first on every request
 * — answers them directly, with no chance of the SPA rewrite in
 * public/_redirects shadowing them.
 */
const GENERATED = {
  '/robots.txt': buildRobots,
  '/sitemap.xml': buildSitemap,
  '/site.webmanifest': buildManifest,
};

export async function onRequest(context) {
  const generate = GENERATED[new URL(context.request.url).pathname];
  if (generate) {
    try {
      return await generate(context);
    } catch {
      return new Response('', { status: 204 });
    }
  }

  const response = await context.next();

  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  let branding = null;
  try {
    branding = await fetchBranding(context.env, context);
  } catch {
    return response;
  }
  if (!branding) return response;

  // This page's own address, not the site root: every route is served this
  // same index.html, and stamping the root as canonical told crawlers that each
  // product page was a duplicate of the homepage. Query strings are dropped —
  // `?utm_source=…` is the same page.
  const path = new URL(context.request.url).pathname.replace(/\/+$/, '');
  const pageUrl = branding.url ? `${branding.url}${path}` : '';

  const rewriter = new HTMLRewriter();

  // Stamp the palette into <head> so the shop's colours are in the bytes
  // themselves. Appended last, so it lands after Vite's stylesheet <link> and
  // wins the :root tie on document order; brand-boot.js's inline style on
  // <html> still beats both, which is what we want when this 60s-cached copy
  // is staler than the visitor's own localStorage.
  const css = paletteCss(branding.palette);
  if (css) {
    rewriter.on('head', {
      element(el) {
        el.append(`<style>${css}</style>`, { html: true });
      },
    });
  }

  rewriter.on('title', {
    element(el) {
      el.setInnerContent(branding.title);
    },
  });

  for (const [selector, value] of Object.entries(REWRITE)) {
    if (selector === 'title') continue;
    const content = value(branding, pageUrl);
    if (!content) continue;
    rewriter.on(selector, {
      element(el) {
        el.setAttribute('content', content);
      },
    });
  }

  // Point each icon slot at the variant made for it. The shipped markup has one
  // <link> per rel, so this rewrites in place rather than emitting the full
  // 16/32/48 set — the boot script fills that in once the page is running, and
  // what matters here is that a first paint and a crawler get a real icon
  // rather than a 512px master scaled down to 16px.
  if (branding.assets || branding.logoPath) {
    const icon = (branding.assets && branding.assets.favicon32) || branding.logoPath;
    const apple = (branding.assets && branding.assets.appleTouch) || branding.logoPath;

    if (icon) {
      rewriter.on('link[rel="icon"]', {
        element(el) {
          el.setAttribute('href', icon);
        },
      });
    }
    if (apple) {
      rewriter.on('link[rel="apple-touch-icon"]', {
        element(el) {
          el.setAttribute('href', apple);
        },
      });
    }
  }
  if (pageUrl) {
    rewriter.on('link[rel="canonical"]', {
      element(el) {
        el.setAttribute('href', pageUrl);
      },
    });
  }

  // Copy into a fresh Response: the one from context.next() can carry immutable
  // headers, and the markup now varies with admin-editable data, so it must not
  // sit in a shared cache.
  const transformed = rewriter.transform(response);
  const out = new Response(transformed.body, transformed);
  out.headers.set('cache-control', 'public, max-age=0, must-revalidate');
  return out;
}
