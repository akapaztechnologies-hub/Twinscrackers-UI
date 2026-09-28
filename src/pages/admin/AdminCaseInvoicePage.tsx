import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileWarning } from 'lucide-react';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { WholesaleInvoiceEditor } from '@/components/admin/WholesaleInvoiceEditor.tsx';
import { billToCaseDraft, draftToUpdatePayload, type CaseDraft } from '@/lib/caseInvoiceDraft.ts';
import { getContentSection } from '@/services/admin.ts';
import { DEFAULT_WHOLESALE_TEMPLATE, type WholesaleInvoiceTemplate } from '@/types/wholesaleInvoice.ts';
import { InvoiceLayoutEditor } from '@/components/admin/InvoiceLayoutEditor.tsx';
import type { Bill, CaseInvoice } from '@/types/admin.ts';

/**
 * Edit and reprint a saved full-case invoice.
 *
 * Reachable from the bill itself, so any past wholesale invoice can be
 * corrected and re-issued rather than only being editable in the moments after
 * it was raised.
 *
 * The server re-prices from what this sends and returns the authoritative bill,
 * which is then read back into the draft — so the screen always shows the
 * totals that were actually stored, not the ones it predicted.
 */
export function AdminCaseInvoicePage() {
  const { billId } = useParams<{ billId: string }>();
  const navigate = useNavigate();

  const [bill, setBill] = useState<Bill | null>(null);
  const [draft, setDraft] = useState<CaseDraft | null>(null);
  const [template, setTemplate] = useState<Partial<WholesaleInvoiceTemplate>>(DEFAULT_WHOLESALE_TEMPLATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!billId) return;
    (async () => {
      try {
        const { getBillById } = await import('@/services/admin.ts');
        const [fetched, tpl] = await Promise.all([
          getBillById(billId),
          getContentSection<Partial<WholesaleInvoiceTemplate>>('wholesale-invoice-template').catch(() => null),
        ]);
        if (tpl) setTemplate({ ...DEFAULT_WHOLESALE_TEMPLATE, ...tpl });
        if (fetched) {
          setBill(fetched);
          setDraft(billToCaseDraft(fetched));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load this invoice.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [billId]);

  const handleSave = useCallback(async () => {
    if (!billId || !draft) return;
    setIsSaving(true);
    setError('');
    try {
      const { updateCaseInvoice } = await import('@/services/admin.ts');
      const saved = await updateCaseInvoice(billId, draftToUpdatePayload(draft));
      setBill(saved);
      // Re-seed from the response rather than keeping the local draft: the
      // server owns every total, and this is what makes that visible.
      setDraft(billToCaseDraft(saved));
      setNotice('Invoice saved.');
      setTimeout(() => setNotice(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this invoice.');
    } finally {
      setIsSaving(false);
    }
  }, [billId, draft]);

  const handleRevert = useCallback(() => {
    if (bill) setDraft(billToCaseDraft(bill));
    setError('');
  }, [bill]);

  if (isLoading) return <div className="p-4 lg:p-6"><SkeletonCard /></div>;

  if (!bill || !draft) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <FileWarning size={32} className="text-surface-300" />
        <p className="text-body-sm text-surface-500">{error || 'That invoice could not be found.'}</p>
        <Link to="/admin/bills" className="text-body-sm font-semibold text-brand-600 hover:text-brand-700">
          Back to Bills
        </Link>
      </div>
    );
  }

  // A retail or per-piece bill prints the regular tax invoice, so it gets the
  // tax invoice's layout editor. This screen used to turn those away entirely —
  // "not edited here" with nowhere else to go — which meant most of the bills
  // the shop raises had no editable printed page at all.
  if (bill.billingMode !== 'wholesale-case') {
    return (
      <TaxInvoiceLayout
        bill={bill}
        onBack={() => navigate(-1)}
        onSaved={(saved) => {
          setBill(saved);
          setNotice('Invoice layout saved.');
          setTimeout(() => setNotice(''), 3000);
        }}
        notice={notice}
      />
    );
  }

  const edited = bill.caseInvoice?.editedAt
    ? `Last edited ${new Date(bill.caseInvoice.editedAt).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}. A customer may be holding an earlier printed copy.`
    : undefined;

  return (
    <div className="p-4 lg:p-6 xl:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800"
            aria-label="Go back"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="font-display font-bold text-body-lg text-surface-900 dark:text-surface-50">
              Wholesale Invoice
            </h1>
            <p className="text-caption text-surface-400">
              Bill {bill.billNumber} · {bill.totalCases ?? 0} case(s) · {bill.totalQuantity} pcs
            </p>
          </div>
        </div>
        {notice && (
          <span className="text-caption font-medium text-green-600 dark:text-green-400">{notice}</span>
        )}
      </div>

      <WholesaleInvoiceEditor
        draft={draft}
        onChange={setDraft}
        template={template}
        onSave={handleSave}
        onRevert={handleRevert}
        isSaving={isSaving}
        saveLabel="Save Invoice"
        editedNote={edited}
        error={error}
      />
    </div>
  );
}

/**
 * The printed layout of a retail or wholesale-per-piece bill.
 *
 * Its own component rather than another branch in the page above: the two
 * documents share a route (every bill's layout lives at the same URL, whichever
 * template it prints on) but nothing else. The case pad is a ruled grid whose
 * lines are editable; this is a tax invoice whose lines are not.
 */
function TaxInvoiceLayout({
  bill,
  onBack,
  onSaved,
  notice,
}: {
  bill: Bill;
  onBack: () => void;
  onSaved: (saved: Bill) => void;
  notice: string;
}) {
  const [draft, setDraft] = useState<CaseInvoice>(() => seedLayout(bill));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError('');
    try {
      const { updateBill } = await import('@/services/admin.ts');
      // Only the printed fields travel. No items, no discount, no GST — the
      // server re-prices from whatever it is sent, and sending nothing else is
      // what makes this save incapable of moving money.
      const saved = await updateBill(bill.id, {
        invoice: {
          displayNumber: draft.displayNumber,
          invoiceDate: draft.invoiceDate,
          transport: draft.transport,
          partyGstin: draft.partyGstin,
          partyState: draft.partyState,
          hsnCode: draft.hsnCode,
          taxKind: draft.taxKind,
          notes: draft.notes,
        },
        taxKind: draft.taxKind,
      });
      onSaved(saved);
      // Re-seeded from the response: the server is the authority on what was
      // actually stored.
      setDraft(seedLayout(saved));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this layout.');
    } finally {
      setIsSaving(false);
    }
  }, [bill.id, draft, onSaved]);

  const edited = bill.caseInvoice?.editedAt
    ? `Last edited ${new Date(bill.caseInvoice.editedAt).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : null;

  return (
    <div className="p-4 lg:p-6 xl:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800"
            aria-label="Go back"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="font-display font-bold text-body-lg text-surface-900 dark:text-surface-50">
              Invoice Layout
            </h1>
            <p className="text-caption text-surface-400">
              Bill {bill.billNumber} · {bill.billingMode === 'wholesale-piece' ? 'Wholesale, per piece' : 'Retail'}
              {edited && ` · ${edited}`}
            </p>
          </div>
        </div>
        {notice && <span className="text-caption font-medium text-green-600 dark:text-green-400">{notice}</span>}
      </div>

      <InvoiceLayoutEditor
        bill={bill}
        draft={draft}
        onChange={setDraft}
        onSave={handleSave}
        onRevert={() => {
          setDraft(seedLayout(bill));
          setError('');
        }}
        isSaving={isSaving}
        error={error}
      />
    </div>
  );
}

/** The bill's stored layout, or a first one seeded from the bill itself. */
function seedLayout(bill: Bill): CaseInvoice {
  return (
    bill.caseInvoice ?? {
      displayNumber: bill.billNumber,
      invoiceDate: bill.createdAt,
      taxKind: bill.taxKind ?? ((bill.totalIgst ?? 0) > 0 ? 'inter' : 'intra'),
    }
  );
}
