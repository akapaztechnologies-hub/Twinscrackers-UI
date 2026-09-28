import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { SaveButton, SuccessToast, SectionLabel, ErrorNotice, errorText, loadErrorText } from '@/components/admin/AdminShared.tsx';
import { getContentSection, updateContentSection } from '@/services/admin.ts';

const inputClass =
  'w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';
const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

export type ContactMethodType = 'phone' | 'email' | 'whatsapp' | 'address';
export interface ContactMethod { id: string; type: ContactMethodType; label: string; valueOverride: string; desc: string; }
export interface SubjectOpt { id: string; value: string; label: string; }
export interface HoursRow { id: string; day: string; time: string; }
export interface QuickLink { id: string; label: string; href: string; }

export interface ContactPageData {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  methods: ContactMethod[];
  formHeading: string;
  subjectOptions: SubjectOpt[];
  successTitle: string;
  successMessage: string;
  successResetLabel: string;
  hoursHeading: string;
  hours: HoursRow[];
  socialHeading: string;
  quickLinksHeading: string;
  quickLinks: QuickLink[];
}

const defaultContactPage: ContactPageData = {
  heroEyebrow: 'Get in Touch',
  heroTitle: "We'd Love to Hear From You",
  heroSubtitle: "Whether you need help choosing the right fireworks, have a bulk inquiry, or just want to say hello — we're here.",
  methods: [
    { id: 'm1', type: 'phone', label: 'Call Us', valueOverride: '', desc: 'Mon-Sat, 9 AM - 8 PM IST' },
    // No reply-time promises in the starting copy: those are the shop's to make.
    { id: 'm2', type: 'email', label: 'Email Us', valueOverride: '', desc: 'We reply as soon as we can' },
    { id: 'm3', type: 'whatsapp', label: 'WhatsApp', valueOverride: 'Chat with us', desc: 'Message us on WhatsApp' },
    { id: 'm4', type: 'address', label: 'Visit Us', valueOverride: '', desc: 'Our shop address' },
  ],
  formHeading: 'Send Us a Message',
  subjectOptions: [
    { id: 'so1', value: 'general', label: 'General Inquiry' },
    { id: 'so2', value: 'bulk', label: 'Bulk Order Inquiry' },
    { id: 'so3', value: 'support', label: 'Order Support' },
    { id: 'so4', value: 'safety', label: 'Safety Question' },
    { id: 'so5', value: 'partnership', label: 'Business Partnership' },
  ],
  successTitle: 'Message Sent!',
  successMessage: "Thanks — we'll get back to you soon.",
  successResetLabel: 'Send another message',
  hoursHeading: 'Business Hours',
  hours: [
    { id: 'hr1', day: 'Monday - Saturday', time: '9:00 AM - 8:00 PM' },
    { id: 'hr2', day: 'Sunday', time: '10:00 AM - 6:00 PM' },
    { id: 'hr3', day: 'Festival Season', time: '8:00 AM - 10:00 PM' },
  ],
  socialHeading: 'Follow Us',
  quickLinksHeading: 'Quick Links',
  quickLinks: [
    { id: 'ql1', label: 'Track Your Order', href: '/track-order' },
    { id: 'ql2', label: 'Bulk Order Inquiry', href: '/bulk-orders' },
    { id: 'ql3', label: 'FAQ', href: '/faq' },
    { id: 'ql4', label: 'Safety Guidelines', href: '/safety' },
  ],
};

