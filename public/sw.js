/*
 * The shop's service worker.
 *
 * Written by hand rather than generated, because what this site needs from one
 * is narrow and the wrong caching strategy on a shop is worse than none: a
 * customer shown yesterday's price, or an "in stock" that sold out this
 * morning, is a complaint at the counter.
 *
 * So nothing from the API is ever served from cache. What is cached is the
 * shell — the built JS and CSS, the fonts, the icons — which is what makes the
 * site open instantly on a second visit and open at all on a train through
 * Virudhunagar with no signal.
 *
 * Bumping CACHE_VERSION is what retires the old cache. The build's filenames
 * are content-hashed, so a deploy mostly takes care of itself; the version is
 * here for the times it does not.
 */

// v2: retires caches that may hold an HTML page under a script's URL (see
// isCacheableAsset).
const CACHE_VERSION = 'v2';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const ASSET_CACHE = `assets-${CACHE_VERSION}`;

/** Served when a navigation fails and nothing usable is cached. */
const OFFLINE_HTML = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>No connection</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:1.5rem;text-align:center;background:#0b0b0d;color:#e5e7eb">
  <div>
    <h1 style="font-size:1.25rem;margin:0 0 .5rem">You are offline</h1>
    <p style="color:#9ca3af;margin:0 0 1.25rem">This page has not been opened before, so there is nothing saved to show.</p>
    <button onclick="location.reload()" style="padding:.6rem 1.25rem;border-radius:.75rem;border:0;background:#eab308;color:#111;font-weight:600">Try again</button>
  </div>
</body>`;

self.addEventListener('install', (event) => {
  // The app shell is one request; everything else is cached as it is asked for.
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.add('/')).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Anything whose freshness a customer's money depends on. Never cached. */
function isLiveData(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_sitemap') ||
    url.pathname.startsWith('/_manifest') ||
    url.pathname.startsWith('/_robots')
  );
}

/**
 * Whether this response really is the file its URL names.
 *
 * After a deploy the old hashed chunks are gone, and the host's SPA fallback
 * answers a request for one with index.html — status 200, text/html. Cached
 * under the .js URL, that page would be served as the script forever. Only a
 * response whose type matches what was asked for is kept.
 */
function isCacheableAsset(url, response) {
  if (!response.ok) return false;
  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (type.includes('text/html')) return false;
  if (/\.m?js$/i.test(url.pathname)) return type.includes('javascript');
  if (/\.css$/i.test(url.pathname)) return type.includes('text/css');
  return true;
}

/** The built bundle, fonts and images — content-hashed and safe to keep. */
function isShellAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/fonts/') ||
    /\.(?:js|css|woff2?|ttf|svg|png|jpg|jpeg|webp|ico)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Another origin's problem — an image CDN or Google Fonts handles its own
  // caching, and intercepting opaque responses here only wastes storage.
  if (url.origin !== self.location.origin) return;
  if (isLiveData(url)) return;

  // Navigations: network first, so a customer always gets the live catalogue
  // when they have signal, and the last shell they loaded when they do not.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy)).catch(() => undefined);
          return response;
        })
        .catch(async () => {
          const cached = (await caches.match(request)) || (await caches.match('/'));
          return (
            cached ||
            new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
          );
        }),
    );
    return;
  }

  // Assets: cache first. Their names carry a content hash, so a cached one is
  // by definition the right one — a new build asks for a new filename.
  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (isCacheableAsset(url, response)) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
            }
            return response;
          }),
      ),
    );
  }
});
