import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { SaveButton, SuccessToast, SectionLabel, ErrorNotice, errorText, loadErrorText } from '@/components/admin/AdminShared.tsx';
import { getContentSection, updateContentSection } from '@/services/admin.ts';

const inputClass =
  'w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';
const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

export interface QuickOrderHero {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
}

const defaultHero: QuickOrderHero = {
  heroEyebrow: 'Rapid Ordering',
  heroTitle: 'Quick Order',
  heroSubtitle: 'Add quantities directly from the table — no need to visit each product page. Perfect for bulk and repeat orders.',
};

export function QuickOrderTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [hero, setHero] = useState<QuickOrderHero>(defaultHero);
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
        // Preserve any other fields already saved on this section; only edit the hero.
        const fetched = await getContentSection<QuickOrderHero>('quick-order');
        if (fetched) {
          setHero({
            heroEyebrow: fetched.heroEyebrow ?? defaultHero.heroEyebrow,
            heroTitle: fetched.heroTitle ?? defaultHero.heroTitle,
            heroSubtitle: fetched.heroSubtitle ?? defaultHero.heroSubtitle,
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
      // Merge over whatever is stored so unrelated fields are never wiped.
      const existing = (await getContentSection<Record<string, unknown>>('quick-order')) || {};
      await updateContentSection('quick-order', { ...existing, ...hero });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const set = (field: keyof QuickOrderHero, value: string) => setHero((p) => ({ ...p, [field]: value }));

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} label="Save Quick Order" />, saveSlot)}

      <AdminCard title="Hero Section">
        <SectionLabel label="Quick Order page header" hint="Visible on: /quick-order" />
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Eyebrow</label>
              <input type="text" value={hero.heroEyebrow} onChange={(e) => set('heroEyebrow', e.target.value)} className={inputClass} placeholder="Rapid Ordering" />
            </div>
            <div>
              <label className={labelClass}>Title</label>
              <input type="text" value={hero.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} className={inputClass} placeholder="Quick Order" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Subtitle</label>
            <textarea value={hero.heroSubtitle} onChange={(e) => set('heroSubtitle', e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="Add quantities directly from the table..." />
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
