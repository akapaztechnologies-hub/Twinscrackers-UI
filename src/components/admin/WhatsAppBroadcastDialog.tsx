import { useState, useEffect } from 'react';
import { X, Paperclip, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { WhatsAppIcon } from '@/components/atoms/BrandIcons.tsx';
import { useSiteStore } from '@/store/site.ts';
import {
  getBroadcastRecipients,
  startBroadcast,
  fileToBase64,
  type BroadcastRecipients,
  type BroadcastResult,
} from '@/services/broadcast.ts';
import { cn } from '@/lib/utils.ts';

const inputClass =
  'w-full px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-wider text-surface-400 mb-1.5';

/** Meta caps a document at 100MB; a price list is a few hundred KB. */
const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Announce the season to every customer, with the price list attached.
 *
 * WhatsApp will not carry a business-initiated message that is not an approved
 * template, so this screen collects what the template needs — the shop name,
 * the website link and the PDF — rather than a free-typed message. The wording
 * itself lives in the template, in Meta's WhatsApp Manager.
 */
export function WhatsAppBroadcastDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const siteConfig = useSiteStore((s) => s.config);

  const [audience, setAudience] = useState<BroadcastRecipients | null>(null);
  const [templateName, setTemplateName] = useState('season_start');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BroadcastResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setResult(null);
    setWebsiteUrl(siteConfig.url || '');
    void (async () => {
      try {
        setAudience(await getBroadcastRecipients());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the customer list.');
        setAudience(null);
      }
    })();
  }, [open, siteConfig.url]);

  if (!open) return null;

  const total = audience?.recipients.length ?? 0;

  const send = async () => {
    if (!total) {
      setError('No customer has a usable phone number.');
      return;
    }
    setIsSending(true);
    setError('');
    try {
      const payload = {
        templateName: templateName.trim() || 'season_start',
        shopName: siteConfig.name,
        websiteUrl: websiteUrl.trim(),
        ...(file
          ? { documentBase64: await fileToBase64(file), documentFilename: file.name }
          : {}),
      };
      setResult(await startBroadcast(payload));
    } catch (e) {
      // The server passes Meta's own words through — "template name does not
      // exist", "access token expired" — which is what an admin needs to act on.
      setError(e instanceof Error ? e.message : 'Could not send the announcement.');
    } finally {
      setIsSending(false);
    }
  };

  const pickFile = (picked: File | null) => {
    if (picked && picked.size > MAX_PDF_BYTES) {
      setError(`${picked.name} is larger than 10MB.`);
      return;
    }
    setError('');
    setFile(picked);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-surface-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-surface-900 rounded-t-2xl sm:rounded-2xl border border-surface-200 dark:border-surface-800 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-800">
          <h2 className="flex items-center gap-2 font-display font-semibold text-body-lg text-surface-900 dark:text-surface-50">
            <span className="w-7 h-7 rounded-lg bg-[#25D366]/10 text-[#25D366] flex items-center justify-center">
              <WhatsAppIcon size={16} />
            </span>
            Season announcement
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="text-body-sm text-emerald-700 dark:text-emerald-300">
                  <p className="font-semibold">Queued for {result.queued} customer(s).</p>
                  <p className="mt-0.5">
                    They go out over the next few minutes. Anything WhatsApp rejects is retried, and the reason is
                    kept against the message.
                    {result.attachment ? ` The price list (${result.attachment}) is attached.` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 rounded-xl bg-surface-100 dark:bg-surface-800 text-body-sm font-semibold text-surface-700 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 rounded-xl bg-surface-50 dark:bg-surface-850 text-body-sm text-surface-600 dark:text-surface-300">
                {audience === null ? (
                  'Counting customers…'
                ) : (
                  <>
                    Going to <span className="font-bold text-surface-900 dark:text-surface-50">{total}</span> customer
                    {total === 1 ? '' : 's'} with a phone number.
                    {audience.skipped.noNumber > 0 && ` ${audience.skipped.noNumber} skipped for having none.`}
                    {audience.skipped.samples > 0 && ` ${audience.skipped.samples} sample row(s) skipped.`}
                  </>
                )}
              </div>

              <div>
                <label className={labelClass}>Template name (approved in Meta)</label>
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="season_start"
                  className={inputClass}
                />
                <p className="text-caption text-surface-400 mt-1.5">
                  A Marketing template with a Document header and three variables: customer name, shop name, website
                  link.
                </p>
              </div>

              <div>
                <label className={labelClass}>Website link</label>
                <input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Price list (PDF)</label>
                <label
                  className={cn(
                    'flex items-center gap-2 px-3 h-9 rounded-lg border border-dashed cursor-pointer transition-colors text-[13px]',
                    file
                      ? 'border-brand-500/40 bg-brand-500/5 text-surface-900 dark:text-surface-100'
                      : 'border-surface-300 dark:border-surface-700 text-surface-500 hover:border-brand-500/40',
                  )}
                >
                  <Paperclip size={14} />
                  <span className="truncate">{file ? file.name : 'Attach the price list PDF (optional)'}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="text-caption text-surface-400 mt-1.5">
                  Download it from Price List, then attach it here. Without one, the message sends as text only.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-body-sm text-red-600 dark:text-red-400">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-body-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={send}
                  disabled={isSending || !total}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] text-white text-body-sm font-semibold hover:brightness-95 disabled:opacity-50 transition-all"
                >
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <WhatsAppIcon size={16} />}
                  {isSending ? 'Sending…' : `Send to ${total}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
