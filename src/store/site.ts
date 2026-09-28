import { create } from 'zustand';
import api from '@/lib/api.ts';
import { siteConfig as defaultSiteConfig } from '@/config/site.ts';
import type { CompanyInfo } from '@/types/admin.ts';
import { unwrapData } from '@/lib/content.ts';
import { applyBrand, applyPalette, readCachedBrand } from '@/lib/branding.ts';
import { derivePalette, type PaletteSeeds } from '@/lib/palette.ts';

export type SiteConfig = typeof defaultSiteConfig;

type AdminSettingsResponse = {
  announcement?: { text?: string; isActive?: boolean; link?: string };
  tax?: { gstRate?: number; gstEnabled?: boolean; gstin?: string; hsnCode?: string };
  payment?: { codEnabled?: boolean; codLimit?: number };
  checkout?: {
    requireLogin?: boolean;
    offerAccountAfterOrder?: boolean;
    deliveryPointEnabled?: boolean;
    deliveryPointRequired?: boolean;
  };
  orders?: { minOrderValue?: number };
  shipping?: {
    standardRate?: number;
    expressRate?: number;
    freeThreshold?: number;
    standardDays?: string;
    expressDays?: string;
    enableStandard?: boolean;
    enableExpress?: boolean;
    customerPaysDeliveryOnly?: boolean;
  };
};

type InvoiceTemplateData = {
  accentColor?: string;
  termsText?: string;
  footerNote?: string;
  website?: string;
  bankDetails?: string;
};

type SiteSettingsData = {
  currency?: string;
  currencyCode?: string;
  url?: string;
  themeColor?: string;
  schemaLocality?: string;
  schemaRegion?: string;
  schemaCountry?: string;
  priceRange?: string;
  languages?: string[];
  openDays?: string[];
  opensAt?: string;
  closesAt?: string;
  /** Seeds only — the ramps are derived, never stored. */
  palette?: Partial<PaletteSeeds>;
};

interface SiteState {
  config: SiteConfig;
  isFetching: boolean;
  /**
   * Bumped every time the palette is repainted. Charts are SVG and cannot read
   * a Tailwind class, so useChartTheme() depends on this to know when to
   * re-read the CSS variables.
   */
  paletteVersion: number;
  fetchCompanyInfo: () => Promise<void>;
}

/**
 * Start from the brand this visitor saw last rather than from the build-time
 * defaults. Without this the navbar, footer and page titles render the fallback
 * for as long as `/content/company-info` takes to answer — which reads to a
 * customer as "the site still has the old company name".
 */
function initialConfig(): SiteConfig {
  const cached = readCachedBrand();
  if (!cached) return { ...defaultSiteConfig };
  return {
    ...defaultSiteConfig,
    name: cached.name || defaultSiteConfig.name,
    tagline: cached.tagline || defaultSiteConfig.tagline,
    description: cached.description || defaultSiteConfig.description,
    logo: cached.logo || defaultSiteConfig.logo,
    logoAssets: cached.logoAssets ?? defaultSiteConfig.logoAssets,
    url: cached.url || defaultSiteConfig.url,
    themeColor: cached.themeColor || defaultSiteConfig.themeColor,
    paletteSeeds: cached.palette?.seeds ?? defaultSiteConfig.paletteSeeds,
  };
}

