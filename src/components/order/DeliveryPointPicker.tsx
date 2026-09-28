import { useEffect, useRef, useState } from 'react';
import { MapPin, Phone, User, Loader2, AlertCircle, Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import { suggestDropPoints, type DropPoint, type DropPointSuggestion } from '@/services/delivery.ts';

/**
 * How long a parcel-office lookup may take before it counts as failed.
 *
 * Checkout holds Continue and Pay until this answer is in, and a request with
 * no timeout that never comes back held them forever. After this long the
 * picker shows its failed state with "Try again" instead.
 */
const LOOKUP_TIMEOUT_MS = 15_000;

/** Rejects if `promise` has not settled within `ms`. The request itself is left to finish unheard. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The parcel office lookup timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Choose where the parcel is collected from.
 *
 * Fireworks cannot be delivered to a door — Class 1 explosives, so no courier
 * carries them. The lorry reaches a transport line's office, the driver phones
 * the customer, and the customer collects. Picking the right office is the
 * difference between driving four kilometres and forty, and until now it was
 * settled by a phone call after the order was already placed.
 *
 * The nearest office is preselected, so for most customers this is a glance and
 * a Continue. What is shown on each card is what they will actually need on
 * collection day: the branch phone and the person to ask for. These offices run
 * on names, not tracking numbers.
 */
/**
 * What the checkout needs to know to decide whether the order may go ahead.
 *
 * The server refuses an order without a collection point whenever the shop
 * requires one — and for Razorpay that refusal would come AFTER the customer
 * has paid. So the checkout gates payment on this, rather than finding out
 * from a failed order.
 */
export interface DropPointStatus {
  /** The shop has the chooser switched on. */
  enabled: boolean;
  /** An office must be chosen before the order can be placed. */
  required: boolean;
  /** A lookup is in flight — the answer is not known yet. */
  loading: boolean;
  /** The last lookup failed, so whether a choice is needed is unknown. */
  failed: boolean;
  /** At least one office serves this address. */
  hasOptions: boolean;
}

export interface DeliveryPointPickerProps {
  address: { pincode?: string; city?: string; district?: string; state?: string };
  value?: string;
  onChange: (dropPointId: string | undefined, point?: DropPoint) => void;
  /** Surfaced by the checkout when it tried to continue without a choice. */
  error?: string;
  /** Reported on every change, so the checkout can hold payment until it is settled. */
  onStatusChange?: (status: DropPointStatus) => void;
}

export function DeliveryPointPicker({ address, value, onChange, error, onStatusChange }: DeliveryPointPickerProps) {
  const [data, setData] = useState<DropPointSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Bumped by "Try again" to re-run a lookup that failed. */
  const [attempt, setAttempt] = useState(0);
  /** Free-text filter over the suggested offices. See the search box below. */
  const [filter, setFilter] = useState('');

  /*
   * The live selection, read when a lookup lands. The effect below cannot list
   * `value` as a dependency (see there), so without this it would compare
   * against the selection as it stood when the customer started typing.
   */
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const { pincode, city, district, state } = address;

  useEffect(() => {
    // Nothing to search on yet — the customer has not filled the address in.
    if (!pincode?.trim() && !city?.trim()) {
      setData(null);
      // A lookup cancelled by clearing the address never reaches its `finally`.
      setLoading(false);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);

    // Debounced: this runs while somebody is typing a pincode.
    const t = setTimeout(async () => {
      try {
        const result = await withTimeout(suggestDropPoints({ pincode, city, district, state }), LOOKUP_TIMEOUT_MS);
        if (cancelled) return;
        setData(result);

        /*
         * Keep a branch the customer deliberately picked, as long as it still
         * serves this address. Otherwise preselect the nearest one.
         *
         * "Only when nothing is chosen" was not enough: the first lookup fires
         * on a half-typed pincode, or on a saved address the customer then
         * corrects, and its pick used to survive the correction — the order
         * went to an office for the old address, which the new list did not
         * even show as selected.
         */
        const current = valueRef.current;
        const stillServes =
          !!current && result.groups.some((g) => g.points.some((p) => p.id === current));
        if (!stillServes) {
          const first = result.groups[0]?.points[0];
          if (first) onChange(first.id, first);
          else if (current) onChange(undefined);
        }
      } catch {
        if (cancelled) return;
        /*
         * The answer for THIS address is unknown. Keeping the last address's
         * answer let an old "no office needed" through with an office chosen
         * for the old address — so both are dropped, and the checkout waits
         * on "Try again" until this address has a real answer.
         */
        setData(null);
        if (valueRef.current) onChange(undefined);
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // `value` and `onChange` are deliberately absent: including them would
    // re-query the server every time the customer picks a different branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pincode, city, district, state, attempt]);

  const total = data?.groups.reduce((n, g) => n + g.points.length, 0) ?? 0;
  const required = !!data?.enabled && !!data?.required;
  // A failed lookup clears `data` (see the catch above), so after one nothing
  // is known about this address — not even whether the chooser is on — and
  // `failed` holds the order until "Try again" gets an answer.

  // Reported as plain fields so an unchanged status does not re-render the checkout.
  const statusEnabled = !!data?.enabled;
  const hasOptions = total > 0;
  useEffect(() => {
    onStatusChange?.({ enabled: statusEnabled, required, loading, failed, hasOptions });
    // `onStatusChange` is an inline closure on the checkout; only the values matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusEnabled, required, loading, failed, hasOptions]);

  // The shop has the feature switched off, or the address is not filled in yet.
  if (!data?.enabled && !loading && !failed) return null;

  /*
   * Filtered client-side, not by another request: the whole suggested set is
   * already here, it is at most a few dozen offices, and a customer typing an
   * area name wants the list to narrow as they type rather than after a round
   * trip. Matches name, address, area, city and pincode, because people look
   * these up by whichever of those they happen to remember.
   */
  const needle = filter.trim().toLowerCase();
  const visibleGroups = (data?.groups ?? [])
    .map((group) => ({
      ...group,
      points: needle
        ? group.points.filter((p) =>
            [p.name, p.address, p.area, p.city, p.pincode, p.landmark]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(needle),
          )
        : group.points,
    }))
    .filter((g) => g.points.length > 0);
  const visibleTotal = visibleGroups.reduce((n, g) => n + g.points.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display font-semibold text-body-lg text-surface-900 dark:text-surface-50">
          Where would you like to collect it?
        </h3>
        {data?.label && total > 0 && (
          <span className="text-caption text-surface-500 whitespace-nowrap">{data.label}</span>
        )}
      </div>

      <p className="text-body-sm text-surface-500 dark:text-surface-400">
        Fireworks cannot be delivered to your door, so your order travels by lorry to a parcel office. The
        driver will call you when it arrives.
      </p>

      {loading && (
        <div className="flex items-center gap-2 py-6 text-caption text-surface-500">
          <Loader2 size={15} className="animate-spin" /> Finding parcel offices near you…
        </div>
      )}

      {/* The lookup failed, not "there are none". Nothing is known about this
          address — whether an office is needed, or which — so the customer is
          asked to retry rather than carry on into a payment the server might
          refuse to turn into an order. */}
      {!loading && failed && (
        <Notice tone="amber">
          We could not load the parcel offices just now. Please try again — we need to know where you will
          collect this order before you pay.{' '}
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        </Notice>
      )}

      {!loading && !failed && data?.enabled && total === 0 && (
        <Notice tone="amber">
          {required
            ? 'We do not have a parcel office listed for your area yet, so this order cannot be placed online. Please contact us and we will arrange transport for you.'
            : 'We do not have a parcel office listed for your area yet. Continue with your order — we will arrange transport and call you with the collection details.'}
        </Notice>
      )}

      {!loading && total > 0 && (
        <>
          {/* Searching is the fast path once a list runs past a handful — a
              customer who knows their office by name should not have to scroll
              twenty cards to find it, and "Kappalur" or "625016" finds it in
              one go. */}
          {total > 5 && (
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search by office, area or pincode…"
                className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-surface-400 hover:text-surface-700 dark:hover:text-surface-200"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {/* The list scrolls inside itself rather than pushing Continue off
              the screen. Madurai alone returns twenty-two offices, and a
              checkout step that grows without limit is one the customer has to
              scroll past to finish paying. */}
          <div className="max-h-[22rem] overflow-y-auto pr-1 space-y-4 rounded-xl">
            {visibleGroups.map((group) => (
              <div key={group.service.id}>
                {/* Sticky so the line's name stays visible while its offices
                    scroll under it — otherwise a customer deep in the list has
                    no idea whose office they are looking at. */}
                <div className="sticky top-0 z-10 flex items-baseline gap-2 py-1.5 bg-white dark:bg-surface-900">
                  <span className="text-label uppercase tracking-wider text-surface-400 font-semibold">
                    {group.service.name}
                  </span>
                  {group.service.trackingMode === 'auto' && (
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      live tracking
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-surface-400">{group.label}</span>
                </div>
                <div className="space-y-2">
                  {group.points.map((point) => (
                    <PointCard
                      key={point.id}
                      point={point}
                      selected={value === point.id}
                      onSelect={() => onChange(point.id, point)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {visibleGroups.length === 0 && (
              <p className="py-6 text-center text-caption text-surface-400">
                No parcel office matches “{filter}”.
              </p>
            )}
          </div>

          <p className="text-caption text-surface-400">
            {filter
              ? `${visibleTotal} of ${total} offices`
              : `${total} parcel office${total === 1 ? '' : 's'} near you`}
          </p>
        </>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-caption text-red-600 dark:text-red-400">
          <AlertCircle size={13} /> {error}
        </p>
      )}
    </div>
  );
}

function PointCard({
  point,
  selected,
  onSelect,
}: {
  point: DropPoint;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'w-full text-left p-3.5 rounded-xl border transition-colors',
        selected
          ? 'border-brand-500 bg-brand-500/[0.06] dark:bg-brand-500/10'
          : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            selected ? 'border-brand-500 bg-brand-500' : 'border-surface-300 dark:border-surface-600',
          )}
        >
          {selected && <Check size={10} className="text-white" strokeWidth={3} />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-body-sm font-semibold text-surface-900 dark:text-surface-100">
            {point.name}
          </span>
          <span className="mt-0.5 flex items-start gap-1.5 text-caption text-surface-500 dark:text-surface-400">
            <MapPin size={12} className="mt-0.5 flex-shrink-0" />
            <span>
              {[point.address, point.area, point.city, point.pincode].filter(Boolean).join(', ')}
            </span>
          </span>

          {/* What the customer actually uses on collection day. */}
          {(point.phone || point.contactPerson) && (
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-surface-500 dark:text-surface-400">
              {point.phone && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Phone size={11} /> {point.phone}
                </span>
              )}
              {point.contactPerson && (
                <span className="inline-flex items-center gap-1">
                  <User size={11} /> Ask for {point.contactPerson}
                </span>
              )}
            </span>
          )}
        </span>
      </div>
    </button>
  );
}

function Notice({ tone, children }: { tone: 'amber'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 p-3 rounded-xl text-caption',
        tone === 'amber' && 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
      )}
    >
      <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}
