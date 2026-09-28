import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ChevronLeft, Printer, Download, Share2, Pencil,
  Banknote, Smartphone, CreditCard, Clock,
  CheckCircle2, XCircle, Wallet, Loader2, AlertCircle, Ban, FileText
} from 'lucide-react';
import { getBillById, settleBill, cancelBill } from '@/services/admin.ts';
import { useSiteStore } from '@/store/site.ts';
import { Select } from '@/components/atoms/Select.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import type { Bill } from '@/types/admin.ts';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const paymentIcons: Record<string, typeof Banknote> = {
  cash: Banknote,
  upi: Smartphone,
  card: CreditCard,
  credit: Clock,
};

export function AdminBillDetailPage() {
  const siteConfig = useSiteStore(s => s.config);
  const { billId } = useParams();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [settling, setSettling] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if (!bill || cancelling) return;
    setCancelling(true);
    setNotice('');
    try {
      setBill(await cancelBill(bill.id));
      setNotice('Bill cancelled — stock returned' + (bill.couponCode ? ' and coupon released' : ''));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not cancel this bill');
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  const handleSettle = async () => {
    if (!bill || settling) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) { setNotice('Enter a valid amount'); return; }
    setSettling(true);
    setNotice('');
    try {
      const updated = await settleBill(bill.id, amount, payMethod);
      setBill(updated);
      setPayAmount('');
      setNotice('Payment recorded');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not record payment');
    } finally {
      setSettling(false);
    }
  };

  useEffect(() => {
    async function load() {
      if (billId) {
        setLoading(true);
        const fetched = await getBillById(billId);
        setBill(fetched);
        setLoading(false);
      }
    }
    load();
  }, [billId]);

  // Both go through billDocument, which picks the wholesale case pad for a
  // full-case bill and the tax invoice for everything else. It also brings the
  // popup-blocked fallback, which the hand-rolled version here did not have.
  const handlePrint = async () => {
    if (!bill) return;
    const { printBillDocument } = await import('@/lib/billDocument.ts');
    await printBillDocument(bill);
  };

  const handleDownload = async () => {
    if (!bill) return;
    const { downloadBillDocument } = await import('@/lib/billDocument.ts');
    await downloadBillDocument(bill);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-body-lg text-surface-500">Loading bill...</p>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-body-lg font-medium text-surface-900 dark:text-surface-100">Bill not found</p>
        <Link to="/admin/bills" className="mt-4 text-brand-600 hover:underline">
          Return to Bills
        </Link>
      </div>
    );
  }

  const PayIcon = paymentIcons[bill.payment.method] || Banknote;
  const isCredit = bill.payment.method === 'credit';
  const received = bill.payment.receivedAmount ?? 0;
  const outstanding = Math.max(0, bill.grandTotal - received);
  const gstHalf = (bill.gstRate ?? 18) / 2;
  const settlements = bill.settlements ?? [];
  // A full-case bill counts CASES in `quantity` and prices per CASE, so the
  // columns have to say so — "Rate ₹500, Qty 2" reads as two pieces at ₹500.
  const isCase = bill.billingMode === 'wholesale-case';
  // `taxKind` is absent on bills raised before the counter could set it; a
  // non-zero IGST amount is the fallback, and a 0% inter-state bill has only
  // the flag to go on.
  const isInterState = bill.taxKind === 'inter' || (bill.totalIgst ?? 0) > 0;
  /** Pieces a line moves. Mirrors piecesFor() on the server. */
  const piecesOf = (it: { quantity: number; unit?: string; piecesPerCase?: number }) =>
    it.unit === 'case' ? it.quantity * Math.max(1, it.piecesPerCase ?? 1) : it.quantity;

  return (
    <div className="w-full max-w-7xl mx-auto pb-20">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link
            to="/admin/bills"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors shadow-sm"
          >
            <ChevronLeft size={20} />
          </Link>
          <div>
            <h1 className="text-h6 font-display font-bold text-surface-900 dark:text-surface-50 flex items-center gap-3">
              Invoice #{bill.billNumber}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-caption">
              {bill.billingMode && bill.billingMode !== 'retail' && (
                <span className="px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 font-medium">
                  {isCase ? `Wholesale · Case${bill.totalCases ? ` (${bill.totalCases})` : ''}` : 'Wholesale · Piece'}
                </span>
              )}
              {bill.status === 'completed' && (
                isCredit && outstanding > 0 ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
                    <Clock size={14} /> Credit · {inr(outstanding)} due
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 font-medium">
                    <CheckCircle2 size={14} /> Paid
                  </span>
                )
              )}
              {bill.status === 'held' && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
                  <Clock size={14} /> Held
                </span>
              )}
              {bill.status === 'cancelled' && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 font-medium">
                  <XCircle size={14} /> Cancelled
                </span>
              )}
              {/* A corrected bill keeps its number, so the only way to tell it
                  apart from the copy a customer may be holding is to say so. */}
              {bill.editedAt && (
                <span
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium"
                  title={`Corrected ${new Date(bill.editedAt).toLocaleString('en-IN')} — an earlier copy may be in the customer's hands`}
                >
                  <Pencil size={13} /> Edited{' '}
                  {new Date(bill.editedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              )}
              <span className="text-surface-500">
                {new Date(bill.createdAt).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Editing a bill means re-opening it on the billing screen, which is
              where it was raised. The case pad keeps its own editor alongside,
              for the printed layout only — pad number, HSN, the notes rule. */}
          {bill.status !== 'cancelled' && (
            <>
              <Link
                to={`/admin/billing?edit=${bill.id}`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-surface-900 border border-brand-200 dark:border-brand-500/30 text-body-sm font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors shadow-sm"
              >
                <Pencil size={16} /> Edit Bill
              </Link>
              {/* Every billing mode. The layout editor was offered only on the
                  case pad, so a retail or per-piece invoice had no way to have
                  its printed page corrected — which is most of what the shop
                  raises. The route picks the right editor for the mode. */}
              <Link
                to={`/admin/bills/${bill.id}/case-invoice`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors shadow-sm"
              >
                <FileText size={16} /> Invoice Layout
              </Link>
            </>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors shadow-sm"
          >
            <Printer size={16} /> Print
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors shadow-sm"
          >
            <Download size={16} /> PDF
          </button>
          {bill.customerPhone && (
            <button
              onClick={() => {
                const text = `Bill: ${bill.billNumber}%0ATotal: ₹${bill.grandTotal}%0AThank you for shopping at ${siteConfig.name}!`;
                window.open(`https://wa.me/91${bill.customerPhone}?text=${text}`, '_blank');
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-body-sm font-medium transition-colors shadow-sm shadow-green-500/20"
            >
              <Share2 size={16} /> WhatsApp
            </button>
          )}
          {bill.status !== 'cancelled' && (
            <button
              onClick={() => setConfirmCancel(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-surface-900 border border-red-200 dark:border-red-500/30 text-body-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shadow-sm"
            >
              <Ban size={16} /> Cancel Bill
            </button>
          )}
        </div>
      </div>

      {/* Why this bill was voided — the reason a reader needs before the numbers. */}
      {bill.status === 'cancelled' && (
        <div className="mb-6 flex items-start gap-2.5 p-4 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
          <XCircle size={17} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="text-body-sm text-red-700 dark:text-red-300">
            <p className="font-semibold">This bill was cancelled.</p>
            <p className="mt-0.5 text-red-600/90 dark:text-red-400/90">
              Its stock went back to inventory{bill.couponCode ? ', its coupon slot was released,' : ''} and it
              no longer counts towards sales reports.
              {bill.cancelledAt && ` Cancelled ${new Date(bill.cancelledAt).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}.`}
            </p>
            {bill.cancelReason && <p className="mt-1 italic">“{bill.cancelReason}”</p>}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this bill?"
        description={
          `Bill ${bill.billNumber} will be voided. Its ${bill.totalQuantity} item${bill.totalQuantity === 1 ? '' : 's'} go back into stock`
          + (bill.couponCode ? `, coupon ${bill.couponCode} gets its slot back` : '')
          + ', and it stops counting towards sales reports. The bill itself is kept, marked cancelled.'
        }
        confirmLabel="Cancel Bill"
        variant="danger"
        isLoading={cancelling}
        onConfirm={handleCancel}
        onCancel={() => setConfirmCancel(false)}
      />

      {/* Document Canvas */}
      <div className="bg-white dark:bg-surface-900 rounded-3xl border border-surface-200 dark:border-surface-800 shadow-xl overflow-hidden">
        {/* Header section */}
        <div className="p-8 sm:p-12 lg:p-16 border-b border-surface-100 dark:border-surface-800 flex flex-col md:flex-row justify-between gap-12">
          <div>
            <p className="text-caption font-bold text-surface-400 uppercase tracking-wider mb-4">From</p>
            <h2 className="text-h6 font-display font-bold text-surface-900 dark:text-surface-50 mb-2">
              {siteConfig.name}
            </h2>
            {/* The shop's own details from Settings. This used to be a fixed
                Sivakasi address and a placeholder GSTIN — printed for every shop
                this app runs. */}
            <div className="text-body-sm text-surface-500 space-y-1">
              {siteConfig.contact.address && <p className="whitespace-pre-wrap">{siteConfig.contact.address}</p>}
              {siteConfig.contact.phone && <p>{siteConfig.contact.phone}</p>}
              {siteConfig.gstin && <p>GSTIN: {siteConfig.gstin}</p>}
            </div>
          </div>
          <div className="md:text-right">
            <p className="text-caption font-bold text-surface-400 uppercase tracking-wider mb-4">Billed To</p>
            {bill.customerName ? (
              <>
                <h2 className="text-h6 font-display font-bold text-surface-900 dark:text-surface-50 mb-2">
                  {bill.customerName}
                </h2>
                <div className="text-body-sm text-surface-500 space-y-1">
                  {bill.customerPhone && <p>{bill.customerPhone}</p>}
                  {bill.customerAddress && (
                    <p className="whitespace-pre-wrap">{bill.customerAddress}</p>
                  )}
                </div>
              </>
            ) : (
              <h2 className="text-h6 font-display font-bold text-surface-900 dark:text-surface-50 mb-2">
                Walk-in Customer
              </h2>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-100 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-800/20">
                <th className="py-4 px-8 text-caption font-bold text-surface-500 uppercase tracking-wider w-16 text-center">#</th>
                <th className="py-4 px-8 text-caption font-bold text-surface-500 uppercase tracking-wider">Item Description</th>
                <th className="py-4 px-8 text-caption font-bold text-surface-500 uppercase tracking-wider text-right">
                  {isCase ? 'Rate / Case' : 'Rate'}
                </th>
                <th className="py-4 px-8 text-caption font-bold text-surface-500 uppercase tracking-wider text-center">
                  {isCase ? 'Cases' : 'Qty'}
                </th>
                <th className="py-4 px-8 text-caption font-bold text-surface-500 uppercase tracking-wider text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-surface-50 dark:divide-surface-800/50">
              {bill.items.map((item, idx) => (
                <tr key={idx} className="group hover:bg-surface-50/50 dark:hover:bg-surface-800/20 transition-colors">
                  <td className="py-4 px-8 text-surface-400 text-center">{idx + 1}</td>
                  <td className="py-4 px-8">
                    <div className="flex items-center gap-4">
                      {item.image ? (
                        <img src={item.image || undefined} alt="" className="w-10 h-10 rounded-xl object-contain p-0.5 border border-surface-100 dark:border-surface-800" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-surface-100 dark:bg-surface-800" />
                      )}
                      <span className="font-medium text-surface-900 dark:text-surface-100">{item.name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-8 text-right text-surface-600 dark:text-surface-400 tabular-nums">
                    ₹{item.unitPrice.toLocaleString('en-IN')}
                  </td>
                  <td className="py-4 px-8 text-center text-surface-900 dark:text-surface-100 font-medium tabular-nums">
                    {item.quantity}
                    {item.unit === 'case' && (
                      <span className="block text-caption font-normal text-surface-400">
                        {item.quantity} x {item.piecesPerCase ?? 1} = {piecesOf(item)} pcs
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-8 text-right text-surface-900 dark:text-surface-50 font-bold tabular-nums">
                    ₹{(item.unitPrice * item.quantity).toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Area */}
        <div className="p-8 sm:p-12 lg:p-16 border-t border-surface-100 dark:border-surface-800 flex flex-col md:flex-row gap-12 bg-surface-50/30 dark:bg-surface-900/50">
          
          {/* Left: Payment info */}
          <div className="flex-1">
            <p className="text-caption font-bold text-surface-400 uppercase tracking-wider mb-4">Payment Details</p>
            <div className="inline-flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700">
              <div className="w-12 h-12 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center text-brand-600">
                <PayIcon size={24} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-body-md font-medium text-surface-900 dark:text-surface-100 capitalize">
                  Paid Via {bill.payment.method}
                </p>
                <p className="text-body-sm text-surface-500">
                  {isCredit
                    ? `Received ${inr(received)} of ${inr(bill.grandTotal)}`
                    : `Received ₹${(bill.payment.receivedAmount || bill.grandTotal).toLocaleString('en-IN')}${bill.payment.changeAmount ? ` • Change ₹${bill.payment.changeAmount}` : ''}`}
                </p>
              </div>
            </div>

            {/* Credit settlement — record later part-payments (udhaar) */}
            {isCredit && (
              <div className="mt-5 max-w-sm rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-body-sm font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-1.5">
                    <Wallet size={15} className="text-brand-500" /> Credit account
                  </span>
                  <span className={bill.status === 'cancelled' ? 'text-surface-400 text-body-sm font-bold' : outstanding > 0 ? 'text-amber-600 dark:text-amber-400 text-body-sm font-bold' : 'text-green-600 dark:text-green-400 text-body-sm font-bold'}>
                    {bill.status === 'cancelled' ? 'Voided' : outstanding > 0 ? `${inr(outstanding)} due` : 'Settled'}
                  </span>
                </div>
                <div className="flex justify-between text-caption text-surface-500 mb-1">
                  <span>Bill total</span><span className="tabular-nums text-surface-700 dark:text-surface-300">{inr(bill.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-caption text-surface-500 mb-3">
                  <span>Received</span><span className="tabular-nums text-green-600 dark:text-green-400">{inr(received)}</span>
                </div>

                {/* Not on a cancelled bill: it was voided, so there is nothing
                    left to collect against it — the form used to take the money
                    anyway. */}
                {outstanding > 0 && bill.status !== 'cancelled' && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-caption text-surface-500 mb-1">Record payment</label>
                      <input
                        type="number"
                        min="0"
                        max={outstanding}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder={String(outstanding)}
                        className="w-full h-9 px-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-body-sm tabular-nums text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                    </div>
                    <div className="w-24">
                      <Select
                        value={payMethod}
                        onChange={setPayMethod}
                        options={[{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }]}
                        size="sm"
                      />
                    </div>
                    <button
                      onClick={handleSettle}
                      disabled={settling}
                      className="h-9 px-3.5 rounded-lg bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {settling ? <Loader2 size={15} className="animate-spin" /> : null}
                      Add
                    </button>
                  </div>
                )}

                {notice && (
                  <p className="mt-2 text-caption text-surface-500 flex items-center gap-1"><AlertCircle size={12} /> {notice}</p>
                )}

                {settlements.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-surface-100 dark:border-surface-700/50 space-y-1.5">
                    <p className="text-caption font-semibold text-surface-400 uppercase tracking-wide">Payment history</p>
                    {settlements.map((s, i) => (
                      <div key={i} className="flex justify-between text-caption text-surface-500">
                        <span>{new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {s.method}</span>
                        <span className="tabular-nums text-green-600 dark:text-green-400">{inr(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {bill.salesperson && (
              <p className="text-body-sm text-surface-500 mt-6">
                Served by: <span className="font-medium text-surface-900 dark:text-surface-100">{bill.salesperson}</span>
              </p>
            )}
          </div>

          {/* Right: Summary */}
          <div className="w-full md:w-80 space-y-4">
            <div className="flex justify-between text-body-md text-surface-600 dark:text-surface-400">
              <span>Subtotal</span>
              <span className="tabular-nums font-medium text-surface-900 dark:text-surface-100">
                ₹{bill.subtotal.toLocaleString('en-IN')}
              </span>
            </div>
            {bill.discountPercent > 0 && (
              <div className="flex justify-between text-body-md text-green-600">
                <span>Discount ({bill.discountPercent}%)</span>
                <span className="tabular-nums font-medium">
                  -₹{bill.totalDiscount.toLocaleString('en-IN')}
                </span>
              </div>
            )}
            {/* The coupon is in the total, so it is on the page — without it the
                figures above never added up to the one below. */}
            {(bill.couponDiscount ?? 0) > 0 && (
              <div className="flex justify-between text-body-md text-green-600">
                <span>Coupon{bill.couponCode ? ` ${bill.couponCode}` : ''}</span>
                <span className="tabular-nums font-medium">
                  -₹{(bill.couponDiscount ?? 0).toLocaleString('en-IN')}
                </span>
              </div>
            )}
            {bill.packagingFee > 0 && (
              <div className="flex justify-between text-body-md text-surface-600 dark:text-surface-400">
                <span>Packaging Fee</span>
                <span className="tabular-nums font-medium text-surface-900 dark:text-surface-100">
                  ₹{bill.packagingFee.toLocaleString('en-IN')}
                </span>
              </div>
            )}
            {(bill.deliveryCharge ?? 0) > 0 && (
              <div className="flex justify-between text-body-md text-surface-600 dark:text-surface-400">
                <span>{bill.courierDelivery ? 'Courier Delivery' : 'Delivery'}</span>
                <span className="tabular-nums font-medium text-surface-900 dark:text-surface-100">
                  ₹{(bill.deliveryCharge ?? 0).toLocaleString('en-IN')}
                </span>
              </div>
            )}
            <div className="pt-4 border-t border-surface-200 dark:border-surface-700 border-dashed space-y-2">
              {/* An inter-state sale is charged IGST and nothing else. Printing
                  the CGST/SGST pair at zero would hide the tax entirely. */}
              {isInterState ? (
                <div className="flex justify-between text-body-sm text-surface-500">
                  <span>IGST{bill.gstMode === 'flat' ? '' : ` @${bill.gstRate ?? 18}%`}</span>
                  <span className="tabular-nums">₹{(bill.totalIgst ?? 0).toLocaleString('en-IN')}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-body-sm text-surface-500">
                    <span>CGST{bill.gstMode === 'flat' ? '' : ` @${gstHalf}%`}</span>
                    <span className="tabular-nums">₹{bill.totalCgst.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-body-sm text-surface-500">
                    <span>SGST{bill.gstMode === 'flat' ? '' : ` @${gstHalf}%`}</span>
                    <span className="tabular-nums">₹{bill.totalSgst.toLocaleString('en-IN')}</span>
                  </div>
                </>
              )}
              {Math.abs(bill.roundOff ?? 0) >= 0.005 && (
                <div className="flex justify-between text-body-sm text-surface-500">
                  <span>Round off</span>
                  <span className="tabular-nums">
                    {(bill.roundOff ?? 0) < 0 ? '-' : '+'}₹{Math.abs(bill.roundOff ?? 0).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>
            <div className="pt-4 border-t border-surface-200 dark:border-surface-800 flex items-center justify-between">
              <span className="text-h6 font-display font-bold text-surface-900 dark:text-surface-50">Total</span>
              <span className="text-h4 font-display font-bold text-brand-600 dark:text-brand-400 tabular-nums">
                ₹{bill.grandTotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
