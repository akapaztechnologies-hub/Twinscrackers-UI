import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSiteStore } from '@/store/site.ts';
import {
  Save,
  Plus,
  Trash2,
  GripVertical,
  Megaphone,
  LayoutGrid,
  Star,
  Building2,
  HelpCircle,
  CheckCircle2,
  Eye,
  Info,
  FileCode2,
  Home,
  Mail,
  Globe,
  Zap,
  Receipt, Palette, ScrollText, Package, FileText, ShieldAlert } from 'lucide-react';
import { ImageUploadField } from '@/components/admin/ImageUploadField.tsx';
import { LogoUploadField } from '@/components/admin/LogoUploadField.tsx';
import { AboutTab } from '@/pages/admin/AboutTab';
import { FunctionalPagesTab } from '@/pages/admin/FunctionalPagesTab';
import { AboutPreviewTab } from '@/pages/admin/AboutPreviewTab';
import { ContactPageTab } from '@/pages/admin/ContactPageTab';
import { SiteSettingsTab } from '@/pages/admin/SiteSettingsTab';
import { ThemeTab } from './ThemeTab.tsx';
import { QuickOrderTab } from '@/pages/admin/QuickOrderTab';
import { PoliciesTab } from '@/pages/admin/PoliciesTab';
import { SafetyTab } from '@/pages/admin/SafetyTab';
import { InvoiceTemplateTab } from '@/pages/admin/InvoiceTemplateTab';
import { WholesaleInvoiceTemplateTab } from '@/pages/admin/WholesaleInvoiceTemplateTab';
import { QuotationTemplateTab } from '@/pages/admin/QuotationTemplateTab';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { ErrorNotice, errorText, loadErrorText, withIds } from '@/components/admin/AdminShared.tsx';
import { cn } from '@/lib/utils.ts';
import { siteConfig } from '@/config/site.ts';
import type {
  AnnouncementBar,
  AdminTestimonial,
  FAQCategory,
  FAQItem,
  CompanyInfo,
  Category,
  AdminProduct,
} from '@/types/admin.ts';

const inputClass =
  'w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

const helpClass = 'text-caption text-surface-400 mt-1';

const tabs = [
  { id: 'hero', label: 'Hero & Banners', icon: Megaphone },
  { id: 'sections', label: 'Homepage Sections', icon: LayoutGrid },
  { id: 'about-preview', label: 'About Preview', icon: Home },
  { id: 'testimonials', label: 'Testimonials', icon: Star },
  { id: 'company', label: 'Company Info', icon: Building2 },
  { id: 'contact', label: 'Contact Page', icon: Mail },
  { id: 'about', label: 'About Us', icon: Info },
  { id: 'policies', label: 'Policies', icon: FileText },
  { id: 'safety', label: 'Safety Page', icon: ShieldAlert },
  { id: 'product-page', label: 'Product Page', icon: Package },
  { id: 'functional', label: 'Forms & Utilities', icon: FileCode2 },
  { id: 'quick-order', label: 'Quick Order', icon: Zap },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
  { id: 'site', label: 'Site & SEO', icon: Globe },
  { id: 'theme', label: 'Theme & Colours', icon: Palette },
  { id: 'invoice', label: 'Invoice / PDF', icon: Receipt },
  { id: 'wholesale-invoice', label: 'Wholesale Invoice', icon: Receipt },
  { id: 'factory-invoice', label: 'Factory Bill', icon: Receipt },
  { id: 'quotation-template', label: 'Quotation', icon: ScrollText },
] as const;

type TabId = (typeof tabs)[number]['id'];

function SaveButton({
  onClick,
  isSaving,
  label = 'Save Changes',
  disabled = false,
}: {
  onClick: () => void;
  isSaving: boolean;
  label?: string;
  /** Held off when the tab never loaded — saving would write its defaults over the real content. */
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isSaving || disabled}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
    >
      <Save size={16} />
      {isSaving ? 'Saving...' : label}
    </button>
  );
}

function SuccessToast({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500 text-white text-body-sm font-medium shadow-lg animate-in slide-in-from-bottom-2">
      <CheckCircle2 size={16} />
      Saved successfully
    </div>
  );
}

function SectionLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-surface-100 dark:border-surface-800">
      <Eye size={14} className="text-brand-500" />
      <span className="text-caption font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wider">{label}</span>
      {hint && <span className="text-caption text-surface-400 ml-auto">{hint}</span>}
    </div>
  );
}

// =====================
// HERO DATA TYPES
// =====================

interface HeroStat {
  id: string;
  value: string;
  label: string;
}

interface HeroCTA {
  text: string;
  link: string;
}

interface HeroContent {
  eyebrow: string;
  titleLine1: string;
  titleGradient: string;
  subtitle: string;
  backgroundImage: string;
  primaryCTA: HeroCTA;
  secondaryCTA: HeroCTA;
  stats: HeroStat[];
}

/**
 * The shared neutral trust badges (see `siteConfig.trustBadges`) in the row
 * shape the editors use. Every unsaved default below that needs a row of
 * figures draws on these rather than inventing customer counts, years in
 * business or free shipping — which a shop saving the tab untouched would
 * otherwise publish as fact.
 */
function neutralFigures(count?: number): { id: string; value: string; label: string }[] {
  return siteConfig.trustBadges
    .slice(0, count)
    .map((badge, i) => ({ id: String(i + 1), value: badge.value, label: badge.label }));
}

const defaultHero: HeroContent = {
  eyebrow: 'Festive Collection Now Live',
  titleLine1: 'Light Up the',
  titleGradient: 'Night Sky',
  subtitle: 'Premium-crafted fireworks for celebrations that deserve perfection. From elegant sparklers to breathtaking aerial shows.',
  backgroundImage: 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=1920&q=80',
  primaryCTA: { text: 'Shop Collection', link: '/shop' },
  secondaryCTA: { text: 'Diwali Specials', link: '/shop?occasion=diwali' },
  // Three, to fill the hero's row of three.
  stats: neutralFigures(3),
};

// =====================
// HERO & BANNERS TAB
// =====================

const EMPTY_ANNOUNCEMENT: AnnouncementBar = { text: '', isActive: false };

function HeroBannersTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [hero, setHero] = useState<HeroContent>(defaultHero);
  const [announcement, setAnnouncement] = useState<AnnouncementBar>({ text: '', isActive: false });
  // What the store held when the tab opened. The announcement is written through
  // the Settings endpoint, so it is only sent when it actually changed — editing
  // the hero alone must not need Settings access.
  const [savedAnnouncement, setSavedAnnouncement] = useState<AnnouncementBar | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { getSiteSettings, getContentSection } = await import('@/services/admin.ts');
        const [settings, heroData] = await Promise.all([
          getSiteSettings(),
          getContentSection<HeroContent>('hero-section'),
        ]);
        if (!settings) throw new Error('Settings did not load');
        const bar: AnnouncementBar = { ...EMPTY_ANNOUNCEMENT, ...settings.announcementBar };
        setAnnouncement(bar);
        setSavedAnnouncement(bar);
        if (heroData) setHero({ ...defaultHero, ...heroData, stats: withIds(heroData.stats ?? defaultHero.stats) });
      } catch (err) {
        setLoadError(loadErrorText(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (loadError) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const { updateSiteSettings, updateContentSection } = await import('@/services/admin.ts');
      await updateContentSection('hero-section', hero as unknown as Record<string, unknown>);
      if (JSON.stringify(announcement) !== JSON.stringify(savedAnnouncement)) {
        await updateSiteSettings({ announcementBar: announcement });
        setSavedAnnouncement(announcement);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} label="Save Hero & Banners" />, saveSlot)}

      {/* Announcement Bar */}
      <AdminCard title="Announcement Bar">
        <SectionLabel label="Appears at top of every page" hint="Visible on: All pages" />
        <div className="space-y-4">
          {announcement.text && announcement.isActive && (
            <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20">
              <p className="text-body-sm text-brand-700 dark:text-brand-300 text-center font-medium">
                {announcement.text}
              </p>
            </div>
          )}
          <div>
            <label className={labelClass}>Banner Text</label>
            <input
              type="text"
              value={announcement.text}
              onChange={(e) => setAnnouncement((a) => ({ ...a, text: e.target.value }))}
              className={inputClass}
              placeholder="e.g., Free shipping on orders above ₹999!"
            />
          </div>
          <Toggle
            checked={announcement.isActive}
            onChange={(v) => setAnnouncement((a) => ({ ...a, isActive: v }))}
            label="Active"
            description="Show announcement bar on the storefront"
          />
        </div>
      </AdminCard>

      {/* Hero Section */}
      <AdminCard title="Hero Section">
        <SectionLabel label="Homepage full-screen hero banner" hint="Visible on: Homepage" />

        {/* Background preview */}
        {hero.backgroundImage && (
          <div className="mb-4 rounded-xl overflow-hidden h-32 relative">
            <img src={hero.backgroundImage} alt="Hero background" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-center">
                <p className="text-caption text-brand-300">{hero.eyebrow}</p>
                <p className="text-body-lg font-bold text-white">{hero.titleLine1} <span className="text-brand-400">{hero.titleGradient}</span></p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Eyebrow Badge</label>
            <input
              type="text"
              value={hero.eyebrow}
              onChange={(e) => setHero((h) => ({ ...h, eyebrow: e.target.value }))}
              className={inputClass}
              placeholder="Diwali 2026 Collection Now Live"
            />
            <p className={helpClass}>Small text shown in the badge above the title</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Title (first line)</label>
              <input
                type="text"
                value={hero.titleLine1}
                onChange={(e) => setHero((h) => ({ ...h, titleLine1: e.target.value }))}
                className={inputClass}
                placeholder="Light Up the"
              />
            </div>
            <div>
              <label className={labelClass}>Title (gradient word)</label>
              <input
                type="text"
                value={hero.titleGradient}
                onChange={(e) => setHero((h) => ({ ...h, titleGradient: e.target.value }))}
                className={inputClass}
                placeholder="Night Sky"
              />
              <p className={helpClass}>This word appears in gold gradient</p>
            </div>
          </div>

          <div>
            <label className={labelClass}>Subtitle</label>
            <textarea
              value={hero.subtitle}
              onChange={(e) => setHero((h) => ({ ...h, subtitle: e.target.value }))}
              className={`${inputClass} resize-none`}
              rows={2}
              placeholder="Premium-crafted fireworks for celebrations that deserve perfection."
            />
          </div>

          <ImageUploadField
            label="Background Image"
            value={hero.backgroundImage}
            onChange={(url) => setHero((h) => ({ ...h, backgroundImage: url }))}
            folder="content"
            previewClassName="w-full aspect-[21/9] rounded-xl"
          />

          {/* CTAs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-surface-50 dark:bg-surface-800/50">
            <div className="space-y-3">
              <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">Primary Button</p>
              <div>
                <label className={labelClass}>Text</label>
                <input
                  type="text"
                  value={hero.primaryCTA.text}
                  onChange={(e) => setHero((h) => ({ ...h, primaryCTA: { ...h.primaryCTA, text: e.target.value } }))}
                  className={inputClass}
                  placeholder="Shop Collection"
                />
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">Secondary Button</p>
              <div>
                <label className={labelClass}>Text</label>
                <input
                  type="text"
                  value={hero.secondaryCTA.text}
                  onChange={(e) => setHero((h) => ({ ...h, secondaryCTA: { ...h.secondaryCTA, text: e.target.value } }))}
                  className={inputClass}
                  placeholder="Diwali Specials"
                />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-body-sm font-medium text-surface-700 dark:text-surface-300">Hero Stats</label>
              <button
                onClick={() => setHero((h) => ({
                  ...h,
                  stats: [...h.stats, { id: crypto.randomUUID(), value: '', label: '' }],
                }))}
                className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline"
              >
                <Plus size={14} /> Add Stat
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {hero.stats.map((stat) => (
                <div key={stat.id} className="flex items-center gap-2 p-3 rounded-xl border border-surface-200 dark:border-surface-700">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={stat.value}
                      onChange={(e) => setHero((h) => ({ ...h, stats: h.stats.map((s) => s.id === stat.id ? { ...s, value: e.target.value } : s) }))}
                      className={inputClass}
                      placeholder="50K+"
                    />
                    <input
                      type="text"
                      value={stat.label}
                      onChange={(e) => setHero((h) => ({ ...h, stats: h.stats.map((s) => s.id === stat.id ? { ...s, label: e.target.value } : s) }))}
                      className={inputClass}
                      placeholder="Happy Customers"
                    />
                  </div>
                  <button
                    onClick={() => setHero((h) => ({ ...h, stats: h.stats.filter((s) => s.id !== stat.id) }))}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AdminCard>

    </div>
  );
}

// =====================
// HOMEPAGE SECTIONS DATA TYPES
// =====================

interface TrustBadgeItem {
  id: string;
  label: string;
  value: string;
}

interface CategoryShowcaseItem {
  id: string;
  title: string;
  description: string;
  image: string;
  href: string;
}

interface SectionHeadingData {
  eyebrow: string;
  title: string;
  subtitle: string;
}

interface NewsletterContent {
  eyebrow: string;
  heading: string;
  description: string;
  successMessage: string;
  backgroundImage: string;
}

interface HomepageSections {
  trustBadges: TrustBadgeItem[];
  categoryShowcase: {
    heading: SectionHeadingData;
    categories: CategoryShowcaseItem[];
    exploreLabel: string;
  };
  featuredProducts: {
    heading: SectionHeadingData;
    productIds: string[];
    ctaLabel: string;
    ctaLink: string;
  };
  newsletter: NewsletterContent;
}

const defaultSections: HomepageSections = {
  trustBadges: neutralFigures(),
  categoryShowcase: {
    heading: { eyebrow: 'Shop by Category', title: 'Find Your Perfect Fireworks', subtitle: 'Explore our curated collection across every category' },
    categories: [
      { id: '1', title: 'Aerial Shells', description: 'Sky-painting masterpieces', image: 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=600&q=80', href: '/shop?category=aerial' },
      { id: '2', title: 'Sparklers', description: 'Elegant hand-held magic', image: 'https://images.unsplash.com/photo-1482575832494-771f74bf6857?w=600&q=80', href: '/shop?category=sparklers' },
      { id: '3', title: 'Rockets', description: 'Soaring performances', image: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=600&q=80', href: '/shop?category=rockets' },
      { id: '4', title: 'Combo Packs', description: 'Complete celebration kits', image: 'https://images.unsplash.com/photo-1533230408708-8f9f91d1235a?w=600&q=80', href: '/combo-packs' },
    ],
    exploreLabel: 'Explore',
  },
  featuredProducts: {
    heading: { eyebrow: 'Curated Selection', title: 'Featured Products', subtitle: 'Hand-picked premium fireworks for unforgettable celebrations' },
    productIds: [],
    ctaLabel: 'View All Products',
    ctaLink: '/shop',
  },
  newsletter: {
    eyebrow: 'Stay Updated',
    heading: 'Get Early Access to Seasonal Collections',
    description: 'Be the first to know about new arrivals, exclusive deals, and seasonal offers.',
    successMessage: "You're in! Watch your inbox.",
    backgroundImage: 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=1920&q=30',
  },
};

// =====================
// HOMEPAGE SECTIONS TAB
// =====================

function HomepageSectionsTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [sections, setSections] = useState<HomepageSections>(defaultSections);
  const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
  const [availableProducts, setAvailableProducts] = useState<AdminProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { getContentSection, getAllCategories, getActiveProducts } = await import('@/services/admin.ts');
        // Only the section itself decides whether saving is safe; the two pick
        // lists just feed the "add from catalogue" dropdowns.
        const [data, cats, prods] = await Promise.all([
          getContentSection<HomepageSections>('homepage-sections'),
          getAllCategories().catch(() => ({ data: [] as Category[] })),
          getActiveProducts().catch(() => [] as AdminProduct[]),
        ]);
        if (data) {
          const merged = { ...defaultSections, ...data };
          setSections({
            ...merged,
            trustBadges: withIds(merged.trustBadges),
            categoryShowcase: {
              ...defaultSections.categoryShowcase,
              ...merged.categoryShowcase,
              categories: withIds(merged.categoryShowcase?.categories),
            },
          });
        }
        setAvailableCategories(cats.data);
        setAvailableProducts(prods);
      } catch (err) {
        setLoadError(loadErrorText(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (loadError) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const { updateContentSection } = await import('@/services/admin.ts');
      await updateContentSection('homepage-sections', sections as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} label="Save Homepage Sections" />, saveSlot)}

      {/* Trust Bar */}
      <AdminCard title="Trust Bar">
        <SectionLabel label="Trust badges shown below hero" hint="Visible on: Homepage" />
        <div className="space-y-3">
          {sections.trustBadges.map((badge) => (
            <div key={badge.id} className="flex items-center gap-3 p-3 rounded-xl border border-surface-200 dark:border-surface-700">
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Label</label>
                  <input
                    type="text"
                    value={badge.label}
                    onChange={(e) => setSections((s) => ({
                      ...s,
                      trustBadges: s.trustBadges.map((b) => b.id === badge.id ? { ...b, label: e.target.value } : b),
                    }))}
                    className={inputClass}
                    placeholder="Premium Quality"
                  />
                </div>
                <div>
                  <label className={labelClass}>Value</label>
                  <input
                    type="text"
                    value={badge.value}
                    onChange={(e) => setSections((s) => ({
                      ...s,
                      trustBadges: s.trustBadges.map((b) => b.id === badge.id ? { ...b, value: e.target.value } : b),
                    }))}
                    className={inputClass}
                    placeholder="BIS Certified"
                  />
                </div>
              </div>
              <button
                onClick={() => setSections((s) => ({ ...s, trustBadges: s.trustBadges.filter((b) => b.id !== badge.id) }))}
                className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setSections((s) => ({
              ...s,
              trustBadges: [...s.trustBadges, { id: crypto.randomUUID(), label: '', value: '' }],
            }))}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-surface-300 dark:border-surface-600 text-body-sm text-surface-500 hover:text-brand-600 hover:border-brand-500/40 transition-colors"
          >
            <Plus size={16} /> Add Badge
          </button>
        </div>
      </AdminCard>

      {/* Category Showcase */}
      <AdminCard title="Category Showcase">
        <SectionLabel label="Category grid section" hint="Visible on: Homepage" />

        {/* Section Heading */}
        <div className="space-y-3 mb-5 p-4 rounded-xl bg-surface-50 dark:bg-surface-800/50">
          <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">Section Heading</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Eyebrow</label>
              <input
                type="text"
                value={sections.categoryShowcase.heading.eyebrow}
                onChange={(e) => setSections((s) => ({
                  ...s,
                  categoryShowcase: { ...s.categoryShowcase, heading: { ...s.categoryShowcase.heading, eyebrow: e.target.value } },
                }))}
                className={inputClass}
                placeholder="Shop by Category"
              />
            </div>
            <div>
              <label className={labelClass}>Title</label>
              <input
                type="text"
                value={sections.categoryShowcase.heading.title}
                onChange={(e) => setSections((s) => ({
                  ...s,
                  categoryShowcase: { ...s.categoryShowcase, heading: { ...s.categoryShowcase.heading, title: e.target.value } },
                }))}
                className={inputClass}
                placeholder="Find Your Perfect Fireworks"
              />
            </div>
            <div>
              <label className={labelClass}>Subtitle</label>
              <input
                type="text"
                value={sections.categoryShowcase.heading.subtitle}
                onChange={(e) => setSections((s) => ({
                  ...s,
                  categoryShowcase: { ...s.categoryShowcase, heading: { ...s.categoryShowcase.heading, subtitle: e.target.value } },
                }))}
                className={inputClass}
                placeholder="Explore our curated collection"
              />
            </div>
          </div>
          <div className="max-w-xs">
            <label className={labelClass}>Card "Explore" Label</label>
            <input
              type="text"
              value={sections.categoryShowcase.exploreLabel ?? ''}
              onChange={(e) => setSections((s) => ({ ...s, categoryShowcase: { ...s.categoryShowcase, exploreLabel: e.target.value } }))}
              className={inputClass}
              placeholder="Explore"
            />
          </div>
        </div>

        {/* Category Items */}
        <div className="space-y-3">
          {sections.categoryShowcase.categories.map((cat) => (
            <div key={cat.id} className="flex items-start gap-3 p-3 rounded-xl border border-surface-200 dark:border-surface-700">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Title</label>
                  <input
                    type="text"
                    value={cat.title}
                    onChange={(e) => setSections((s) => ({
                      ...s,
                      categoryShowcase: { ...s.categoryShowcase, categories: s.categoryShowcase.categories.map((c) => c.id === cat.id ? { ...c, title: e.target.value } : c) },
                    }))}
                    className={inputClass}
                    placeholder="Aerial Shells"
                  />
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <input
                    type="text"
                    value={cat.description}
                    onChange={(e) => setSections((s) => ({
                      ...s,
                      categoryShowcase: { ...s.categoryShowcase, categories: s.categoryShowcase.categories.map((c) => c.id === cat.id ? { ...c, description: e.target.value } : c) },
                    }))}
                    className={inputClass}
                    placeholder="Sky-painting masterpieces"
                  />
                </div>
                <ImageUploadField
                  label="Image"
                  value={cat.image}
                  onChange={(url) => setSections((s) => ({
                    ...s,
                    categoryShowcase: { ...s.categoryShowcase, categories: s.categoryShowcase.categories.map((c) => c.id === cat.id ? { ...c, image: url } : c) },
                  }))}
                  folder="content"
                  previewClassName="w-20 h-20 rounded-lg"
                />
              </div>
              <button
                onClick={() => setSections((s) => ({
                  ...s,
                  categoryShowcase: { ...s.categoryShowcase, categories: s.categoryShowcase.categories.filter((c) => c.id !== cat.id) },
                }))}
                className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0 mt-1"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="pt-2">
            <Select
              searchable
              searchPlaceholder="Search categories..."
              value=""
              onChange={(catId) => {
                if (!catId) return;
                const cat = availableCategories.find((c) => c.id === catId);
                if (cat) {
                  setSections((s) => ({
                    ...s,
                    categoryShowcase: {
                      ...s.categoryShowcase,
                      categories: [
                        ...s.categoryShowcase.categories,
                        {
                          id: crypto.randomUUID(),
                          title: cat.name,
                          description: cat.description || '',
                          image: cat.image || '',
                          href: `/shop?category=${cat.slug}`,
                        },
                      ],
                    },
                  }));
                }
              }}
              options={[
                { value: '', label: '+ Add Category from Management...' },
                ...availableCategories.map(c => ({ value: c.id, label: c.name }))
              ]}
              className="border-dashed border-surface-300 dark:border-surface-600 text-surface-500 hover:border-brand-500/40 hover:text-brand-600 transition-colors"
            />
          </div>
        </div>
      </AdminCard>

      {/* Featured Products */}
      <AdminCard title="Featured Products">
        <SectionLabel label="Product grid section" hint="Visible on: Homepage" />

        <div className="space-y-3 mb-5 p-4 rounded-xl bg-surface-50 dark:bg-surface-800/50">
          <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">Section Heading</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Eyebrow</label>
              <input
                type="text"
                value={sections.featuredProducts.heading.eyebrow}
                onChange={(e) => setSections((s) => ({
                  ...s,
                  featuredProducts: { ...s.featuredProducts, heading: { ...s.featuredProducts.heading, eyebrow: e.target.value } },
                }))}
                className={inputClass}
                placeholder="Curated Selection"
              />
            </div>
            <div>
              <label className={labelClass}>Title</label>
              <input
                type="text"
                value={sections.featuredProducts.heading.title}
                onChange={(e) => setSections((s) => ({
                  ...s,
                  featuredProducts: { ...s.featuredProducts, heading: { ...s.featuredProducts.heading, title: e.target.value } },
                }))}
                className={inputClass}
                placeholder="Featured Products"
              />
            </div>
            <div>
              <label className={labelClass}>Subtitle</label>
              <input
                type="text"
                value={sections.featuredProducts.heading.subtitle}
                onChange={(e) => setSections((s) => ({
                  ...s,
                  featuredProducts: { ...s.featuredProducts, heading: { ...s.featuredProducts.heading, subtitle: e.target.value } },
                }))}
                className={inputClass}
                placeholder="Hand-picked premium fireworks"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Bottom CTA Label</label>
            <input type="text" value={sections.featuredProducts.ctaLabel ?? ''} onChange={(e) => setSections((s) => ({ ...s, featuredProducts: { ...s.featuredProducts, ctaLabel: e.target.value } }))} className={inputClass} placeholder="View All Products" />
          </div>
        </div>

        <div>
          <label className={labelClass}>Featured Products</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {sections.featuredProducts.productIds.map((id) => {
              const p = availableProducts.find(p => p.id === id);
              return (
                <div key={id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700">
                  <span className="text-body-sm text-surface-700 dark:text-surface-300">
                    {p ? p.name : id}
                  </span>
                  <button
                    onClick={() => setSections(s => ({
                      ...s,
                      featuredProducts: {
                        ...s.featuredProducts,
                        productIds: s.featuredProducts.productIds.filter(pid => pid !== id)
                      }
                    }))}
                    className="text-surface-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
          <Select
            searchable
            searchPlaceholder="Search products..."
            value=""
            onChange={(productId) => {
              if (!productId) return;
              if (sections.featuredProducts.productIds.includes(productId)) return;
              setSections((s) => ({
                ...s,
                featuredProducts: {
                  ...s.featuredProducts,
                  productIds: [...s.featuredProducts.productIds, productId],
                },
              }));
            }}
            options={[
              { value: '', label: '+ Add Product from Management...' },
              ...availableProducts
                .filter(p => !sections.featuredProducts.productIds.includes(p.id))
                .map(p => ({ value: p.id, label: p.name }))
            ]}
            className="border-dashed border-surface-300 dark:border-surface-600 text-surface-500 hover:border-brand-500/40 hover:text-brand-600 transition-colors mt-4"
          />
          <p className={helpClass}>
            {sections.featuredProducts.productIds.length > 0
              ? `${sections.featuredProducts.productIds.length} products selected`
              : 'Shows default featured products when empty'}
          </p>
        </div>
      </AdminCard>

      {/* Newsletter CTA */}
      <AdminCard title="Newsletter CTA">
        <SectionLabel label="Newsletter signup section" hint="Visible on: Homepage (bottom)" />
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Eyebrow</label>
            <input
              type="text"
              value={sections.newsletter.eyebrow}
              onChange={(e) => setSections((s) => ({ ...s, newsletter: { ...s.newsletter, eyebrow: e.target.value } }))}
              className={inputClass}
              placeholder="Stay Updated"
            />
          </div>
          <div>
            <label className={labelClass}>Heading</label>
            <input
              type="text"
              value={sections.newsletter.heading}
              onChange={(e) => setSections((s) => ({ ...s, newsletter: { ...s.newsletter, heading: e.target.value } }))}
              className={inputClass}
              placeholder="Get Early Access to Seasonal Collections"
            />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={sections.newsletter.description}
              onChange={(e) => setSections((s) => ({ ...s, newsletter: { ...s.newsletter, description: e.target.value } }))}
              className={`${inputClass} resize-none`}
              rows={2}
              placeholder="Join 25,000+ celebration enthusiasts..."
            />
          </div>
          <div>
            <label className={labelClass}>Success Message</label>
            <input
              type="text"
              value={sections.newsletter.successMessage}
              onChange={(e) => setSections((s) => ({ ...s, newsletter: { ...s.newsletter, successMessage: e.target.value } }))}
              className={inputClass}
              placeholder="You're in! Watch your inbox."
            />
          </div>
          <ImageUploadField
            label="Background Image"
            value={sections.newsletter.backgroundImage ?? ''}
            onChange={(url) => setSections((s) => ({ ...s, newsletter: { ...s.newsletter, backgroundImage: url } }))}
            folder="content"
            previewClassName="w-full aspect-[21/9] rounded-xl"
          />
        </div>
      </AdminCard>

    </div>
  );
}

// =====================
// TESTIMONIALS TAB
// =====================

interface TestimonialsHeading {
  eyebrow: string;
  title: string;
  subtitle: string;
}

const defaultTestimonialsHeading: TestimonialsHeading = {
  eyebrow: 'Customer Love',
  title: 'What Our Customers Say',
  subtitle: 'Stories from customers who celebrated with us.',
};

function TestimonialsTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [testimonials, setTestimonials] = useState<AdminTestimonial[]>([]);
  const [heading, setHeading] = useState<TestimonialsHeading>(defaultTestimonialsHeading);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { getContentSection } = await import('@/services/admin.ts');
        const data = await getContentSection<{ testimonials?: AdminTestimonial[]; heading?: TestimonialsHeading }>('testimonials');
        if (data?.testimonials) setTestimonials(withIds(data.testimonials));
        if (data?.heading) setHeading({ ...defaultTestimonialsHeading, ...data.heading });
      } catch (err) {
        setLoadError(loadErrorText(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (loadError) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const { updateContentSection } = await import('@/services/admin.ts');
      await updateContentSection('testimonials', { heading, testimonials });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const addTestimonial = () => {
    setTestimonials((prev) => [...prev, {
      id: crypto.randomUUID(),
      name: '',
      location: '',
      rating: 5,
      text: '',
      avatar: '',
      isActive: true,
      order: prev.length,
    }]);
  };

  const update = (id: string, field: string, value: string | number | boolean) => {
    setTestimonials((prev) => prev.map((t) => t.id === id ? { ...t, [field]: value } : t));
  };

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} />, saveSlot)}

      <AdminCard title="Section Heading">
        <SectionLabel label="Heading above the testimonial cards" hint="Visible on: Homepage" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Eyebrow</label>
            <input type="text" value={heading.eyebrow} onChange={(e) => setHeading((h) => ({ ...h, eyebrow: e.target.value }))} className={inputClass} placeholder="Customer Love" />
          </div>
          <div>
            <label className={labelClass}>Title</label>
            <input type="text" value={heading.title} onChange={(e) => setHeading((h) => ({ ...h, title: e.target.value }))} className={inputClass} placeholder="What Our Customers Say" />
          </div>
          <div>
            <label className={labelClass}>Subtitle</label>
            <input type="text" value={heading.subtitle} onChange={(e) => setHeading((h) => ({ ...h, subtitle: e.target.value }))} className={inputClass} placeholder="Real reviews from celebrations across India" />
          </div>
        </div>
      </AdminCard>

      <AdminCard
        title={`Testimonials (${testimonials.length})`}
        titleAction={
          <button onClick={addTestimonial} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm text-brand-600 dark:text-brand-400 font-medium hover:bg-brand-500/10 transition-colors">
            <Plus size={16} /> Add Testimonial
          </button>
        }
      >
        <SectionLabel label="Customer reviews section" hint="Visible on: Homepage" />

        {testimonials.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-body-sm text-surface-500">No testimonials yet</p>
            <button onClick={addTestimonial} className="mt-2 text-body-sm text-brand-600 font-medium hover:underline">Add your first testimonial</button>
          </div>
        ) : (
          <div className="space-y-4">
            {testimonials.map((t, i) => (
              <div key={t.id} className="rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-700">
                  <GripVertical size={16} className="text-surface-300 flex-shrink-0" />
                  <span className="text-body-sm font-medium text-surface-900 dark:text-surface-100 flex-1 truncate">
                    {t.name || `Testimonial ${i + 1}`}
                  </span>
                  {/* Star Rating */}
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => update(t.id, 'rating', star)}
                        className={cn('transition-colors', star <= t.rating ? 'text-amber-400' : 'text-surface-300')}
                      >
                        <Star size={14} fill={star <= t.rating ? 'currentColor' : 'none'} />
                      </button>
                    ))}
                  </div>
                  <Toggle checked={t.isActive} onChange={(v) => update(t.id, 'isActive', v)} />
                  <button
                    onClick={() => setTestimonials((prev) => prev.filter((x) => x.id !== t.id))}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                    <input type="text" value={t.name} onChange={(e) => update(t.id, 'name', e.target.value)} placeholder="Customer name" className={inputClass} />
                    <input type="text" value={t.location} onChange={(e) => update(t.id, 'location', e.target.value)} placeholder="Location (e.g., Mumbai)" className={inputClass} />
                    <div className="flex items-center gap-2">
                      <ImageUploadField
                        value={t.avatar}
                        onChange={(url) => update(t.id, 'avatar', url)}
                        folder="content"
                        previewClassName="w-10 h-10 rounded-full flex-shrink-0"
                        compact
                      />
                      <span className="text-caption text-surface-400">Avatar (optional)</span>
                    </div>
                  </div>
                  <textarea
                    value={t.text}
                    onChange={(e) => update(t.id, 'text', e.target.value)}
                    placeholder="Testimonial text..."
                    rows={3}
                    className={`${inputClass} resize-none`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  );
}

// =====================
// COMPANY INFO TAB
// =====================

const emptyCompanyInfo: CompanyInfo = {
  logoAssets: null,
  name: '',
  tagline: '',
  description: '',
  phone: '',
  email: '',
  whatsapp: '',
  address: '',
  city: '',
  state: '',
  socialInstagram: '',
  socialFacebook: '',
  socialYoutube: '',
  socialTelegram: '',
  logo: '',
  footerBlurb: '',
  whatsappMessage: 'Hi {name} team! I have a question.',
  whatsappTooltip: 'Chat with us on WhatsApp',
};

function CompanyInfoTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [info, setInfo] = useState<CompanyInfo>(emptyCompanyInfo);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { getContentSection } = await import('@/services/admin.ts');
        const data = await getContentSection<CompanyInfo>('company-info');
        if (data) setInfo({ ...emptyCompanyInfo, ...data });
      } catch (err) {
        setLoadError(loadErrorText(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (loadError) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const { updateContentSection } = await import('@/services/admin.ts');
      await updateContentSection('company-info', info as unknown as Record<string, unknown>);
      // Trigger a re-fetch of site data so SEO/favicon updates everywhere dynamically
      useSiteStore.getState().fetchCompanyInfo();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const set = useCallback((field: keyof CompanyInfo, value: string) => {
    setInfo((prev) => ({ ...prev, [field]: value }));
  }, []);

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} />, saveSlot)}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Brand */}
        <AdminCard title="Brand">
          <SectionLabel label="Site branding & identity" hint="Visible on: Navbar, Footer, SEO" />
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Company Name</label>
              <input type="text" value={info.name} onChange={(e) => set('name', e.target.value)} className={inputClass} placeholder="Your company name" />
            </div>
            <div>
              <label className={labelClass}>Tagline</label>
              <input type="text" value={info.tagline} onChange={(e) => set('tagline', e.target.value)} className={inputClass} placeholder="Premium Fireworks for Every Celebration" />
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <textarea value={info.description} onChange={(e) => set('description', e.target.value)} className={`${inputClass} resize-none`} rows={3} placeholder="About the company..." />
              <p className={helpClass}>Used in SEO meta tags and footer</p>
            </div>
            <LogoUploadField
              value={info.logo}
              assets={info.logoAssets}
              onChange={(logo, logoAssets) => setInfo((prev) => ({ ...prev, logo, logoAssets }))}
            />
            <p className={helpClass}>
              Upload once — the background is removed and the favicon, app icons, header mark,
              loading screen and share image are generated from it automatically. Leave blank to
              use the built-in logo.
            </p>
          </div>
        </AdminCard>

        {/* Contact */}
        <AdminCard title="Contact Information">
          <SectionLabel label="Contact details" hint="Visible on: Footer, Contact page" />
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Phone</label>
                <input type="tel" value={info.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className={labelClass}>WhatsApp</label>
                <input type="tel" value={info.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} className={inputClass} placeholder="+91 98765 43210" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={info.email} onChange={(e) => set('email', e.target.value)} className={inputClass} placeholder="hello@yourstore.com" />
            </div>
            <div>
              <label className={labelClass}>Address</label>
              <input type="text" value={info.address} onChange={(e) => set('address', e.target.value)} className={inputClass} placeholder="Street address" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>City</label>
                <input type="text" value={info.city} onChange={(e) => set('city', e.target.value)} className={inputClass} placeholder="Sivakasi" />
              </div>
              <div>
                <label className={labelClass}>State</label>
                <input type="text" value={info.state} onChange={(e) => set('state', e.target.value)} className={inputClass} placeholder="Tamil Nadu" />
              </div>
            </div>
          </div>
        </AdminCard>

        {/* Social Media */}
        <AdminCard title="Social Media" className="lg:col-span-2">
          <SectionLabel label="Social media links" hint="Visible on: Footer, Contact page" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Instagram URL</label>
              <input type="url" value={info.socialInstagram} onChange={(e) => set('socialInstagram', e.target.value)} className={inputClass} placeholder="https://instagram.com/..." />
            </div>
            <div>
              <label className={labelClass}>Facebook URL</label>
              <input type="url" value={info.socialFacebook} onChange={(e) => set('socialFacebook', e.target.value)} className={inputClass} placeholder="https://facebook.com/..." />
            </div>
            <div>
              <label className={labelClass}>YouTube URL</label>
              <input type="url" value={info.socialYoutube} onChange={(e) => set('socialYoutube', e.target.value)} className={inputClass} placeholder="https://youtube.com/..." />
            </div>
            <div>
              <label className={labelClass}>Telegram URL</label>
              <input type="url" value={info.socialTelegram} onChange={(e) => set('socialTelegram', e.target.value)} className={inputClass} placeholder="https://t.me/..." />
            </div>
            {/* WhatsApp has no field of its own: the footer and the chat button
                both link to the number set under Contact Details above. */}
          </div>
        </AdminCard>

        <AdminCard title="Storefront Copy" className="lg:col-span-2">
          <SectionLabel label="Footer blurb & WhatsApp button" hint="Visible on: Footer, WhatsApp button" />
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Footer Blurb</label>
              <input type="text" value={info.footerBlurb} onChange={(e) => set('footerBlurb', e.target.value)} className={inputClass} placeholder="Premium Fireworks for Every Celebration. Trusted by 50,000+ customers across India." />
              <p className={helpClass}>The sentence under the logo in the footer. Leave blank to auto-build from tagline.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>WhatsApp Pre-filled Message</label>
                <input type="text" value={info.whatsappMessage} onChange={(e) => set('whatsappMessage', e.target.value)} className={inputClass} placeholder="Hi {name} team! I have a question." />
                <p className={helpClass}>{'Use {name} for the company name.'}</p>
              </div>
              <div>
                <label className={labelClass}>WhatsApp Button Tooltip</label>
                <input type="text" value={info.whatsappTooltip} onChange={(e) => set('whatsappTooltip', e.target.value)} className={inputClass} placeholder="Chat with us on WhatsApp" />
              </div>
            </div>
          </div>
        </AdminCard>
      </div>
    </div>
  );
}

// =====================
// FAQ TAB
// =====================

interface FAQHeader {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaHeading: string;
  ctaSubtitle: string;
  ctaButtonLabel: string;
  ctaButtonLink: string;
}

const defaultFAQHeader: FAQHeader = {
  eyebrow: 'Help Center',
  title: 'Frequently Asked Questions',
  subtitle: 'Everything you need to know about ordering, safety, shipping, and more.',
  ctaHeading: 'Still have questions?',
  ctaSubtitle: 'Our team is happy to help. Reach out anytime.',
  ctaButtonLabel: 'Contact Us',
  ctaButtonLink: '/contact',
};

function FAQTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [categories, setCategories] = useState<FAQCategory[]>([]);
  const [header, setHeader] = useState<FAQHeader>(defaultFAQHeader);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { getContentSection } = await import('@/services/admin.ts');
        const data = await getContentSection<{ categories?: FAQCategory[]; header?: FAQHeader }>('faq');
        if (data?.categories) {
          setCategories(withIds(data.categories).map((c) => ({ ...c, items: withIds(c.items) })));
        }
        if (data?.header) setHeader({ ...defaultFAQHeader, ...data.header });
      } catch (err) {
        setLoadError(loadErrorText(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (loadError) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const { updateContentSection } = await import('@/services/admin.ts');
      await updateContentSection('faq', { categories, header });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const setH = (field: keyof FAQHeader, value: string) => setHeader((h) => ({ ...h, [field]: value }));

  const addCategory = () => {
    const newCat: FAQCategory = {
      id: crypto.randomUUID(),
      name: '',
      icon: '❓',
      items: [],
      order: categories.length,
    };
    setCategories((prev) => [...prev, newCat]);
    setExpandedCat(newCat.id);
  };

  const addItem = (catId: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, items: [...c.items, { id: crypto.randomUUID(), question: '', answer: '' }] }
          : c,
      ),
    );
  };

  const updateItem = (catId: string, itemId: string, field: keyof FAQItem, value: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, items: c.items.map((item) => item.id === itemId ? { ...item, [field]: value } : item) }
          : c,
      ),
    );
  };

  const removeItem = (catId: string, itemId: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, items: c.items.filter((item) => item.id !== itemId) }
          : c,
      ),
    );
  };

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} />, saveSlot)}

      <AdminCard title="Page Header">
        <SectionLabel label="FAQ page hero & search" hint="Visible on: /faq" />
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Eyebrow</label>
              <input type="text" value={header.eyebrow} onChange={(e) => setH('eyebrow', e.target.value)} className={inputClass} placeholder="Help Center" />
            </div>
            <div>
              <label className={labelClass}>Title</label>
              <input type="text" value={header.title} onChange={(e) => setH('title', e.target.value)} className={inputClass} placeholder="Frequently Asked Questions" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Subtitle</label>
            <input type="text" value={header.subtitle} onChange={(e) => setH('subtitle', e.target.value)} className={inputClass} placeholder="Everything you need to know..." />
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Bottom CTA">
        <SectionLabel label="'Still have questions?' call-to-action" hint="Visible on: /faq (bottom)" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Heading</label>
            <input type="text" value={header.ctaHeading} onChange={(e) => setH('ctaHeading', e.target.value)} className={inputClass} placeholder="Still have questions?" />
          </div>
          <div>
            <label className={labelClass}>Subtitle</label>
            <input type="text" value={header.ctaSubtitle} onChange={(e) => setH('ctaSubtitle', e.target.value)} className={inputClass} placeholder="Our team is happy to help." />
          </div>
          <div>
            <label className={labelClass}>Button Label</label>
            <input type="text" value={header.ctaButtonLabel} onChange={(e) => setH('ctaButtonLabel', e.target.value)} className={inputClass} placeholder="Contact Us" />
          </div>
        </div>
      </AdminCard>

      <div className="flex items-center justify-between">
        <p className="text-body-sm text-surface-500">{categories.length} categories, {categories.reduce((sum, c) => sum + c.items.length, 0)} questions total</p>
        <button
          onClick={addCategory}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm text-brand-600 dark:text-brand-400 font-medium hover:bg-brand-500/10 transition-colors"
        >
          <Plus size={16} /> Add Category
        </button>
      </div>

      {categories.length === 0 ? (
        <AdminCard>
          <div className="text-center py-8">
            <HelpCircle size={32} className="text-surface-300 mx-auto mb-3" />
            <p className="text-body-sm text-surface-500">No FAQ categories yet</p>
            <button onClick={addCategory} className="mt-2 text-body-sm text-brand-600 font-medium hover:underline">Add your first category</button>
          </div>
        </AdminCard>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const isExpanded = expandedCat === cat.id;
            return (
              <div key={cat.id} className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 overflow-hidden">
                {/* Category Header */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                  onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                >
                  <input
                    type="text"
                    value={cat.icon}
                    onChange={(e) => { e.stopPropagation(); setCategories((prev) => prev.map((c) => c.id === cat.id ? { ...c, icon: e.target.value } : c)); }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-10 text-center text-lg p-1 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800"
                    maxLength={4}
                  />
                  <input
                    type="text"
                    value={cat.name}
                    onChange={(e) => { e.stopPropagation(); setCategories((prev) => prev.map((c) => c.id === cat.id ? { ...c, name: e.target.value } : c)); }}
                    onClick={(e) => e.stopPropagation()}
                    className={`${inputClass} flex-1`}
                    placeholder="Category name (e.g., Ordering & Payment)"
                  />
                  <span className="text-caption text-surface-400 flex-shrink-0">{cat.items.length} Q&A</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setCategories((prev) => prev.filter((c) => c.id !== cat.id)); }}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Expanded Q&A Items */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-surface-100 dark:border-surface-800 space-y-3 pt-4">
                    {cat.items.map((item, idx) => (
                      <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50">
                        <span className="w-6 h-6 rounded-lg bg-surface-200 dark:bg-surface-700 flex items-center justify-center text-caption font-semibold text-surface-500 flex-shrink-0 mt-1">
                          {idx + 1}
                        </span>
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={item.question}
                            onChange={(e) => updateItem(cat.id, item.id, 'question', e.target.value)}
                            className={inputClass}
                            placeholder="Question"
                          />
                          <textarea
                            value={item.answer}
                            onChange={(e) => updateItem(cat.id, item.id, 'answer', e.target.value)}
                            className={`${inputClass} resize-none`}
                            rows={2}
                            placeholder="Answer"
                          />
                        </div>
                        <button
                          onClick={() => removeItem(cat.id, item.id)}
                          className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0 mt-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addItem(cat.id)}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-surface-300 dark:border-surface-600 text-body-sm text-surface-500 hover:text-brand-600 hover:border-brand-500/40 transition-colors"
                    >
                      <Plus size={16} /> Add Question
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =====================
// MAIN PAGE
// =====================

export function AdminContentPage() {
  const [activeTab, setActiveTab] = useState<TabId>('hero');
  const [saveSlot, setSaveSlot] = useState<HTMLDivElement | null>(null);

  return (
    <div className="space-y-6">
      {/* Tabs + Save */}
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-3">
        <nav className="flex gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-hide p-1 rounded-xl bg-surface-100/70 dark:bg-surface-900/60 border border-surface-200 dark:border-surface-800">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-shrink-0 items-center gap-2 px-3 py-1.5 rounded-lg text-body-sm font-medium whitespace-nowrap transition-all',
                  isActive
                    ? 'bg-white dark:bg-surface-800 text-brand-600 dark:text-brand-400 shadow-sm ring-1 ring-brand-500/20'
                    : 'text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-white/60 dark:hover:bg-surface-800/50',
                )}
              >
                <Icon size={16} className="flex-shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div ref={setSaveSlot} className="flex flex-shrink-0 [&>button]:h-full" />
      </div>

      {/* Tab Content */}
      {activeTab === 'hero' && <HeroBannersTab saveSlot={saveSlot} />}
      {activeTab === 'sections' && <HomepageSectionsTab saveSlot={saveSlot} />}
      {activeTab === 'about-preview' && <AboutPreviewTab saveSlot={saveSlot} />}
      {activeTab === 'testimonials' && <TestimonialsTab saveSlot={saveSlot} />}
      {activeTab === 'company' && <CompanyInfoTab saveSlot={saveSlot} />}
      {activeTab === 'contact' && <ContactPageTab saveSlot={saveSlot} />}
      {activeTab === 'about' && <AboutTab saveSlot={saveSlot} />}
      {activeTab === 'policies' && <PoliciesTab saveSlot={saveSlot} />}
      {activeTab === 'safety' && <SafetyTab saveSlot={saveSlot} />}
      {activeTab === 'product-page' && <ProductPageTab saveSlot={saveSlot} />}
      {activeTab === 'functional' && <FunctionalPagesTab saveSlot={saveSlot} />}
      {activeTab === 'quick-order' && <QuickOrderTab saveSlot={saveSlot} />}
      {activeTab === 'faq' && <FAQTab saveSlot={saveSlot} />}
      {activeTab === 'site' && <SiteSettingsTab saveSlot={saveSlot} />}
      {activeTab === 'theme' && <ThemeTab saveSlot={saveSlot} />}
      {activeTab === 'invoice' && <InvoiceTemplateTab saveSlot={saveSlot} />}
      {activeTab === 'wholesale-invoice' && <WholesaleInvoiceTemplateTab saveSlot={saveSlot} />}
      {/* Same pad, the factory's own letterhead — its name and GSTIN are not the shop's. */}
      {activeTab === 'factory-invoice' && (
        <WholesaleInvoiceTemplateTab saveSlot={saveSlot} sectionId="factory-invoice-template" />
      )}
      {activeTab === 'quotation-template' && <QuotationTemplateTab saveSlot={saveSlot} />}
    </div>
  );
}

/* ─────────────────────────── Product Page ─────────────────────────── */

interface ProductTrustSignal { id: string; icon: string; label: string; desc: string; }

/**
 * Icons offered for a badge.
 *
 * Stored as the Lucide name, shown as what the picture actually is — nobody
 * choosing an icon knows that "RotateCcw" is the returns arrow. A stored name
 * the renderer cannot find falls back to a star.
 */
const TRUST_ICONS: { value: string; label: string }[] = [
  { value: 'Truck', label: 'Delivery truck' },
  { value: 'Shield', label: 'Shield' },
  { value: 'RotateCcw', label: 'Returns arrow' },
  { value: 'BadgeCheck', label: 'Verified badge' },
  { value: 'Award', label: 'Award' },
  { value: 'Headphones', label: 'Support headset' },
  { value: 'Lock', label: 'Padlock' },
  { value: 'Sparkles', label: 'Sparkles' },
];

/**
 * The badge whose description is not typed here.
 *
 * The free-delivery line is built from the threshold in Settings → Shipping, so
 * the product page and the cart cannot promise different figures. Its heading
 * is still the shop's to write.
 */
const DERIVED_DESC_ID = 't1';

const defaultProductPage = {
  trustSignals: [
    { id: 't1', icon: 'Truck', label: 'Free Shipping', desc: '' },
    { id: 't2', icon: 'Shield', label: 'Certified Fireworks', desc: 'Safe to use as directed' },
    { id: 't3', icon: 'Lock', label: 'Secure Payments', desc: 'Your payment details stay protected' },
  ] as ProductTrustSignal[],
  safetyNotice: 'Professional-grade product. Adult supervision required. Please follow all safety guidelines.',
  relatedHeading: 'You May Also Like',
};

type ProductPageContent = typeof defaultProductPage;

function ProductPageTab({ saveSlot }: { saveSlot: HTMLElement | null }) {
  const [content, setContent] = useState<ProductPageContent>(defaultProductPage);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { getContentSection } = await import('@/services/admin.ts');
        const data = await getContentSection<ProductPageContent>('product-page');
        if (data) {
          setContent({
            ...defaultProductPage,
            ...data,
            trustSignals: withIds(data.trustSignals ?? defaultProductPage.trustSignals),
          });
        }
      } catch (err) {
        setLoadError(loadErrorText(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (loadError) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const { updateContentSection } = await import('@/services/admin.ts');
      await updateContentSection('product-page', content as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const setSignal = (id: string, field: keyof ProductTrustSignal, value: string) =>
    setContent((c) => ({
      ...c,
      trustSignals: c.trustSignals.map((sig) => (sig.id === id ? { ...sig, [field]: value } : sig)),
    }));

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} label="Save Product Page" />, saveSlot)}

      <AdminCard title="Trust Badges">
        <SectionLabel
          label="The row under the Add to Cart button"
          hint="Visible on: every product page. These read as promises, so say only what the shop can stand behind."
        />

        <div className="space-y-3">
          {content.trustSignals.map((sig) => {
            const derived = sig.id === DERIVED_DESC_ID;
            return (
              <div
                key={sig.id}
                className="flex items-start gap-3 p-3 rounded-xl border border-surface-200 dark:border-surface-800"
              >
                <div className="flex-1 grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Icon</label>
                    <Select
                      value={sig.icon}
                      onChange={(v) => setSignal(sig.id, 'icon', v)}
                      options={TRUST_ICONS}
                      size="md"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Heading</label>
                    <input
                      type="text"
                      value={sig.label}
                      onChange={(e) => setSignal(sig.id, 'label', e.target.value)}
                      className={inputClass}
                      placeholder="Easy Returns"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Description</label>
                    {derived ? (
                      <>
                        <input
                          type="text"
                          value="Taken from your free-delivery threshold"
                          readOnly
                          disabled
                          className={cn(inputClass, 'opacity-60 cursor-not-allowed')}
                        />
                        <p className="text-caption text-surface-400 mt-1">
                          Set under Settings, Shipping — so this and the cart always agree. The badge hides
                          itself when there is no threshold.
                        </p>
                      </>
                    ) : (
                      <input
                        type="text"
                        value={sig.desc}
                        onChange={(e) => setSignal(sig.id, 'desc', e.target.value)}
                        className={inputClass}
                        placeholder="7-day return policy"
                      />
                    )}
                  </div>
                </div>

                <button
                  onClick={() =>
                    setContent((c) => ({ ...c, trustSignals: c.trustSignals.filter((b) => b.id !== sig.id) }))
                  }
                  className="mt-7 p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"
                  title="Remove this badge"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}

          <button
            onClick={() =>
              setContent((c) => ({
                ...c,
                trustSignals: [
                  ...c.trustSignals,
                  { id: crypto.randomUUID(), icon: 'BadgeCheck', label: '', desc: '' },
                ],
              }))
            }
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-surface-300 dark:border-surface-600 text-body-sm text-surface-500 hover:text-brand-600 hover:border-brand-500/40 transition-colors"
          >
            <Plus size={15} /> Add a badge
          </button>
        </div>
      </AdminCard>

      <AdminCard title="Safety Notice">
        <SectionLabel
          label="Shown on products rated professional"
          hint="Visible on: product pages whose Safety Rating is Professional"
        />
        <textarea
          value={content.safetyNotice}
          onChange={(e) => setContent((c) => ({ ...c, safetyNotice: e.target.value }))}
          rows={3}
          className={inputClass}
        />
      </AdminCard>

      <AdminCard title="Related Products">
        <SectionLabel label="Heading above the suggestions" hint="Visible on: every product page" />
        <input
          type="text"
          value={content.relatedHeading}
          onChange={(e) => setContent((c) => ({ ...c, relatedHeading: e.target.value }))}
          className={inputClass}
          placeholder="You May Also Like"
        />
      </AdminCard>
    </div>
  );
}
