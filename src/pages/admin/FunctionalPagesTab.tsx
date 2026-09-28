import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { SaveButton, SuccessToast, SectionLabel, ErrorNotice, errorText, loadErrorText } from '@/components/admin/AdminShared.tsx';
import { ImageUploadField } from '@/components/admin/ImageUploadField.tsx';
import { getContentSection, updateContentSection } from '@/services/admin.ts';

const inputClass =
  'w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

export interface Benefit {
  id: string;
  icon: string;
  title: string;
  desc: string;
}

export interface Tier {
  id: string;
  range: string;
  discount: string;
  label: string;
}

export interface FunctionalPagesData {
  bulkHeroTitle: string;
  bulkHeroSubtitle: string;
  bulkHeroBgImage: string;
  bulkBenefits: Benefit[];
  bulkTiers: Tier[];
  trackHeroTitle: string;
  trackHeroSubtitle: string;
}

const defaultData: FunctionalPagesData = {
  bulkHeroTitle: 'Bulk & Wholesale Orders',
  bulkHeroSubtitle: 'Special pricing, custom packages, and dedicated support for large orders. Perfect for events, retailers, and businesses.',
  bulkHeroBgImage: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=1920&q=30',
  // Starting copy promises no discount rates or service levels — a shop that
  // saves this untouched must not be held to a "30% off" it never offered.
  bulkBenefits: [
    { id: '1', icon: 'Percent', title: 'Wholesale Pricing', desc: 'Better rates on larger orders — send us your list and we will quote.' },
    { id: '2', icon: 'Package', title: 'Custom Packages', desc: 'Tell us the occasion and budget, and we will suggest an assortment.' },
    { id: '3', icon: 'Users', title: 'Personal Help', desc: 'We call you back to go through quantities, delivery and payment.' },
    { id: '4', icon: 'Headphones', title: 'Direct Contact', desc: 'Reach us by phone or WhatsApp while you plan your order.' },
  ],
  bulkTiers: [
    { id: '1', range: '₹10,000 – ₹24,999', discount: 'On request', label: 'Starter' },
    { id: '2', range: '₹25,000 – ₹49,999', discount: 'On request', label: 'Business' },
    { id: '3', range: '₹50,000 – ₹99,999', discount: 'On request', label: 'Premium' },
    { id: '4', range: '₹1,00,000+', discount: 'On request', label: 'Enterprise' },
  ],
  trackHeroTitle: 'Track Your Order',
  trackHeroSubtitle: 'Enter your order number to see the latest on your parcel.',
};

export function FunctionalPagesTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [data, setData] = useState<FunctionalPagesData>(defaultData);
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
        const fetched = await getContentSection<FunctionalPagesData>('functional-pages');
        if (fetched) setData({ ...defaultData, ...fetched });
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
      await updateContentSection('functional-pages', data as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (field: keyof FunctionalPagesData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const updateArrayItem = <K extends 'bulkBenefits' | 'bulkTiers'>(
    arrayName: K,
    id: string,
    field: keyof FunctionalPagesData[K][number],
    value: string
  ) => {
    setData(prev => ({
      ...prev,
      [arrayName]: (prev[arrayName] as Array<{ id: string }>).map((item) => item.id === id ? { ...item, [field]: value } : item)
    }) as FunctionalPagesData);
  };

  const addArrayItem = (arrayName: 'bulkBenefits' | 'bulkTiers', newItem: { id: string; [key: string]: unknown }) => {
    setData(prev => ({
      ...prev,
      [arrayName]: [...prev[arrayName], newItem]
    }) as FunctionalPagesData);
  };

  const removeArrayItem = (arrayName: 'bulkBenefits' | 'bulkTiers', id: string) => {
    setData(prev => ({
      ...prev,
      [arrayName]: (prev[arrayName] as Array<{ id: string }>).filter((item) => item.id !== id)
    }) as FunctionalPagesData);
  };

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} label="Save Pages" />, saveSlot)}

      <AdminCard title="Bulk Orders Page">
        <SectionLabel label="Content for /bulk-orders" />
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className={labelClass}>Hero Title</label>
              <input type="text" value={data.bulkHeroTitle} onChange={e => updateField('bulkHeroTitle', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Hero Subtitle</label>
              <textarea value={data.bulkHeroSubtitle} onChange={e => updateField('bulkHeroSubtitle', e.target.value)} className={inputClass} rows={2} />
            </div>
            <ImageUploadField
              label="Hero Background Image"
              value={data.bulkHeroBgImage}
              onChange={(url) => updateField('bulkHeroBgImage', url)}
              folder="content"
              previewClassName="w-full h-32 rounded-xl"
            />
          </div>

          <div className="pt-4 border-t border-surface-200 dark:border-surface-700">
            <h4 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">Bulk Benefits ({data.bulkBenefits.length})</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {data.bulkBenefits.map(item => (
                <div key={item.id} className="flex items-start gap-3 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50">
                  <div className="flex-1 space-y-3">
                    <input type="text" value={item.title} onChange={e => updateArrayItem('bulkBenefits', item.id, 'title', e.target.value)} className={inputClass} placeholder="Title" />
                    <textarea value={item.desc} onChange={e => updateArrayItem('bulkBenefits', item.id, 'desc', e.target.value)} className={inputClass} placeholder="Description" rows={2} />
                  </div>
                  <button onClick={() => removeArrayItem('bulkBenefits', item.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => addArrayItem('bulkBenefits', { id: crypto.randomUUID(), icon: 'Star', title: 'New Benefit', desc: '' })} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
              <Plus size={14} /> Add Benefit
            </button>
          </div>

          <div className="pt-4 border-t border-surface-200 dark:border-surface-700">
            <h4 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">Pricing Tiers ({data.bulkTiers.length})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {data.bulkTiers.map(item => (
                <div key={item.id} className="flex items-start gap-3 p-4 rounded-xl border border-surface-200 dark:border-surface-700">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input type="text" value={item.label} onChange={e => updateArrayItem('bulkTiers', item.id, 'label', e.target.value)} className={inputClass} placeholder="Label (e.g. Starter)" />
                    <input type="text" value={item.range} onChange={e => updateArrayItem('bulkTiers', item.id, 'range', e.target.value)} className={inputClass} placeholder="Range (e.g. ₹10,000+)" />
                    <input type="text" value={item.discount} onChange={e => updateArrayItem('bulkTiers', item.id, 'discount', e.target.value)} className={inputClass} placeholder="Discount (e.g. 10%)" />
                  </div>
                  <button onClick={() => removeArrayItem('bulkTiers', item.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => addArrayItem('bulkTiers', { id: crypto.randomUUID(), label: 'New Tier', range: '', discount: '' })} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
              <Plus size={14} /> Add Tier
            </button>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Track Order Page">
        <SectionLabel label="Content for /track-order" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Hero Title</label>
            <input type="text" value={data.trackHeroTitle} onChange={e => updateField('trackHeroTitle', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Hero Subtitle</label>
            <textarea value={data.trackHeroSubtitle} onChange={e => updateField('trackHeroSubtitle', e.target.value)} className={inputClass} rows={2} />
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