export function ContactPageTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [data, setData] = useState<ContactPageData>(defaultContactPage);
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
        const fetched = await getContentSection<ContactPageData>('contact-page');
        if (fetched) setData({ ...defaultContactPage, ...fetched });
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
      await updateContentSection('contact-page', data as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const set = (field: keyof ContactPageData, value: string) => setData((p) => ({ ...p, [field]: value }));
  const updateItem = <K extends 'methods' | 'subjectOptions' | 'hours' | 'quickLinks'>(arr: K, id: string, field: keyof ContactPageData[K][number], value: string) =>
    setData((p) => ({ ...p, [arr]: (p[arr] as Array<{ id: string }>).map((it) => (it.id === id ? { ...it, [field]: value } : it)) }) as ContactPageData);
  const addItem = (arr: 'subjectOptions' | 'hours' | 'quickLinks', item: { id: string; [key: string]: unknown }) => setData((p) => ({ ...p, [arr]: [...(p[arr] as Array<{ id: string }>), item] }) as ContactPageData);
  const removeItem = (arr: 'subjectOptions' | 'hours' | 'quickLinks', id: string) => setData((p) => ({ ...p, [arr]: (p[arr] as Array<{ id: string }>).filter((it) => it.id !== id) }) as ContactPageData);

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} label="Save Contact Page" />, saveSlot)}

      <AdminCard title="Hero">
        <SectionLabel label="Contact page header" hint="Visible on: /contact" />
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={labelClass}>Eyebrow</label><input type="text" value={data.heroEyebrow} onChange={(e) => set('heroEyebrow', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Title</label><input type="text" value={data.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Subtitle</label><textarea value={data.heroSubtitle} onChange={(e) => set('heroSubtitle', e.target.value)} className={inputClass} rows={2} /></div>
        </div>
      </AdminCard>

      <AdminCard title="Contact Method Cards">
        <SectionLabel label="Labels & descriptions (values sync with Company Info)" />
        <div className="space-y-3">
          {data.methods.map((m) => (
            <div key={m.id} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl border border-surface-200 dark:border-surface-700">
              <div><label className={labelClass}>Label ({m.type})</label><input type="text" value={m.label} onChange={(e) => updateItem('methods', m.id, 'label', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>{m.type === 'whatsapp' ? 'Display Value' : 'Value Override (optional)'}</label><input type="text" value={m.valueOverride} onChange={(e) => updateItem('methods', m.id, 'valueOverride', e.target.value)} className={inputClass} placeholder={m.type === 'whatsapp' ? 'Chat with us' : 'From Company Info'} /></div>
              <div><label className={labelClass}>Description</label><input type="text" value={m.desc} onChange={(e) => updateItem('methods', m.id, 'desc', e.target.value)} className={inputClass} /></div>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard title="Contact Form">
        <SectionLabel label="Form heading, inquiry subjects & success message" />
        <div className="space-y-4">
          <div><label className={labelClass}>Form Heading</label><input type="text" value={data.formHeading} onChange={(e) => set('formHeading', e.target.value)} className={inputClass} /></div>
          <div>
            <label className={labelClass}>Subject Dropdown Options</label>
            <div className="space-y-2">
              {data.subjectOptions.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input type="text" value={o.label} onChange={(e) => updateItem('subjectOptions', o.id, 'label', e.target.value)} className={inputClass} placeholder="Label" />
                  <button onClick={() => removeItem('subjectOptions', o.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => addItem('subjectOptions', { id: crypto.randomUUID(), value: crypto.randomUUID().slice(0, 6), label: 'New option' })} className="mt-2 flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline"><Plus size={14} /> Add Option</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={labelClass}>Success Title</label><input type="text" value={data.successTitle} onChange={(e) => set('successTitle', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Success Message</label><input type="text" value={data.successMessage} onChange={(e) => set('successMessage', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Reset Link Label</label><input type="text" value={data.successResetLabel} onChange={(e) => set('successResetLabel', e.target.value)} className={inputClass} /></div>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Sidebar — Hours, Social & Quick Links">
        <div className="space-y-5">
          <div>
            <label className={labelClass}>Business Hours Heading</label>
            <input type="text" value={data.hoursHeading} onChange={(e) => set('hoursHeading', e.target.value)} className={inputClass} />
            <div className="space-y-2 mt-3">
              {data.hours.map((h) => (
                <div key={h.id} className="flex items-center gap-2">
                  <input type="text" value={h.day} onChange={(e) => updateItem('hours', h.id, 'day', e.target.value)} className={inputClass} placeholder="Monday - Saturday" />
                  <input type="text" value={h.time} onChange={(e) => updateItem('hours', h.id, 'time', e.target.value)} className={inputClass} placeholder="9:00 AM - 8:00 PM" />
                  <button onClick={() => removeItem('hours', h.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => addItem('hours', { id: crypto.randomUUID(), day: 'New', time: '' })} className="mt-2 flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline"><Plus size={14} /> Add Row</button>
          </div>
          <div>
            <label className={labelClass}>Social Block Heading</label>
            <input type="text" value={data.socialHeading} onChange={(e) => set('socialHeading', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Quick Links Heading</label>
            <input type="text" value={data.quickLinksHeading} onChange={(e) => set('quickLinksHeading', e.target.value)} className={inputClass} />
            <div className="space-y-2 mt-3">
              {data.quickLinks.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <input type="text" value={l.label} onChange={(e) => updateItem('quickLinks', l.id, 'label', e.target.value)} className={inputClass} placeholder="Label" />
                  <button onClick={() => removeItem('quickLinks', l.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => addItem('quickLinks', { id: crypto.randomUUID(), label: 'New link', href: '/' })} className="mt-2 flex items-center gap-1 text-caption text-brand-600 font-medium hover:underline"><Plus size={14} /> Add Link</button>
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
