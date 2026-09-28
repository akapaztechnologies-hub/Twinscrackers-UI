import { fetchBranding, siteOrigin } from './_brand.js';

/**
 * robots.txt, generated per request.
 *
 * It was a static file naming one hard-coded domain, so pointing the shop at a
 * new URL left crawlers being sent to the old one. The sitemap line now follows
 * the Canonical Site URL from Admin → Content → Site Settings, and falls back
 * to whichever domain actually served the request.
 */
const DISALLOWED = [
  '/account',
  '/account/*',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/claim-account',
  '/checkout',
  '/order-confirmation',
  '/admin',
  '/admin/*',
];

export async function buildRobots(context) {
  const branding = await fetchBranding(context.env, context).catch(() => null);
  const origin = siteOrigin(branding, context.request);

  const body = [
    branding ? `# ${branding.name}` : '# robots.txt',
    'User-agent: *',
    'Allow: /',
    '',
    '# Private / transactional routes',
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
