import { useMemo, useState, useCallback } from 'react';
import { Plus, Trash2, Printer, Download, Save, RotateCcw, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import { DatePicker } from '@/components/atoms/DatePicker.tsx';
import { caseDraftTotals, type CaseDraft } from '@/lib/caseInvoiceDraft.ts';
import { numberToWords } from '@/lib/numberToWords.ts';
import { isValidGstin, normalizeGstin, gstinStateName } from '@/lib/gstin.ts';
import { printCaseInvoice, downloadCaseInvoice, describeRenderWarnings } from '@/lib/caseInvoicePdf.ts';
import type { WholesaleInvoiceTemplate } from '@/types/wholesaleInvoice.ts';

/**
 * The full-case invoice, edited in the shape it prints.
 *
 * Laid out as the document rather than as a form on purpose: this replaces a
 * paper pad, and the person filling it in is looking for the box they used to
 * write in. A conventional stacked form would be quicker to build and worse to
 * use at a counter.
 *
 * Two kinds of field live here and the difference matters:
 *   - presentation (pad number, date, transport, party details, the text in a
 *     PARTICULARS cell) is stored as typed and printed as typed;
 *   - anything that moves money (qty, rate, GST %, IGST, delivery, round-off)
 *     is fed through the same `computeBillTotals` the server uses, so what the
 *     screen shows is what the server will store.
 *
 * The server recomputes on save regardless — this preview is never trusted for
 * what ends up in the database.
 */

const cellInput =
  'w-full bg-transparent px-2 py-1.5 text-body-sm text-surface-900 dark:text-surface-100 ' +
  'focus:outline-none focus:bg-brand-50/60 dark:focus:bg-brand-500/10 rounded';

const fieldInput =
  'w-full bg-transparent border-b border-dotted border-surface-300 dark:border-surface-600 ' +
  'px-1 py-1 text-body-sm text-surface-900 dark:text-surface-100 ' +
  'focus:outline-none focus:border-brand-500 focus:border-solid';

const boxCls = 'border border-surface-300 dark:border-surface-700';

export interface WholesaleInvoiceEditorProps {
  draft: CaseDraft;
  onChange: (next: CaseDraft) => void;
  template: Partial<WholesaleInvoiceTemplate>;
  /** Absent while the invoice has not been saved yet (the POS "review" pass). */
  onSave?: () => Promise<void> | void;
  /** Restore the draft to what the saved bill holds. */
  onRevert?: () => void;
  isSaving?: boolean;
  saveLabel?: string;
  /** Shown above the grid — e.g. "Edited 12 Sep, 4:02 PM by Priya". */
  editedNote?: string;
  error?: string;
}

export function WholesaleInvoiceEditor({
  draft,
  onChange,
  template,
  onSave,
  onRevert,
  isSaving = false,
  saveLabel = 'Save Invoice',
  editedNote,
  error,
}: WholesaleInvoiceEditorProps) {
  const [busy, setBusy] = useState<'print' | 'download' | null>(null);
  // A failed render used to reject into nothing. An invoice that will not print
  // has to say why, at the counter, while the customer is still waiting.
  const [docError, setDocError] = useState('');
  const [docWarning, setDocWarning] = useState('');

  const set = useCallback(
    <K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) =>
      onChange({ ...draft, [key]: value }),
    [draft, onChange],
  );

  const setLine = useCallback(
    (index: number, patch: Partial<CaseDraft['lines'][number]>) =>
      onChange({
        ...draft,
        lines: draft.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)),
      }),
    [draft, onChange],
  );

  const addLine = useCallback(
    () =>
      onChange({
        ...draft,
        lines: [...draft.lines, { name: '', quantity: 1, unitPrice: 0, unit: 'case' }],
      }),
    [draft, onChange],
  );

  const removeLine = useCallback(
    (index: number) => onChange({ ...draft, lines: draft.lines.filter((_, i) => i !== index) }),
    [draft, onChange],
  );

  // Same function the server runs, over the same lines it will be sent, with
  // the bill's own GST mode, coupon and round-off — so this preview and the
  // saved bill agree. It used to assume percent GST and no coupon, which is not
  // how the counter raises most bills.
  const { totals, lineFor } = useMemo(() => caseDraftTotals(draft), [draft]);

  const gstinTouched = Boolean(draft.partyGstin?.trim());
  const gstinBad = gstinTouched && !isValidGstin(draft.partyGstin);
  const flatGst = draft.gstMode === 'flat';
  const halfRate = draft.gstRate / 2;

  const withBusy = async (kind: 'print' | 'download', fn: () => Promise<void>) => {
    setBusy(kind);
    setDocError('');
    setDocWarning('');
    try {
      await fn();
      setDocWarning(describeRenderWarnings());
    } catch (e) {
      setDocError(
        e instanceof Error
          ? `Could not produce the invoice: ${e.message}`
          : 'Could not produce the invoice. If your browser blocked the popup, allow it and try again.',
      );
    } finally {
      setBusy(null);
    }
  };

  const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-3">
      {(error || docError) && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {error || docError}
        </div>
      )}
      {docWarning && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-caption font-medium">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {docWarning}
        </div>
      )}
      {editedNote && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-caption font-medium">
          <Info size={14} className="flex-shrink-0" /> {editedNote}
        </div>
      )}

      {/* The sheet. Sized to the printed proportions so what is on screen reads
          as the page that comes out of the printer. */}
      <div className={cn('mx-auto w-full max-w-3xl bg-white dark:bg-surface-900 rounded-xl overflow-hidden', boxCls)}>

        {/* ── Pre-printed head (from the template, not editable here) ── */}
        <div className="px-4 py-3 border-b border-surface-300 dark:border-surface-700 text-center bg-surface-50 dark:bg-surface-800/40">
          <p className="text-[11px] text-surface-500 dark:text-surface-400">
            {template.headerGstin ? `GSTIN ${template.headerGstin}` : 'GSTIN not set'}
            {template.licenseNo ? ` · License ${template.licenseNo}` : ''}
            {template.cellNumber ? ` · Cell ${template.cellNumber}` : ''}
          </p>
          <p className="mt-1 font-display font-bold text-h4 text-surface-900 dark:text-surface-50 tracking-wide">
            {template.shopName || 'Set your shop name in Content → Wholesale Invoice'}
          </p>
          <p className="text-[11px] text-surface-500 dark:text-surface-400">
            {template.addressLine1} {template.addressLine2}
          </p>
          <p className="mt-1 text-[10px] text-surface-400">
            Heading, emblems and Tamil lines are set once in Content → Wholesale Invoice
          </p>
        </div>

        {/* ── No. / Date ── */}
        <div className="flex flex-wrap gap-4 px-4 py-2.5 border-b border-surface-300 dark:border-surface-700">
          <label className="flex items-baseline gap-2 flex-1 min-w-[140px]">
            <span className="text-caption text-surface-500">No :</span>
            <input
              value={draft.displayNumber}
              onChange={(e) => set('displayNumber', e.target.value)}
              className={cn(fieldInput, 'font-semibold')}
            />
          </label>
          <div className="flex items-baseline gap-2 flex-1 min-w-[160px]">
            <span className="text-caption text-surface-500">Date :</span>
            {/* The app's own picker, not the browser's. A native date input is
                styled by the OS, so it ignored the theme and looked like a
                different application dropped into the middle of the pad. */}
            <DatePicker
              value={draft.invoiceDate}
              onChange={(v) => set('invoiceDate', v)}
              aria-label="Invoice date"
              size="sm"
              className="flex-1"
            />
          </div>
        </div>

        {/* ── Party ── */}
        <div className="px-4 py-3 space-y-2.5 border-b border-surface-300 dark:border-surface-700">
          <Row label="Name">
            <input value={draft.customerName} onChange={(e) => set('customerName', e.target.value)} className={fieldInput} />
          </Row>
          <Row label="Address">
            <input value={draft.customerAddress} onChange={(e) => set('customerAddress', e.target.value)} className={fieldInput} />
          </Row>
          <Row label="State">
            <input value={draft.customerState} onChange={(e) => set('customerState', e.target.value)} className={fieldInput} />
          </Row>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[220px]">
              <Row label="GSTIN No">
                <input
                  value={draft.partyGstin}
                  maxLength={15}
                  onChange={(e) => {
                    const gstin = normalizeGstin(e.target.value).slice(0, 15);
                    // The state code decides CGST+SGST vs IGST and fills in the
                    // State row, so a valid number does both at once rather than
                    // making the admin work it out and set them by hand.
                    const state = gstinStateName(gstin);
                    onChange({
                      ...draft,
                      partyGstin: gstin,
                      ...(state ? { customerState: state } : {}),
                      ...(isValidGstin(gstin) && template.headerGstin
                        ? {
                            taxKind:
                              normalizeGstin(template.headerGstin).slice(0, 2) === gstin.slice(0, 2)
                                ? ('intra' as const)
                                : ('inter' as const),
                          }
                        : {}),
                    });
                  }}
                  className={cn(fieldInput, 'font-mono tracking-wide', gstinBad && 'border-amber-500 text-amber-600')}
                />
              </Row>
              {gstinBad && <p className="mt-1 pl-[76px] text-[11px] text-amber-600">Not a valid GSTIN</p>}
            </div>
            <div className="flex-1 min-w-[220px]">
              <Row label="Transport">
                <input value={draft.transport} onChange={(e) => set('transport', e.target.value)} className={fieldInput} />
              </Row>
            </div>
          </div>
          <Row label="">
            <input
              value={draft.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Continuation line (optional)"
              className={cn(fieldInput, 'placeholder:text-surface-300')}
            />
          </Row>
        </div>

        {/* ── Grid ── */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr className="bg-surface-50 dark:bg-surface-800/40">
                <Th className="w-[9%]">S.No.</Th>
                <Th className="w-[44%]">PARTICULARS</Th>
                <Th className="w-[10%]">Qty.</Th>
                <Th className="w-[15%]">Rate Per Case</Th>
                <Th className="w-[16%]">Amount</Th>
                <Th className="w-[6%]" />
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((line, i) => (
                <tr key={i} className="border-t border-surface-200 dark:border-surface-700">
                  <Td className="text-center text-surface-500">{i + 1}</Td>
                  <Td>
                    <input
                      value={line.name}
                      onChange={(e) => setLine(i, { name: e.target.value })}
                      placeholder="Item description"
                      className={cn(cellInput, 'placeholder:text-surface-300')}
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      min={0}
                      value={line.quantity}
                      onChange={(e) => setLine(i, { quantity: Math.max(0, Number(e.target.value) || 0) })}
                      className={cn(cellInput, 'text-center')}
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => setLine(i, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                      className={cn(cellInput, 'text-right')}
                    />
                  </Td>
                  <Td className="text-right pr-2 tabular-nums text-surface-700 dark:text-surface-300">
                    {money(lineFor(i)?.taxableValue ?? 0)}
                  </Td>
                  <Td className="text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="p-1 rounded text-surface-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                      aria-label={`Remove line ${i + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </tr>
              ))}
              {draft.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-caption text-surface-400">
                    No lines yet — add the first one below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2 border-y border-surface-200 dark:border-surface-700">
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700"
          >
            <Plus size={14} /> Add line
          </button>
          <label className="flex items-center gap-2 text-caption text-surface-500">
            HSN No.
            <input
              value={draft.hsnCode}
              onChange={(e) => set('hsnCode', e.target.value)}
              className={cn(fieldInput, 'w-20 text-center font-semibold')}
            />
          </label>
        </div>

        {/* ── Totals ── */}
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 px-4 py-3 border-b md:border-b-0 md:border-r border-surface-300 dark:border-surface-700">
            <p className="text-caption text-surface-500">Rupees</p>
            <p className="mt-1 text-body-sm font-medium text-surface-800 dark:text-surface-200 leading-relaxed">
              {numberToWords(totals.grandTotal)}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniField label="Discount %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.discountPercent}
                  onChange={(e) => set('discountPercent', Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className={fieldInput}
                />
              </MiniField>
              {/* In the mode the bill was raised in. A flat bill is a typed rupee
                  figure; showing it as a % box re-saved it as percent GST at a
                  rounded rate and moved its total. */}
              <MiniField label={flatGst ? 'GST ₹' : 'GST %'}>
                <div className="flex items-center gap-1.5">
                  {flatGst ? (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draft.gstAmount ?? 0}
                      onChange={(e) => set('gstAmount', Math.max(0, Number(e.target.value) || 0))}
                      className={fieldInput}
                    />
                  ) : (
                    <input
                      type="number"
                      min={0}
                      value={draft.gstRate}
                      onChange={(e) => set('gstRate', Math.max(0, Number(e.target.value) || 0))}
                      className={fieldInput}
                    />
                  )}
                  <div className="inline-flex flex-shrink-0 rounded-md border border-surface-200 dark:border-surface-700 overflow-hidden">
                    {(['percent', 'flat'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          onChange({
                            ...draft,
                            gstMode: mode,
                            // Switching to flat starts from the tax the bill carries now,
                            // not from zero.
                            ...(mode === 'flat' && !flatGst
                              ? { gstAmount: totals.totalCgst + totals.totalSgst + totals.totalIgst }
                              : {}),
                          })
                        }
                        className={cn(
                          'px-1.5 py-0.5 text-caption font-medium transition-colors',
                          (draft.gstMode ?? 'percent') === mode
                            ? 'bg-brand-500 text-white'
                            : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800',
                        )}
                      >
                        {mode === 'percent' ? '%' : '₹'}
                      </button>
                    ))}
                  </div>
                </div>
              </MiniField>
              <MiniField label="Delivery ₹">
                <input
                  type="number"
                  min={0}
                  value={draft.deliveryCharge}
                  onChange={(e) => set('deliveryCharge', Math.max(0, Number(e.target.value) || 0))}
                  className={fieldInput}
                />
              </MiniField>
              <MiniField label="Round Off ₹">
                <input
                  type="number"
                  step="0.01"
                  value={draft.manualRoundOff}
                  onChange={(e) => set('manualRoundOff', e.target.value)}
                  placeholder={totals.roundOff.toFixed(2)}
                  className={cn(fieldInput, 'placeholder:text-surface-300')}
                />
              </MiniField>
              <div className="col-span-2">
                <p className="text-[11px] font-medium text-surface-500 mb-1">Tax</p>
                <div className="inline-flex rounded-lg border border-surface-200 dark:border-surface-700 p-0.5">
                  {(['intra', 'inter'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => set('taxKind', kind)}
                      className={cn(
                        'px-3 py-1 rounded-md text-caption font-medium transition-colors',
                        draft.taxKind === kind
                          ? 'bg-brand-500 text-white'
                          : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800',
                      )}
                    >
                      {kind === 'intra' ? 'CGST + SGST' : 'IGST'}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-surface-400">
                  Set from the buyer&rsquo;s GSTIN state code — override if the sale says otherwise.
                </p>
              </div>
            </div>
          </div>

          <div className="w-full md:w-72">
            {/* The coupon the bill already carries. Not editable here — it was
                redeemed at the counter — but it is in the Total below, so it is
                shown rather than left to explain itself. */}
            {(draft.couponDiscount ?? 0) > 0 && (
              <TotalRow label="Coupon (in Total)" value={`−${money(draft.couponDiscount ?? 0)}`} />
            )}
            <TotalRow label="Total" value={money(totals.taxableAmount)} />
            <TotalRow
              label={`CGST ${draft.taxKind === 'intra' && !flatGst ? `${halfRate}%` : ''}`}
              value={totals.totalCgst ? money(totals.totalCgst) : '—'}
            />
            <TotalRow
              label={`SGST ${draft.taxKind === 'intra' && !flatGst ? `${halfRate}%` : ''}`}
              value={totals.totalSgst ? money(totals.totalSgst) : '—'}
            />
            <TotalRow
              label={`IGST ${draft.taxKind === 'inter' && !flatGst ? `${draft.gstRate}%` : ''}`}
              value={totals.totalIgst ? money(totals.totalIgst) : '—'}
            />
            {(draft.packagingFee ?? 0) > 0 && <TotalRow label="Packing" value={money(draft.packagingFee ?? 0)} />}
            {totals.deliveryCharge > 0 && <TotalRow label="Delivery" value={money(totals.deliveryCharge)} />}
            <TotalRow label="Round Off" value={totals.roundOff ? money(totals.roundOff) : '—'} />
            <TotalRow label="Grand Total" value={money(totals.grandTotal)} strong />
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="mx-auto w-full max-w-3xl flex flex-wrap items-center gap-2 justify-end">
        {onRevert && (
          <button
            type="button"
            onClick={onRevert}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 font-medium text-body-sm hover:bg-surface-50 dark:hover:bg-surface-800"
          >
            <RotateCcw size={15} /> Revert
          </button>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void withBusy('download', () => downloadCaseInvoice(draft, template))}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 font-medium text-body-sm hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50"
        >
          <Download size={15} /> {busy === 'download' ? 'Preparing…' : 'PDF'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void withBusy('print', () => printCaseInvoice(draft, template))}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 font-medium text-body-sm hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50"
        >
          <Printer size={15} /> {busy === 'print' ? 'Preparing…' : 'Print'}
        </button>
        {onSave && (
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-body-sm hover:bg-brand-600 disabled:opacity-50"
          >
            <Save size={15} /> {isSaving ? 'Saving…' : saveLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Small presentational pieces ───

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-[68px] flex-shrink-0 text-caption text-surface-500">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-surface-500 mb-1">{label}</p>
      {children}
    </div>
  );
}

function Th({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <th
      className={cn(
        'px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-surface-600 dark:text-surface-400 border-b border-surface-300 dark:border-surface-700',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <td className={cn('align-middle', className)}>{children}</td>;
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-surface-200 dark:border-surface-700 last:border-b-0">
      <span
        className={cn(
          'text-caption',
          strong ? 'font-bold text-surface-900 dark:text-surface-50' : 'text-surface-500',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          strong
            ? 'text-body-sm font-bold text-surface-900 dark:text-surface-50'
            : 'text-caption text-surface-700 dark:text-surface-300',
        )}
      >
        {value}
      </span>
    </div>
  );
}
