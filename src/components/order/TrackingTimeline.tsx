import { Truck, CheckCircle2, MapPin, Clock, Circle } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import type { TrackingEvent } from '@/types/index.ts';

/**
 * Vertical courier-tracking timeline shared by the admin order detail, the
 * customer order detail, and the public /track-order page. Events are expected
 * newest-first (as scraped from the courier); index 0 is the current state.
 */
export function TrackingTimeline({
  events,
  emptyText = 'No tracking updates yet. Press “Check status” to fetch the latest from the courier.',
}: {
  events?: TrackingEvent[];
  emptyText?: string;
}) {
  if (!events || events.length === 0) {
    return <p className="text-body-sm text-surface-400 dark:text-surface-500">{emptyText}</p>;
  }

  return (
    <div className="relative">
      {events.map((e, i) => {
        const isCurrent = i === 0;
        const delivered = /delivered/i.test(e.description);
        return (
          <div key={`${e.timestamp || ''}-${i}`} className="flex gap-3 pb-5 last:pb-0">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10',
                  delivered
                    ? 'bg-green-500 text-white'
                    : isCurrent
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-200 dark:bg-surface-700 text-surface-500 dark:text-surface-400',
                )}
              >
                {delivered ? <CheckCircle2 size={15} /> : isCurrent ? <Truck size={15} /> : <Circle size={12} />}
              </div>
              {i < events.length - 1 && <div className="w-0.5 flex-1 mt-1 bg-surface-200 dark:bg-surface-700" />}
            </div>
            <div className="pb-1 min-w-0 flex-1">
              <p
                className={cn(
                  'text-body-sm font-medium break-words',
                  isCurrent ? 'text-surface-900 dark:text-surface-100' : 'text-surface-600 dark:text-surface-300',
                )}
              >
                {e.description}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-caption text-surface-400">
                {e.timestamp && (
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} /> {e.timestamp}
                  </span>
                )}
                {e.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={11} /> {e.location}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
