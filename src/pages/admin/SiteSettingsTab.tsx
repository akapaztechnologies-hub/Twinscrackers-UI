import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { SaveButton, SuccessToast, SectionLabel, ErrorNotice, errorText, loadErrorText } from '@/components/admin/AdminShared.tsx';
import { ColorField } from '@/components/admin/ColorField.tsx';
import { getContentSection, updateContentSection } from '@/services/admin.ts';
import { useSiteStore } from '@/store/site.ts';

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';
const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

export interface SiteSettingsData {
  currency: string;
  currencyCode: string;
  url: string;
  themeColor: string;
  schemaLocality: string;
  schemaRegion: string;
  schemaCountry: string;
  priceRange: string;
  opensAt: string;
  closesAt: string;
  openDays: string[];
  languages: string[];
}

const defaultSettings: SiteSettingsData = {
  currency: '₹',
  currencyCode: 'INR',
  url: '',
  themeColor: '#0A0A0A',
  schemaLocality: 'Sivakasi',
  schemaRegion: 'Tamil Nadu',
  schemaCountry: 'IN',
  priceRange: '₹₹',
  opensAt: '09:00',
  closesAt: '20:00',
  openDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  languages: ['English', 'Hindi', 'Tamil'],
};

export function SiteSettingsTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [data, setData] = useState<SiteSettingsData>(defaultSettings);
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
        const fetched = await getContentSection<SiteSettingsData>('site-settings');
        if (fetched) setData({ ...defaultSettings, ...fetched });
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
      await updateContentSection('site-settings', data as unknown as Record<string, unknown>);
      // Canonical URL, currency and brand colour all live here — re-read them
      // so the tab title, favicon, Open Graph tags and PDFs pick the change up
      // immediately instead of on the next full page load.
      await useSiteStore.getState().fetchCompanyInfo();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const set = (field: keyof SiteSettingsData, value: string) => setData((p) => ({ ...p, [field]: value }));
  const setListItem = (field: 'openDays' | 'languages', i: number, value: string) =>
    setData((p) => ({ ...p, [field]: p[field].map((it, idx) => (idx === i ? value : it)) }));
  const addListItem = (field: 'openDays' | 'languages') => setData((p) => ({ ...p, [field]: [...p[field], ''] }));
  const removeListItem = (field: 'openDays' | 'languages', i: number) =>
    setData((p) => ({ ...p, [field]: p[field].filter((_, idx) => idx !== i) }));

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} label="Save Site Settings" />, saveSlot)}

      <AdminCard title="Currency & Site URL">
        <SectionLabel label="Used across prices, canonical URLs, share previews and structured data" hint="Visible on: All pages" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label className={labelClass}>Currency Symbol</label><input type="text" value={data.currency} onChange={(e) => set('currency', e.target.value)} className={inputClass} placeholder="₹" /></div>
          <div><label className={labelClass}>Currency Code</label><input type="text" value={data.currencyCode} onChange={(e) => set('currencyCode', e.target.value)} className={inputClass} placeholder="INR" /></div>
          <div><label className={labelClass}>Canonical Site URL</label><input type="url" value={data.url} onChange={(e) => set('url', e.target.value)} className={inputClass} placeholder="https://yourstore.com" /></div>
        </div>
        <p className="mt-2 text-caption text-surface-500 dark:text-surface-400">
          The Canonical Site URL is what logo and share-preview links are resolved against — in the browser tab, in
          WhatsApp/Facebook previews and in every email we send. Set it to the live domain.
        </p>
        <div className="mt-4 max-w-xs">
          <ColorField
            label="Browser Theme Colour"
            value={data.themeColor}
            onChange={(v) => set('themeColor', v)}
            fallback="#0A0A0A"
            hint="Tints the mobile browser chrome and the installed app. Leave it blank to follow the palette in Theme & Colours."
          />
        </div>
      </AdminCard>

      <AdminCard title="Business Structured Data (SEO)">
        <SectionLabel label="Powers Google's rich results (JSON-LD)" hint="Visible on: search engines" />
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={labelClass}>City / Locality</label><input type="text" value={data.schemaLocality} onChange={(e) => set('schemaLocality', e.target.value)} className={inputClass} placeholder="Sivakasi" /></div>
            <div><label className={labelClass}>Region / State</label><input type="text" value={data.schemaRegion} onChange={(e) => set('schemaRegion', e.target.value)} className={inputClass} placeholder="Tamil Nadu" /></div>
            <div><label className={labelClass}>Country Code</label><input type="text" value={data.schemaCountry} onChange={(e) => set('schemaCountry', e.target.value)} className={inputClass} placeholder="IN" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={labelClass}>Price Range</label><input type="text" value={data.priceRange} onChange={(e) => set('priceRange', e.target.value)} className={inputClass} placeholder="₹₹" /></div>
            <div><label className={labelClass}>Opens At (HH:MM)</label><input type="text" value={data.opensAt} onChange={(e) => set('opensAt', e.target.value)} className={inputClass} placeholder="09:00" /></div>
            <div><label className={labelClass}>Closes At (HH:MM)</label><input type="text" value={data.closesAt} onChange={(e) => set('closesAt', e.target.value)} className={inputClass} placeholder="20:00" /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Open Days</label>
              <div className="space-y-2">
                {data.openDays.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="text" value={d} onChange={(e) => setListItem('openDays', i, e.target.value)} className={inputClass} placeholder="Monday" />
                    <button onClick={() => removeListItem('openDays', i)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => addListItem('openDays')} className="mt-2 flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline"><Plus size={13} /> Add Day</button>
            </div>
            <div>
              <label className={labelClass}>Supported Languages</label>
              <div className="space-y-2">
                {data.languages.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="text" value={l} onChange={(e) => setListItem('languages', i, e.target.value)} className={inputClass} placeholder="English" />
                    <button onClick={() => removeListItem('languages', i)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => addListItem('languages')} className="mt-2 flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline"><Plus size={13} /> Add Language</button>
            </div>
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
