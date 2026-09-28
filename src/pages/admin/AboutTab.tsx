import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { SaveButton, SuccessToast, SectionLabel, ErrorNotice, errorText, loadErrorText } from '@/components/admin/AdminShared.tsx';
import { ImageUploadField } from '@/components/admin/ImageUploadField.tsx';
import { getContentSection, updateContentSection } from '@/services/admin.ts';
import { useSiteStore } from '@/store/site.ts';
import { siteConfig } from '@/config/site.ts';

const inputClass =
  'w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

export interface Milestone {
  id: string;
  year: string;
  title: string;
  desc: string;
}

export interface ValueProp {
  id: string;
  icon: string;
  title: string;
  desc: string;
}

export interface Stat {
  id: string;
  value: string;
  label: string;
}

export interface CraftBullet {
  id: string;
  icon: string;
  text: string;
}

export interface AboutPageData {
  heroEyebrow: string;
  heroTitle: string;
  heroHighlight: string;
  heroSubtitle: string;
  heroImage: string;
  aboutSideImage: string;
  stats: Stat[];
  values: ValueProp[];
  milestones: Milestone[];
  // Mission section
  missionEyebrow: string;
  missionTitle: string;
  missionBody: string;
  // Section headings
  valuesEyebrow: string;
  valuesTitle: string;
  timelineEyebrow: string;
  timelineTitle: string;
  // Craft / Factory section
  craftEyebrow: string;
  craftTitle: string;
  craftBody: string;
  craftBullets: CraftBullet[];
  // Final CTA
  ctaTitle: string;
  ctaSubtitle: string;
  ctaPrimaryLabel: string;
  ctaPrimaryLink: string;
  ctaSecondaryLabel: string;
  ctaSecondaryLink: string;
  ctaBgImage: string;
}

/**
 * Starting copy for a shop that has not written its About page yet.
 *
 * Deliberately free of any one shop's history — this admin serves more than one
 * brand, and the defaults are what gets published if Save is pressed before
 * every line is rewritten. So: no founding year, no family name, no headcounts,
 * and the shop's own name wherever a name is needed.
 */
function defaultAboutData(siteName: string): AboutPageData {
  const name = siteName || 'We';
  return {
    heroEyebrow: 'Our Story',
    heroTitle: 'Crafting',
    heroHighlight: 'Every Celebration',
    heroSubtitle: `${name} brings you quality fireworks for every festival, wedding and family occasion — carefully sourced, safely packed and fairly priced.`,
    heroImage: 'https://images.unsplash.com/photo-1533604100650-3bf1c8b3e8e8?w=1920&q=30',
    aboutSideImage: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=800&q=80',
    // The shared neutral badges — no percentages or counts to stand behind.
    stats: siteConfig.trustBadges.map((b, i) => ({ id: String(i + 1), value: b.value, label: b.label })),
    values: [
      { id: '1', icon: 'Shield', title: 'Safety First', desc: 'Products are chosen for consistent quality and checked before they are packed.' },
      { id: '2', icon: 'Award', title: 'Quality You Can Trust', desc: 'Sourced only from licensed manufacturers, and stored and handled with care.' },
      { id: '3', icon: 'Heart', title: 'Customer First', desc: 'A real person to help you plan your order, before and after you buy.' },
      { id: '4', icon: 'Target', title: 'Something for Everyone', desc: 'From sparklers for the little ones to sky shots for the big night, including low-noise options.' },
    ],
    milestones: [
      { id: '1', year: String(new Date().getFullYear()), title: 'Online Store Opens', desc: `${name} opens its online store, so customers can browse the full range and order from home.` },
    ],
    missionEyebrow: 'Our Mission',
    missionTitle: 'To make every celebration unforgettable with fireworks that are safe, stunning, and accessible to all.',
    missionBody: "We believe celebrations are the moments that define our lives. Whether it's a child's first Diwali, a dream wedding, or a community gathering — the right fireworks transform an event into a memory that lasts forever.",
    valuesEyebrow: 'What Drives Us',
    valuesTitle: 'Our Core Values',
    timelineEyebrow: 'Our Journey',
    timelineTitle: 'Our Journey So Far',
    craftEyebrow: 'The Craft',
    craftTitle: 'Chosen and Packed with Care',
    craftBody: `Every product ${name} sells comes from licensed manufacturers, and is stored and packed to strict safety standards before it reaches you.`,
    craftBullets: [
      { id: 'c1', icon: 'Factory', text: 'Licensed manufacturers' },
      { id: 'c2', icon: 'Shield', text: 'Quality checks on every batch' },
      { id: 'c3', icon: 'Flame', text: 'Low-noise & eco-friendly options' },
      { id: 'c4', icon: 'Truck', text: 'Safe, dry storage' },
    ],
    ctaTitle: 'Ready to Create Unforgettable Moments?',
    ctaSubtitle: 'Browse our collection or reach out for custom event packages.',
    ctaPrimaryLabel: 'Shop Now',
    ctaPrimaryLink: '/shop',
    ctaSecondaryLabel: 'Contact Us',
    ctaSecondaryLink: '/contact',
    ctaBgImage: 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=1920&q=30',
  };
}

