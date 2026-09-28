import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Star, Search, Check, X, Trash2, BadgeCheck, Loader2, MessageSquare } from 'lucide-react';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { Pagination } from '@/components/admin/Pagination.tsx';
import { ErrorNotice, errorText } from '@/components/admin/AdminShared.tsx';
import { cn } from '@/lib/utils.ts';
import {
  getReviews,
  getReviewStats,
  moderateReview,
  deleteReview,
  type AdminReview,
  type ReviewStatus,
  type ReviewStats,
} from '@/services/adminReviews.ts';

/**
 * The review queue.
 *
 * Nothing a customer writes reaches a product page until it is approved here.
 * Built as cards rather than a table because the job is reading a paragraph and
 * deciding, not comparing rows — and because the shop's reply is written in the
 * same place, which a table cell cannot hold.
 */

const TABS: { key: ReviewStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Waiting' },
  { key: 'approved', label: 'Published' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={13}
          className={cn(
            n <= value
              ? 'fill-amber-500 text-amber-500'
              : 'fill-surface-200 text-surface-200 dark:fill-surface-700 dark:text-surface-700',
          )}
        />
      ))}
    </span>
  );
}

function ReviewCard({
  review,
  onDone,
  onDelete,
}: {
  review: AdminReview;
  onDone: () => void;
  onDelete: () => void;
}) {
  const [busy, setBusy] = useState<ReviewStatus | null>(null);
  const [reply, setReply] = useState(review.reply ?? '');
  const [replyOpen, setReplyOpen] = useState(false);
  const [error, setError] = useState('');

  const decide = async (status: ReviewStatus) => {
    setError('');
    setBusy(status);
    try {
      await moderateReview(review._id, { status, reply: reply.trim() || undefined });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
      setBusy(null);
    }
  };

  return (
    <div className="p-4 rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
      <div className="flex items-start gap-3">
        {review.product?.images?.[0] && (
          <img
            src={review.product.images[0]}
            alt=""
            className="w-11 h-11 rounded-lg object-contain p-0.5 bg-surface-100 dark:bg-surface-800 flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          {review.product ? (
            <Link
              to={`/admin/products/${review.product._id}/edit`}
              className="text-body-sm font-semibold text-surface-900 dark:text-surface-100 hover:text-brand-600 dark:hover:text-brand-400 truncate block"
            >
              {review.product.name}
            </Link>
          ) : (
            <p className="text-body-sm font-semibold text-surface-400">Product removed</p>
          )}
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            <Stars value={review.rating} />
            <span className="text-caption text-surface-600 dark:text-surface-400">{review.name}</span>
            {review.verifiedPurchase && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-caption font-semibold">
                <BadgeCheck size={11} /> Bought it
              </span>
            )}
            {/* Staff-only: how the shop rings this customer back about a complaint. */}
            {review.phone && <span className="text-caption text-surface-400">{review.phone}</span>}
            <span className="text-caption text-surface-400 ml-auto">
              {new Date(review.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>
      </div>

      {review.title && (
        <p className="mt-3 font-semibold text-body-sm text-surface-900 dark:text-surface-100">
          {review.title}
        </p>
      )}
      <p className="mt-1 text-body-sm text-surface-600 dark:text-surface-400 whitespace-pre-line">
        {review.body}
      </p>

      {replyOpen || review.reply ? (
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          placeholder="Your public answer, shown under this review"
          className="input-field mt-3 resize-none"
        />
      ) : null}

      {error && <p className="mt-2 text-caption text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {review.status !== 'approved' && (
          <button
            onClick={() => decide('approved')}
            disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-green-600 text-white text-[13px] font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {busy === 'approved' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Publish
          </button>
        )}
        {review.status !== 'rejected' && (
          <button
            onClick={() => decide('rejected')}
            disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-red-200 dark:border-red-500/30 text-[13px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors"
          >
            {busy === 'rejected' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            Reject
          </button>
        )}
        {!replyOpen && !review.reply && (
          <button
            onClick={() => setReplyOpen(true)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors"
          >
            <MessageSquare size={14} /> Reply
          </button>
        )}
        <button
          onClick={onDelete}
          className="ml-auto p-2 rounded-lg text-surface-400 hover:text-red-600 hover:bg-red-500/10 transition-colors"
          title="Delete permanently"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

export function AdminReviewsPage() {
  const [tab, setTab] = useState<ReviewStatus | 'all'>('pending');
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Paged on the server. A single fetch of 50 left every older review in a tab
  // unreachable except by guessing a search term.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // A new tab or search starts at the first page — page 4 of a narrower list
  // is usually empty.
  const [pageKey, setPageKey] = useState(`${tab}|${debounced}`);
  if (pageKey !== `${tab}|${debounced}`) {
    setPageKey(`${tab}|${debounced}`);
    setPage(1);
  }

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [result, counts] = await Promise.all([
        getReviews({ status: tab, search: debounced, page, limit: perPage }),
        getReviewStats().catch(() => null),
      ]);
      setReviews(result.data);
      setTotal(result.total);
      if (counts) setStats(counts);
      setError('');
    } catch (err) {
      setReviews([]);
      setTotal(0);
      setError(errorText(err, 'Reviews could not be loaded. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  }, [tab, debounced, page, perPage]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteReview(deleteTarget);
      await load();
    } catch (err) {
      setError(errorText(err, 'That review could not be deleted. Please try again.'));
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <ListPageShell
      header={
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
          <div className="flex items-center gap-1 flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-3 h-9 rounded-lg text-[13px] font-medium transition-colors',
                  tab === t.key
                    ? 'bg-brand-500 text-white'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850',
                )}
              >
                {t.label}
                {t.key === 'pending' && stats && stats.pending > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-caption font-bold">
                    {stats.pending}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-sm ml-auto">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              placeholder="Search reviews..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
            />
          </div>
        </div>
      }
    >
      <ErrorNotice message={error} onDismiss={() => setError('')} />
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-500" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="py-20 text-center">
          <Star size={28} className="mx-auto text-surface-300 dark:text-surface-700 mb-2" />
          <p className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-100">
            {tab === 'pending' ? 'Nothing waiting' : 'No reviews here'}
          </p>
          <p className="mt-1 text-body-sm text-surface-500">
            {tab === 'pending'
              ? 'Reviews appear here as customers write them.'
              : 'Try another tab or clear the search.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3 p-1">
          {reviews.map((review) => (
            <ReviewCard
              key={review._id}
              review={review}
              onDone={load}
              onDelete={() => setDeleteTarget(review._id)}
            />
          ))}
          {total > perPage && (
            <Pagination
              currentPage={page}
              totalItems={total}
              itemsPerPage={perPage}
              onPageChange={setPage}
              onItemsPerPageChange={(size) => {
                setPerPage(size);
                setPage(1);
              }}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete review"
        description="This removes the review for good and updates the product's rating. Rejecting it instead keeps the record."
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </ListPageShell>
  );
}
