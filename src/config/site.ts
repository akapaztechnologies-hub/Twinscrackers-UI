import { DEFAULT_PALETTE_SEEDS } from '@/lib/palette.ts';
import { DEFAULT_LETTERHEAD } from '@/types/invoiceLetterhead.ts';
/**
 * Last-resort defaults, used only for the split second before
 * `useSiteStore.fetchCompanyInfo()` returns — and only when the visitor has no
 * cached brand yet (see src/lib/branding.ts).
 *
 * There is deliberately no shop name, logo or contact detail hard-coded here.
 * Everything brand-shaped comes from Admin → Content → Company Info and
 * Admin → Content → Site Settings, with these build-time env values as the
 * fallback so a fresh deployment still reads sensibly. Anything left blank
 * simply does not render rather than showing someone else's brand.
 */
import type { LogoAssets } from '@/lib/logoAssets.ts';

const env = import.meta.env;

export const siteConfig = {
  name: env.VITE_SITE_NAME || 'Fireworks Store',
  tagline: env.VITE_SITE_TAGLINE || 'Premium Fireworks for Every Celebration',
  description:
    env.VITE_SITE_DESCRIPTION ||
    'Shop premium-quality fireworks — aerial shells, rockets, sparklers, and professional-grade pyrotechnics.',
  url: (env.VITE_SITE_URL || '').replace(/\/+$/, ''),
  currency: '₹',
  currencyCode: 'INR',
  /** Whether GST is charged/shown at all (admin toggle). When false, 0% everywhere. */
  gstEnabled: true,
  /** Total GST % (CGST+SGST). Admin-configurable via Settings; default 18% (fireworks HSN 3604). */
  gstRate: 18,
  /** Business GSTIN printed on invoices (admin-configurable via Settings). */
  gstin: '',
  /** HSN code printed on invoices (Settings → tax). '' until loaded; the invoice falls back to 3604. */
  hsnCode: '',
  /**
   * Whether an online order needs an account behind it.
   *
   * Admin-configurable via Settings → Checkout. `true` is how the shop has
   * always worked and stays the default, so a deploy never quietly opens guest
   * ordering. Switched off, checkout offers "Continue as guest" beside "Sign
   * in" and the order attaches to a phone-keyed guest record.
   */
  requireLoginToOrder: true,
  /** Offer a guest an account on the confirmation page, after the order is placed. */
  offerAccountAfterOrder: true,
  /**
   * The shop's collection-office rule (Settings → Checkout), as last loaded.
   *
   * `'unknown'` until settings arrive. Checkout treats unknown like required,
   * so a slow or failed office lookup can never let through an order the
   * server would refuse after the customer has paid; only a rule known to be
   * off or optional lets checkout carry on without the lookup.
   */
  deliveryPointMode: 'unknown' as 'unknown' | 'off' | 'optional' | 'required',
  /** Cash on Delivery — admin-configurable via Settings → Payment. */
  codEnabled: false,
  codLimit: 5000,
  /**
   * Minimum cart subtotal an online order must reach, set in Admin → Settings →
   * Orders. 0 means no minimum — the default, so a shop that has not configured
   * one never blocks a checkout.
   */
  minOrderValue: 0,
  /** Delivery options and rates — admin-configurable via Settings → Shipping.
   *  `enable*` decides which options a customer is offered at checkout. */
  shipping: {
    standardRate: 0,
    expressRate: 199,
    freeThreshold: 999,
    standardDays: '5-7',
    expressDays: '2-3',
    enableStandard: true,
    enableExpress: true,
    customerPaysDeliveryOnly: false,
  },
  logo: env.VITE_SITE_LOGO || '/logo.png',
  /**
   * Derived icon set for the uploaded logo. Null until an admin uploads one —
   * a build-time env logo is a single file with no variants, and every consumer
   * falls back to `logo` on its own.
   */
  logoAssets: null as LogoAssets | null,
  footerBlurb: '',
  whatsappMessage: 'Hi {name} team! I have a question.',
  whatsappTooltip: 'Chat with us on WhatsApp',
  // SEO / structured-data settings
  schemaLocality: env.VITE_SITE_LOCALITY || 'Sivakasi',
  schemaRegion: env.VITE_SITE_REGION || 'Tamil Nadu',
  schemaCountry: 'IN',
  priceRange: '₹₹',
  languages: ['English', 'Hindi', 'Tamil'] as string[],
  openDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as string[],
  opensAt: '09:00',
  closesAt: '20:00',
  themeColor: env.VITE_THEME_COLOR || '#0A0A0A',
  /**
   * The three colours the whole palette is derived from. This is only the
   * floor the site renders at before /content/site-settings answers — it must
   * stay in step with the :root block in styles/index.css.
   */
  paletteSeeds: { ...DEFAULT_PALETTE_SEEDS },
  social: {
    instagram: '',
    facebook: '',
    youtube: '',
    telegram: '',
    whatsapp: '',
  },
  contact: {
    phone: '',
    email: '',
    address: '',
  },
  /**
   * Shown until the shop saves its own (Content → Homepage). Deliberately
   * claims nothing a particular shop would have to prove — no customer counts,
   * no years in business — and nothing untrue for every shop: delivery is
   * charged, and parcels are collected from a transport office.
   */
  trustBadges: [
    { label: 'Certified fireworks', value: 'Safe' },
    { label: 'Payments', value: 'Secure' },
    { label: 'With care', value: 'Packed' },
    { label: 'Parcel office pick-up', value: 'Near you' },
  ],
  announcementBar: {
    text: '',
    isActive: false,
    link: '',
  },
  /** How invoice/order PDFs look — admin-configurable via Settings → Invoice / PDF.
   *  GSTIN, HSN and tax rate stay in Settings → Tax; this only controls presentation. */
  invoiceTemplate: {
    accentColor: '#B91C1C',
    termsText:
      'Goods once sold will not be taken back.\nHandle fireworks with care.\nSubject to Sivakasi jurisdiction.',
    footerNote: 'Computer-generated invoice',
    /** Printed on invoices/packing slips. Blank falls back to the canonical site URL. */
    website: '',
    bankDetails: '',
    /**
     * Print the shop's classic letterhead instead of the coloured band. Off by
     * default so an existing shop's invoices do not change appearance because
     * this field appeared; switched on in Content -> Invoice.
     */
    useLetterhead: false,
    letterhead: DEFAULT_LETTERHEAD,
  },
};
