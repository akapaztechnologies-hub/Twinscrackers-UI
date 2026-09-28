import { useEffect } from 'react';
import { useSiteStore } from '@/store/site.ts';
import { logoSrc } from '@/lib/logoAssets.ts';

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: 'website' | 'product' | 'article';
  noIndex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Lightweight SEO head manager — sets document title, meta tags,
 * canonical URL, Open Graph, Twitter Card, and JSON-LD structured data.
 */
export function SEO({
  title,
  description,
  canonical,
  ogImage,
  ogType = 'website',
  noIndex = false,
  jsonLd,
}: SEOProps) {
  const siteConfig = useSiteStore(s => s.config);

  const fullTitle = title
    ? `${title} | ${siteConfig.name}`
    : `${siteConfig.name} — ${siteConfig.tagline}`;

  const metaDescription = description ?? siteConfig.description;
  const canonicalUrl = canonical
    ? `${siteConfig.url}${canonical}`
    : undefined;
  const resolveAbs = (p: string) => (p.startsWith('http') ? p : `${siteConfig.url}${p}`);
  // A 1200x630 card when the logo pipeline produced one; the bare logo is a
  // poor share preview but still better than a 404.
  const shareImage = logoSrc(siteConfig, 'og');
  const ogImageUrl = ogImage ?? (shareImage ? resolveAbs(shareImage) : `${siteConfig.url}/og-image.jpg`);

  useEffect(() => {
    // Title
    document.title = fullTitle;

    // Helper to set/create a meta tag
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // Standard meta
    setMeta('name', 'description', metaDescription);

    // Robots
    if (noIndex) {
      setMeta('name', 'robots', 'noindex, nofollow');
    } else {
      const existing = document.querySelector('meta[name="robots"]');
      if (existing) existing.remove();
    }

    // Canonical
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (canonicalUrl) {
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', canonicalUrl);
    } else if (link) {
      link.remove();
    }

    // Open Graph
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', metaDescription);
    setMeta('property', 'og:type', ogType);
    setMeta('property', 'og:site_name', siteConfig.name);
    if (canonicalUrl) setMeta('property', 'og:url', canonicalUrl);
    setMeta('property', 'og:image', ogImageUrl);

    // Twitter Card
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', metaDescription);
    setMeta('name', 'twitter:image', ogImageUrl);

    // JSON-LD Structured Data
    const scriptId = 'seo-json-ld';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (jsonLd) {
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.type = 'application/ld+json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(
        Array.isArray(jsonLd) ? jsonLd : jsonLd,
      );
    } else if (script) {
      script.remove();
    }

    // Cleanup on unmount — restore defaults
    return () => {
      document.title = `${siteConfig.name} — ${siteConfig.tagline}`;
      const jsonScript = document.getElementById(scriptId);
      if (jsonScript) jsonScript.remove();
    };
  }, [fullTitle, metaDescription, canonicalUrl, ogImageUrl, ogType, noIndex, jsonLd, siteConfig.name, siteConfig.tagline]);

  return null;
}
