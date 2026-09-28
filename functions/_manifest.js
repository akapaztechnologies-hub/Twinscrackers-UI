import { fetchBranding, siteOrigin } from './_brand.js';

/**
 * The PWA manifest, generated per request.
 *
 * It named one shop and one icon path, so an installed home-screen shortcut
 * kept the previous company's name and logo after a rebrand. It now mirrors
 * Admin → Content → Company Info. (The boot script also swaps in a live
 * manifest client-side; this is what crawlers and the install prompt read.)
 */
/** Icon MIME must match the actual file — an admin can upload webp or svg. */
function iconType(src) {
  const ext = (src.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
  return (
    { svg: 'image/svg+xml', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', ico: 'image/x-icon' }[ext] ||
    'image/png'
  );
}

export async function buildManifest(context) {
  const branding = await fetchBranding(context.env, context).catch(() => null);
  const origin = siteOrigin(branding, context.request);
  const logo = (branding && branding.logoPath) || '/logo.png';
  const themeColor = (branding && branding.themeColor) || '#0A0A0A';
  const assets = branding && branding.assets;

  /**
   * One file declared as both 192x192 and 512x512 is a lie the install prompt
   * believes, which is what left installed shortcuts blurry. When the logo
   * pipeline has run, each entry is genuinely the size it claims and Android
   * gets a real maskable icon so the launcher stops cropping into the mark.
   */
  const icons =
    assets && assets.icon192 && assets.icon512
      ? [
          { src: assets.icon192, sizes: '192x192', type: iconType(assets.icon192), purpose: 'any' },
          { src: assets.icon512, sizes: '512x512', type: iconType(assets.icon512), purpose: 'any' },
          ...(assets.maskable
            ? [
                {
                  src: assets.maskable,
                  sizes: '512x512',
                  type: iconType(assets.maskable),
                  purpose: 'maskable',
                },
              ]
            : []),
        ]
      : [
          { src: logo, sizes: '192x192', type: iconType(logo), purpose: 'any' },
          { src: logo, sizes: '512x512', type: iconType(logo), purpose: 'any' },
        ];

  const manifest = {
    name: (branding && branding.name) || 'Store',
    short_name: (branding && branding.name) || 'Store',
    description: (branding && branding.description) || '',
    start_url: '/',
    scope: '/',
    id: `${origin}/`,
    display: 'standalone',
    background_color: themeColor,
    theme_color: themeColor,
    icons,
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
