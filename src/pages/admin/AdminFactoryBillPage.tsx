import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Printer, Save, Factory, Search, Ban, Pencil, FileText, Hash, Check } from 'lucide-react';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import {
  getFactoryProducts,
  getFactoryBills,
  getFactoryBillById,
  createFactoryBill,
  updateFactoryBill,
  cancelFactoryBill,
  getNextFactoryNumber,
  setNextFactoryNumber,
} from '@/services/factory.ts';
import { printFactoryBill } from '@/lib/factoryBillPrint.ts';
import {
  FACTORY_UNITS,
  emptyLine,
  emptyFactoryDraft,
  factoryDraftTotals,
  factoryDraftToPayload,
  factoryBillToDraft,
  isPricedFactoryLine,
  type FactoryBill,
  type FactoryBillDraft,
  type FactoryProduct,
} from '@/types/factory.ts';
import { cn } from '@/lib/utils.ts';

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s: string) => {
  const n = Number(String(s).trim());
  return Number.isFinite(n) ? n : 0;
};

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';
const cellClass =
  'w-full px-2 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40';
const labelClass = 'block text-caption font-semibold uppercase tracking-wider text-surface-500 mb-1';

/**
 * Factory billing — the ruled pad, on screen.
 *
 * The factory is a separate firm from the shop: its own GSTIN, its own invoice
 * run and its own product list, which carries no stock. Nothing raised here
 * touches the shop's counter takings, stock ledger or Monthly Report.
 *
 * Money is priced here exactly as the server prices it on save, so the figures
 * under the cursor and the figures printed on the pad are the same arithmetic.
 */
