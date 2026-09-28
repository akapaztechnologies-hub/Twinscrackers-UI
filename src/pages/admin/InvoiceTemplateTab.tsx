import { useState, useEffect } from 'react';
import { DEFAULT_LETTERHEAD, toLetterhead, type InvoiceLetterhead } from '@/types/invoiceLetterhead.ts';
import { cn } from '@/lib/utils.ts';
import { ImageUploadField } from '@/components/admin/ImageUploadField.tsx';
import { createPortal } from 'react-dom';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import {
  SaveButton,
  SuccessToast,
  SectionLabel,
  ErrorNotice,
  errorText,
  loadErrorText,
} from '@/components/admin/AdminShared.tsx';
import { getContentSection, updateContentSection } from '@/services/admin.ts';
import { useSiteStore } from '@/store/site.ts';
import type { Bill } from '@/types/admin.ts';
import { preparePdfLogo } from '@/lib/pdfLogo.ts';
import { prepareLetterheadAssets } from '@/lib/letterheadAssets.ts';

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

export interface InvoiceTemplateData {
  accentColor: string;
  termsText: string;
  footerNote: string;
  /** Website printed on documents. Blank falls back to the canonical site URL. */
  website: string;
  bankDetails: string;
  /**
   * Print the shop's classic letterhead at the top instead of the modern
   * coloured band, so a retail bill and a wholesale pad hand the customer the
   * same-looking document. Off by default: an existing shop's invoices must not
   * change appearance because this field appeared.
   */
  useLetterhead: boolean;
  /** Only read when `useLetterhead`. Shared shape with the wholesale pad. */
  letterhead: InvoiceLetterhead;
}

const defaultData: InvoiceTemplateData = {
  useLetterhead: false,
  letterhead: DEFAULT_LETTERHEAD,
  accentColor: '#B91C1C',
  termsText: 'Goods once sold will not be taken back.\nHandle fireworks with care.\nSubject to Sivakasi jurisdiction.',
  footerNote: 'Computer-generated invoice',
  website: '',
  bankDetails: '',
};

/** Sample data for the "Preview" button — never sent to the server. */
const SAMPLE_BILL: Bill = {
  id: 'preview',
  billNumber: 'AK-2601-00001',
  status: 'completed',
  customerName: 'Ramesh Kumar',
  customerPhone: '+91 98765 43210',
  customerAddress: 'No. 12, Gandhi Street, Sivakasi, Tamil Nadu - 626123',
  items: [
    { productId: '1', name: 'Sky Shot — 10 Shots', image: '', quantity: 2, unitPrice: 381.36, taxableValue: 762.71, cgstAmount: 68.64, sgstAmount: 68.64, totalAmount: 900 },
    { productId: '2', name: 'Ground Chakkar (Pack of 10)', image: '', quantity: 3, unitPrice: 101.69, taxableValue: 305.08, cgstAmount: 27.46, sgstAmount: 27.46, totalAmount: 360 },
  ],
  discountPercent: 0,
  subtotal: 1067.79,
  totalDiscount: 0,
  packagingFee: 20,
  deliveryCharge: 0,
  courierDelivery: false,
  taxableAmount: 1067.79,
  totalCgst: 96.1,
  totalSgst: 96.1,
  gstRate: 18,
  grandTotal: 1280,
  roundOff: 0,
  payment: { method: 'upi', amount: 1280, reference: 'UPI-PREVIEW-001' },
  itemCount: 2,
  totalQuantity: 5,
  createdAt: new Date().toISOString(),
  createdBy: 'preview',
};

