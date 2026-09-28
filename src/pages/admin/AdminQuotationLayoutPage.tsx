import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileWarning } from 'lucide-react';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { QuotationLayoutEditor } from '@/components/admin/QuotationLayoutEditor.tsx';
import { getContentSection } from '@/services/admin.ts';
import { getQuotationById, updateQuotationLayout } from '@/services/quotations.ts';
import { DEFAULT_QUOTATION_TEMPLATE, type QuotationTemplate } from '@/types/quotationTemplate.ts';
import type { Quotation, QuotationLayout } from '@/types/quotation.ts';

/**
 * Edit and reprint a saved quotation's printed page.
 *
 * The quotation's answer to `AdminCaseInvoicePage`, and reachable from the same
 * places: the Quotations list and the quotation itself. It exists so a past
 * quotation can be corrected and re-issued — a wrong party address, a missing
 * transport, a term the customer asked for — without touching a single figure,
 * and without raising a second quotation under a second number.
 *
 * The server returns the authoritative quotation, which is read back into the
 * draft, so the screen always shows what was actually stored rather than what
 * it predicted.
 */

/** A layout for a quotation saved before layouts existed, or one that lost it. */
function fallbackLayout(q: Quotation): QuotationLayout {
  return {
    displayNumber: q.quotationNumber,
    quotationDate: q.createdAt,
    partyGstin: q.customerGstin,
    taxKind: q.taxKind ?? 'intra',
  };
}

export function AdminQuotationLayoutPage() {
  const { quotationId } = useParams<{ quotationId: string }>();
  const navigate = useNavigate();

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [draft, setDraft] = useState<QuotationLayout | null>(null);
  const [template, setTemplate] = useState<Partial<QuotationTemplate>>(DEFAULT_QUOTATION_TEMPLATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!quotationId) return;
    (async () => {
      try {
        const [fetched, tpl] = await Promise.all([
          getQuotationById(quotationId),
          getContentSection<Partial<QuotationTemplate>>('quotation-template').catch(() => null),
        ]);
        if (tpl) setTemplate({ ...DEFAULT_QUOTATION_TEMPLATE, ...tpl });
        if (fetched) {
          setQuotation(fetched);
          setDraft(fetched.layout ?? fallbackLayout(fetched));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load this quotation.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [quotationId]);

  const handleSave = useCallback(async () => {
    if (!quotation || !draft) return;
    setIsSaving(true);
    setError('');
    try {
      // The route that cannot re-price. Whatever comes back is the authority —
      // read straight into the draft rather than keeping what was on screen.
      const saved = await updateQuotationLayout(quotation.id, draft);
      setQuotation(saved);
      setDraft(saved.layout ?? fallbackLayout(saved));
      setNotice(`Layout saved for ${saved.quotationNumber}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this layout.');
    } finally {
      setIsSaving(false);
    }
  }, [quotation, draft]);

  const handleRevert = useCallback(() => {
    if (!quotation) return;
    setDraft(quotation.layout ?? fallbackLayout(quotation));
    setNotice('Reverted to the saved layout.');
  }, [quotation]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!quotation || !draft) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-3">
          <FileWarning size={22} className="text-surface-400" />
        </div>
        <p className="text-body-sm text-surface-500">{error || 'That quotation could not be found.'}</p>
        <Link
          to="/admin/quotations"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800"
        >
          <ArrowLeft size={15} /> Back to Quotations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/admin/quotations')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-body-sm font-medium text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        >
          <ArrowLeft size={15} /> Quotations
        </button>
        <div className="min-w-0">
          <h1 className="font-display font-semibold text-heading-sm text-surface-900 dark:text-surface-50">
            {quotation.quotationNumber}
          </h1>
          <p className="text-caption text-surface-500">
            Printed layout · {quotation.customerName || 'Walk-in customer'}
            {quotation.layout?.editedAt &&
              ` · edited ${new Date(quotation.layout.editedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
      </div>

      {notice && (
        <div className="p-2.5 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 text-caption font-medium">
          {notice}
        </div>
      )}

      <QuotationLayoutEditor
        quotation={quotation}
        draft={draft}
        onChange={setDraft}
        template={template}
        onSave={handleSave}
        onRevert={handleRevert}
        isSaving={isSaving}
        error={error}
      />
    </div>
  );
}