export function AdminFactoryBillPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState<FactoryBillDraft>(emptyFactoryDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [products, setProducts] = useState<FactoryProduct[]>([]);
  const [nextNumber, setNextNumber] = useState('');
  const [bills, setBills] = useState<FactoryBill[]>([]);
  const [search, setSearch] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [numberEdit, setNumberEdit] = useState('');
  const [isNumberOpen, setIsNumberOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<FactoryBill | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const totals = useMemo(() => factoryDraftTotals(draft), [draft]);
  const pricedLines = draft.lines.filter(isPricedFactoryLine);

  const loadBills = useCallback(async (term: string) => {
    try {
      const result = await getFactoryBills({ limit: 15, search: term, status: 'all' });
      setBills(result.bills);
    } catch {
      setBills([]);
    }
  }, []);

  const loadNumber = useCallback(async () => {
    try {
      const { invoiceNumber } = await getNextFactoryNumber();
      setNextNumber(invoiceNumber);
    } catch {
      setNextNumber('');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setProducts(await getFactoryProducts());
      } catch {
        setProducts([]);
      }
    })();
    void loadNumber();
  }, [loadNumber]);

  useEffect(() => {
    const t = setTimeout(() => void loadBills(search), 250);
    return () => clearTimeout(t);
  }, [search, loadBills]);

  // Arriving from the Factory Bills list with ?edit=<id>. The parameter is
  // cleared once loaded, so a refresh does not silently reopen an old bill.
  useEffect(() => {
    const id = searchParams.get('edit');
    if (!id || id === editingId) return;
    void (async () => {
      try {
        const bill = await getFactoryBillById(id);
        setDraft(factoryBillToDraft(bill));
        setEditingId(bill.id);
        setNotice(`Editing bill ${bill.invoiceNumber}. Its number does not change.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not open that bill.');
      } finally {
        setSearchParams({}, { replace: true });
      }
    })();
  }, [searchParams, editingId, setSearchParams]);

  const setField = <K extends keyof FactoryBillDraft>(key: K, value: FactoryBillDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setLine = (key: string, patch: Partial<FactoryBillDraft['lines'][number]>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  /** Picking a listed product fills the rate and unit; both stay editable. */
  const applyProduct = (key: string, name: string) => {
    const match = products.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    setLine(key, {
      name,
      product: match?.id,
      ...(match ? { rate: match.rate ? String(match.rate) : '', per: match.per || 'CASE' } : {}),
    });
  };

  const addLine = () => setDraft((d) => ({ ...d, lines: [...d.lines, emptyLine()] }));
  const removeLine = (key: string) =>
    setDraft((d) => ({ ...d, lines: d.lines.length > 1 ? d.lines.filter((l) => l.key !== key) : [emptyLine()] }));

  const startNew = () => {
    setDraft(emptyFactoryDraft());
    setEditingId(null);
    setError('');
    setNotice('');
    setSearchParams({}, { replace: true });
    void loadNumber();
  };

  const validate = (): string => {
    if (!draft.partyName.trim()) return 'Enter the party name.';
    if (pricedLines.length === 0) return 'Add at least one line with a description and a quantity.';
    return '';
  };

  const save = async (thenPrint: boolean) => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setIsSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = factoryDraftToPayload(draft);
      const saved = editingId ? await updateFactoryBill(editingId, payload) : await createFactoryBill(payload);
      setNotice(`Bill ${saved.invoiceNumber} saved.`);
      setEditingId(null);
      setDraft(emptyFactoryDraft());
      await Promise.all([loadNumber(), loadBills(search)]);
      if (thenPrint) {
        setIsPrinting(true);
        try {
          await printFactoryBill(saved);
        } finally {
          setIsPrinting(false);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this bill.');
    } finally {
      setIsSaving(false);
    }
  };

  const print = async (bill: FactoryBill) => {
    setIsPrinting(true);
    setError('');
    try {
      await printFactoryBill(bill);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the print dialog.');
    } finally {
      setIsPrinting(false);
    }
  };

  const edit = (bill: FactoryBill) => {
    setDraft(factoryBillToDraft(bill));
    setEditingId(bill.id);
    setError('');
    setNotice(`Editing bill ${bill.invoiceNumber}. Its number does not change.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    setCancelError('');
    try {
      await cancelFactoryBill(cancelTarget.id);
      setCancelTarget(null);
      await loadBills(search);
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Could not cancel that bill.');
    } finally {
      setIsCancelling(false);
    }
  };

  const saveNumber = async () => {
    const start = Number(numberEdit);
    if (!Number.isInteger(start) || start < 1) {
      setError('The start number must be a whole number of 1 or more.');
      return;
    }
    try {
      const { invoiceNumber } = await setNextFactoryNumber(start);
      setNextNumber(invoiceNumber);
      setIsNumberOpen(false);
      setNotice(`The next bill will be ${invoiceNumber}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the numbering.');
    }
  };

  const inter = draft.taxKind === 'inter';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editingId && (
          <button
            onClick={startNew}
            className="px-4 py-2.5 rounded-xl bg-surface-100 dark:bg-surface-800 text-body-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
          >
            New Bill
          </button>
        )}
      </div>

      {isNumberOpen && (
        <AdminCard>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className={labelClass}>Start numbering from</label>
              <input
                value={numberEdit}
                onChange={(e) => setNumberEdit(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className={cn(inputClass, 'tabular-nums max-w-[200px]')}
              />
              <p className="text-caption text-surface-400 mt-1.5">
                Carry on from the paper pad — enter 43 and the next bill prints 43. A number already used by a
                saved bill is refused.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsNumberOpen(false)}
                className="px-4 py-2.5 rounded-xl text-body-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800"
              >
                Cancel
              </button>
              <button
                onClick={saveNumber}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600"
              >
                <Check size={15} /> Set
              </button>
            </div>
          </div>
        </AdminCard>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-body-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-body-sm text-emerald-600 dark:text-emerald-400">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
        <div className="space-y-5">
          <AdminCard title="Party & Transport">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* The pad's own top line — number and date before the party. Left
                  blank, the number is the next one in the run; the placeholder
                  shows which that is. */}
              <div>
                <label className={labelClass}>Bill No.</label>
                <div className="flex items-center gap-2">
                  <input
                    value={draft.invoiceNumber}
                    onChange={(e) => setField('invoiceNumber', e.target.value.slice(0, 20))}
                    placeholder={nextNumber || '—'}
                    aria-label="Bill number"
                    className={cn(inputClass, 'font-display font-bold tabular-nums')}
                  />
                  {!editingId && (
                    <button
                      onClick={() => {
                        setNumberEdit(String(Number(nextNumber) || 1));
                        setIsNumberOpen((v) => !v);
                      }}
                      className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:text-brand-500 transition-colors"
                      title="Set the starting invoice number"
                    >
                      <Hash size={16} />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className={labelClass}>Date</label>
                <input
                  type="date"
                  value={draft.invoiceDate}
                  onChange={(e) => setField('invoiceDate', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Ms / Mr</label>
                <input
                  value={draft.partyName}
                  onChange={(e) => setField('partyName', e.target.value)}
                  placeholder="Party name"
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Address</label>
                <input
                  value={draft.partyAddress}
                  onChange={(e) => setField('partyAddress', e.target.value)}
                  placeholder="Town, district, state"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Party's GSTIN</label>
                <input
                  value={draft.partyGstin}
                  onChange={(e) => setField('partyGstin', e.target.value.toUpperCase())}
                  placeholder="10BQLPS9593D1ZL"
                  className={cn(inputClass, 'uppercase')}
                />
              </div>
              <div>
                <label className={labelClass}>State</label>
                <input
                  value={draft.partyState}
                  onChange={(e) => setField('partyState', e.target.value)}
                  placeholder="Bihar"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Bill type</label>
                <div className="flex rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
                  {(['cash', 'credit'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setField('paymentMode', mode)}
                      className={cn(
                        'flex-1 py-2 text-body-sm font-medium capitalize transition-colors',
                        draft.paymentMode === mode
                          ? 'bg-brand-500 text-white'
                          : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-300',
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Transport ID</label>
                <input
                  value={draft.transportId}
                  onChange={(e) => setField('transportId', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Transport name</label>
                <input
                  value={draft.transportName}
                  onChange={(e) => setField('transportName', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </AdminCard>

          <AdminCard
            title="Particulars"
            titleAction={
              <button
                onClick={addLine}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 dark:bg-surface-800 text-body-sm font-medium text-surface-700 dark:text-surface-300 hover:text-brand-500 transition-colors"
              >
                <Plus size={14} /> Add line
              </button>
            }
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="bg-surface-50 dark:bg-surface-850 text-label font-bold uppercase tracking-wider text-surface-500">
                    <th className="px-3 py-2.5 text-left w-[110px]">No. of Cases</th>
                    <th className="px-3 py-2.5 text-left">Particulars</th>
                    <th className="px-3 py-2.5 text-right w-[100px]">Quantity</th>
                    <th className="px-3 py-2.5 text-right w-[110px]">Rate</th>
                    <th className="px-3 py-2.5 text-left w-[96px]">Per</th>
                    <th className="px-3 py-2.5 text-right w-[120px]">Amount</th>
                    <th className="px-2 py-2.5 w-[44px]" />
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line) => {
                    const amount = num(line.quantity) * num(line.rate);
                    return (
                      <tr key={line.key} className="border-t border-surface-100 dark:border-surface-800">
                        <td className="px-3 py-2">
                          <input
                            value={line.cases}
                            onChange={(e) => setLine(line.key, { cases: e.target.value.slice(0, 40) })}
                            placeholder="15 to 30"
                            className={cellClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={line.name}
                            onChange={(e) => applyProduct(line.key, e.target.value)}
                            list="factory-product-list"
                            placeholder="Item description"
                            className={cellClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={line.quantity}
                            onChange={(e) => setLine(line.key, { quantity: e.target.value.replace(/[^\d.]/g, '') })}
                            inputMode="decimal"
                            className={cn(cellClass, 'text-right tabular-nums')}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={line.rate}
                            onChange={(e) => setLine(line.key, { rate: e.target.value.replace(/[^\d.]/g, '') })}
                            inputMode="decimal"
                            className={cn(cellClass, 'text-right tabular-nums')}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={line.per}
                            onChange={(e) => setLine(line.key, { per: e.target.value.toUpperCase() })}
                            list="factory-units"
                            className={cellClass}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-body-sm font-semibold text-surface-900 dark:text-surface-100">
                          {amount > 0 ? inr(amount) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            onClick={() => removeLine(line.key)}
                            aria-label="Remove line"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <datalist id="factory-product-list">
              {products.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
            <datalist id="factory-units">
              {FACTORY_UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            {products.length === 0 && (
              <p className="px-4 py-3 text-body-sm text-surface-500 border-t border-surface-100 dark:border-surface-800">
                No factory products yet — add them under Factory Products, or just type a description here.
              </p>
            )}
          </AdminCard>
        </div>

        <div className="space-y-5">
          <AdminCard title="Tax & Total">
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Tax</label>
                <div className="flex rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
                  <button
                    onClick={() => setField('taxKind', 'intra')}
                    className={cn(
                      'flex-1 py-2 text-body-sm font-medium transition-colors',
                      !inter ? 'bg-brand-500 text-white' : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-300',
                    )}
                  >
                    CGST + SGST
                  </button>
                  <button
                    onClick={() => setField('taxKind', 'inter')}
                    className={cn(
                      'flex-1 py-2 text-body-sm font-medium transition-colors',
                      inter ? 'bg-brand-500 text-white' : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-300',
                    )}
                  >
                    IGST
                  </button>
                </div>
                <p className="text-caption text-surface-400 mt-1.5">
                  IGST for another state; CGST + SGST within it. The rupees are the same either way.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>GST %</label>
                  <input
                    value={String(draft.gstRate)}
                    onChange={(e) => setField('gstRate', num(e.target.value.replace(/[^\d.]/g, '')))}
                    inputMode="decimal"
                    className={cn(inputClass, 'tabular-nums')}
                  />
                </div>
                <div>
                  <label className={labelClass}>Round off</label>
                  <input
                    value={draft.manualRoundOff}
                    onChange={(e) => setField('manualRoundOff', e.target.value.replace(/[^\d.-]/g, ''))}
                    placeholder={totals.roundOff.toFixed(2)}
                    inputMode="decimal"
                    className={cn(inputClass, 'tabular-nums')}
                  />
                </div>
              </div>

              <dl className="space-y-2 pt-2 border-t border-surface-100 dark:border-surface-800 text-body-sm">
                <div className="flex justify-between">
                  <dt className="text-surface-500">Taxable Value</dt>
                  <dd className="tabular-nums font-medium text-surface-900 dark:text-surface-100">
                    {inr(totals.taxableValue)}
                  </dd>
                </div>
                {inter ? (
                  <div className="flex justify-between">
                    <dt className="text-surface-500">IGST @ {draft.gstRate}%</dt>
                    <dd className="tabular-nums text-surface-900 dark:text-surface-100">{inr(totals.totalIgst)}</dd>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">CGST @ {draft.gstRate / 2}%</dt>
                      <dd className="tabular-nums text-surface-900 dark:text-surface-100">{inr(totals.totalCgst)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">SGST @ {draft.gstRate / 2}%</dt>
                      <dd className="tabular-nums text-surface-900 dark:text-surface-100">{inr(totals.totalSgst)}</dd>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <dt className="text-surface-500">Round Off</dt>
                  <dd className="tabular-nums text-surface-900 dark:text-surface-100">{inr(totals.roundOff)}</dd>
                </div>
                <div className="flex justify-between pt-2 border-t border-surface-100 dark:border-surface-800">
                  <dt className="font-display font-bold text-body-md text-surface-900 dark:text-surface-50">Total</dt>
                  <dd className="font-display font-bold text-heading-sm tabular-nums text-brand-600 dark:text-brand-400">
                    {inr(totals.grandTotal)}
                  </dd>
                </div>
              </dl>

              <div>
                <label className={labelClass}>Notes</label>
                <input
                  value={draft.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Optional"
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => void save(true)}
                  disabled={isSaving || isPrinting}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors"
                >
                  <Printer size={16} />
                  {isSaving ? 'Saving...' : isPrinting ? 'Preparing...' : 'Save & Print'}
                </button>
                <button
                  onClick={() => void save(false)}
                  disabled={isSaving || isPrinting}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 text-body-sm font-semibold hover:bg-surface-200 dark:hover:bg-surface-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={16} />
                  {editingId ? 'Save Changes' : 'Save Only'}
                </button>
              </div>
            </div>
          </AdminCard>

          <AdminCard
            title="Recent Bills"
            noPadding
            titleAction={
              <Link
                to="/admin/factory/bills"
                className="text-body-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
              >
                View all
              </Link>
            }
          >
            <div className="p-4 border-b border-surface-100 dark:border-surface-800">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Number, party or GSTIN"
                  className={cn(inputClass, 'pl-9')}
                />
              </div>
            </div>
            <ul className="divide-y divide-surface-100 dark:divide-surface-800 max-h-[520px] overflow-y-auto">
              {bills.length === 0 && (
                <li className="px-4 py-8 text-center text-body-sm text-surface-500">
                  <FileText size={22} className="mx-auto mb-2 text-surface-300" />
                  No factory bills yet.
                </li>
              )}
              {bills.map((bill) => (
                <li key={bill.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-display font-semibold text-body-sm text-surface-900 dark:text-surface-100">
                        <Factory size={13} className="text-surface-400 flex-shrink-0" />
                        {bill.invoiceNumber}
                        {bill.status === 'cancelled' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500">
                            CANCELLED
                          </span>
                        )}
                      </p>
                      <p className="truncate text-caption text-surface-500 mt-0.5">
                        {bill.party?.name} · {(bill.invoiceDate || '').slice(0, 10)} · {bill.paymentMode}
                      </p>
                    </div>
                    <span className="tabular-nums text-body-sm font-semibold text-brand-600 dark:text-brand-400 flex-shrink-0">
                      {inr(bill.grandTotal)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      onClick={() => void print(bill)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-caption font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-brand-500 transition-colors"
                    >
                      <Printer size={13} /> Print
                    </button>
                    {bill.status !== 'cancelled' && (
                      <>
                        <button
                          onClick={() => edit(bill)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-caption font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-brand-500 transition-colors"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          onClick={() => {
                            setCancelError('');
                            setCancelTarget(bill);
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-caption font-medium text-surface-600 dark:text-surface-300 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                        >
                          <Ban size={13} /> Cancel
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </AdminCard>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title={`Cancel bill ${cancelTarget?.invoiceNumber ?? ''}?`}
        description="The bill is marked cancelled and keeps its number, so the printed run stays accounted for. It can still be reprinted."
        confirmLabel="Cancel bill"
        cancelLabel="Keep it"
        variant="danger"
        isLoading={isCancelling}
        error={cancelError}
        onConfirm={doCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