export function InvoiceTemplateTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [data, setData] = useState<InvoiceTemplateData>(defaultData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [saved, setSaved] = useState(false);
  // Failures used to vanish into empty catches: a save that did not save looked
  // like one that did, and a failed load left defaults on screen that Save
  // would then write over the shop's real terms and bank details.
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const fetched = await getContentSection<InvoiceTemplateData>('invoice-template');
        if (fetched) setData({ ...defaultData, ...fetched });
      } catch (e) {
        setLoadFailed(true);
        setError(loadErrorText(e));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (loadFailed) return;
    setIsSaving(true);
    setError('');
    try {
      await updateContentSection('invoice-template', data as unknown as Record<string, unknown>);
      useSiteStore.setState((st) => ({ config: { ...st.config, invoiceTemplate: data } }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errorText(e, 'Could not save. Your changes are still on screen — try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const set = (field: keyof InvoiceTemplateData, value: string) => setData((p) => ({ ...p, [field]: value }));
  const setHead = <K extends keyof InvoiceLetterhead>(field: K, value: InvoiceLetterhead[K]) =>
    setData((p) => ({ ...p, letterhead: { ...toLetterhead(p.letterhead), [field]: value } }));
  const head = toLetterhead(data.letterhead);

  /**
   * Take the head the shop already set up for the wholesale pad.
   *
   * There is one letterhead in real life, and it was filled in once under
   * Content -> Wholesale Invoice. Retyping thirteen fields to match is how the
   * two documents end up disagreeing about a phone number.
   */
  const copyFromWholesale = async () => {
    setCopying(true);
    try {
      const { getContentSection } = await import('@/services/admin.ts');
      const tpl = await getContentSection<Partial<InvoiceLetterhead>>('wholesale-invoice-template');
      if (tpl) setData((p) => ({ ...p, letterhead: toLetterhead(tpl), useLetterhead: true }));
      else setError('The wholesale invoice letterhead has not been set up yet.');
    } catch (e) {
      // Leave what is there, and say so.
      setError(errorText(e, 'Could not read the wholesale invoice letterhead.'));
    } finally {
      setCopying(false);
    }
  };

  /** Render a sample tax invoice with the current (possibly unsaved) form values. */
  const handlePreview = async () => {
    setIsPreviewing(true);
    const prev = useSiteStore.getState().config.invoiceTemplate;
    useSiteStore.setState((st) => ({ config: { ...st.config, invoiceTemplate: data } }));
    try {
      const [{ pdf }, { BillPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/admin/BillPDF.tsx'),
        preparePdfLogo(),
        // Preview renders the UNSAVED form, so its assets come from `data`
        // rather than from the store the print path reads.
        prepareLetterheadAssets(data),
      ]);
      const blob = await pdf(BillPDF({ bill: SAMPLE_BILL })).toBlob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(errorText(e, 'Preview failed. If your browser blocked the popup, allow it and try again.'));
    } finally {
      useSiteStore.setState((st) => ({ config: { ...st.config, invoiceTemplate: prev } }));
      setIsPreviewing(false);
    }
  };

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={error} onDismiss={loadFailed ? undefined : () => setError('')} />
      {saveSlot &&
        createPortal(
          <SaveButton onClick={handleSave} isSaving={isSaving} disabled={loadFailed} label="Save Invoice Settings" />,
          saveSlot,
        )}

      <p className="text-body-sm text-surface-500 dark:text-surface-400">
        Controls how invoices, packing slips and quotations look. GSTIN, HSN code and GST rate are managed separately under{' '}
        <span className="font-medium text-surface-700 dark:text-surface-300">Settings → Tax</span> and can't be edited here.
      </p>

      <AdminCard title="Letterhead">
        <SectionLabel
          label="Print the shop's classic letterhead on retail and wholesale-per-piece invoices, instead of the coloured band"
          hint="Visible on: Tax invoices & quotations — the full-case pad always uses its own"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={data.useLetterhead}
            onClick={() => setData((p) => ({ ...p, useLetterhead: !p.useLetterhead }))}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              data.useLetterhead ? 'bg-brand-500' : 'bg-surface-300 dark:bg-surface-600',
            )}
          >
            <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', data.useLetterhead ? 'translate-x-6' : 'translate-x-1')} />
          </button>
          <span className="text-body-sm text-surface-600 dark:text-surface-400">
            {data.useLetterhead ? 'Classic letterhead' : 'Coloured band (current)'}
          </span>
          <button
            type="button"
            onClick={() => void copyFromWholesale()}
            disabled={copying}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 text-caption font-semibold text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50"
          >
            {copying ? 'Copying...' : 'Copy from wholesale invoice'}
          </button>
        </div>

        {data.useLetterhead && (
          <div className="mt-5 space-y-5 pt-5 border-t border-surface-100 dark:border-surface-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <HeadField label="Shop Name">
                <input value={head.shopName} onChange={(e) => setHead('shopName', e.target.value)} className={inputClass} placeholder="PD Crackers" />
              </HeadField>
              <HeadField label="Document Title">
                <input value={head.docTitle} onChange={(e) => setHead('docTitle', e.target.value)} className={inputClass} placeholder="TAX INVOICE" />
              </HeadField>
              <HeadField label="Address Line 1">
                <input value={head.addressLine1} onChange={(e) => setHead('addressLine1', e.target.value)} className={inputClass} placeholder="Door No. 3/666/99, Ponbalaji Nagar" />
              </HeadField>
              <HeadField label="Address Line 2">
                <input value={head.addressLine2} onChange={(e) => setHead('addressLine2', e.target.value)} className={inputClass} placeholder="Sattur Main Road, Sivakasi" />
              </HeadField>
              <HeadField label="Tagline Band">
                <input value={head.tagline} onChange={(e) => setHead('tagline', e.target.value)} className={inputClass} placeholder="The Best Branded Fancy Crackers & Sparklers All Varities / Wholesale" />
              </HeadField>
              <HeadField label="GSTIN (printed)">
                <input value={head.headerGstin} onChange={(e) => setHead('headerGstin', e.target.value)} className={inputClass} placeholder="33ABIFP1692E1ZA" />
              </HeadField>
              <HeadField label="Licence No.">
                <input value={head.licenseNo} onChange={(e) => setHead('licenseNo', e.target.value)} className={inputClass} placeholder="908 / 2025" />
              </HeadField>
              <HeadField label="Cell Number">
                <input value={head.cellNumber} onChange={(e) => setHead('cellNumber', e.target.value)} className={inputClass} placeholder="82484 93988" />
              </HeadField>
              <HeadField label="Ink Colour — heading, table, totals and every rule">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={/^#([0-9a-f]{6})$/i.test(head.inkColor) ? head.inkColor : '#1D4ED8'}
                    onChange={(e) => setHead('inkColor', e.target.value)}
                    className="h-11 w-14 rounded-lg border border-surface-200 dark:border-surface-700 cursor-pointer bg-transparent"
                  />
                  <input value={head.inkColor} onChange={(e) => setHead('inkColor', e.target.value)} className={inputClass} placeholder="#1D4ED8" />
                </div>
              </HeadField>
            </div>

            <div>
              <SectionLabel label="Invocation lines - centred above the title. Leave blank to omit; Tamil is supported" />
              <div className="space-y-3">
                <input value={head.tamilLine1} onChange={(e) => setHead('tamilLine1', e.target.value)} className={inputClass} placeholder="Invocation line 1" />
                <input value={head.tamilLine2} onChange={(e) => setHead('tamilLine2', e.target.value)} className={inputClass} placeholder="Invocation line 2" />
              </div>
            </div>

            <div>
              <SectionLabel label="Emblems - one at each side of the heading. PNG or JPEG only" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ImageUploadField
                  label="Left"
                  value={head.leftEmblemUrl}
                  onChange={(url) => setHead('leftEmblemUrl', url)}
                  folder="content"
                  previewClassName="w-24 h-24 rounded-xl"
                  placeholder="https://.../left.png"
                />
                <ImageUploadField
                  label="Right"
                  value={head.rightEmblemUrl}
                  onChange={(url) => setHead('rightEmblemUrl', url)}
                  folder="content"
                  previewClassName="w-24 h-24 rounded-xl"
                  placeholder="https://.../right.png"
                />
              </div>
              <div className="mt-4">
                <label className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">
                  Emblem size - {head.emblemSize}pt
                </label>
                <input
                  type="range"
                  min={24}
                  max={78}
                  step={2}
                  value={head.emblemSize}
                  onChange={(e) => setHead('emblemSize', Number(e.target.value))}
                  className="w-full max-w-sm accent-brand-500"
                />
                <p className="mt-1 text-caption text-surface-400">
                  Sets the height; the width follows the image&rsquo;s own shape, so a tall picture is not
                  squashed into a square.
                </p>
              </div>
            </div>
          </div>
        )}
      </AdminCard>

      <AdminCard title="Branding">
        <SectionLabel
          label={
            data.useLetterhead
              ? 'Used on packing slips. The tax invoice follows the letterhead ink colour above instead, so the sheet is one colour throughout'
              : 'Accent color used on every generated PDF'
          }
          hint="Visible on: All invoices, packing slips & quotations"
        />
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={/^#([0-9a-f]{6})$/i.test(data.accentColor) ? data.accentColor : '#B91C1C'}
            onChange={(e) => set('accentColor', e.target.value)}
            className="h-11 w-14 rounded-lg border border-surface-200 dark:border-surface-700 cursor-pointer bg-transparent"
          />
          <input
            type="text"
            value={data.accentColor}
            onChange={(e) => set('accentColor', e.target.value)}
            className={inputClass + ' max-w-[140px]'}
            placeholder="#B91C1C"
          />
          <button
            type="button"
            onClick={handlePreview}
            disabled={isPreviewing}
            className="ml-auto px-4 py-2.5 rounded-xl text-body-sm font-medium border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors disabled:opacity-60"
          >
            {isPreviewing ? 'Generating…' : 'Preview Sample Invoice'}
          </button>
        </div>
      </AdminCard>

      <AdminCard title="Terms & Conditions">
        <SectionLabel label="One rule per line — numbered automatically on the tax invoice" hint="Visible on: Tax invoices & quotations" />
        <textarea
          value={data.termsText}
          onChange={(e) => set('termsText', e.target.value)}
          rows={4}
          className={inputClass}
          placeholder={'Goods once sold will not be taken back.\nHandle fireworks with care.'}
        />
      </AdminCard>

      <AdminCard title="Footer Note">
        <SectionLabel label="Shown at the bottom of every tax invoice, next to your site URL" hint="Visible on: Tax invoices & quotations" />
        <input
          type="text"
          value={data.footerNote}
          onChange={(e) => set('footerNote', e.target.value)}
          className={inputClass}
          placeholder="Computer-generated invoice"
        />
      </AdminCard>

      <AdminCard title="Website">
        <SectionLabel label="Printed in the header and footer of every generated PDF" hint="Visible on: Invoices, packing slips & quotations" />
        <input
          type="text"
          value={data.website}
          onChange={(e) => set('website', e.target.value)}
          className={inputClass}
          placeholder="yourstore.com"
        />
        <p className="mt-2 text-caption text-surface-400">
          Leave blank to use the Canonical Site URL from{' '}
          <span className="font-medium text-surface-500 dark:text-surface-400">Content → Site Settings</span>.
        </p>
      </AdminCard>

      <AdminCard title="Bank / Payment Details">
        <SectionLabel label="Optional — one detail per line, shown on the invoice only if filled in" hint="Visible on: Tax invoices" />
        <textarea
          value={data.bankDetails}
          onChange={(e) => set('bankDetails', e.target.value)}
          rows={3}
          className={inputClass}
          placeholder={'A/c Name: Your Company\nA/c No: 123456789012\nIFSC: ABCD0123456\nUPI: yourstore@upi'}
        />
      </AdminCard>
    </div>
  );
}

/** One labelled letterhead field. Mirrors the wholesale tab's own `Field`. */
function HeadField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">{label}</label>
      {children}
    </div>
  );
}
