import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { SaveButton, SuccessToast, SectionLabel, loadErrorText } from '@/components/admin/AdminShared.tsx';
import { ImageUploadField } from '@/components/admin/ImageUploadField.tsx';
import { getContentSection, updateContentSection } from '@/services/admin.ts';
import { printCaseInvoice, describeRenderWarnings } from '@/lib/caseInvoicePdf.ts';
import { isValidGstin, normalizeGstin } from '@/lib/gstin.ts';
import {
  DEFAULT_WHOLESALE_TEMPLATE,
  type CaseInvoiceDraft,
  type WholesaleInvoiceTemplate,
} from '@/types/wholesaleInvoice.ts';

/**
 * The pre-printed stationery for the wholesale full-case invoice.
 *
 * Everything here is identical on every copy — the parts that would have been
 * printed onto a blank pad at the press. What gets written *into* the pad for
 * one sale is edited on the invoice itself, in Billing.
 *
 * A sibling of InvoiceTemplateTab rather than a section inside it: that tab
 * controls the retail tax invoice and the packing slip, which share an accent
 * colour, terms and a footer note. This document shares none of them.
 */

const SECTION_ID = 'wholesale-invoice-template';

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

/** Sample data for the Preview button — never sent to the server. */
const SAMPLE: CaseInvoiceDraft = {
  displayNumber: '6',
  invoiceDate: new Date().toISOString().slice(0, 10),
  customerName: 'Ramesh Traders',
  customerAddress: '12, Bazaar Road, Sivakasi, Virudhunagar - 626123',
  customerState: 'Tamil Nadu',
  partyGstin: '33ABIFP1692E1ZA',
  transport: 'ARC Parcel Service',
  hsnCode: '3604',
  lines: [
    { name: '4" Lakshmi Deluxe', quantity: 5, unitPrice: 1240, unit: 'case', piecesPerCase: 100 },
    { name: 'Sky Shot 10 Shots', quantity: 3, unitPrice: 4500, unit: 'case', piecesPerCase: 24 },
    { name: 'Ground Chakkar Big', quantity: 12, unitPrice: 860.5, unit: 'case', piecesPerCase: 50 },
  ],
  discountPercent: 0,
  gstRate: 18,
  taxKind: 'intra',
  deliveryCharge: 0,
  manualRoundOff: '',
  notes: '',
};

