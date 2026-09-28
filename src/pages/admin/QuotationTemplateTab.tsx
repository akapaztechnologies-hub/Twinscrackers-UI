import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Eye, Info } from 'lucide-react';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { SaveButton, SuccessToast, loadErrorText } from '@/components/admin/AdminShared.tsx';
import { getContentSection, updateContentSection } from '@/services/admin.ts';
import { printBillDocument } from '@/lib/billDocument.ts';
import { LETTERHEAD_KEYS, toLetterhead } from '@/types/invoiceLetterhead.ts';
import { DEFAULT_QUOTATION_TEMPLATE, type QuotationTemplate } from '@/types/quotationTemplate.ts';
import type { Bill } from '@/types/admin.ts';

/**
 * The pre-printed stationery for a quotation.
 *
 * Everything here is identical on EVERY quotation — the letterhead, the boxed
 * title, the standing terms, how long a quote stands for, and the line that
 * says this is not a tax invoice. What gets written into it for one customer
 * (number, dates, party, transport, notes) is edited on the quotation itself,
 * from Quotations → the layout button.
 *
 * A sibling of InvoiceTemplateTab and WholesaleInvoiceTemplateTab rather than a
 * section inside either: a quotation shares the shop's letterhead with both,
 * but nothing else. Its terms are about an offer, not a completed sale, and it
 * has a validity period neither of the others has.
 */

const SECTION_ID = 'quotation-template';

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

/** Sample data for the Preview button — never sent to the server. */
const SAMPLE: Bill = {
  id: 'sample',
  billNumber: 'AK-2609-00042',
  status: 'completed',
  customerName: 'Ramesh Traders',
  customerPhone: '9876543210',
  customerAddress: '12, Bazaar Road, Sivakasi, Virudhunagar - 626123',
  items: [
    { productId: 's1', name: '4" Lakshmi Deluxe', image: '', quantity: 5, unitPrice: 1240, taxableValue: 6200, cgstAmount: 558, sgstAmount: 558, totalAmount: 7316 },
    { productId: 's2', name: 'Sky Shot 10 Shots', image: '', quantity: 3, unitPrice: 4500, taxableValue: 13500, cgstAmount: 1215, sgstAmount: 1215, totalAmount: 15930 },
    { productId: 's3', name: 'Ground Chakkar Big', image: '', quantity: 12, unitPrice: 860, taxableValue: 10320, cgstAmount: 929, sgstAmount: 929, totalAmount: 12178 },
  ],
  discountPercent: 0,
  subtotal: 30020,
  totalDiscount: 0,
  packagingFee: 0,
  deliveryCharge: 0,
  taxableAmount: 30020,
  totalCgst: 2702,
  totalSgst: 2702,
  taxKind: 'intra',
  billingMode: 'retail',
  gstMode: 'percent',
  gstRate: 18,
  grandTotal: 35424,
  roundOff: 0,
  payment: { method: 'cash', amount: 0 },
  itemCount: 3,
  totalQuantity: 20,
  createdAt: new Date().toISOString(),
  createdBy: 'sample',
};

