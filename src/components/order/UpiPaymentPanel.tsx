import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Landmark,
  Loader2,
  QrCode,
  ShieldCheck,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/atoms/Button.tsx';
import { cn } from '@/lib/utils.ts';
import { submitPaymentProof } from '@/services/payments.ts';
import type { ManualPayment, ManualPaymentInstructions, PaymentStatus } from '@/types/index.ts';

/**
 * The direct UPI / bank-transfer payment screen.
 *
 * Two things drive the layout. First, a customer on a phone cannot scan a QR
 * shown on that same phone — so the UPI deep link is the primary action on
 * small screens and the QR is the fallback, with the emphasis reversed on
 * desktop. Second, the screenshot alone is weak evidence, so the UTR is a
 * required field: it is the part an admin can match against a bank statement.
 */

interface UpiPaymentPanelProps {
  payment: ManualPaymentInstructions;
  paymentStatus: PaymentStatus;
  manualPayment?: ManualPayment | null;
  /** Called after proof is accepted, so the parent can clear the cart / redirect. */
  onSubmitted?: () => void;
  /** Called when the payment window elapses without a submission. */
  onExpired?: () => void;
}

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

/**
 * Shrink the screenshot in the browser before uploading it.
 *
 * A modern phone screenshot is several megabytes, which is slow over mobile
 * data and expensive for a small server to decode — a 4MB JPEG expands to well
 * over 50MB of raw bitmap, which is enough to get the API process killed. This
 * keeps the UTR perfectly legible while cutting the upload to a few hundred KB.
 *
 * It also re-encodes HEIC (the iPhone default) to JPEG on devices that can
 * decode it, which the server cannot always do.
 *
 * Best-effort: any failure returns the original file and lets the server try.
 */
async function downscaleImage(file: File, maxEdge = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));

    // Already small enough in both dimensions and bytes — leave it alone.
    if (scale === 1 && file.size <= 1024 * 1024) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

/** Paise are shown only when there are any — "₹17,485.00" is noise on a phone. */
function formatInr(value: number) {
  const hasPaise = Math.round(value * 100) % 100 !== 0;
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure origin or denied) — the value is still
      // selectable on screen, so there is nothing useful to report.
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-caption text-surface-400">{label}</p>
        <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 break-all">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 text-caption font-medium text-surface-600 dark:text-surface-300 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** Counts down to `expiresAt`, or renders nothing when there is no deadline. */
function Countdown({ expiresAt, onExpired }: { expiresAt: string | null; onExpired?: () => void }) {
  const [msLeft, setMsLeft] = useState(() =>
    expiresAt ? new Date(expiresAt).getTime() - Date.now() : 0,
  );
  // Kept in a ref so the ticking effect doesn't restart on every parent render.
  const firedRef = useRef(false);
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    if (!expiresAt) return;
    firedRef.current = false;
    const tick = () => {
      const remaining = new Date(expiresAt).getTime() - Date.now();
      setMsLeft(remaining);
      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpiredRef.current?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt) return null;

  const expired = msLeft <= 0;
  const totalSeconds = Math.max(0, Math.floor(msLeft / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-body-sm font-medium flex-shrink-0',
        expired
          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
          : totalSeconds < 300
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300',
      )}
    >
      <Clock size={15} className="flex-shrink-0" />
      {/* The full sentence does not fit beside the amount on a phone. */}
      <span className="hidden sm:inline">
        {expired ? 'Payment window closed' : `Complete payment within ${mm}:${ss}`}
      </span>
      <span className="sm:hidden tabular-nums">{expired ? 'Closed' : `${mm}:${ss}`}</span>
    </div>
  );
}

