import { useState, useCallback } from 'react';
import { Printer, Download, Save, RotateCcw, AlertTriangle, Info, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils.ts';
import { DatePicker } from '@/components/atoms/DatePicker.tsx';
import { numberToWords } from '@/lib/numberToWords.ts';
import { isValidGstin, normalizeGstin, gstinStateName } from '@/lib/gstin.ts';
import { printBillDocument, downloadBillDocument } from '@/lib/billDocument.ts';
import type { Bill, CaseInvoice } from '@/types/admin.ts';

/**
 * The printed face of a RETAIL or WHOLESALE-PER-PIECE invoice.
 *
 * The third of the three layout editors, and the one that was missing. The
 * wholesale full-case pad has had `WholesaleInvoiceEditor` all along and
 * quotations now have `QuotationLayoutEditor`, but a retail or per-piece bill —
 * which is most of what the shop raises — could only be re-priced, never
 * corrected on the page. A wrong party address or a missing transport on one of
 * those meant reprinting a document the shop could not change.
 *
 * The same split the other two keep, and it is the important one:
 *
 *  - Editable here: the printed number, the date, the party's GSTIN and state,
 *    transport, HSN, the tax split and a note. Presentation only. Saved through
 *    a path that re-prices nothing.
 *  - NOT editable here: items, quantities, rates, discount, GST. That is the
 *    money, and it is edited on the billing screen where product search and
 *    coupons live. Two places to change a rate would be two answers to what the
 *    customer was charged.
 *
 * The totals shown are the ones the server stored. Nothing here computes them.
 */

const fieldInput =
  'w-full bg-transparent border-b border-dotted border-surface-300 dark:border-surface-600 ' +
  'px-1 py-1 text-body-sm text-surface-900 dark:text-surface-100 ' +
  'focus:outline-none focus:border-brand-500 focus:border-solid';

const boxCls = 'border border-surface-300 dark:border-surface-700';

/**
 * The picker speaks `yyyy-mm-dd`; the API speaks full ISO.
 *
 * Read in the shop's zone. Slicing the UTC string showed a bill raised between
 * midnight and 5:30 am IST as the day before.
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
 * Midday, not midnight: India is UTC+5:30, so a date picked locally and round
 * tripped through `toISOString()` can land on the day before. Noon leaves 12
 * hours of slack either way, so the printed date is the day that was clicked.
 */
function isoAtNoon(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toISOString();
}

export interface InvoiceLayoutEditorProps {
  bill: Bill;
  draft: CaseInvoice;
  onChange: (next: CaseInvoice) => void;
  onSave: () => Promise<void> | void;
  /** Restore the draft to what the saved bill holds. */
  onRevert: () => void;
  isSaving?: boolean;
  error?: string;
}

export function InvoiceLayoutEditor({
  bill,
  draft,
  onChange,
  onSave,
  onRevert,
  isSaving = false,
  error,
}: InvoiceLayoutEditorProps) {
  const [busy, setBusy] = useState<'print' | 'download' | null>(null);
  const [docError, setDocError] = useState('');

  const set = useCallback(
    <K extends keyof CaseInvoice>(key: K, value: CaseInvoice[K]) => onChange({ ...draft, [key]: value }),
    [draft, onChange],
  );

  const gstinTyped = (draft.partyGstin ?? '').trim();
  const gstinBad = gstinTyped.length > 0 && !isValidGstin(gstinTyped);
  const cancelled = bill.status === 'cancelled';

  /**
   * Print or download what is ON SCREEN, not what was last saved.
   *
   * The draft is merged over the bill first, so the button previews the edits
   * being made. Otherwise Print after a change quietly hands over the previous
   * version — the failure nobody notices until the customer has the wrong page.
   */
  const render = useCallback(
    async (mode: 'print' | 'download') => {
      setBusy(mode);
      setDocError('');
      try {
        const preview: Bill = { ...bill, caseInvoice: draft };
        await (mode === 'print' ? printBillDocument(preview) : downloadBillDocument(preview));
      } catch (e) {
        setDocError(e instanceof Error ? e.message : 'Could not render this invoice.');
      } finally {
        setBusy(null);
      }
    },
    [bill, draft],
  );

  const isWholesale = bill.billingMode === 'wholesale-piece';
  // Under the split the page will print, and the same rupees either way.
  const gstLabel = (draft.taxKind ?? bill.taxKind) === 'inter' ? 'IGST' : 'CGST + SGST';
  const gstValue = (bill.totalCgst ?? 0) + (bill.totalSgst ?? 0) + (bill.totalIgst ?? 0);

  return (
    <div className="space-y-4">
      {(error || docError) && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{error || docError}</span>
        </div>
      )}

      {cancelled && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-caption">
          <Info size={15} className="mt-0.5 flex-shrink-0" />
          <span>
            {bill.billNumber} was cancelled — its stock has been returned, so its page is read-only. It can
            still be reprinted.
          </span>
        </div>
      )}

      <fieldset disabled={cancelled} className="rounded-2xl bg-white dark:bg-surface-900 p-5 disabled:opacity-70">
        <div className="text-center pb-3 mb-3 border-b border-surface-200 dark:border-surface-700">
          <div className="inline-block px-4 py-1 rounded border border-surface-300 dark:border-surface-600">
            <span className="text-caption font-bold tracking-widest text-surface-700 dark:text-surface-200">
              TAX INVOICE
            </span>
          </div>
          <p className="mt-2 text-[11px] text-surface-400">
            {isWholesale ? 'Wholesale, billed per piece.' : 'Retail.'} The letterhead, terms and footer are
            shared by every invoice —{' '}
            <Link to="/admin/content?tab=invoice" className="text-brand-600 dark:text-brand-400 hover:underline">
              edit them in Content
            </Link>
            .
          </p>
        </div>

        {/* ─── Number / date ─── */}
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <span className="block text-label uppercase tracking-wider text-surface-400 font-semibold">No.</span>
            <input
              type="text"
              value={draft.displayNumber ?? ''}
              onChange={(e) => set('displayNumber', e.target.value)}
              placeholder={bill.billNumber}
              className={fieldInput}
            />
            {draft.displayNumber && draft.displayNumber !== bill.billNumber && (
              // The printed number can be overridden, but the row keeps its own
              // key — and that key is what the GST series is counted on.
              <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-400">
                Filed as {bill.billNumber}. Changing what prints does not move it in the invoice series.
              </span>
            )}
          </div>
          <div>
            <span className="block text-label uppercase tracking-wider text-surface-400 font-semibold">Date</span>
            <DatePicker
              value={toDateInput(draft.invoiceDate || bill.createdAt)}
              onChange={(v) => set('invoiceDate', v ? isoAtNoon(v) : bill.createdAt)}
              aria-label="Invoice date"
              size="sm"
              className="mt-1"
            />
          </div>
        </div>

        {/* ─── Party block ─── */}
        <div className={cn('rounded-xl p-4 mb-4', boxCls)}>
          <p className="text-label uppercase tracking-wider text-surface-400 font-semibold mb-2.5">Billed to</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">
                {bill.customerName || 'Walk-in customer'}
              </p>
              <p className="text-caption text-surface-500">{bill.customerAddress || '—'}</p>
              {bill.customerPhone && (
                <p className="text-caption text-surface-500 tabular-nums">{bill.customerPhone}</p>
              )}
              <p className="mt-1.5 text-[11px] text-surface-400">
                Name, address and phone come from the bill. Correct them on the billing screen.
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
                    // the first two digits ARE the state, and asking twice is
                    // how the two end up disagreeing.
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
                    (draft.taxKind ?? bill.taxKind ?? 'intra') === kind
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-50 dark:bg-surface-800 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700',
                  )}
                >
                  {kind === 'intra' ? 'CGST+SGST' : 'IGST'}
                </button>
              ))}
            </div>
            <span className="mt-1 block text-[11px] text-surface-400">
              Same rupees either way — this is what the invoice prints and what gets filed.
            </span>
          </div>
        </div>

        {/* ─── Items: read-only, edited where the money lives ─── */}
        <div className={cn('rounded-xl overflow-hidden mb-4', boxCls)}>
          <div className="flex items-center justify-between px-3 py-2 bg-surface-50 dark:bg-surface-800/50">
            <span className="text-label uppercase tracking-wider text-surface-400 font-semibold">Items</span>
            {!cancelled && (
              <Link
                to={`/admin/billing?edit=${bill.id}`}
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
                <th className="text-left font-semibold py-2">Item</th>
                <th className="text-center font-semibold py-2 w-20">Qty</th>
                <th className="text-right font-semibold py-2 w-28">Rate</th>
                <th className="text-right font-semibold py-2 w-28 pr-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {bill.items.map((it, idx) => (
                <tr
                  key={`${it.productId}-${idx}`}
                  className="border-b border-surface-50 dark:border-surface-800/50 last:border-0"
                >
                  <td className="py-1.5 pl-3 text-caption text-surface-400 tabular-nums">{idx + 1}</td>
                  <td className="py-1.5 text-body-sm text-surface-900 dark:text-surface-100">{it.name}</td>
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
              {numberToWords(Math.round(bill.grandTotal))}
            </p>
          </div>
          <div className="w-full sm:w-64 space-y-1">
            <TotalRow label="Subtotal" value={bill.subtotal} />
            {bill.totalDiscount > 0 && (
              <TotalRow label={`Discount (${bill.discountPercent}%)`} value={-bill.totalDiscount} />
            )}
            {(bill.couponDiscount ?? 0) > 0 && (
              <TotalRow label={`Coupon ${bill.couponCode ?? ''}`} value={-(bill.couponDiscount ?? 0)} />
            )}
            <TotalRow label={gstLabel} value={gstValue} />
            {(bill.deliveryCharge ?? 0) > 0 && (
              <TotalRow label={bill.courierDelivery ? 'Courier' : 'Delivery'} value={bill.deliveryCharge ?? 0} />
            )}
            <div className="flex items-center justify-between pt-1.5 border-t border-surface-200 dark:border-surface-700">
              <span className="text-body-sm font-bold text-surface-900 dark:text-surface-50">Total</span>
              <span className="text-body-md font-bold text-brand-600 dark:text-brand-400 tabular-nums">
                ₹{bill.grandTotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        <label className="block">
          <span className="text-label uppercase tracking-wider text-surface-400 font-semibold">Note</span>
          <textarea
            value={draft.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            placeholder="Printed under the standing terms — anything agreed for this bill only."
            className="mt-1 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 px-2.5 py-2 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
          />
        </label>
      </fieldset>

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
          disabled={cancelled || isSaving}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-body-sm font-medium text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-40 transition-colors"
        >
          <RotateCcw size={15} /> Revert
        </button>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={cancelled || isSaving || gstinBad}
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
