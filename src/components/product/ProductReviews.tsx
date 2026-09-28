import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Star, BadgeCheck, Loader2, MessageSquare, Store } from 'lucide-react';
import { Button } from '@/components/atoms/Button.tsx';
import { StarRating } from '@/components/atoms/StarRating.tsx';
import { useAuthStore } from '@/store/auth.ts';
import { cn } from '@/lib/utils.ts';
import {
  getProductReviews,
  submitReview,
  type ProductReview,
  type ReviewPage,
} from '@/services/reviews.ts';

/**
 * What customers said about a product, and the form to say it.
 *
 * Open to guests. Most orders on this site are placed without an account, so
 * the people best placed to review a pack are exactly the ones a sign-up wall
 * would turn away — they identify themselves with the phone number they
 * ordered on, which is also how the server decides whether to mark the review
 * a verified purchase.
 *
 * Nothing written here appears until the shop approves it, and the form says so
 * rather than leaving someone refreshing the page looking for their words.
 */

function Stars({
  value,
  onChange,
  size = 28,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          onMouseEnter={() => setHover(n)}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          className={cn('transition-transform', onChange && 'hover:scale-110 active:scale-95')}
          disabled={!onChange}
        >
          <Star
            size={size}
            className={cn(
              'transition-colors',
              n <= shown
                ? 'fill-brand-500 text-brand-500'
                : 'fill-surface-200 text-surface-200 dark:fill-surface-700 dark:text-surface-700',
            )}
          />
        </button>
      ))}
    </div>
  );
}

