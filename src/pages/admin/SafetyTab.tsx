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

export interface SafetyStat {
  id: string;
  value: string;
  label: string;
  icon: string;
}

export interface CategoryCard {
  id: string;
  name: string;
  distance: string;
  icon: string;
  color: string;
  iconColor: string;
  tips: { id: string; text: string }[];
}

export interface StringItem {
  id: string;
  text: string;
}

export interface EmergencyStep {
  id: string;
  icon: string;
  title: string;
  color: string;
  iconColor: string;
  steps: StringItem[];
}

export interface StorageRule {
  id: string;
  icon: string;
  title: string;
  desc: string;
}

export interface EmergencyNumber {
  id: string;
  icon: string;
  label: string;
  number: string;
}

export interface SafetyPageData {
  heroTitle: string;
  heroHighlight: string;
  heroSubtitle: string;
  heroBgImage: string;
  stats: SafetyStat[];
  safetyDos: StringItem[];
  safetyDonts: StringItem[];
  categoryCards: CategoryCard[];
  emergencySteps: EmergencyStep[];
  storageRules: StorageRule[];
  // Section headings & labels
  dosEyebrow: string;
  dosHeading: string;
  dosColumnTitle: string;
  dontsColumnTitle: string;
  categoryEyebrow: string;
  categoryHeading: string;
  categorySubtitle: string;
  storageEyebrow: string;
  storageHeading: string;
  emergencyEyebrow: string;
  emergencyHeading: string;
  emergencySubtitle: string;
  // Floating SOS button + emergency numbers banner
  sosLabel: string;
  sosPhone: string;
  emergencyNumbersHeader: string;
  emergencyNumbers: EmergencyNumber[];
}

const defaultSafetyData: SafetyPageData = {
  heroTitle: 'Celebrate',
  heroHighlight: 'Safely',
  heroSubtitle: 'Fireworks bring joy, but safety must always come first. Follow these essential guidelines to ensure your celebrations remain beautiful, memorable, and injury-free.',
  heroBgImage: 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=1920&q=30',
  stats: [
    { id: '1', value: '2,000°F', label: 'Sparklers burn hot enough to melt glass', icon: 'Thermometer' },
    { id: '2', value: '20 min', label: 'Wait before approaching a dud firework', icon: 'AlertTriangle' },
    { id: '3', value: '15 ft', label: 'Minimum safe distance for ground fireworks', icon: 'MapPin' },
    { id: '4', value: '100 ft', label: 'Safe viewing distance for aerial shells', icon: 'Eye' },
  ],
  safetyDos: [
    { id: '1', text: 'Read all instructions on the label before use' },
    { id: '2', text: 'Light fireworks one at a time and move away quickly' },
    { id: '3', text: 'Keep a bucket of water or fire extinguisher nearby' },
    { id: '4', text: 'Supervise children at all times — even with "safe" products' },
  ],
  safetyDonts: [
    { id: '1', text: 'Never relight a firework that didn\'t go off — wait 20 minutes then soak in water' },
    { id: '2', text: 'Never point or throw fireworks at people or animals' },
    { id: '3', text: 'Don\'t carry fireworks in your pockets' },
    { id: '4', text: 'Don\'t use fireworks near flammable materials or dry vegetation' },
  ],
  categoryCards: [
    {
      id: '1', icon: 'Sparkles', name: 'Sparklers', color: 'border-emerald-500/30 bg-emerald-500/5', iconColor: 'bg-emerald-500/10 text-emerald-500', distance: '2 ft',
      tips: [{ id: '1a', text: 'Hold at arm\'s length, away from body' }, { id: '1b', text: 'Never hand to children under 5' }]
    },
    {
      id: '2', icon: 'Star', name: 'Fountains & Cones', color: 'border-blue-500/30 bg-blue-500/5', iconColor: 'bg-blue-500/10 text-blue-500', distance: '15 ft',
      tips: [{ id: '2a', text: 'Place on flat, hard surface before lighting' }, { id: '2b', text: 'Never hold in hand while lit' }]
    }
  ],
  emergencySteps: [
    {
      id: '1', icon: 'Droplets', title: 'Minor Burns', color: 'border-amber-500/30', iconColor: 'bg-amber-500/10 text-amber-500',
      steps: [{ id: '1a', text: 'Run cool water over burn' }, { id: '1b', text: 'Cover with sterile bandage' }]
    },
    {
      id: '2', icon: 'Eye', title: 'Eye Injury', color: 'border-red-500/30', iconColor: 'bg-red-500/10 text-red-500',
      steps: [{ id: '2a', text: 'Do NOT rub or touch the eye' }, { id: '2b', text: 'Seek emergency medical attention' }]
    }
  ],
  storageRules: [
    { id: '1', icon: 'Thermometer', title: 'Cool & Dry', desc: 'Store below 30°C in a dry, well-ventilated area away from direct sunlight.' },
    { id: '2', icon: 'Lock', title: 'Locked Away', desc: 'Keep out of reach of children and pets.' },
  ],
  dosEyebrow: 'Know the Rules',
  dosHeading: "Do's & Don'ts",
  dosColumnTitle: "Safety Do's",
  dontsColumnTitle: "Safety Don'ts",
  categoryEyebrow: 'By Product Type',
  categoryHeading: 'Category Safety Guide',
  categorySubtitle: 'Different fireworks require different precautions. Know the safe distance and handling for each type.',
  storageEyebrow: 'Storage',
  storageHeading: 'Safe Storage & Handling',
  emergencyEyebrow: 'Be Prepared',
  emergencyHeading: 'Emergency First Aid',
  emergencySubtitle: 'Know what to do in an emergency. Follow these steps while waiting for professional help.',
  sosLabel: 'Emergency 112',
  sosPhone: '112',
  emergencyNumbersHeader: 'Emergency Numbers — Save These',
  emergencyNumbers: [
    { id: 'e1', icon: 'Phone', label: 'Emergency', number: '112' },
    { id: 'e2', icon: 'Flame', label: 'Fire Services', number: '101' },
    { id: 'e3', icon: 'Square', label: 'Ambulance', number: '108' },
  ],
};

