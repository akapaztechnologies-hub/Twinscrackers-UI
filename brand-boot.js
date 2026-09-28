/**
 * Brand boot — runs before React, inlined into <head> by the `brand-html`
 * plugin in vite.config.ts (never shipped as a separate request).
 *
 * Three things have to be true for the storefront to feel like it belongs to
 * whoever the admin says it belongs to:
 *
 *  1. No flash of the previous brand. The last known name/logo is kept in
 *     localStorage and re-applied synchronously here, before first paint, so a
 *     returning visitor never watches the tab title change under them.
 *  2. No hard-coded shop name anywhere. What the markup ships with comes from
 *     build-time env (see vite.config.ts); what you see comes from the admin.
 *  3. One implementation. `window.__brandKit` is the only code in the app that
 *     writes brand data into <head> — the React store calls into it too, so a
 *     save in the admin repaints the tab without a reload.
 */
(function () {
  var CFG = window.__BRAND_BOOT_CFG__ || {};
  var CACHE_KEY = 'akash-crackers-brand';

  function absolute(base, pathOrUrl) {
    if (!pathOrUrl) return '';
    if (/^(https?:|data:|blob:)/i.test(pathOrUrl)) return pathOrUrl;
    if (!base) return pathOrUrl;
    return base.replace(/\/+$/, '') + (pathOrUrl.charAt(0) === '/' ? '' : '/') + pathOrUrl;
  }

  function setMeta(attr, key, content) {
    if (!content) return;
    var el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function setLink(rel, href) {
    if (!href) return;
    var el = document.head.querySelector('link[rel="' + rel + '"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      document.head.appendChild(el);
    }
    if (el.getAttribute('href') === href) return;
    el.setAttribute('href', href);
  }

  function metaTag(attr, key) {
    return {
      get: function () {
        var el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
        return el ? el.getAttribute('content') || '' : '';
      },
      set: function (value) {
        setMeta(attr, key, value);
      },
    };
  }

  /**
   * The page-level tags: title, description, canonical and share preview.
   *
   * A tag is this script's while it still holds what this script (or the served
   * HTML) last put there. A page with its own SEO component writes its own
   * values, and from then on a brand re-apply leaves that page's tags alone —
   * writing the shop-wide ones over them put the homepage's title and canonical
   * on every page. A page without one (checkout, account, login, admin) keeps
   * following the brand, so a rename still reaches it on the same visit.
   */
  var PAGE_TAGS = {
    title: {
      get: function () {
        return document.title;
      },
      set: function (value) {
        document.title = value;
      },
    },
    description: metaTag('name', 'description'),
    ogTitle: metaTag('property', 'og:title'),
    ogDescription: metaTag('property', 'og:description'),
    ogImage: metaTag('property', 'og:image'),
    ogUrl: metaTag('property', 'og:url'),
    twitterTitle: metaTag('name', 'twitter:title'),
    twitterDescription: metaTag('name', 'twitter:description'),
    twitterImage: metaTag('name', 'twitter:image'),
    canonical: {
      get: function () {
        var el = document.head.querySelector('link[rel="canonical"]');
        return el ? el.getAttribute('href') || '' : '';
      },
      set: function (value) {
        setLink('canonical', value);
      },
    },
  };

  /** What each page-level tag held when this script last wrote it — or at boot. */
  var ownedValues = {};
  for (var tagName in PAGE_TAGS) ownedValues[tagName] = PAGE_TAGS[tagName].get();

  function setPageTag(name, value) {
    if (!value) return;
    var tag = PAGE_TAGS[name];
    // Something else wrote this tag since: it is the page's now.
    if (tag.get() !== ownedValues[name]) return;
    tag.set(value);
    ownedValues[name] = tag.get();
  }

  /**
   * Favicons are cached hard, and browsers ignore a plain href change on an
   * already-parsed <link>. Detaching and re-appending forces a re-read.
   *
   * `icons` is a list of {href, sizes} — the derived set gives the browser a
   * real 32 and 48 to choose between instead of making it downscale a 512px
   * master on every page load.
   */
  function setIcons(rel, icons) {
    var wanted = icons.filter(function (i) {
      return i && i.href;
    });
    if (!wanted.length) return;

    var existing = document.head.querySelectorAll('link[rel="' + rel + '"]');
    var same =
      existing.length === wanted.length &&
      wanted.every(function (icon, i) {
        return existing[i].getAttribute('href') === icon.href;
      });
    if (same) return;

    for (var i = 0; i < existing.length; i++) existing[i].parentNode.removeChild(existing[i]);
    wanted.forEach(function (icon) {
      var el = document.createElement('link');
      el.setAttribute('rel', rel);
      el.setAttribute('href', icon.href);
      el.setAttribute('type', iconType(icon.href));
      if (icon.sizes) el.setAttribute('sizes', icon.sizes);
      document.head.appendChild(el);
    });
  }

  /** Icon MIME must match the actual file — an admin can upload webp or svg. */
  function iconType(src) {
    var ext = (src.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
    if (ext === 'svg') return 'image/svg+xml';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'ico') return 'image/x-icon';
    return 'image/png';
  }

  var RAMP_STOPS = {
    brand: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
    fire: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
    surface: [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 850, 900, 950],
  };

  /** '#D4AF37' -> '212 175 55'. The only colour maths in this file. */
  function triplet(hex) {
    if (typeof hex !== 'string') return '';
    var m = /^#([0-9a-f]{6})$/i.exec(hex.replace(/\s/g, ''));
    if (!m) return '';
    var n = parseInt(m[1], 16);
    return ((n >> 16) & 255) + ' ' + ((n >> 8) & 255) + ' ' + (n & 255);
  }

  /**
   * Paint the palette onto <html> as inline custom properties.
   *
   * Inline style on the root element beats the :root defaults compiled into
   * the stylesheet no matter where Vite puts the CSS <link>, and this script
   * is a synchronous <script> in <head>, so the writes land before the parser
   * reaches <body> — i.e. strictly before first paint, with no flash.
   *
   * Every Tailwind colour in the app is rgb(var(--x) / <alpha-value>), so this
   * one pass repaints the entire site — storefront and admin — with no React
   * re-render and no reload.
   *
   * The ramps arrive already derived from the API, so nothing here needs to
   * know what OKLCh is.
   */
  function applyPalette(palette) {
    if (!palette) return;
    var root = document.documentElement;

    for (var group in RAMP_STOPS) {
      var ramp = palette[group];
      if (!ramp) continue;
      var stops = RAMP_STOPS[group];
      for (var i = 0; i < stops.length; i++) {
        var rgb = triplet(ramp[stops[i]]);
        if (rgb) root.style.setProperty('--' + group + '-' + stops[i], rgb);
      }
    }

    var onBrand = triplet(palette.onBrand);
    if (onBrand) root.style.setProperty('--brand-on', onBrand);
    var onFire = triplet(palette.onFire);
    if (onFire) root.style.setProperty('--fire-on', onFire);
  }

  /**
   * Keep only a payload that has all three complete ramps.
   *
   * A half-applied palette is worse than none — it would leave some shades on
   * the old accent and some on the new one — so a malformed payload is dropped
   * whole and the compiled defaults stand.
   */
  function normalizePalette(raw) {
    if (!raw) return null;
    var out = { seeds: raw.seeds || null, onBrand: raw.onBrand || '', onFire: raw.onFire || '' };
    for (var group in RAMP_STOPS) {
      var src = raw[group];
      if (!src) return null;
      var stops = RAMP_STOPS[group];
      var ramp = {};
      for (var i = 0; i < stops.length; i++) {
        if (!triplet(src[stops[i]])) return null;
        ramp[stops[i]] = src[stops[i]];
      }
      out[group] = ramp;
    }
    return out;
  }

  /**
   * Icons for the PWA manifest.
   *
   * This used to declare one file as being simultaneously 192x192 and 512x512,
   * which is simply untrue and left installed shortcuts blurry. With a derived
   * set each entry is the size it claims, and Android gets a real maskable
   * icon — one with a safe zone — so the launcher stops cropping into the mark.
   */
  function manifestIcons(assets, logoUrl) {
    if (assets) {
      var icons = [
        { src: assets.icon192, sizes: '192x192', purpose: 'any' },
        { src: assets.icon512, sizes: '512x512', purpose: 'any' },
        { src: assets.maskable, sizes: '512x512', purpose: 'maskable' },
      ].filter(function (i) {
        return i.src;
      });
      if (icons.length) {
        return icons.map(function (i) {
          return { src: i.src, sizes: i.sizes, type: iconType(i.src), purpose: i.purpose };
        });
      }
    }
    if (!logoUrl) return [];
    return [
      { src: logoUrl, sizes: '192x192', type: iconType(logoUrl), purpose: 'any' },
      { src: logoUrl, sizes: '512x512', type: iconType(logoUrl), purpose: 'any' },
    ];
  }

  /**
   * The PWA manifest names the app on a home screen, so it follows the brand.
   * `assets` is passed in already validated against the current logo rather
   * than re-read from the brand — a stale set has to be dropped here too, not
   * only from the <link> tags.
   */
  function setManifest(brand, assets, logoUrl) {
    try {
      var manifest = {
        name: brand.name,
        short_name: brand.name,
        description: brand.description || '',
        start_url: '/',
        display: 'standalone',
        background_color: brand.themeColor || '#0A0A0A',
        theme_color: brand.themeColor || '#0A0A0A',
        icons: manifestIcons(assets, logoUrl),
      };
      var previous = document.head.querySelector('link[rel="manifest"]');
      var previousHref = previous && previous.getAttribute('href');
      var blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
      setLink('manifest', URL.createObjectURL(blob));
      if (previousHref && previousHref.indexOf('blob:') === 0) URL.revokeObjectURL(previousHref);
    } catch (err) {
      /* Blob/URL unavailable — the static manifest link stays as-is. */
    }
  }

  function apply(brand) {
    if (!brand) return;
    // Before the name guard: a brand with no name still has colours, and the
    // palette is the one thing that must never be skipped.
    applyPalette(brand.palette);
    if (!brand.name) return;
    var title = brand.tagline ? brand.name + ' — ' + brand.tagline : brand.name;
    // A variant set only belongs to the logo it was generated from. The master
    // is stored as `logo` on upload, so a mismatch means the admin has since
    // pasted a bare URL and the old set must not be used.
    var assets =
      brand.logoAssets && brand.logoAssets.master === brand.logo ? brand.logoAssets : null;
    var logoUrl = absolute(brand.url, brand.logo);
    // Share previews want the 1200x630 card, not a square mark on a huge crop.
    var shareUrl = assets && assets.og ? assets.og : logoUrl;

    // Only the tags no page has claimed (see PAGE_TAGS).
    var pageUrl = brand.url ? brand.url + location.pathname.replace(/\/+$/, '') : '';
    setPageTag('title', title);
    setPageTag('description', brand.description);
    setPageTag('ogTitle', title);
    setPageTag('ogDescription', brand.description);
    setPageTag('ogImage', shareUrl);
    setPageTag('ogUrl', pageUrl);
    setPageTag('twitterTitle', title);
    setPageTag('twitterDescription', brand.description);
    setPageTag('twitterImage', shareUrl);
    setPageTag('canonical', pageUrl);

    setMeta('name', 'author', brand.name);
    setMeta('name', 'theme-color', brand.themeColor);
    setMeta('property', 'og:site_name', brand.name);

    if (assets) {
      setIcons('icon', [
        { href: assets.favicon },
        { href: assets.favicon32, sizes: '32x32' },
        { href: assets.favicon48, sizes: '48x48' },
      ]);
      // iOS composites a transparent apple-touch icon onto black, so this one
      // variant is deliberately flattened server-side.
      setIcons('apple-touch-icon', [{ href: assets.appleTouch, sizes: '180x180' }]);
    } else {
      setIcons('icon', [{ href: brand.logo }]);
      setIcons('apple-touch-icon', [{ href: brand.logo }]);
    }

    setManifest(brand, assets, logoUrl);
  }

  function read() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.name ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function write(brand) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(brand));
    } catch (err) {
      /* Private mode / quota — the brand still applies for this page view. */
    }
  }

  function normalize(raw) {
    if (!raw || !raw.name) return null;
    return {
      name: raw.name,
      tagline: raw.tagline || '',
      description: raw.description || '',
      logo: raw.logoPath || raw.logo || '',
      logoAssets: raw.logoAssets || null,
      url: (raw.url || '').replace(/\/+$/, ''),
      themeColor: raw.themeColor || '',
      // Whitelisted like everything else here: without this line the palette
      // is silently stripped from the API response and the site stays on the
      // compiled default forever, with no error anywhere to explain why.
      palette: normalizePalette(raw.palette),
    };
  }

  var kit = {
    cacheKey: CACHE_KEY,
    apply: apply,
    read: read,
    write: write,
    normalize: normalize,
    applyPalette: applyPalette,
    normalizePalette: normalizePalette,
    /** Whatever the page is currently branded as — the store reads this. */
    current: null,
  };
  window.__brandKit = kit;

  // 1. Repaint from cache immediately. This is what removes the flash.
  var cached = read();
  if (cached) {
    kit.current = cached;
    apply(cached);
  }

  // 2. Then reconcile with the server, so an admin edit lands on this visit.
  if (!CFG.api) return;
  var endpoint = CFG.api.replace(/\/+$/, '') + '/content/branding';
  fetch(endpoint, { credentials: 'omit' })
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (payload) {
      var brand = normalize(payload && (payload.data || payload));
      if (!brand) return;
      kit.current = brand;
      apply(brand);
      write(brand);
      document.dispatchEvent(new CustomEvent('brand:updated', { detail: brand }));
    })
    .catch(function () {
      /* Offline or API down — the cached/build-time brand is already showing. */
    });
})();
