import { useState, useCallback } from 'react';
import { Printer, Download, Save, RotateCcw, AlertTriangle, Info, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils.ts';
import { DatePicker } from '@/components/atoms/DatePicker.tsx';
import { numberToWords } from '@/lib/numberToWords.ts';
import { isValidGstin, normalizeGstin, gstinStateName } from '@/lib/gstin.ts';
import { printBillDocument, downloadBillDocument } from '@/lib/billDocument.ts';
import { quotationToBill, quotationEstimate, type Quotation, type QuotationLayout } from '@/types/quotation.ts';
import type { QuotationTemplate } from '@/types/quotationTemplate.ts';

/**
 * A quotation's printed page, edited in the shape it prints.
 *
 * The counterpart of `WholesaleInvoiceEditor`, and laid out the same way for
 * the same reason: the person filling it in is looking for the box they would
 * have written in on paper, not for the third field of a stacked form.
 *
 * What this edits and what it does NOT is the important line:
 *
 *  - Editable here: everything presentational — the printed number, the dates,
 *    the party block, transport, HSN, the tax split, the notes and the terms.
 *    Stored as typed, printed as typed, and saved through a route that cannot
 *    re-price.
 *  - NOT editable here: items, quantities, rates, discount, GST. Those are the
 *    money, and the money is edited on the billing screen, where product
 *    search, case pricing and coupons all live. A second place to change a rate
 *    would be a second answer to what the customer was quoted.
 *
 * The totals shown are the ones the server stored. Nothing on this screen
 * computes them.
 */

const fieldInput =
  'w-full bg-transparent border-b border-dotted border-surface-300 dark:border-surface-600 ' +
  'px-1 py-1 text-body-sm text-surface-900 dark:text-surface-100 ' +
  'focus:outline-none focus:border-brand-500 focus:border-solid';

const boxCls = 'border border-surface-300 dark:border-surface-700';

/**
 * The picker speaks `yyyy-mm-dd`; the API speaks full ISO.
 *
 * Read in the shop's zone. Slicing the UTC string showed a quotation raised
 * between midnight and 5:30 am IST as the day before — the date a server-set
 * `validUntil` usually carries a time like that.
 */
function toDateInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * A `yyyy-mm-dd` back to ISO, anchored at midday.
 *
 * Midday, not midnight: India is UTC+5:30, so `new Date('2026-09-21')` is
 * midnight UTC, which is still the 21st here — but the round trip back through
 * `toISOString()` for a date the shop picked in local time can land on the day
 * before. Noon leaves 12 hours of slack either way, so the printed date is
 * always the day that was clicked.
 */
function isoAtNoon(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toISOString();
}

export interface QuotationLayoutEditorProps {
  quotation: Quotation;
  draft: QuotationLayout;
  onChange: (next: QuotationLayout) => void;
  template: Partial<QuotationTemplate>;
  onSave: () => Promise<void> | void;
  /** Restore the draft to what the saved quotation holds. */
  onRevert: () => void;
  isSaving?: boolean;
  error?: string;
}

export function QuotationLayoutEditor({
  quotation,
  draft,
  onChange,
  template,
  onSave,
  onRevert,
  isSaving = false,
  error,
}: QuotationLayoutEditorProps) {
  const [busy, setBusy] = useState<'print' | 'download' | null>(null);
  // A failed render used to reject into nothing on the wholesale pad. A
  // document that will not print has to say why, while somebody is waiting.
  const [docError, setDocError] = useState('');

  const set = useCallback(
    <K extends keyof QuotationLayout>(key: K, value: QuotationLayout[K]) => onChange({ ...draft, [key]: value }),
    [draft, onChange],
  );

  const gstinTyped = (draft.partyGstin ?? '').trim();
  const gstinBad = gstinTyped.length > 0 && !isValidGstin(gstinTyped);
  const settled = quotation.status === 'converted' || quotation.status === 'cancelled';

  /**
   * Print or download what is ON SCREEN, not what was last saved.
   *
   * The draft is merged over the quotation first, so the button previews the
   * edits being made. Otherwise "Print" after a change quietly hands over the
   * previous version — the failure mode nobody notices until the customer has
   * the wrong page.
   */
  const render = useCallback(
    async (mode: 'print' | 'download') => {
      setBusy(mode);
      setDocError('');
      try {
        const bill = quotationToBill({ ...quotation, layout: draft });
        const chrome = quotationEstimate({ ...quotation, layout: draft });
        await (mode === 'print' ? printBillDocument(bill, true, chrome) : downloadBillDocument(bill, true, chrome));
      } catch (e) {
        setDocError(e instanceof Error ? e.message : 'Could not render this quotation.');
      } finally {
        setBusy(null);
      }
    },
    [quotation, draft],
  );

  const isCase = quotation.billingMode === 'wholesale-case';
  // Under the split the page will print, and the same rupees either way — the
  // toggle below changes the heading, never the amount.
  const gstLabel = (draft.taxKind ?? quotation.taxKind) === 'inter' ? 'IGST' : 'CGST + SGST';
  const gstValue = (quotation.totalCgst ?? 0) + (quotation.totalSgst ?? 0) + (quotation.totalIgst ?? 0);

  return (
    <div className="space-y-4">
      {(error || docError) && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{error || docError}</span>
        </div>
      )}

      {settled && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-caption">
          <Info size={15} className="mt-0.5 flex-shrink-0" />
          <span>
            {quotation.status === 'converted'
              ? `${quotation.quotationNumber} has been converted to an invoice, so its page is read-only. Edit the bill instead.`
              : `${quotation.quotationNumber} was cancelled, so its page is read-only. It can still be reprinted.`}
          </span>
        </div>
      )}

      {/* ─── The page ─── */}
      <fieldset disabled={settled} className="rounded-2xl bg-white dark:bg-surface-900 p-5 disabled:opacity-70">
        {/* Letterhead — fixed stationery, edited once in Settings. Shown so the
            page is recognisable, greyed so nobody types into it here. */}
        <div className="text-center pb-3 mb-3 border-b border-surface-200 dark:border-surface-700">
          <p className="text-body-lg font-bold text-surface-900 dark:text-surface-50">
            {template.shopName || 'Your shop name'}
          </p>
          <p className="text-caption text-surface-500">
            {[template.addressLine1, template.addressLine2].filter(Boolean).join(', ') || 'Set the address in Settings'}
          </p>
          <div className="mt-2 inline-block px-4 py-1 rounded border border-surface-300 dark:border-surface-600">
            <span className="text-caption font-bold tracking-widest text-surface-700 dark:text-surface-200">
              {template.docTitle || 'QUOTATION'}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-surface-400">
            Letterhead, terms and validity are shared by every quotation —{' '}
            <Link to="/admin/content?tab=quotation-template" className="text-brand-600 dark:text-brand-400 hover:underline">
              edit them in Settings
            </Link>
            .
          </p>
        </div>

        {/* ─── Number / dates ─── */}
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <label className="block">
            <span className="text-label uppercase tracking-wider text-surface-400 font-semibold">No.</span>
            <input
              type="text"
              value={draft.displayNumber}
              onChange={(e) => set('displayNumber', e.target.value)}
              className={fieldInput}
            />
            {draft.displayNumber !== quotation.quotationNumber && (
              // The printed number can be overridden, but the row keeps its own
              // key — and that key is the one the invoice will carry, so it is
              // worth saying out loud before somebody writes a different number
              // on the page the customer keeps.
              <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-400">
                Filed as {quotation.quotationNumber} — the invoice will use that number.
              </span>
            )}
          </label>
          <div>
            <span className="block text-label uppercase tracking-wider text-surface-400 font-semibold">Date</span>
            <DatePicker
              value={toDateInput(draft.quotationDate)}
              onChange={(v) => set('quotationDate', v ? isoAtNoon(v) : draft.quotationDate)}
              aria-label="Quotation date"
              size="sm"
              className="mt-1"
            />
          </div>
          <div>
            <span className="block text-label uppercase tracking-wider text-surface-400 font-semibold">Valid until</span>
            <DatePicker
              value={toDateInput(draft.validUntil)}
              // Not before the quotation itself — a quote that expired before it
              // was written is not a date anybody means to pick.
              min={toDateInput(draft.quotationDate)}
              onChange={(v) => set('validUntil', v ? isoAtNoon(v) : undefined)}
              placeholder="No expiry"
              aria-label="Valid until"
              size="sm"
              className="mt-1"
            />
            <span className="mt-1 block text-[11px] text-surface-400">
              Past this date the quotation is marked expired.
            </span>
          </div>
        </div>

        {/* ─── Party block ─── */}
        <div className={cn('rounded-xl p-4 mb-4', boxCls)}>
          <p className="text-label uppercase tracking-wider text-surface-400 font-semibold mb-2.5">To</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">
                {quotation.customerName || 'Walk-in customer'}
              </p>
              <p className="text-caption text-surface-500">{quotation.customerAddress || '—'}</p>
              {quotation.customerPhone && (
                <p className="text-caption text-surface-500 tabular-nums">{quotation.customerPhone}</p>
              )}
              <p className="mt-1.5 text-[11px] text-surface-400">
                Name, address and phone come from the customer record.
              </p>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-label uppercase tracking-wider text-surface-400 font-semibold">Party GSTIN</span>
                <input
                  type="text"
                  value={draft.partyGstin ?? ''}
                  onChange={(e) => {
                    const next = normalizeGstin(e.target.value);
                    // The state follows the GSTIN unless it was typed over —
                    // the first two digits ARE the state, and asking for it
                    // twice is how the two end up disagreeing.
                    onChange({
                      ...draft,
                      partyGstin: next,
                      partyState: gstinStateName(next) || draft.partyState,
                    });
                  }}
                  maxLength={15}
                  className={cn(fieldInput, gstinBad && 'border-red-400 focus:border-red-500')}
                />
                {gstinBad && <span className="mt-1 block text-[11px] text-red-500">That is not a valid GSTIN.</span>}
              </label>
              <label className="block">
                <span className="text-label uppercase tracking-wider text-surface-400 font-semibold">State</span>
                <input
                  type="text"
                  value={draft.partyState ?? ''}
                  onChange={(e) => set('partyState', e.target.value)}
                  className={fieldInput}
                />
              </label>
            </div>
          </div>
        </div>

        {/* ─── Transport / HSN / split ─── */}
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <label className="block">
            <span className="text-label uppercase tracking-wider text-surface-400 font-semibold">Transport</span>
            <input
              type="text"
              value={draft.transport ?? ''}
              onChange={(e) => set('transport', e.target.value)}
              placeholder="e.g. Muthu Mari Travels"
              className={fieldInput}
            />
          </label>
          <label className="block">
            <span className="text-label uppercase tracking-wider text-surface-400 font-semibold">HSN</span>
            <input
              type="text"
              value={draft.hsnCode ?? ''}
              onChange={(e) => set('hsnCode', e.target.value)}
              className={fieldInput}
            />
          </label>
          <div>
            <span className="text-label uppercase tracking-wider text-surface-400 font-semibold">Tax split</span>
            <div className="mt-1 flex rounded-md border border-surface-200 dark:border-surface-700 overflow-hidden">
              {(['intra', 'inter'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => set('taxKind', kind)}
                  className={cn(
                    'flex-1 px-2 py-1 text-caption font-medium transition-colors',
                    draft.taxKind === kind
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-50 dark:bg-surface-800 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700',
                  )}
                >
                  {kind === 'intra' ? 'CGST+SGST' : 'IGST'}
                </button>
              ))}
            </div>
            <span className="mt-1 block text-[11px] text-surface-400">
              Changes what prints, not what is charged.
            </span>
          </div>
        </div>

        {/* ─── Items: read-only, edited where the money lives ─── */}
        <div className={cn('rounded-xl overflow-hidden mb-4', boxCls)}>
          <div className="flex items-center justify-between px-3 py-2 bg-surface-50 dark:bg-surface-800/50">
            <span className="text-label uppercase tracking-wider text-surface-400 font-semibold">Items</span>
            {!settled && (
              <Link
                to={`/admin/billing?quote=${quotation.id}`}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline"
              >
                <Pencil size={11} /> Change items &amp; prices
              </Link>
            )}
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-label uppercase tracking-wider text-surface-400 border-b border-surface-100 dark:border-surface-800">
                <th className="text-left font-semibold py-2 pl-3 w-10">#</th>
                <th className="text-left font-semibold py-2">Particulars</th>
                <th className="text-center font-semibold py-2 w-24">{isCase ? 'Cases' : 'Qty'}</th>
                <th className="text-right font-semibold py-2 w-28">{isCase ? 'Rate / Case' : 'Rate'}</th>
                <th className="text-right font-semibold py-2 w-28 pr-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quotation.items.map((it, idx) => (
                <tr key={`${it.productId}-${idx}`} className="border-b border-surface-50 dark:border-surface-800/50 last:border-0">
                  <td className="py-1.5 pl-3 text-caption text-surface-400 tabular-nums">{idx + 1}</td>
                  <td className="py-1.5 text-body-sm text-surface-900 dark:text-surface-100">
                    {it.name}
                    {it.unit === 'case' && (
                      <span className="ml-1.5 text-[10px] font-semibold text-brand-600 dark:text-brand-400">
                        {it.quantity} x {it.piecesPerCase ?? 1} pcs
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-center text-caption text-surface-600 dark:text-surface-300 tabular-nums">
                    {it.quantity}
                  </td>
                  <td className="py-1.5 text-right text-caption text-surface-600 dark:text-surface-300 tabular-nums">
                    ₹{it.unitPrice.toLocaleString('en-IN')}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-body-sm font-semibold text-surface-900 dark:text-surface-100 tabular-nums">
                    ₹{(it.unitPrice * it.quantity).toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ─── Totals: the server's figures, shown not computed ─── */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <p className="text-label uppercase tracking-wider text-surface-400 font-semibold">Amount in words</p>
            <p className="mt-1 text-body-sm text-surface-700 dark:text-surface-300 capitalize">
              {numberToWords(Math.round(quotation.grandTotal))}
            </p>
          </div>
          <div className="w-full sm:w-64 space-y-1">
            <TotalRow label="Subtotal" value={quotation.subtotal} />
            {quotation.totalDiscount > 0 && (
              <TotalRow label={`Discount (${quotation.discountPercent}%)`} value={-quotation.totalDiscount} />
            )}
            {(quotation.couponDiscount ?? 0) > 0 && (
              <TotalRow label={`Coupon ${quotation.couponCode ?? ''}`} value={-(quotation.couponDiscount ?? 0)} />
            )}
            <TotalRow label={gstLabel} value={gstValue} />
            {(quotation.deliveryCharge ?? 0) > 0 && (
              <TotalRow label={quotation.courierDelivery ? 'Courier' : 'Delivery'} value={quotation.deliveryCharge ?? 0} />
            )}
            <div className="flex items-center justify-between pt-1.5 border-t border-surface-200 dark:border-surface-700">
              <span className="text-body-sm font-bold text-surface-900 dark:text-surface-50">Total</span>
              <span className="text-body-md font-bold text-brand-600 dark:text-brand-400 tabular-nums">
                ₹{quotation.grandTotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        {/* ─── Free text ─── */}
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-label uppercase tracking-wider text-surface-400 font-semibold">Notes</span>
            <textarea
              value={draft.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="Delivery terms, what is excluded, anything agreed on the phone…"
              className="mt-1 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 px-2.5 py-2 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
            />
          </label>
          <label className="block">
            <span className="text-label uppercase tracking-wider text-surface-400 font-semibold">Terms</span>
            <textarea
              value={draft.terms ?? ''}
              onChange={(e) => set('terms', e.target.value)}
              rows={3}
              placeholder={template.terms || 'Leave blank to print the standing terms from Settings.'}
              className="mt-1 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 px-2.5 py-2 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
            />
            <span className="mt-1 block text-[11px] text-surface-400">
              Blank prints the standing terms. Anything here replaces them, on this quotation only.
            </span>
          </label>
        </div>
      </fieldset>

      {/* ─── Actions ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void render('print')}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50 transition-colors"
        >
          <Printer size={15} /> {busy === 'print' ? 'Preparing…' : 'Print'}
        </button>
        <button
          type="button"
          onClick={() => void render('download')}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50 transition-colors"
        >
          <Download size={15} /> {busy === 'download' ? 'Preparing…' : 'Download'}
        </button>
        <button
          type="button"
          onClick={onRevert}
          disabled={settled || isSaving}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-body-sm font-medium text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-40 transition-colors"
        >
          <RotateCcw size={15} /> Revert
        </button>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={settled || isSaving || gstinBad}
          className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-body-sm hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shadow-brand-500/20"
        >
          <Save size={15} /> {isSaving ? 'Saving…' : 'Save layout'}
        </button>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-surface-400">
        <Info size={12} className="mt-0.5 flex-shrink-0" />
        Saving here changes only the printed page — never the items, rates or totals. Those are edited on the
        billing screen, and the totals above are the ones the server stored.
      </p>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-caption text-surface-500">{label}</span>
      <span className="text-caption text-surface-700 dark:text-surface-300 tabular-nums">
        {value < 0 ? '-' : ''}₹{Math.abs(value).toLocaleString('en-IN')}
      </span>
    </div>
  );
}