export function SafetyTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [data, setData] = useState<SafetyPageData>(defaultSafetyData);
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
        const fetched = await getContentSection<SafetyPageData>('safety-page');
        if (fetched) setData({ ...defaultSafetyData, ...fetched });
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
      await updateContentSection('safety-page', data as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (field: keyof SafetyPageData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const addArrayItem = <K extends 'stats' | 'categoryCards' | 'storageRules' | 'emergencySteps' | 'emergencyNumbers'>(
    arrayName: K,
    newItem: SafetyPageData[K][number]
  ) => {
    setData(prev => ({
      ...prev,
      [arrayName]: [...prev[arrayName], newItem]
    }));
  };

  const updateArrayItem = <K extends 'stats' | 'categoryCards' | 'storageRules' | 'emergencySteps' | 'emergencyNumbers'>(
    arrayName: K,
    id: string,
    field: keyof SafetyPageData[K][number],
    value: string
  ) => {
    setData(prev => ({
      ...prev,
      [arrayName]: (prev[arrayName] as Array<{ id: string }>).map((item) => item.id === id ? { ...item, [field]: value } : item)
    }) as SafetyPageData);
  };

  const removeArrayItem = <K extends 'stats' | 'categoryCards' | 'storageRules' | 'emergencySteps' | 'emergencyNumbers'>(
    arrayName: K,
    id: string
  ) => {
    setData(prev => ({
      ...prev,
      [arrayName]: (prev[arrayName] as Array<{ id: string }>).filter((item) => item.id !== id)
    }) as SafetyPageData);
  };

  const updateStringItem = (arrayName: 'safetyDos' | 'safetyDonts', id: string, value: string) => {
    setData(prev => ({
      ...prev,
      [arrayName]: prev[arrayName].map(item => item.id === id ? { ...item, text: value } : item)
    }));
  };

  const addStringItem = (arrayName: 'safetyDos' | 'safetyDonts') => {
    setData(prev => ({
      ...prev,
      [arrayName]: [...prev[arrayName], { id: crypto.randomUUID(), text: 'New guideline' }]
    }));
  };

  const removeStringItem = (arrayName: 'safetyDos' | 'safetyDonts', id: string) => {
    setData(prev => ({
      ...prev,
      [arrayName]: prev[arrayName].filter(item => item.id !== id)
    }));
  };

  const addCategoryCard = () => {
    setData(prev => ({
      ...prev,
      categoryCards: [...prev.categoryCards, {
        id: crypto.randomUUID(), name: 'New Category', distance: '10 ft', icon: 'Star',
        color: 'border-surface-500/30 bg-surface-500/5', iconColor: 'bg-surface-500/10 text-surface-500', tips: []
      }]
    }));
  };

  const removeCategoryCard = (id: string) => {
    setData(prev => ({
      ...prev,
      categoryCards: prev.categoryCards.filter(c => c.id !== id)
    }));
  };

  const addTip = (cardId: string) => {
    setData(prev => ({
      ...prev,
      categoryCards: prev.categoryCards.map(c => c.id === cardId ? { ...c, tips: [...c.tips, { id: crypto.randomUUID(), text: 'New Tip' }] } : c)
    }));
  };

  const updateTip = (cardId: string, tipId: string, text: string) => {
    setData(prev => ({
      ...prev,
      categoryCards: prev.categoryCards.map(c => c.id === cardId ? { ...c, tips: c.tips.map(t => t.id === tipId ? { ...t, text } : t) } : c)
    }));
  };

  const removeTip = (cardId: string, tipId: string) => {
    setData(prev => ({
      ...prev,
      categoryCards: prev.categoryCards.map(c => c.id === cardId ? { ...c, tips: c.tips.filter(t => t.id !== tipId) } : c)
    }));
  };

  const addEmergencyStepItem = (stepId: string) => {
    setData(prev => ({
      ...prev,
      emergencySteps: prev.emergencySteps.map(s => s.id === stepId ? { ...s, steps: [...s.steps, { id: crypto.randomUUID(), text: 'New Step' }] } : s)
    }));
  };

  const updateEmergencyStepItem = (stepId: string, itemId: string, text: string) => {
    setData(prev => ({
      ...prev,
      emergencySteps: prev.emergencySteps.map(s => s.id === stepId ? { ...s, steps: s.steps.map(t => t.id === itemId ? { ...t, text } : t) } : s)
    }));
  };

  const removeEmergencyStepItem = (stepId: string, itemId: string) => {
    setData(prev => ({
      ...prev,
      emergencySteps: prev.emergencySteps.map(s => s.id === stepId ? { ...s, steps: s.steps.filter(t => t.id !== itemId) } : s)
    }));
  };

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} label="Save Safety Page" />, saveSlot)}

      <AdminCard title="Hero Section">
        <SectionLabel label="Safety Guidelines hero banner" hint="Visible on: /safety" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              value={data.heroBgImage}
              onChange={(url) => updateField('heroBgImage', url)}
              folder="content"
              previewClassName="w-full h-32 rounded-xl"
            />
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Section Headings & SOS">
        <SectionLabel label="Headings and the floating emergency button" hint="Visible on: /safety" />
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50">
            <p className="sm:col-span-2 text-body-sm font-semibold text-surface-900 dark:text-surface-100">Floating Emergency Button</p>
            <div>
              <label className={labelClass}>Button Label</label>
              <input type="text" value={data.sosLabel} onChange={e => updateField('sosLabel', e.target.value)} className={inputClass} placeholder="Emergency 112" />
            </div>
            <div>
              <label className={labelClass}>Phone Number (tel:)</label>
              <input type="text" value={data.sosPhone} onChange={e => updateField('sosPhone', e.target.value)} className={inputClass} placeholder="112" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div><label className={labelClass}>Do's/Don'ts Eyebrow</label><input type="text" value={data.dosEyebrow} onChange={e => updateField('dosEyebrow', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Do's/Don'ts Heading</label><input type="text" value={data.dosHeading} onChange={e => updateField('dosHeading', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Do's Column Title</label><input type="text" value={data.dosColumnTitle} onChange={e => updateField('dosColumnTitle', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Don'ts Column Title</label><input type="text" value={data.dontsColumnTitle} onChange={e => updateField('dontsColumnTitle', e.target.value)} className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={labelClass}>Category Guide Eyebrow</label><input type="text" value={data.categoryEyebrow} onChange={e => updateField('categoryEyebrow', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Category Guide Heading</label><input type="text" value={data.categoryHeading} onChange={e => updateField('categoryHeading', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Category Guide Subtitle</label><input type="text" value={data.categorySubtitle} onChange={e => updateField('categorySubtitle', e.target.value)} className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={labelClass}>Storage Eyebrow</label><input type="text" value={data.storageEyebrow} onChange={e => updateField('storageEyebrow', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Storage Heading</label><input type="text" value={data.storageHeading} onChange={e => updateField('storageHeading', e.target.value)} className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={labelClass}>First Aid Eyebrow</label><input type="text" value={data.emergencyEyebrow} onChange={e => updateField('emergencyEyebrow', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>First Aid Heading</label><input type="text" value={data.emergencyHeading} onChange={e => updateField('emergencyHeading', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>First Aid Subtitle</label><input type="text" value={data.emergencySubtitle} onChange={e => updateField('emergencySubtitle', e.target.value)} className={inputClass} /></div>
          </div>
        </div>
      </AdminCard>

      <AdminCard title={`Key Stats (${data.stats.length})`}>
        <SectionLabel label="Safety statistics below hero banner" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {data.stats.map(stat => (
            <div key={stat.id} className="flex items-start gap-3 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50">
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" value={stat.value} onChange={e => updateArrayItem('stats', stat.id, 'value', e.target.value)} className={inputClass} placeholder="Value (e.g. 2,000°F)" />
                  <input type="text" value={stat.icon} onChange={e => updateArrayItem('stats', stat.id, 'icon', e.target.value)} className={inputClass} placeholder="Lucide Icon" />
                </div>
                <input type="text" value={stat.label} onChange={e => updateArrayItem('stats', stat.id, 'label', e.target.value)} className={inputClass} placeholder="Label" />
              </div>
              <button onClick={() => removeArrayItem('stats', stat.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => addArrayItem('stats', { id: crypto.randomUUID(), value: 'New', label: 'Stat', icon: 'AlertTriangle' })} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
          <Plus size={14} /> Add Stat
        </button>
      </AdminCard>

      <AdminCard title={`Storage Rules (${data.storageRules.length})`}>
        <SectionLabel label="Storage instructions" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {data.storageRules.map(rule => (
            <div key={rule.id} className="flex items-start gap-3 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50">
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" value={rule.title} onChange={e => updateArrayItem('storageRules', rule.id, 'title', e.target.value)} className={inputClass} placeholder="Title" />
                  <input type="text" value={rule.icon} onChange={e => updateArrayItem('storageRules', rule.id, 'icon', e.target.value)} className={inputClass} placeholder="Lucide Icon" />
                </div>
                <textarea value={rule.desc} onChange={e => updateArrayItem('storageRules', rule.id, 'desc', e.target.value)} className={inputClass} placeholder="Description" rows={2} />
              </div>
              <button onClick={() => removeArrayItem('storageRules', rule.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => addArrayItem('storageRules', { id: crypto.randomUUID(), title: 'New Rule', desc: 'Description', icon: 'Thermometer' })} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
          <Plus size={14} /> Add Storage Rule
        </button>
      </AdminCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminCard title={`Do's (${data.safetyDos.length})`}>
          <div className="space-y-3 mb-4">
            {data.safetyDos.map(item => (
              <div key={item.id} className="flex gap-2 p-3 rounded-xl border border-surface-200 dark:border-surface-700">
                <input type="text" value={item.text} onChange={e => updateStringItem('safetyDos', item.id, e.target.value)} className={inputClass} />
                <button onClick={() => removeStringItem('safetyDos', item.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => addStringItem('safetyDos')} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
            <Plus size={14} /> Add Guideline
          </button>
        </AdminCard>

        <AdminCard title={`Don'ts (${data.safetyDonts.length})`}>
          <div className="space-y-3 mb-4">
            {data.safetyDonts.map(item => (
              <div key={item.id} className="flex gap-2 p-3 rounded-xl border border-surface-200 dark:border-surface-700">
                <input type="text" value={item.text} onChange={e => updateStringItem('safetyDonts', item.id, e.target.value)} className={inputClass} />
                <button onClick={() => removeStringItem('safetyDonts', item.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => addStringItem('safetyDonts')} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
            <Plus size={14} /> Add Guideline
          </button>
        </AdminCard>
      </div>

      <AdminCard title={`Category Safety Cards (${data.categoryCards.length})`}>
        <SectionLabel label="Product-specific safety guidelines" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          {data.categoryCards.map(card => (
            <div key={card.id} className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50">
              <div className="flex justify-between items-start mb-4">
                <h4 className="font-semibold text-surface-900 dark:text-surface-100">Card Configuration</h4>
                <button onClick={() => removeCategoryCard(card.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <input type="text" value={card.name} onChange={e => updateArrayItem('categoryCards', card.id, 'name', e.target.value)} className={inputClass} placeholder="Category Name" />
                <input type="text" value={card.distance} onChange={e => updateArrayItem('categoryCards', card.id, 'distance', e.target.value)} className={inputClass} placeholder="Safe Distance" />
                <input type="text" value={card.icon} onChange={e => updateArrayItem('categoryCards', card.id, 'icon', e.target.value)} className={inputClass} placeholder="Lucide Icon" />
                <input type="text" value={card.color} onChange={e => updateArrayItem('categoryCards', card.id, 'color', e.target.value)} className={inputClass} placeholder="Tailwind Border Color" />
              </div>
              <div className="space-y-3">
                <label className={labelClass}>Safety Tips</label>
                {card.tips.map(tip => (
                  <div key={tip.id} className="flex gap-2">
                    <input type="text" value={tip.text} onChange={e => updateTip(card.id, tip.id, e.target.value)} className={inputClass} placeholder="Tip" />
                    <button onClick={() => removeTip(card.id, tip.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button onClick={() => addTip(card.id)} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
                  <Plus size={14} /> Add Tip
                </button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addCategoryCard} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
          <Plus size={14} /> Add Category Card
        </button>
      </AdminCard>

      <AdminCard title={`Emergency Steps (${data.emergencySteps.length})`}>
        <SectionLabel label="First aid & emergency procedures" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          {data.emergencySteps.map(step => (
            <div key={step.id} className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50">
              <div className="flex justify-between items-start mb-4">
                <h4 className="font-semibold text-surface-900 dark:text-surface-100">Step Configuration</h4>
                <button onClick={() => removeArrayItem('emergencySteps', step.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <input type="text" value={step.title} onChange={e => updateArrayItem('emergencySteps', step.id, 'title', e.target.value)} className={inputClass} placeholder="Title" />
                <input type="text" value={step.icon} onChange={e => updateArrayItem('emergencySteps', step.id, 'icon', e.target.value)} className={inputClass} placeholder="Lucide Icon" />
                <input type="text" value={step.color} onChange={e => updateArrayItem('emergencySteps', step.id, 'color', e.target.value)} className={inputClass} placeholder="Tailwind Border Color" />
                <input type="text" value={step.iconColor} onChange={e => updateArrayItem('emergencySteps', step.id, 'iconColor', e.target.value)} className={inputClass} placeholder="Tailwind Icon Color" />
              </div>
              <div className="space-y-3">
                <label className={labelClass}>Sub-steps</label>
                {step.steps.map(substep => (
                  <div key={substep.id} className="flex gap-2">
                    <input type="text" value={substep.text} onChange={e => updateEmergencyStepItem(step.id, substep.id, e.target.value)} className={inputClass} placeholder="Action item" />
                    <button onClick={() => removeEmergencyStepItem(step.id, substep.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button onClick={() => addEmergencyStepItem(step.id)} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
                  <Plus size={14} /> Add Sub-step
                </button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => addArrayItem('emergencySteps', { id: crypto.randomUUID(), icon: 'AlertTriangle', title: 'New Emergency Step', color: 'border-red-500/30', iconColor: 'bg-red-500/10 text-red-500', steps: [] })} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
          <Plus size={14} /> Add Emergency Category
        </button>
      </AdminCard>

      <AdminCard title="Emergency Numbers Banner">
        <SectionLabel label="Red banner at the bottom of the page" hint="Visible on: /safety" />
        <div className="mb-4">
          <label className={labelClass}>Banner Header</label>
          <input type="text" value={data.emergencyNumbersHeader} onChange={e => updateField('emergencyNumbersHeader', e.target.value)} className={inputClass} placeholder="Emergency Numbers — Save These" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {data.emergencyNumbers.map(num => (
            <div key={num.id} className="flex items-center gap-2 p-3 rounded-xl border border-surface-200 dark:border-surface-700">
              <input type="text" value={num.icon} onChange={e => updateArrayItem('emergencyNumbers', num.id, 'icon', e.target.value)} className={`${inputClass.replace('w-full', 'w-24')} flex-shrink-0`} placeholder="Icon" />
              <input type="text" value={num.label} onChange={e => updateArrayItem('emergencyNumbers', num.id, 'label', e.target.value)} className={inputClass} placeholder="Emergency" />
              <input type="text" value={num.number} onChange={e => updateArrayItem('emergencyNumbers', num.id, 'number', e.target.value)} className={`${inputClass.replace('w-full', 'w-24')} flex-shrink-0`} placeholder="112" />
              <button onClick={() => removeArrayItem('emergencyNumbers', num.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => addArrayItem('emergencyNumbers', { id: crypto.randomUUID(), icon: 'Phone', label: 'New', number: '' })} className="flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline">
          <Plus size={14} /> Add Number
        </button>
      </AdminCard>
    </div>
  );
}