export function QuotationTemplateTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [data, setData] = useState<QuotationTemplate>(DEFAULT_QUOTATION_TEMPLATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  // Defaults on screen after a failed load; saving them would replace the
  // shop's real quotation wording, so Save stays off.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const fetched = await getContentSection<Partial<QuotationTemplate>>(SECTION_ID);
        if (fetched) setData({ ...DEFAULT_QUOTATION_TEMPLATE, ...fetched });
      } catch (e) {
        setLoadFailed(true);
        setError(loadErrorText(e));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof QuotationTemplate>(key: K, value: QuotationTemplate[K]) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      await updateContentSection(SECTION_ID, data as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Your changes are still on screen — try again.');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Copy the letterhead across from the wholesale pad.
   *
   * The shop has one letterhead. Retyping thirteen fields is how the address on
   * one document ends up a year behind the address on another.
   */
  const copyLetterhead = async () => {
    setError('');
    try {
      const source = await getContentSection<Record<string, unknown>>('wholesale-invoice-template');
      if (!source) {
        setError('The wholesale invoice template has not been set up yet.');
        return;
      }
      const head = toLetterhead(source as never);
      setData((prev) => {
        const next = { ...prev };
        for (const key of LETTERHEAD_KEYS) {
          // The title is the one letterhead field NOT copied: the whole point
          // of this document is that it does not say TAX INVOICE.
          if (key === 'docTitle') continue;
          (next as Record<string, unknown>)[key] = head[key];
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the wholesale template.');
    }
  };

  /** Print a sample using the current (possibly unsaved) values. */
  const handlePreview = async () => {
    setIsPreviewing(true);
    setError('');
    try {
      await printBillDocument(SAMPLE, true, {
        docTitle: data.docTitle,
        terms: data.terms,
        notice: data.showEstimateNotice ? data.estimateNotice : undefined,
        validUntil: new Date(Date.now() + data.validityDays * 86400000).toISOString(),
      });
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

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-body-sm text-surface-500 dark:text-surface-400 max-w-2xl">
        The pre-printed parts of a <span className="font-medium text-surface-700 dark:text-surface-300">quotation</span>
        {' '}— the same on every copy. The customer, items and totals are filled in per quotation from Billing, and
        each quotation's own number, dates, party block and notes are edited from{' '}
        <span className="font-medium text-surface-700 dark:text-surface-300">Quotations → layout</span>. A quotation
        for a full-case wholesale customer prints on the ruled wholesale sheet, with the title set below.
      </p>

      <AdminCard title="Document">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">Title</span>
            <input
              type="text"
              value={data.docTitle}
              onChange={(e) => set('docTitle', e.target.value)}
              placeholder="QUOTATION"
              className={inputClass}
            />
            <span className="mt-1 block text-[11px] text-surface-400">
              Boxed above the shop name, and on the full-case sheet too.
            </span>
          </label>
          <label className="block">
            <span className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">Valid for (days)</span>
            <input
              type="number"
              min={1}
              max={365}
              value={data.validityDays}
              onChange={(e) => set('validityDays', Math.max(1, Number(e.target.value) || 1))}
              className={inputClass}
            />
            <span className="mt-1 block text-[11px] text-surface-400">
              Sets the "Valid until" date on a new quotation. Past it, the quotation is marked expired —
              it can still be changed per quotation.
            </span>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-surface-200 dark:border-surface-700 p-3.5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.showEstimateNotice}
              onChange={(e) => set('showEstimateNotice', e.target.checked)}
              className="mt-1 h-4 w-4 rounded accent-brand-500"
            />
            <span className="min-w-0">
              <span className="block text-body-sm font-medium text-surface-900 dark:text-surface-100">
                Print the "not a tax invoice" line
              </span>
              <span className="block mt-0.5 text-[11px] text-surface-500">
                Printed under the grand total. Strongly recommended: a quotation that reads like a tax invoice
                is the one way this document can cause the shop real trouble.
              </span>
            </span>
          </label>
          {data.showEstimateNotice && (
            <input
              type="text"
              value={data.estimateNotice}
              onChange={(e) => set('estimateNotice', e.target.value)}
              placeholder={DEFAULT_QUOTATION_TEMPLATE.estimateNotice}
              className={`${inputClass} mt-3`}
            />
          )}
        </div>
      </AdminCard>

      <AdminCard
        title="Standing terms"
       
      >
        <textarea
          value={data.terms}
          onChange={(e) => set('terms', e.target.value)}
          rows={4}
          placeholder={DEFAULT_QUOTATION_TEMPLATE.terms}
          className={inputClass}
        />
      </AdminCard>

      <AdminCard title="Sheet">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block">
            <span className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">HSN code</span>
            <input type="text" value={data.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">Ruled rows</span>
            <input
              type="number"
              min={1}
              max={40}
              value={data.rowCount}
              onChange={(e) => set('rowCount', Math.max(1, Number(e.target.value) || 1))}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">"For" label</span>
            <input type="text" value={data.forLabel} onChange={(e) => set('forLabel', e.target.value)} placeholder="For NV Crackers" className={inputClass} />
          </label>
          <label className="block">
            <span className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">Signatory</span>
            <input type="text" value={data.signatoryLabel} onChange={(e) => set('signatoryLabel', e.target.value)} className={inputClass} />
          </label>
        </div>
      </AdminCard>

      <AdminCard
        title="Letterhead"
       
      >
        <p className="flex items-start gap-1.5 text-caption text-surface-500">
          <Info size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            The shop has one letterhead, edited on the Invoice and Wholesale Invoice tabs. Copy it here rather
            than retyping it, so the address on a quotation cannot drift from the address on an invoice.
          </span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copyLetterhead()}
            className="px-4 py-2 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
          >
            Copy from the wholesale invoice
          </button>
          {data.shopName && (
            <span className="text-caption text-surface-500">
              Currently: <span className="font-medium text-surface-700 dark:text-surface-200">{data.shopName}</span>
            </span>
          )}
        </div>
      </AdminCard>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handlePreview()}
          disabled={isPreviewing}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50 transition-colors"
        >
          <Eye size={15} /> {isPreviewing ? 'Preparing…' : 'Preview a sample'}
        </button>
      </div>

      {saveSlot && createPortal(<SaveButton onClick={() => void handleSave()} isSaving={isSaving} disabled={loadFailed} label="Save Quotation Template" />, saveSlot)}
      <SuccessToast show={saved} />
    </div>
  );
}
