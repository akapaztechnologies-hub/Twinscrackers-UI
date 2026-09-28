import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Save, X, Mail, Phone, MessageSquare, Building2, CalendarDays,
  Wallet, Trash2, User, Clock,
} from 'lucide-react';
import { Select } from '@/components/atoms/Select.tsx';
import { StatusBadge } from '@/components/admin/StatusBadge.tsx';
import { updateEnquiry, enquiryLabel } from '@/services/enquiries.ts';
import {
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABEL,
  ENQUIRY_SUBJECT_LABEL,
  ENQUIRY_EVENT_LABEL,
  ENQUIRY_BUDGET_LABEL,
} from '@/types/admin.ts';
import type { Enquiry, EnquiryStatus } from '@/types/admin.ts';

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/** One read-only fact about the visitor. */
function DetailRow({ icon: Icon, label, children }: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 shrink-0 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
        <Icon size={16} className="text-surface-500" />
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-caption text-surface-400 uppercase tracking-wider font-semibold">{label}</p>
        <div className="text-body-sm text-surface-900 dark:text-surface-100 break-words">{children}</div>
      </div>
    </div>
  );
}

interface EnquiryDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  enquiry: Enquiry | null;
  onSaved: (enquiry: Enquiry) => void;
  onRequestDelete: (id: string) => void;
}

/**
 * Triage panel for one storefront enquiry, shared by both admin screens.
 *
 * The visitor's own words are read-only: this is a record of what they sent, and
 * an editable copy of it would be worth nothing as evidence of what was asked
 * for. Only the three fields the shop owns — status, notes and (for bulk) the
 * quoted amount — are writable.
 *
 * The call / WhatsApp / reply buttons are the point of the screen. A shop owner
 * reading a quote request on a phone should be one tap from answering it, not
 * copying a number out of a table.
 */
