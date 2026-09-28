import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { StatusBadge } from '@/components/admin/StatusBadge.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { EmptyState } from '@/components/atoms/EmptyState.tsx';
import { cn, formatPrice } from '@/lib/utils.ts';
import {
  getPendingVerifications,
  reviewManualPayment,
  type PendingVerification,
} from '@/services/payments.ts';
import { orderRef } from '@/lib/orderRef.ts';
import { ApiRequestError } from '@/lib/api.ts';

/**
 * The manual-payment review queue.
 *
 * Everything a decision needs sits on one row: the screenshot next to the amount
 * we priced, the UTR that can be searched in a bank statement, and warnings when
 * the image is reused or the claimed amount disagrees. Reviewing is the slowest
 * part of this payment method, so nothing here should require opening the order.
 */

/**
 * The tag(s) a customer's payment carries, as the bank shows it.
 *
 * The QR now tags a payment with the order number without its dashes
 * (`ORD-2609-00042` → `ORD260900042`). Payments made before that carry the old
 * `NVC` + first eight characters of the id, and an order paid then still has to
 * be matched on it — so both are shown while any can be outstanding.
 */
function paymentTags(row: { _id: string; orderNumber?: string }): string[] {
  const legacy = `NVC${row._id.slice(0, 8).toUpperCase()}`;
  const current = (row.orderNumber ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return current ? [current, legacy] : [legacy];
}

const REJECTION_PRESETS = [
  'Amount paid does not match the order total',
  'Screenshot is unclear or incomplete',
  'No matching payment found in our account',
  'This payment reference was already used',
];

function ReviewCard({
  row,
  onDecided,
  onStale,
}: {
  row: PendingVerification;
  onDecided: (id: string) => void;
  /** Another reviewer decided this one first (the server's 409): re-read the queue. */
  onStale: (message: string) => void;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const utr = row.manualPayment?.utr ?? '';
  const claimed = row.manualPayment?.claimedAmount;

  const decide = async (approve: boolean) => {
    setError(null);
    if (!approve && reason.trim().length < 3) {
      setError('Give the customer a reason so they can correct it.');
      return;
    }
    setBusy(approve ? 'approve' : 'reject');
    try {
      await reviewManualPayment(row._id, { approve, reason: approve ? undefined : reason.trim() });
      onDecided(row._id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not record that decision.';
      if (err instanceof ApiRequestError && err.status === 409) {
        // Decided elsewhere a moment ago — this card is stale, so the queue is
        // re-read rather than left offering a decision that is already made.
        onStale(message);
        return;
      }
      setError(message);
      setBusy(null);
    }
  };

  const copyUtr = async () => {
    try {
      await navigator.clipboard.writeText(utr);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable — the value is on screen and selectable.
    }
  };

  return (
    <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-0">
        {/* Proof */}
        <a
          href={row.manualPayment?.screenshotUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="relative block bg-surface-100 dark:bg-surface-850 group"
        >
          {row.manualPayment?.screenshotUrl ? (
            <>
              <img
                src={row.manualPayment.screenshotUrl}
                alt={`Payment proof for order ${row._id}`}
                className="w-full h-48 lg:h-full object-cover"
                loading="lazy"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white text-body-sm font-medium gap-1.5">
                <ExternalLink size={15} /> Open full size
              </span>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-surface-400 text-body-sm">
              No screenshot
            </div>
          )}
        </a>

        {/* Details + actions */}
        <div className="p-5 space-y-4 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to={`/admin/orders/${row._id}`}
                className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50 hover:text-brand-500 transition-colors"
              >
                {orderRef(row)}
              </Link>
              <p className="text-body-sm text-surface-500 truncate">
                {row.customerName || row.shippingAddress?.fullName || 'Customer'}
                {row.shippingAddress?.phone ? ` · ${row.shippingAddress.phone}` : ''}
              </p>
              {/* What to look for in the bank statement's remark. */}
              <p className="text-caption text-surface-400 font-mono">
                Payment note: {paymentTags(row).join('  or  ')}
              </p>
            </div>
            <StatusBadge status={row.paymentStatus} type="payment" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-caption text-surface-400">We priced</p>
              <p className="font-display font-bold text-body-lg text-surface-900 dark:text-surface-50">
                {formatPrice(row.total)}
              </p>
            </div>
            {claimed !== undefined && (
              <div>
                <p className="text-caption text-surface-400">Customer says</p>
                <p
                  className={cn(
                    'font-display font-bold text-body-lg',
                    row.amountMismatch
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-surface-900 dark:text-surface-50',
                  )}
                >
                  {formatPrice(claimed)}
                </p>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-caption text-surface-400">UTR / Reference</p>
              <button
                type="button"
                onClick={copyUtr}
                className="flex items-center gap-1.5 text-body-sm font-medium text-surface-900 dark:text-surface-100 hover:text-brand-500 transition-colors break-all text-left"
              >
                {utr || '—'}
                {utr && (copied ? <Check size={13} /> : <Copy size={13} className="flex-shrink-0" />)}
              </button>
            </div>
          </div>

          {(row.duplicateScreenshot || row.amountMismatch) && (
            <div className="space-y-1.5">
              {row.amountMismatch && (
                <p className="flex items-start gap-2 text-body-sm text-red-600 dark:text-red-400">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  The amount the customer entered does not match this order's total.
                </p>
              )}
              {row.duplicateScreenshot && (
                <p className="flex items-start gap-2 text-body-sm text-red-600 dark:text-red-400">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  This exact screenshot was also submitted for another order.
                </p>
              )}
            </div>
          )}

          {row.manualPayment && row.manualPayment.attempts > 1 && (
            <p className="text-caption text-surface-400">
              Attempt {row.manualPayment.attempts} — a previous submission was rejected.
            </p>
          )}

          {error && (
            <p className="flex items-start gap-2 text-body-sm text-red-500">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              {error}
            </p>
          )}

          {rejecting ? (
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap gap-1.5">
                {REJECTION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReason(preset)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-caption font-medium transition-colors',
                      reason === preset
                        ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                        : 'bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700',
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason shown to the customer…"
                maxLength={300}
                className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:border-brand-500/40 min-h-[68px] resize-y"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => decide(false)}
                  disabled={busy !== null}
                  className="flex items-center gap-2 px-4 h-9 rounded-lg bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {busy === 'reject' ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                  Confirm rejection
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejecting(false);
                    setError(null);
                  }}
                  disabled={busy !== null}
                  className="px-4 h-9 rounded-lg text-[13px] font-medium text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => decide(true)}
                disabled={busy !== null}
                className="flex items-center gap-2 px-4 h-9 rounded-lg bg-green-600 text-white text-[13px] font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {busy === 'approve' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ShieldCheck size={15} />
                )}
                Approve payment
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy !== null}
                className="flex items-center gap-2 px-4 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-semibold text-surface-600 dark:text-surface-300 hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
              >
                <X size={15} />
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Rows added by each "Show more". */
const PAGE_SIZE = 50;
/** The server's ceiling on rows per request (`MAX_PAGE_LIMIT`). */
const MAX_PER_REQUEST = 100;

export function AdminPaymentVerificationPage() {
  const [rows, setRows] = useState<PendingVerification[]>([]);
  // The server's count of everything waiting, not just the rows on screen —
  // the header used to say "50 waiting" when there were eighty.
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * How many rows the reviewer has asked to see. Every read takes that many
   * from the top of the queue. The queue shrinks as payments are decided, so
   * asking for "page 2" after deciding three skipped the three rows that had
   * moved up into page 1, and nobody ever saw them.
   */
  const windowRef = useRef(PAGE_SIZE);
  /** Only the newest read lands; an older one would bring back decided rows. */
  const readSeq = useRef(0);

  /** Read the first `count` rows of the queue. False when a newer read replaced this one. */
  const readQueue = useCallback(async (count: number): Promise<boolean> => {
    const seq = ++readSeq.current;
    try {
      const limit = Math.min(Math.max(1, count), MAX_PER_REQUEST);
      const results = await Promise.all(
        Array.from({ length: Math.ceil(count / limit) }, (_, i) =>
          getPendingVerifications({ page: i + 1, limit }),
        ),
      );
      if (seq !== readSeq.current) return false;
      // A row decided between two of the requests shifts the next one up, so
      // the same row can come back twice.
      const seen = new Set<string>();
      const data: PendingVerification[] = [];
      for (const row of results.flatMap((r) => r.data)) {
        if (seen.has(row._id)) continue;
        seen.add(row._id);
        data.push(row);
      }
      const last = results[results.length - 1];
      // Whole pages can bring back more than was asked for (150 comes back as
      // 200). Kept to the window, or the next "Show more" would add nothing.
      const shown = data.slice(0, count);
      setRows(shown);
      setTotal(last.total ?? data.length);
      setHasMore(data.length > shown.length || Boolean(last.hasMore));
      return true;
    } catch (err) {
      if (seq !== readSeq.current) return false;
      throw err;
    }
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'more') => {
      const setBusy = mode === 'initial' ? setIsLoading : mode === 'refresh' ? setIsRefreshing : setIsLoadingMore;
      setBusy(true);
      try {
        if (await readQueue(windowRef.current)) setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : mode === 'more'
              ? 'Could not load more of the queue.'
              : 'Could not load the verification queue.',
        );
      } finally {
        setBusy(false);
      }
    },
    [readQueue],
  );

  const loadMore = () => {
    if (isLoadingMore) return;
    windowRef.current += PAGE_SIZE;
    void load('more');
  };

  useEffect(() => {
    void load('initial');
  }, [load]);

  // The decided row goes at once, so the reviewer keeps their place. The same
  // number of rows is then read again from the top: the rows below move up
  // into view, and ones another reviewer decided drop out.
  const handleDecided = (id: string) => {
    setRows((prev) => prev.filter((r) => r._id !== id));
    setTotal((t) => Math.max(0, t - 1));
    void readQueue(windowRef.current).catch(() => {
      // Only a top-up. The decided row is already gone, and Refresh or Show
      // more reads the queue again.
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-semibold text-body-lg text-surface-900 dark:text-surface-50">
            Payment Verification
          </h2>
          <p className="text-caption text-surface-400">
            {isLoading
              ? 'Loading…'
              : rows.length === 0 && !hasMore
                ? 'Nothing waiting on you'
                : `${Math.max(total, rows.length)} payment${Math.max(total, rows.length) === 1 ? '' : 's'} waiting on your review`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load('refresh')}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3.5 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-300 hover:border-brand-500/40 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={cn(isRefreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          <p className="text-body-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : rows.length === 0 && !hasMore ? (
        // Not while more are waiting: deciding every row on screen used to say
        // "nothing waiting" with the rest of the queue still to come.
        <EmptyState
          icon={<ShieldCheck size={28} className="text-surface-400" />}
          title="No payments awaiting verification"
          description="Direct UPI and bank-transfer payments appear here as soon as a customer uploads their proof."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <ReviewCard
              key={row._id}
              row={row}
              onDecided={handleDecided}
              onStale={(message) => {
                // Said after the reload, which clears the error line.
                void load('refresh').then(() => setError(message));
              }}
            />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={isLoadingMore}
              className="w-full h-10 rounded-xl border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-300 hover:border-brand-500/40 disabled:opacity-50 transition-colors"
            >
              {isLoadingMore ? 'Loading…' : `Show more (${Math.max(0, total - rows.length)} more waiting)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