export function AboutTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [data, setData] = useState<AboutPageData>(() => defaultAboutData(useSiteStore.getState().config.name));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // A failed load leaves the defaults on screen; saving them would overwrite
  // the real section, so Save stays off until a reload succeeds.
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const fetched = await getContentSection<AboutPageData>('about-page');
        if (fetched) setData({ ...defaultAboutData(useSiteStore.getState().config.name), ...fetched });
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
      await updateContentSection('about-page', data as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (field: keyof AboutPageData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const updateArrayItem = <K extends 'stats' | 'values' | 'milestones' | 'craftBullets'>(
    arrayName: K,
    id: string,
    field: keyof AboutPageData[K][number],
    value: string
  ) => {
    setData(prev => ({
      ...prev,
      [arrayName]: (prev[arrayName] as Array<{ id: string }>).map((item) => item.id === id ? { ...item, [field]: value } : item)
    }) as AboutPageData);
  };

  const addArrayItem = (arrayName: 'stats' | 'values' | 'milestones' | 'craftBullets', newItem: { id: string; [key: string]: unknown }) => {
    setData(prev => ({
      ...prev,
      [arrayName]: [...prev[arrayName], newItem]
    }) as AboutPageData);
  };

  const removeArrayItem = (arrayName: 'stats' | 'values' | 'milestones' | 'craftBullets', id: string) => {
    setData(prev => ({
      ...prev,
      [arrayName]: (prev[arrayName] as Array<{ id: string }>).filter((item) => item.id !== id)
    }) as AboutPageData);
  };

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} label="Save About Page" />, saveSlot)}

      <AdminCard title="Hero Section">
        <SectionLabel label="Top hero banner for About Us page" hint="Visible on: /about" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Eyebrow</label>
            <input type="text" value={data.heroEyebrow} onChange={e => updateField('heroEyebrow', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Title (Part 1)</label>
            <input type="text" value={data.heroTitle} onChange={e => updateField('heroTitle', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Title Highlight (Part 2)</label>
            <input type="text" value={data.heroHighlight} onChange={e => updateField('heroHighlight', e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Subtitle</label>
            <textarea value={data.heroSubtitle} onChange={e => updateField('heroSubtitle', e.target.value)} className={inputClass} rows={2} />
          </div>
          <div className="sm:col-span-2">
            <ImageUploadField
              label="Hero Background Image"
              value={data.heroImage}
              onChange={(url) => updateField('heroImage', url)}
              folder="content"
              previewClassName="w-full h-32 rounded-xl"
            />
          </div>
          <div className="sm:col-span-2">
            <ImageUploadField
              label="Side Image (Factory/Craft Section)"
              value={data.aboutSideImage}
              onChange={(url) => updateField('aboutSideImage', url)}
              folder="content"
              previewClassName="w-full h-48 rounded-xl"
            />
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Mission Section">
        <SectionLabel label="Mission statement below the stats bar" hint="Visible on: /about" />
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Eyebrow</label>
            <input type="text" value={data.missionEyebrow} onChange={e => updateField('missionEyebrow', e.target.value)} className={inputClass} placeholder="Our Mission" />
          </div>
          <div>
            <label className={labelClass}>Mission Headline</label>
            <textarea value={data.missionTitle} onChange={e => updateField('missionTitle', e.target.value)} className={inputClass} rows={2} placeholder="To make every celebration unforgettable..." />
          </div>
          <div>
            <label className={labelClass}>Mission Body Paragraph</label>
            <textarea value={data.missionBody} onChange={e => updateField('missionBody', e.target.value)} className={inputClass} rows={3} placeholder="We believe celebrations are the moments..." />
          </div>
        </div>
      </AdminCard>

      <AdminCard title={`Key Stats (${data.stats.length})`}>
        <SectionLabel label="Statistics shown below the hero" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {data.stats.map(stat => (
            <div key={stat.id} className="flex items-start gap-2 p-3 rounded-xl border border-surface-200 dark:border-surface-700">
              <div className="flex-1 space-y-2">
                <input type="text" value={stat.value} onChange={e => updateArrayItem('stats', stat.id, 'value', e.target.value)} className={inputClass} placeholder="Value (e.g. 25+)" />
                <input type="text" value={stat.label} onChange={e => updateArrayItem('stats', stat.id, 'label', e.target.value)} className={inputClass} placeholder="Label" />
              </div>
              <button onClick={() => removeArrayItem('stats', stat.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => addArrayItem('stats', { id: crypto.randomUUID(), value: 'New', label: 'Stat' })} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
          <Plus size={14} /> Add Stat
        </button>
      </AdminCard>

      <AdminCard title={`Core Values (${data.values.length})`}>
        <SectionLabel label="Company values section" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <div>
            <label className={labelClass}>Section Eyebrow</label>
            <input type="text" value={data.valuesEyebrow} onChange={e => updateField('valuesEyebrow', e.target.value)} className={inputClass} placeholder="What Drives Us" />
          </div>
          <div>
            <label className={labelClass}>Section Heading</label>
            <input type="text" value={data.valuesTitle} onChange={e => updateField('valuesTitle', e.target.value)} className={inputClass} placeholder="Our Core Values" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {data.values.map(val => (
            <div key={val.id} className="flex items-start gap-3 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50">
              <div className="flex-1 space-y-3">
                <input type="text" value={val.title} onChange={e => updateArrayItem('values', val.id, 'title', e.target.value)} className={inputClass} placeholder="Title" />
                <textarea value={val.desc} onChange={e => updateArrayItem('values', val.id, 'desc', e.target.value)} className={inputClass} placeholder="Description" rows={2} />
              </div>
              <button onClick={() => removeArrayItem('values', val.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => addArrayItem('values', { id: crypto.randomUUID(), icon: 'Star', title: 'New Value', desc: 'Description' })} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
          <Plus size={14} /> Add Value
        </button>
      </AdminCard>

      <AdminCard title={`Milestones (${data.milestones.length})`}>
        <SectionLabel label="Company history timeline" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <div>
            <label className={labelClass}>Section Eyebrow</label>
            <input type="text" value={data.timelineEyebrow} onChange={e => updateField('timelineEyebrow', e.target.value)} className={inputClass} placeholder="Our Journey" />
          </div>
          <div>
            <label className={labelClass}>Section Heading</label>
            <input type="text" value={data.timelineTitle} onChange={e => updateField('timelineTitle', e.target.value)} className={inputClass} placeholder="25 Years of Brilliance" />
          </div>
        </div>
        <div className="space-y-3 mb-4">
          {data.milestones.map(ms => (
            <div key={ms.id} className="flex items-start gap-3 p-4 rounded-xl border border-surface-200 dark:border-surface-700">
              <div className="w-32 flex-shrink-0">
                <input type="text" value={ms.year} onChange={e => updateArrayItem('milestones', ms.id, 'year', e.target.value)} className={inputClass} placeholder="Year" />
              </div>
              <div className="flex-1 space-y-3">
                <input type="text" value={ms.title} onChange={e => updateArrayItem('milestones', ms.id, 'title', e.target.value)} className={inputClass} placeholder="Title" />
                <textarea value={ms.desc} onChange={e => updateArrayItem('milestones', ms.id, 'desc', e.target.value)} className={inputClass} placeholder="Description" rows={2} />
              </div>
              <button onClick={() => removeArrayItem('milestones', ms.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => addArrayItem('milestones', { id: crypto.randomUUID(), year: '2026', title: 'New Milestone', desc: 'Description' })} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
          <Plus size={14} /> Add Milestone
        </button>
      </AdminCard>

      <AdminCard title="Craft / Factory Section">
        <SectionLabel label="'Handcrafted in the Fireworks Capital' block" hint="Visible on: /about" />
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Eyebrow</label>
              <input type="text" value={data.craftEyebrow} onChange={e => updateField('craftEyebrow', e.target.value)} className={inputClass} placeholder="The Craft" />
            </div>
            <div>
              <label className={labelClass}>Heading</label>
              <input type="text" value={data.craftTitle} onChange={e => updateField('craftTitle', e.target.value)} className={inputClass} placeholder="Handcrafted in the Fireworks Capital" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Body Paragraph</label>
            <textarea value={data.craftBody} onChange={e => updateField('craftBody', e.target.value)} className={inputClass} rows={3} placeholder="Sivakasi, Tamil Nadu — the fireworks capital of India..." />
          </div>
          <div>
            <label className={labelClass}>Facility Feature Bullets ({data.craftBullets.length})</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {data.craftBullets.map(bullet => (
                <div key={bullet.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-surface-200 dark:border-surface-700">
                  <input type="text" value={bullet.text} onChange={e => updateArrayItem('craftBullets', bullet.id, 'text', e.target.value)} className={inputClass} placeholder="50,000 sq ft facility" />
                  <button onClick={() => removeArrayItem('craftBullets', bullet.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => addArrayItem('craftBullets', { id: crypto.randomUUID(), icon: 'Star', text: 'New feature' })} className="mt-3 flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
              <Plus size={14} /> Add Bullet
            </button>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Final CTA Section">
        <SectionLabel label="Bottom call-to-action banner" hint="Visible on: /about" />
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Heading</label>
            <input type="text" value={data.ctaTitle} onChange={e => updateField('ctaTitle', e.target.value)} className={inputClass} placeholder="Ready to Create Unforgettable Moments?" />
          </div>
          <div>
            <label className={labelClass}>Subtitle</label>
            <textarea value={data.ctaSubtitle} onChange={e => updateField('ctaSubtitle', e.target.value)} className={inputClass} rows={2} placeholder="Browse our premium collection..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-surface-50 dark:bg-surface-800/50">
            <div className="space-y-2">
              <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">Primary Button</p>
              <input type="text" value={data.ctaPrimaryLabel} onChange={e => updateField('ctaPrimaryLabel', e.target.value)} className={inputClass} placeholder="Shop Now" />
            </div>
            <div className="space-y-2">
              <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">Secondary Button</p>
              <input type="text" value={data.ctaSecondaryLabel} onChange={e => updateField('ctaSecondaryLabel', e.target.value)} className={inputClass} placeholder="Contact Us" />
            </div>
          </div>
          <ImageUploadField
            label="Background Image"
            value={data.ctaBgImage}
            onChange={(url) => updateField('ctaBgImage', url)}
            folder="content"
            previewClassName="w-full aspect-[21/9] rounded-xl"
          />
        </div>
      </AdminCard>
    </div>
  );
}