export function EnquiryDetailDrawer({
  isOpen,
  onClose,
  enquiry,
  onSaved,
  onRequestDelete,
}: EnquiryDetailDrawerProps) {
  const [status, setStatus] = useState<EnquiryStatus>('new');
  const [adminNotes, setAdminNotes] = useState('');
  const [quotedAmount, setQuotedAmount] = useState('0');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const isBulk = enquiry?.type === 'bulk';

  // Reset to the row being opened. Depends on the enquiry itself, not just
  // `isOpen`, so clicking straight from one row to the next reloads the form
  // rather than leaving the previous enquiry's notes in the box.
  useEffect(() => {
    if (!isOpen || !enquiry) return;
    setStatus(enquiry.status);
    setAdminNotes(enquiry.adminNotes);
    setQuotedAmount(String(enquiry.quotedAmount || 0));
    setError('');
  }, [isOpen, enquiry]);

  if (!enquiry) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      const saved = await updateEnquiry(enquiry.id, {
        status,
        adminNotes,
        // Contact messages have no quote; sending one for them would be
        // rejected by the server, which accepts an amount only on bulk rows.
        ...(isBulk ? { quotedAmount: Number(quotedAmount) || 0 } : {}),
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const statusOptions = ENQUIRY_STATUSES[enquiry.type].map((s) => ({
    value: s,
    label: ENQUIRY_STATUS_LABEL[s],
  }));

  // `tel:` and wa.me both choke on spaces and punctuation, and wa.me additionally
  // rejects the leading '+', so the two are stripped differently.
  const dialable = enquiry.phone.replace(/[^\d+]/g, '');
  const whatsappNumber = enquiry.phone.replace(/\D/g, '');
  const replySubject = encodeURIComponent(
    isBulk
      ? 'Re: your bulk order enquiry'
      : `Re: ${enquiryLabel(ENQUIRY_SUBJECT_LABEL, enquiry.subject) || 'your message'}`,
  );

  const quickActionBase =
    'flex flex-col items-center gap-1.5 py-3 rounded-xl border text-caption font-semibold transition-colors';
  const quickActionOff =
    'border-surface-100 dark:border-surface-800 text-surface-300 dark:text-surface-700 pointer-events-none';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/60"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 z-[101] w-full max-w-lg bg-white dark:bg-surface-900 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-5 border-b border-surface-200 dark:border-surface-800">
              <div className="min-w-0">
                <h2 className="font-display font-semibold text-heading-sm text-surface-900 dark:text-surface-50 truncate">
                  {enquiry.name || 'Unnamed'}
                </h2>
                <div className="flex items-center gap-2 mt-1.5">
                  <StatusBadge status={enquiry.status} type="enquiry" />
                  <span className="text-caption text-surface-400">{formatDateTime(enquiry.createdAt)}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {error && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
                  {error}
                </div>
              )}

              {/* Reach them — the reason this panel exists */}
              <div className="grid grid-cols-3 gap-2">
                <a
                  href={dialable ? `tel:${dialable}` : undefined}
                  aria-disabled={!dialable}
                  className={
                    dialable
                      ? `${quickActionBase} border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 hover:border-brand-500/40 hover:bg-brand-500/5`
                      : `${quickActionBase} ${quickActionOff}`
                  }
                >
                  <Phone size={17} />
                  Call
                </a>
                <a
                  href={whatsappNumber ? `https://wa.me/${whatsappNumber}` : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!whatsappNumber}
                  className={
                    whatsappNumber
                      ? `${quickActionBase} border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 hover:border-green-500/40 hover:bg-green-500/5`
                      : `${quickActionBase} ${quickActionOff}`
                  }
                >
                  <MessageSquare size={17} />
                  WhatsApp
                </a>
                <a
                  href={`mailto:${enquiry.email}?subject=${replySubject}`}
                  className={`${quickActionBase} border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 hover:border-brand-500/40 hover:bg-brand-500/5`}
                >
                  <Mail size={17} />
                  Reply
                </a>
              </div>

              {/* What they sent */}
              <div className="space-y-4">
                <DetailRow icon={Mail} label="Email">
                  <a href={`mailto:${enquiry.email}`} className="hover:text-brand-500 transition-colors">
                    {enquiry.email}
                  </a>
                </DetailRow>

                {enquiry.phone && (
                  <DetailRow icon={Phone} label="Phone">
                    <a href={`tel:${dialable}`} className="hover:text-brand-500 transition-colors">
                      {enquiry.phone}
                    </a>
                  </DetailRow>
                )}

                {!isBulk && enquiry.subject && (
                  <DetailRow icon={MessageSquare} label="Subject">
                    {enquiryLabel(ENQUIRY_SUBJECT_LABEL, enquiry.subject)}
                  </DetailRow>
                )}

                {isBulk && enquiry.company && (
                  <DetailRow icon={Building2} label="Company / Event">
                    {enquiry.company}
                  </DetailRow>
                )}

                {isBulk && enquiry.eventType && (
                  <DetailRow icon={CalendarDays} label="Event type">
                    {enquiryLabel(ENQUIRY_EVENT_LABEL, enquiry.eventType)}
                  </DetailRow>
                )}

                {isBulk && enquiry.budget && (
                  <DetailRow icon={Wallet} label="Budget">
                    {enquiryLabel(ENQUIRY_BUDGET_LABEL, enquiry.budget)}
                  </DetailRow>
                )}

                {enquiry.handledByName && (
                  <DetailRow icon={User} label="Last handled by">
                    {enquiry.handledByName}
                    {enquiry.handledAt ? ` · ${formatDateTime(enquiry.handledAt)}` : ''}
                  </DetailRow>
                )}
              </div>

              {enquiry.message && (
                <div>
                  <p className="text-caption text-surface-400 uppercase tracking-wider font-semibold mb-2">
                    Their message
                  </p>
                  <p className="p-4 rounded-xl bg-surface-50 dark:bg-surface-850 border-l-[3px] border-brand-500 text-body-sm text-surface-700 dark:text-surface-300 whitespace-pre-wrap">
                    {enquiry.message}
                  </p>
                </div>
              )}

              {/* What the shop owns */}
              <div className="pt-5 border-t border-surface-200 dark:border-surface-800 space-y-4">
                <div>
                  <label className={labelClass}>Status</label>
                  <Select
                    value={status}
                    onChange={(v) => setStatus(v as EnquiryStatus)}
                    options={statusOptions}
                    size="md"
                  />
                </div>

                {isBulk && (
                  <div>
                    <label className={labelClass}>Quoted amount</label>
                    <input
                      type="number"
                      min="0"
                      value={quotedAmount}
                      onChange={(e) => setQuotedAmount(e.target.value)}
                      className={inputClass}
                      placeholder="0"
                    />
                    <p className="mt-1.5 text-caption text-surface-400">
                      What you actually quoted, not the band they picked
                      {enquiry.budget ? ` (${enquiryLabel(ENQUIRY_BUDGET_LABEL, enquiry.budget)})` : ''}.
                      Shows as {inr(Number(quotedAmount) || 0)} on the list.
                    </p>
                  </div>
                )}

                <div>
                  <label className={labelClass}>Internal notes</label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={4}
                    className={`${inputClass} resize-none`}
                    placeholder="Called on Tuesday, sending a price list..."
                  />
                  <p className="mt-1.5 text-caption text-surface-400">
                    Only your team sees this. The customer is never sent it.
                  </p>
                </div>

                {enquiry.updatedAt && enquiry.updatedAt !== enquiry.createdAt && (
                  <p className="flex items-center gap-1.5 text-caption text-surface-400">
                    <Clock size={13} />
                    Last updated {formatDateTime(enquiry.updatedAt)}
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-surface-200 dark:border-surface-800 flex items-center gap-3">
              <button
                type="button"
                onClick={() => onRequestDelete(enquiry.id)}
                className="flex items-center justify-center w-10 h-10 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-400 hover:text-red-600 hover:border-red-500/40 hover:bg-red-500/5 transition-colors"
                aria-label="Delete enquiry"
              >
                <Trash2 size={16} />
              </button>
              <div className="ml-auto flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 h-10 rounded-xl border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 h-10 rounded-xl bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
                >
                  <Save size={16} />
                  {isSaving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