function ReviewRow({ review }: { review: ProductReview }) {
  return (
    <div className="py-5 border-b border-surface-200 dark:border-surface-800 last:border-0">
      <div className="flex items-center gap-2 flex-wrap">
        <StarRating rating={review.rating} showCount={false} />
        <span className="text-body-sm font-semibold text-surface-900 dark:text-surface-50">
          {review.name}
        </span>
        {review.verifiedPurchase && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-caption font-semibold">
            <BadgeCheck size={12} />
            Verified purchase
          </span>
        )}
        <span className="text-caption text-surface-400 ml-auto">
          {new Date(review.createdAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      </div>

      {review.title && (
        <p className="mt-2 font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
          {review.title}
        </p>
      )}
      <p className="mt-1 text-body-sm text-surface-600 dark:text-surface-400 leading-relaxed whitespace-pre-line">
        {review.body}
      </p>

      {/* The shop's answer. Shown under the review it answers, because a reply
          floating on its own reads as a second review. */}
      {review.reply && (
        <div className="mt-3 ml-4 pl-4 border-l-2 border-brand-500/40">
          <p className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
            <Store size={12} />
            Shop's reply
          </p>
          <p className="mt-1 text-body-sm text-surface-600 dark:text-surface-400 whitespace-pre-line">
            {review.reply}
          </p>
        </div>
      )}
    </div>
  );
}

export function ProductReviews({ slug }: { slug: string }) {
  const user = useAuthStore((s) => s.user);
  const [page, setPage] = useState<ReviewPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    // Moving to another product while this one's reviews are loading must not
    // let them land under the next product.
    let cancelled = false;
    setIsLoading(true);
    getProductReviews(slug).then((result) => {
      if (cancelled) return;
      setPage(result);
      setIsLoading(false);
    });
    // A different product means a different form, not a half-typed one carried
    // across from the last page.
    setFormOpen(false);
    setThanks(false);
    return () => { cancelled = true; };
  }, [slug]);

  const handleSubmit = async () => {
    setError('');
    if (rating < 1) {
      setError('Pick a star rating first.');
      return;
    }
    if (body.trim().length < 10) {
      setError('Tell other customers a little more — at least a sentence.');
      return;
    }
    if (!user && !/^\d{10}$/.test(phone.trim())) {
      setError('Enter the 10-digit phone number you ordered with.');
      return;
    }
    if (!user && name.trim().length < 2) {
      setError('Enter the name to show with your review.');
      return;
    }

    setIsSaving(true);
    try {
      await submitReview(slug, {
        rating,
        title: title.trim() || undefined,
        body: body.trim(),
        name: name.trim() || undefined,
        phone: user ? undefined : phone.trim(),
      });
      setThanks(true);
      setFormOpen(false);
      setRating(0);
      setTitle('');
      setBody('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that review. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const total = page?.total ?? 0;

  return (
    <section className="mt-12 pt-10 border-t border-surface-200 dark:border-surface-800">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
            Customer Reviews
          </h2>
          {total > 0 ? (
            <div className="mt-2 flex items-center gap-3">
              <span className="font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">
                {page?.average.toFixed(1)}
              </span>
              <div>
                <StarRating rating={page?.average ?? 0} showCount={false} size="md" />
                <p className="text-body-sm text-surface-500">
                  {total} review{total === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-body-sm text-surface-500 dark:text-surface-400">
              No reviews yet — be the first to write one.
            </p>
          )}
        </div>

        {!formOpen && (
          <Button variant="outline" onClick={() => setFormOpen(true)}>
            Write a review
          </Button>
        )}
      </div>

      {/* The 5-to-1 spread. Only worth drawing once there is something to
          spread — with two reviews it is five empty bars and one short one. */}
      {total >= 3 && page && (
        <div className="mt-6 max-w-sm space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = page.breakdown[star] ?? 0;
            const pct = total ? Math.round((count / total) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-2 text-caption text-surface-500">
                <span className="w-10 tabular-nums">{star} star</span>
                <div className="flex-1 h-2 rounded-full bg-surface-200 dark:bg-surface-800 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${pct}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="h-full bg-brand-500"
                  />
                </div>
                <span className="w-8 text-right tabular-nums">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {thanks && (
        <p className="mt-6 px-4 py-3 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-body-sm font-medium">
          Thanks — your review has been sent. It appears here once the shop has checked it.
        </p>
      )}

      {formOpen && (
        <div className="mt-6 p-5 rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900">
          <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-50">
            How was it?
          </p>
          <div className="mt-3">
            <Stars value={rating} onChange={setRating} />
          </div>

          {!user && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="input-field"
              />
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="Phone you ordered with"
                className="input-field"
              />
            </div>
          )}

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sum it up in a few words (optional)"
            className="input-field mt-3"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="What was the sound like? Did it last? Would you buy it again?"
            className="input-field mt-3 resize-none"
          />

          {/* Off-screen, never focusable. A value here means a bot filled it. */}
          <input
            type="text"
            name="fx_ref"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="absolute -left-[9999px] w-px h-px opacity-0"
          />

          {error && <p className="mt-3 text-body-sm text-red-600 dark:text-red-400">{error}</p>}

          <p className="mt-3 text-caption text-surface-500">
            Your phone number is never shown. Reviews appear once the shop has checked them.
          </p>

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Send review'}
            </Button>
            <button
              onClick={() => setFormOpen(false)}
              className="text-body-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={22} className="animate-spin text-brand-500" />
          </div>
        ) : total === 0 ? (
          <div className="py-10 text-center">
            <MessageSquare size={32} className="mx-auto text-surface-300 dark:text-surface-700 mb-2" />
            <p className="text-body-sm text-surface-500">
              Nobody has reviewed this yet.
            </p>
          </div>
        ) : (
          <>
            {page?.data.map((review) => <ReviewRow key={review._id} review={review} />)}
            {page?.hasMore && (
              <div className="pt-5 text-center">
                <Button
                  variant="outline"
                  onClick={async () => {
                    const next = await getProductReviews(slug, (page.page ?? 1) + 1);
                    setPage({ ...next, data: [...page.data, ...next.data] });
                  }}
                >
                  Show more reviews
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
