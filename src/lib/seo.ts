import { useSiteStore } from '@/store/site.ts';
import type { Product } from '@/types/index.ts';

/** Resolve the brand logo/image to an absolute URL crawlers can fetch. */
function brandImage(): string {
  const { logo, url } = useSiteStore.getState().config;
  if (!logo) return `${url}/favicon.svg`;
  return logo.startsWith('http') ? logo : `${url}${logo}`;
}

/** Organization schema — use on homepage and about page */
export function organizationSchema() {
  const siteConfig = useSiteStore.getState().config;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    url: siteConfig.url,
    logo: brandImage(),
    description: siteConfig.description,
    address: {
      '@type': 'PostalAddress',
      addressLocality: siteConfig.schemaLocality,
      addressRegion: siteConfig.schemaRegion,
      addressCountry: siteConfig.schemaCountry,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: siteConfig.contact.phone,
      contactType: 'customer service',
      email: siteConfig.contact.email,
      availableLanguage: siteConfig.languages,
    },
    sameAs: [
      siteConfig.social.instagram,
      siteConfig.social.facebook,
      siteConfig.social.youtube,
    ].filter(Boolean),
  };
}

/** LocalBusiness schema — use on contact page */
export function localBusinessSchema() {
  const siteConfig = useSiteStore.getState().config;
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: siteConfig.name,
    url: siteConfig.url,
    telephone: siteConfig.contact.phone,
    email: siteConfig.contact.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: siteConfig.contact.address,
      addressLocality: siteConfig.schemaLocality,
      addressRegion: siteConfig.schemaRegion,
      addressCountry: siteConfig.schemaCountry,
    },
    priceRange: siteConfig.priceRange,
    image: brandImage(),
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: siteConfig.openDays,
      opens: siteConfig.opensAt,
      closes: siteConfig.closesAt,
    },
  };
}

/** Product schema — use on individual product pages */
export function productSchema(product: Product) {
  const siteConfig = useSiteStore.getState().config;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.images,
    sku: product.id,
    brand: {
      '@type': 'Brand',
      name: siteConfig.name,
    },
    offers: {
      '@type': 'Offer',
      url: `${siteConfig.url}/product/${product.slug}`,
      priceCurrency: siteConfig.currencyCode,
      price: product.price,
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: siteConfig.name,
      },
    },
    // Published ONLY when real customers have actually rated this product.
    //
    // These two numbers used to be typed into the admin form, and sending them
    // to Google as an AggregateRating was telling the search engine about
    // reviews that did not exist — which is what Google's structured-data
    // policy calls out by name, and what a manual action is issued for. They
    // are now recomputed from approved reviews, so 0 means nobody has written
    // one yet and the block is left out rather than claiming five stars from
    // nowhere.
    ...(product.reviewCount && product.reviewCount > 0 && product.rating > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

/** BreadcrumbList schema — use on product and category pages */
export function breadcrumbSchema(
  items: { name: string; url: string }[],
) {
  const siteConfig = useSiteStore.getState().config;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${siteConfig.url}${item.url}`,
    })),
  };
}

/** FAQPage schema — use on FAQ page */
export function faqSchema(
  questions: { question: string; answer: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
      },
    })),
  };
}

/** WebSite schema with SearchAction — use on homepage */
export function websiteSchema() {
  const siteConfig = useSiteStore.getState().config;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteConfig.url}/shop?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}
