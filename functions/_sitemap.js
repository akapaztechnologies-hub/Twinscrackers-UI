import { fetchBranding, siteOrigin } from './_brand.js';

/**
 * sitemap.xml, generated per request.
 *
 * The old file was a frozen list of one domain's URLs, so it went stale the
 * moment the shop changed address or added a product. Static routes come from
 * the list below; products and categories are pulled live from the API, and if
 * that call fails the static routes are still served rather than a 500.
 */
const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/shop', changefreq: 'daily', priority: '0.9' },
  { path: '/combo-packs', changefreq: 'weekly', priority: '0.8' },
  { path: '/quick-order', changefreq: 'weekly', priority: '0.7' },
  { path: '/bulk-orders', changefreq: 'monthly', priority: '0.7' },
  { path: '/about', changefreq: 'monthly', priority: '0.6' },
  { path: '/contact', changefreq: 'monthly', priority: '0.6' },
  { path: '/faq', changefreq: 'monthly', priority: '0.5' },
  { path: '/safety', changefreq: 'monthly', priority: '0.5' },
  { path: '/track-order', changefreq: 'monthly', priority: '0.5' },
  { path: '/shipping', changefreq: 'yearly', priority: '0.3' },
  { path: '/returns', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
];

const escapeXml = (value) =>
  String(value).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );

async function fetchList(env, path) {
  const base = ((env && (env.API_BASE_URL || env.VITE_API_URL)) || '').replace(/\/+$/, '');
  if (!base) return [];
  try {
    const res = await fetch(`${base}${path}`);
    if (!res.ok) return [];
    const payload = await res.json();
    const data = payload?.data ?? payload;
    const list = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function buildSitemap(context) {
  const branding = await fetchBranding(context.env, context).catch(() => null);
  const origin = siteOrigin(branding, context.request);
  const today = new Date().toISOString().slice(0, 10);

  const [products, categories] = await Promise.all([
    fetchList(context.env, '/products?limit=500'),
    fetchList(context.env, '/categories'),
  ]);

  const entries = [
    ...STATIC_ROUTES.map((route) => ({ ...route, lastmod: today })),
    ...categories
      .filter((c) => c?.slug)
      .map((c) => ({ path: `/shop?category=${encodeURIComponent(c.slug)}`, changefreq: 'weekly', priority: '0.8', lastmod: today })),
    ...products
      .filter((p) => p?.slug)
      .map((p) => ({
        path: `/product/${encodeURIComponent(p.slug)}`,
        changefreq: 'weekly',
        priority: '0.7',
        lastmod: (p.updatedAt || '').slice(0, 10) || today,
      })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) => `  <url>
    <loc>${escapeXml(origin + e.path)}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