export function UpiPaymentPanel({
  payment,
  paymentStatus,
  manualPayment,
  onSubmitted,
  onExpired,
}: UpiPaymentPanelProps) {
  const [utr, setUtr] = useState('');
  // Left blank unless the customer paid something other than the quoted total.
  const [paidAmount, setPaidAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  // Mobile only — the QR is collapsed until the customer says they need it.
  const [showQr, setShowQr] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Object URLs must be revoked or the blob leaks for the page's lifetime.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const underReview = paymentStatus === 'awaiting_verification';
  const isPaid = paymentStatus === 'paid';
  const rejection = manualPayment?.rejectionReason;

  const pickFile = useCallback((next: File | null) => {
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (!next.type.startsWith('image/')) {
      setError('Upload an image of your payment confirmation (JPG, PNG, or HEIC).');
      return;
    }
    if (next.size > MAX_SCREENSHOT_BYTES) {
      setError('That image is larger than 5MB. Please upload a smaller screenshot.');
      return;
    }
    setFile(next);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanedUtr = utr.toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-Z0-9]{8,22}$/.test(cleanedUtr)) {
      setError('Enter the UTR / reference number from your payment app (8–22 letters or digits).');
      return;
    }
    if (!file) {
      setError('Attach a screenshot of your payment confirmation.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Shrink before sending: full-size phone screenshots are slow to upload
      // and can be large enough to take the API down while decoding them.
      const upload = await downscaleImage(file);
      await submitPaymentProof(payment.orderId, {
        utr: cleanedUtr,
        // Only sent when the customer actually typed a different figure —
        // pre-filling this with our own total would make the admin's
        // amount-mismatch check compare our number against itself.
        claimedAmount: paidAmount.trim() ? Number(paidAmount) : undefined,
        screenshot: upload,
      });
      onSubmitted?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      // A dropped connection surfaces as a bare "Network Error", which tells the
      // customer nothing about what to do next.
      setError(
        !message || /network|timeout|failed to fetch/i.test(message)
          ? 'Upload failed — your payment has NOT been lost. Check your connection and try again, or use a smaller screenshot.'
          : message,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isPaid) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 flex items-start gap-3">
        <ShieldCheck size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
            Payment verified
          </p>
          <p className="text-body-sm text-surface-500 mt-1">
            We have confirmed {formatInr(payment.amount)} against reference {payment.reference}. Your
            order is being prepared.
          </p>
        </div>
      </div>
    );
  }

  if (underReview) {
    return (
      <div className="rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Clock size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
              Payment under review
            </p>
            <p className="text-body-sm text-surface-500 mt-1">
              We received your proof for {formatInr(payment.amount)} and are checking it against our
              account. You will be notified once it is confirmed — no need to pay again.
            </p>
          </div>
        </div>
        {manualPayment && (
          <div className="pt-3 border-t border-surface-100 dark:border-surface-800 text-body-sm text-surface-500">
            Reference submitted: <span className="font-medium text-surface-900 dark:text-surface-100">{manualPayment.utr}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rejection && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
          <X size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-50">
              Your previous proof was not accepted
            </p>
            <p className="text-body-sm text-surface-500 mt-0.5">{rejection}</p>
            <p className="text-caption text-surface-400 mt-1.5">
              Please check the details below and submit again. Your order is still reserved.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-surface-100 dark:border-surface-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption text-surface-400">Amount to pay</p>
            <p className="font-display font-bold text-heading-md sm:text-display-xs text-surface-900 dark:text-surface-50">
              {formatInr(payment.amount)}
            </p>
          </div>
          <Countdown expiresAt={payment.expiresAt} onExpired={onExpired} />
        </div>

        <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">
          {payment.instructions && (
            <p className="text-body-sm text-surface-500 whitespace-pre-line">{payment.instructions}</p>
          )}

          {payment.upi && (
            <div className="space-y-4">
              {/* Mobile leads with the app hand-off: this phone cannot scan a QR
                  on its own screen, so the deep link is the only real action. */}
              <div className="sm:hidden space-y-1.5">
                <a href={payment.upi.link} className="block">
                  <Button fullWidth size="lg">
                    <Smartphone size={18} />
                    Pay {formatInr(payment.amount)}
                  </Button>
                </a>
                <p className="text-caption text-surface-400 text-center">
                  Opens GPay, PhonePe, Paytm or any UPI app
                </p>
              </div>

              {/* Desktop leads with the QR, beside the details. */}
              <div className="hidden sm:flex items-center gap-5">
                <div className="rounded-xl bg-white p-3 border border-surface-200 flex-shrink-0">
                  <img
                    src={payment.upi.qr}
                    alt={`UPI QR code for ${formatInr(payment.amount)}`}
                    className="w-40 h-40"
                    width={160}
                    height={160}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm text-surface-500 mb-2">
                    Scan this code with any UPI app — the amount is filled in for you.
                  </p>
                  <div className="divide-y divide-surface-100 dark:divide-surface-800">
                    <CopyField label="UPI ID" value={payment.upi.id} />
                    {payment.upi.payeeName && (
                      <CopyField label="Payee name" value={payment.upi.payeeName} />
                    )}
                    <CopyField label="Reference" value={payment.reference} />
                  </div>
                </div>
              </div>

              {/* On mobile the QR only matters when paying from a second device,
                  so it stays folded away instead of pushing the form off-screen. */}
              <div className="sm:hidden">
                <button
                  type="button"
                  onClick={() => setShowQr((v) => !v)}
                  aria-expanded={showQr}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-600 dark:text-surface-300"
                >
                  <QrCode size={16} />
                  Paying from another device?
                  <ChevronDown
                    size={15}
                    className={cn('transition-transform', showQr && 'rotate-180')}
                  />
                </button>
                {showQr && (
                  <div className="mt-3 flex justify-center">
                    <div className="rounded-xl bg-white p-3 border border-surface-200">
                      <img
                        src={payment.upi.qr}
                        alt={`UPI QR code for ${formatInr(payment.amount)}`}
                        className="w-40 h-40"
                        width={160}
                        height={160}
                      />
                    </div>
                  </div>
                )}
                <div className="mt-1 divide-y divide-surface-100 dark:divide-surface-800">
                  <CopyField label="UPI ID" value={payment.upi.id} />
                  {payment.upi.payeeName && (
                    <CopyField label="Payee name" value={payment.upi.payeeName} />
                  )}
                  <CopyField label="Reference" value={payment.reference} />
                </div>
              </div>
            </div>
          )}

          {payment.bank && (
            <div className={cn('space-y-1', payment.upi && 'pt-4 sm:pt-5 border-t border-surface-100 dark:border-surface-800')}>
              <div className="flex items-center gap-2 mb-1">
                <Landmark size={16} className="text-surface-400" />
                <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">
                  Or transfer by NEFT / IMPS
                </p>
              </div>
              <div className="divide-y divide-surface-100 dark:divide-surface-800">
                <CopyField label="Account number" value={payment.bank.accountNumber} />
                <CopyField label="IFSC" value={payment.bank.ifsc} />
                {payment.bank.accountName && (
                  <CopyField label="Account holder" value={payment.bank.accountName} />
                )}
                {payment.bank.bankName && (
                  <CopyField
                    label="Bank"
                    value={[payment.bank.bankName, payment.bank.branch].filter(Boolean).join(' — ')}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Proof of payment */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 sm:p-5 space-y-4"
      >
        <div>
          <p className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
            After paying, confirm it here
          </p>
          <p className="text-body-sm text-surface-500 mt-1">
            We check both against our account before confirming your order.
          </p>
        </div>

        <div>
          <label htmlFor="utr" className="block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            UTR / Reference number
          </label>
          <input
            id="utr"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={utr}
            onChange={(e) => setUtr(e.target.value.toUpperCase())}
            placeholder="e.g. 412345678901"
            maxLength={22}
            className="w-full px-4 py-3 rounded-xl text-body-md bg-white dark:bg-surface-850 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:border-brand-500 tracking-wide"
          />
          <p className="text-caption text-surface-400 mt-1">
            Shown in your UPI app as “UTR”, “Transaction ID”, or “Reference No.” after the payment
            succeeds.
          </p>
        </div>

        <div>
          <label htmlFor="paidAmount" className="block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            Amount paid <span className="font-normal text-surface-400">(only if different)</span>
          </label>
          <input
            id="paidAmount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            placeholder={payment.amount.toFixed(2)}
            className="w-full px-4 py-3 rounded-xl text-body-md bg-white dark:bg-surface-850 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:border-brand-500"
          />
          <p className="text-caption text-surface-400 mt-1">
            Leave blank if you paid exactly {formatInr(payment.amount)}.
          </p>
        </div>

        <div>
          <span className="block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            Payment screenshot
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file && previewUrl ? (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-surface-200 dark:border-surface-700">
              <img src={previewUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                  {file.name}
                </p>
                <p className="text-caption text-surface-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  pickFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="p-2 rounded-lg text-surface-400 hover:text-red-500 transition-colors"
                aria-label="Remove screenshot"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-7 rounded-xl border border-dashed border-surface-300 dark:border-surface-700 text-surface-500 hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              <Upload size={20} />
              <span className="text-body-sm font-medium">Choose screenshot</span>
              <span className="text-caption text-surface-400">JPG or PNG, up to 5MB</span>
            </button>
          )}
        </div>

        {error && (
          <p className="flex items-start gap-2 text-body-sm text-red-500">
            <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" fullWidth size="lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Submitting…
            </>
          ) : (
            'Submit payment proof'
          )}
        </Button>
        <p className="text-caption text-surface-400 text-center">
          Your order is confirmed once we verify the payment — usually within a few hours.
        </p>
      </form>
    </div>
  );
}
