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

export interface Highlight { id: string; icon: string; text: string; }
export interface PreviewStat { id: string; value: string; label: string; }

export interface AboutPreviewData {
  eyebrow: string;
  titlePrefix: string;
  titleHighlight: string;
  titleSuffix: string;
  body: string;
  image: string;
  imageAlt: string;
  highlights: Highlight[];
  stats: PreviewStat[];
  badgeValue: string;
  badgeLabel: string;
  ctaLabel: string;
  ctaLink: string;
}

/** Starting copy — free of any one shop's history, for the same reason as the About page's. */
function defaultAboutPreview(siteName: string): AboutPreviewData {
  const name = siteName || 'We';
  return {
    eyebrow: 'Our Story',
    titlePrefix: 'Crafting',
    titleHighlight: 'Celebrations',
    titleSuffix: 'That Sparkle',
    body: `${name} brings quality fireworks for every festival and family celebration — carefully sourced from licensed makers, safely packed and fairly priced.`,
    image: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=900&q=80',
    imageAlt: 'Fireworks lighting up the night sky',
    highlights: [
      { id: 'h1', icon: 'Shield', text: 'BIS-certified quality & safety' },
      { id: 'h2', icon: 'MapPin', text: 'Sourced from licensed manufacturers' },
      { id: 'h3', icon: 'Leaf', text: 'Low-noise & eco-friendly range' },
    ],
    stats: siteConfig.trustBadges.map((b, i) => ({ id: `s${i + 1}`, value: b.value, label: b.label })),
    badgeValue: siteConfig.trustBadges[0]?.value ?? '',
    badgeLabel: siteConfig.trustBadges[0]?.label ?? '',
    ctaLabel: 'Discover Our Story',
    ctaLink: '/about',
  };
}

export function AboutPreviewTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [data, setData] = useState<AboutPreviewData>(() => defaultAboutPreview(useSiteStore.getState().config.name));
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
        const fetched = await getContentSection<AboutPreviewData>('about-preview');
        if (fetched) setData({ ...defaultAboutPreview(useSiteStore.getState().config.name), ...fetched });
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
      await updateContentSection('about-preview', data as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const set = (field: keyof AboutPreviewData, value: string) => setData((p) => ({ ...p, [field]: value }));

  const updateItem = <K extends 'highlights' | 'stats'>(arr: K, id: string, field: keyof AboutPreviewData[K][number], value: string) =>
    setData((p) => ({ ...p, [arr]: (p[arr] as Array<{ id: string }>).map((it) => (it.id === id ? { ...it, [field]: value } : it)) }) as AboutPreviewData);
  const addItem = (arr: 'highlights' | 'stats', item: { id: string; [key: string]: unknown }) => setData((p) => ({ ...p, [arr]: [...(p[arr] as Array<{ id: string }>), item] }) as AboutPreviewData);
  const removeItem = (arr: 'highlights' | 'stats', id: string) => setData((p) => ({ ...p, [arr]: (p[arr] as Array<{ id: string }>).filter((it) => it.id !== id) }) as AboutPreviewData);

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} label="Save About Preview" />, saveSlot)}

      <AdminCard title="About Preview (Homepage)">
        <SectionLabel label="'Our Story' block on the homepage" hint="Visible on: Homepage" />
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={labelClass}>Eyebrow</label><input type="text" value={data.eyebrow} onChange={(e) => set('eyebrow', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Highlighted Word (gold)</label><input type="text" value={data.titleHighlight} onChange={(e) => set('titleHighlight', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Title Before Highlight</label><input type="text" value={data.titlePrefix} onChange={(e) => set('titlePrefix', e.target.value)} className={inputClass} placeholder="Crafting" /></div>
            <div><label className={labelClass}>Title After Highlight</label><input type="text" value={data.titleSuffix} onChange={(e) => set('titleSuffix', e.target.value)} className={inputClass} placeholder="That Sparkle" /></div>
          </div>
          <div><label className={labelClass}>Body Paragraph</label><textarea value={data.body} onChange={(e) => set('body', e.target.value)} className={inputClass} rows={3} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ImageUploadField value={data.image} onChange={(url) => set('image', url)} folder="content" label="Image" previewClassName="w-full h-40 rounded-xl" />
            <div><label className={labelClass}>Image Alt Text</label><input type="text" value={data.imageAlt} onChange={(e) => set('imageAlt', e.target.value)} className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-surface-50 dark:bg-surface-800/50">
            <p className="sm:col-span-3 text-body-sm font-semibold text-surface-900 dark:text-surface-100">Floating Badge & CTA</p>
            <div><label className={labelClass}>Badge Value</label><input type="text" value={data.badgeValue} onChange={(e) => set('badgeValue', e.target.value)} className={inputClass} placeholder="Safe" /></div>
            <div className="sm:col-span-2"><label className={labelClass}>Badge Label</label><input type="text" value={data.badgeLabel} onChange={(e) => set('badgeLabel', e.target.value)} className={inputClass} placeholder="Certified fireworks" /></div>
            <div className="sm:col-span-3"><label className={labelClass}>CTA Label</label><input type="text" value={data.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} className={inputClass} /></div>
          </div>
        </div>
      </AdminCard>

      <AdminCard title={`Highlights (${data.highlights.length})`}>
        <SectionLabel label="Icon + text list beside the story" />
        <div className="space-y-2 mb-3">
          {data.highlights.map((h) => (
            <div key={h.id} className="flex items-center gap-2">
              <input type="text" value={h.text} onChange={(e) => updateItem('highlights', h.id, 'text', e.target.value)} className={inputClass} placeholder="BIS-certified quality" />
              <button onClick={() => removeItem('highlights', h.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <button onClick={() => addItem('highlights', { id: crypto.randomUUID(), icon: 'Star', text: 'New highlight' })} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline"><Plus size={14} /> Add Highlight</button>
      </AdminCard>

      <AdminCard title={`Stats (${data.stats.length})`}>
        <SectionLabel label="Stats row below the highlights" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {data.stats.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input type="text" value={s.value} onChange={(e) => updateItem('stats', s.id, 'value', e.target.value)} className={`${inputClass.replace('w-full', 'w-24')} flex-shrink-0`} placeholder="25+" />
              <input type="text" value={s.label} onChange={(e) => updateItem('stats', s.id, 'label', e.target.value)} className={inputClass} placeholder="Years of Heritage" />
              <button onClick={() => removeItem('stats', s.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <button onClick={() => addItem('stats', { id: crypto.randomUUID(), value: 'New', label: 'Stat' })} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline"><Plus size={14} /> Add Stat</button>
      </AdminCard>
    </div>
  );
}