export function WholesaleInvoiceTemplateTab({
  saveSlot,
  sectionId = SECTION_ID,
}: {
  saveSlot: HTMLDivElement | null;
  /** Which stationery this is editing. The factory bill is the same document with its own letterhead. */
  sectionId?: string;
}) {
  const [data, setData] = useState<WholesaleInvoiceTemplate>(DEFAULT_WHOLESALE_TEMPLATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [saved, setSaved] = useState(false);
  // Every failure here used to be swallowed by an empty catch, so a save that
  // did not save and a preview that did not open looked identical to one that
  // worked. Both now say what went wrong.
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  // A template that failed to load shows the defaults, and saving those would
  // overwrite the shop's real letterhead — so Save stays off.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const fetched = await getContentSection<Partial<WholesaleInvoiceTemplate>>(sectionId);
        if (fetched) setData({ ...DEFAULT_WHOLESALE_TEMPLATE, ...fetched });
      } catch (e) {
        setLoadFailed(true);
        setError(loadErrorText(e));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof WholesaleInvoiceTemplate>(key: K, value: WholesaleInvoiceTemplate[K]) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      await updateContentSection(sectionId, data as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Your changes are still on screen — try again.');
    } finally {
      setIsSaving(false);
    }
  };

  /** Print a sample using the current (possibly unsaved) values. */
  const handlePreview = async () => {
    setIsPreviewing(true);
    setError('');
    setWarning('');
    try {
      // refreshImages: the admin may have just replaced an emblem, and the
      // memoised copy of the old one is exactly what they are trying to check.
      await printCaseInvoice(SAMPLE, data, { refreshImages: true });
      setWarning(describeRenderWarnings());
    } catch (e) {
      setError(
        e instanceof Error
          ? `Preview failed: ${e.message}`
          : 'Preview failed. If your browser blocked the popup, allow it and try again.',
      );
    } finally {
      setIsPreviewing(false);
    }
  };

  if (isLoading) return <SkeletonCard />;

  const gstinBad = Boolean(data.headerGstin) && !isValidGstin(data.headerGstin);

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {warning && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-body-sm font-medium">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {warning}
        </div>
      )}
      {saveSlot &&
        createPortal(
          <SaveButton onClick={handleSave} isSaving={isSaving} disabled={loadFailed} label="Save Wholesale Invoice" />,
          saveSlot,
        )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-body-sm text-surface-500 dark:text-surface-400 max-w-2xl">
          The pre-printed parts of the <span className="font-medium text-surface-700 dark:text-surface-300">full-case
          wholesale invoice</span> — the same on every copy. Customer, items, GST and totals are filled in per
          invoice from Billing. Wholesale billed <span className="font-medium">per piece</span> uses the regular tax
          invoice under <span className="font-medium text-surface-700 dark:text-surface-300">Invoice / PDF</span> instead.
        </p>
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPreviewing}
          className="px-4 py-2.5 rounded-xl text-body-sm font-medium border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors disabled:opacity-60"
        >
          {isPreviewing ? 'Generating…' : 'Preview Sample Invoice'}
        </button>
      </div>

      <AdminCard title="Heading">
        <SectionLabel label="Printed across the top of every wholesale invoice" hint="Visible on: Full-case invoices" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Shop Name">
            <input value={data.shopName} onChange={(e) => set('shopName', e.target.value)} className={inputClass} placeholder="PD CRACKERS" />
          </Field>
          <Field label="Document Title">
            <input value={data.docTitle} onChange={(e) => set('docTitle', e.target.value)} className={inputClass} placeholder="TAX INVOICE" />
          </Field>
          <Field label="Address Line 1">
            <input value={data.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} className={inputClass} placeholder="Door No.3/666/99, Ponbalaji Nagar, Sattur Main Road," />
          </Field>
          <Field label="Address Line 2">
            <input value={data.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} className={inputClass} placeholder="SIVAKASI." />
          </Field>
          <Field label="Tagline Band">
            <input value={data.tagline} onChange={(e) => set('tagline', e.target.value)} className={inputClass} placeholder="The Best Branded Fancy Crackers & Sparklers All Varities / Wholesale" />
          </Field>
          <Field label="GSTIN (yours)">
            <input
              value={data.headerGstin}
              onChange={(e) => set('headerGstin', normalizeGstin(e.target.value).slice(0, 15))}
              maxLength={15}
              className={inputClass + ' font-mono tracking-wide' + (gstinBad ? ' border-amber-400' : '')}
              placeholder="33ABIFP1692E1ZA"
            />
            <p className="mt-1 text-caption text-surface-400">
              {gstinBad
                ? 'Not a valid GSTIN — the state code also decides CGST+SGST vs IGST.'
                : 'Its first two digits decide whether an invoice charges CGST+SGST or IGST.'}
            </p>
          </Field>
          <Field label="License No">
            <input value={data.licenseNo} onChange={(e) => set('licenseNo', e.target.value)} className={inputClass} placeholder="908 / 2025" />
          </Field>
          <Field label="Cell Number">
            <input value={data.cellNumber} onChange={(e) => set('cellNumber', e.target.value)} className={inputClass} placeholder="82484 93988" />
          </Field>
          <Field label="Ink Colour">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={/^#([0-9a-f]{6})$/i.test(data.inkColor) ? data.inkColor : '#1D4ED8'}
                onChange={(e) => set('inkColor', e.target.value)}
                className="h-11 w-14 rounded-lg border border-surface-200 dark:border-surface-700 cursor-pointer bg-transparent"
              />
              <input value={data.inkColor} onChange={(e) => set('inkColor', e.target.value)} className={inputClass} placeholder="#1D4ED8" />
            </div>
          </Field>
        </div>
      </AdminCard>

      <AdminCard title="Invocation Lines">
        <SectionLabel
          label="Centred above the title. Leave blank to omit — Tamil is supported"
          hint="Visible on: Full-case invoices"
        />
        <div className="space-y-3">
          <input value={data.tamilLine1} onChange={(e) => set('tamilLine1', e.target.value)} className={inputClass} placeholder="ஸ்ரீ மகாலட்சுமி தாயார் துணை" />
          <input value={data.tamilLine2} onChange={(e) => set('tamilLine2', e.target.value)} className={inputClass} placeholder="அருள்மிகு பொன்னும்மன் துணை" />
        </div>
      </AdminCard>

      <AdminCard title="Emblems">
        <SectionLabel
          label="One at each side of the heading. PNG or JPEG only"
          hint="Visible on: Full-case invoices"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ImageUploadField
            label="Left"
            value={data.leftEmblemUrl}
            onChange={(url) => set('leftEmblemUrl', url)}
            folder="content"
            previewClassName="w-24 h-24 rounded-xl"
            placeholder="https://…/left.png"
          />
          <ImageUploadField
            label="Right"
            value={data.rightEmblemUrl}
            onChange={(url) => set('rightEmblemUrl', url)}
            folder="content"
            previewClassName="w-24 h-24 rounded-xl"
            placeholder="https://…/right.png"
          />
        </div>
        <div className="mt-4">
          <label className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">
            Emblem size — {data.emblemSize}pt
          </label>
          <input
            type="range"
            min={24}
            max={78}
            step={2}
            value={data.emblemSize}
            onChange={(e) => set('emblemSize', Number(e.target.value))}
            className="w-full max-w-sm accent-brand-500"
          />
          <p className="mt-1 text-caption text-surface-400">
            Sets the height; the width follows your image&rsquo;s own shape, so a tall picture is not squashed
            into a square. Hit Preview to see it on the page.
          </p>
        </div>

        <p className="mt-3 text-caption text-surface-400">
          Upload any common image format — it is converted to something the PDF can draw automatically. Preview
          says so if one could not be loaded.
        </p>
      </AdminCard>

      <AdminCard title="Grid & Totals">
        <SectionLabel label="How the ruled sheet is laid out" hint="Visible on: Full-case invoices" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Default HSN Code">
            <input value={data.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} className={inputClass} placeholder="3604" />
          </Field>
          <Field label="Ruled Rows">
            <input
              type="number"
              min={5}
              max={30}
              value={data.rowCount}
              onChange={(e) => set('rowCount', Math.min(30, Math.max(5, Number(e.target.value) || 13)))}
              className={inputClass}
            />
            <p className="mt-1 text-caption text-surface-400">
              Blank rows keep the sheet looking full. An invoice with more items than this simply grows past it.
            </p>
          </Field>
          <Field label="Tax Note">
            <input value={data.eoeLabel} onChange={(e) => set('eoeLabel', e.target.value)} className={inputClass} placeholder="E.&O.E." />
          </Field>
          <Field label="Show IGST Row">
            <label className="flex items-center gap-2 h-11 px-3.5 rounded-xl border border-surface-200 dark:border-surface-700 cursor-pointer">
              <input
                type="checkbox"
                checked={data.showIgstRow}
                onChange={(e) => set('showIgstRow', e.target.checked)}
                className="h-4 w-4 accent-brand-500"
              />
              <span className="text-body-sm text-surface-700 dark:text-surface-300">
                Print an IGST line even on local sales
              </span>
            </label>
          </Field>
        </div>
      </AdminCard>

      <AdminCard title="Terms & Signature">
        <SectionLabel label="Bottom of every invoice" hint="Visible on: Full-case invoices" />
        <Field label="Conditions (one per line)">
          <textarea
            value={data.terms}
            onChange={(e) => set('terms', e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="Goods once sold cannot be taken back"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Left Signing Slot">
            <input value={data.checkedByLabel} onChange={(e) => set('checkedByLabel', e.target.value)} className={inputClass} placeholder="Checked by" />
          </Field>
          <Field label="Right Signing Slot">
            <input value={data.preparedByLabel} onChange={(e) => set('preparedByLabel', e.target.value)} className={inputClass} placeholder="Prepared by" />
          </Field>
          <Field label="“For …” Name">
            <input value={data.forLabel} onChange={(e) => set('forLabel', e.target.value)} className={inputClass} placeholder="Leave blank to use the shop name" />
          </Field>
          <Field label="Signatory Title">
            <input value={data.signatoryLabel} onChange={(e) => set('signatoryLabel', e.target.value)} className={inputClass} placeholder="Partner" />
          </Field>
        </div>
      </AdminCard>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">{label}</label>
      {children}
    </div>
  );
}