export const useSiteStore = create<SiteState>()((set) => ({
  config: initialConfig(),
  isFetching: false,
  paletteVersion: 0,
  fetchCompanyInfo: async () => {
    set({ isFetching: true });
    try {
      // Fetch dynamic company info from content sections
      const [data, settings, site, invoiceTemplate] = await Promise.all([
        api.get('/content/company-info') as Promise<CompanyInfo>,
        api.get('/admin/settings').catch(() => null) as Promise<AdminSettingsResponse | null>,
        api.get('/content/site-settings').catch(() => null) as Promise<Record<string, unknown> | null>,
        api.get('/content/invoice-template').catch(() => null) as Promise<InvoiceTemplateData | null>,
      ]);

      if (data || settings || site || invoiceTemplate) {
        set((state) => {
          const newConfig = { ...state.config };

          if (settings && settings.announcement) {
            newConfig.announcementBar = {
              text: settings.announcement.text || '',
              isActive: settings.announcement.isActive || false,
              link: settings.announcement.link || ''
            };
          }

          if (settings && settings.tax) {
            if (typeof settings.tax.gstRate === 'number') newConfig.gstRate = settings.tax.gstRate;
            if (typeof settings.tax.gstEnabled === 'boolean') newConfig.gstEnabled = settings.tax.gstEnabled;
            if (typeof settings.tax.gstin === 'string') newConfig.gstin = settings.tax.gstin;
            if (typeof settings.tax.hsnCode === 'string') newConfig.hsnCode = settings.tax.hsnCode.trim();
          }

          // Guest checkout — see `requireLoginToOrder` in config/site.ts.
          if (settings && settings.checkout) {
            // Only an explicit `false` opens guest checkout. A settings
            // document saved before this flag existed must keep requiring an
            // account, which is what the shop has today.
            newConfig.requireLoginToOrder = settings.checkout.requireLogin !== false;
            newConfig.offerAccountAfterOrder = settings.checkout.offerAccountAfterOrder !== false;
            // Collection offices — see `deliveryPointMode` in config/site.ts.
            // Mirrors the server's defaults: off unless switched on, and
            // required once on unless explicitly made optional.
            const { deliveryPointEnabled, deliveryPointRequired } = settings.checkout;
            newConfig.deliveryPointMode =
              deliveryPointEnabled !== true ? 'off' : deliveryPointRequired === false ? 'optional' : 'required';
          }

          if (settings && settings.shipping) {
            const sh = settings.shipping;
            newConfig.shipping = { ...newConfig.shipping };
            if (typeof sh.standardRate === 'number') newConfig.shipping.standardRate = sh.standardRate;
            if (typeof sh.expressRate === 'number') newConfig.shipping.expressRate = sh.expressRate;
            if (typeof sh.freeThreshold === 'number') newConfig.shipping.freeThreshold = sh.freeThreshold;
            if (sh.standardDays) newConfig.shipping.standardDays = sh.standardDays;
            if (sh.expressDays) newConfig.shipping.expressDays = sh.expressDays;
            // Only an explicit `false` hides an option — a settings document
            // saved before these flags existed must keep both available.
            newConfig.shipping.enableStandard = sh.enableStandard !== false;
            newConfig.shipping.enableExpress = sh.enableExpress !== false;
            // Only an explicit `true` activates the delivery-fee-only model so
            // existing shops without this field stay on normal shipping.
            newConfig.shipping.customerPaysDeliveryOnly = sh.customerPaysDeliveryOnly === true;
          }

          if (settings && typeof settings.orders?.minOrderValue === 'number') {
            newConfig.minOrderValue = settings.orders.minOrderValue;
          }

          if (settings && settings.payment) {
            if (typeof settings.payment.codEnabled === 'boolean') newConfig.codEnabled = settings.payment.codEnabled;
            if (typeof settings.payment.codLimit === 'number') newConfig.codLimit = settings.payment.codLimit;
          }

          if (invoiceTemplate && typeof invoiceTemplate === 'object') {
            newConfig.invoiceTemplate = { ...newConfig.invoiceTemplate, ...invoiceTemplate };
          }

          const s = unwrapData<SiteSettingsData>(site);
          if (s && typeof s === 'object') {
            if (s.currency) newConfig.currency = s.currency;
            if (s.currencyCode) newConfig.currencyCode = s.currencyCode;
            if (s.url) newConfig.url = s.url.replace(/\/+$/, '');
            if (s.themeColor) newConfig.themeColor = s.themeColor;
            if (s.palette) newConfig.paletteSeeds = { ...newConfig.paletteSeeds, ...s.palette };
            if (s.schemaLocality) newConfig.schemaLocality = s.schemaLocality;
            if (s.schemaRegion) newConfig.schemaRegion = s.schemaRegion;
            if (s.schemaCountry) newConfig.schemaCountry = s.schemaCountry;
            if (s.priceRange) newConfig.priceRange = s.priceRange;
            if (Array.isArray(s.languages) && s.languages.length) newConfig.languages = s.languages;
            if (Array.isArray(s.openDays) && s.openDays.length) newConfig.openDays = s.openDays;
            if (s.opensAt) newConfig.opensAt = s.opensAt;
            if (s.closesAt) newConfig.closesAt = s.closesAt;
          }

          if (data) {
            if (data.name) newConfig.name = data.name;
            if (data.tagline) newConfig.tagline = data.tagline;
            if (data.description) newConfig.description = data.description;
            if (data.logo) newConfig.logo = data.logo;
            // Always assigned, never guarded on truthiness: clearing the logo
            // or swapping it for a pasted URL has to clear the derived set too,
            // or the site keeps serving the previous logo's favicon.
            newConfig.logoAssets = data.logoAssets ?? null;
            if (data.footerBlurb) newConfig.footerBlurb = data.footerBlurb;
            if (data.whatsappMessage) newConfig.whatsappMessage = data.whatsappMessage;
            if (data.whatsappTooltip) newConfig.whatsappTooltip = data.whatsappTooltip;

            // Deep clone nested objects to avoid mutating default
            newConfig.contact = { ...newConfig.contact };
            if (data.phone) newConfig.contact.phone = data.phone;
            if (data.email) newConfig.contact.email = data.email;

            const fullAddress = [data.address, data.city, data.state].filter(Boolean).join(', ');
            if (fullAddress) newConfig.contact.address = fullAddress;

            newConfig.social = { ...newConfig.social };
            if (data.socialInstagram) newConfig.social.instagram = data.socialInstagram;
            if (data.socialFacebook) newConfig.social.facebook = data.socialFacebook;
            if (data.socialYoutube) newConfig.social.youtube = data.socialYoutube;
            if (data.socialTelegram) newConfig.social.telegram = data.socialTelegram;
            if (data.whatsapp) {
               const cleanNumber = data.whatsapp.replace(/\D/g, '');
               newConfig.social.whatsapp = `https://wa.me/${cleanNumber}`;
            }
          }

          return { config: newConfig };
        });
      }

      // Resolve the PDF-safe logo now that the brand is known. Every PDF entry
      // point also asks for it, but warming it here means a new one that forgets
      // to still prints the right mark instead of silently printing none.
      void import('@/lib/pdfLogo.ts')
        .then((m) => m.preparePdfLogo(useSiteStore.getState().config))
        .catch(() => {});

      // Hand the resolved brand to the boot script, which owns <head> — title,
      // description, Open Graph, favicon, apple-touch-icon and PWA manifest —
      // and caches it so the next visit paints this brand, not the fallback.
      const { config } = useSiteStore.getState();

      // Repaint the palette from the seeds we just read.
      //
      // Prefer the ramps the server already derived, so the site, the emails
      // and the invoices are provably the same colour. Fall back to deriving
      // locally when the seeds disagree — which is exactly the case right
      // after an admin save, where /content/branding is still serving the old
      // palette out of a 60s edge cache and waiting for it would mean the shop
      // owner clicks Save and nothing happens.
      const served = window.__brandKit?.current?.palette;
      const seeds = config.paletteSeeds;
      const palette =
        served &&
        served.seeds.accent === seeds.accent &&
        served.seeds.secondary === seeds.secondary &&
        served.seeds.neutral === seeds.neutral
          ? served
          : derivePalette(seeds);

      applyPalette(palette);
      set((state) => ({ paletteVersion: state.paletteVersion + 1 }));

      applyBrand({
        name: config.name,
        tagline: config.tagline,
        description: config.description,
        logo: config.logo,
        logoAssets: config.logoAssets,
        url: config.url,
        themeColor: config.themeColor,
        palette,
      });
    } catch {
      // Silently fallback to default if content section isn't set up or fails
    } finally {
      set({ isFetching: false });
    }
  },
}));
