/**
 * The combo offer window — the dates a combo pack is on sale between.
 *
 * Nothing here has anything to do with `product.duration`, which is how long a
 * single shell burns for. This is the offer's own start and end, the thing a
 * shop means by "this pack runs till Diwali".
 *
 * The shop, its customers and its admins are all in one timezone, so the dates
 * are IST dates rather than instants: "until 5 Nov" has to stay live at 11pm on
 * the 5th no matter which timezone the browser reports. The <input type="date">
 * values are therefore widened here — start to the first instant of that IST
 * day, end to the last — and the server stores the instants that fall out.
 */

const IST_OFFSET_MINUTES = 330;
const DAY_MS = 24 * 60 * 60 * 1000;

/** How close to the end the storefront starts showing a countdown. */
export const COUNTDOWN_DAYS = 7;

export interface OfferWindow {
  offerStartsAt?: string | null;
  offerEndsAt?: string | null;
}

/** 'YYYY-MM-DD' (an <input type="date"> value) → the first instant of that IST day. */
export function istDayStart(ymd: string): string {
  return new Date(Date.parse(`${ymd}T00:00:00.000Z`) - IST_OFFSET_MINUTES * 60_000).toISOString();
}

/** 'YYYY-MM-DD' → the last instant of that IST day, so the end date is inclusive. */
export function istDayEnd(ymd: string): string {
  return new Date(Date.parse(`${ymd}T23:59:59.999Z`) - IST_OFFSET_MINUTES * 60_000).toISOString();
}

/** An instant back to the IST day it falls on, for putting into a date input. */
export function toIstDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** Today in IST, for `min` on the date inputs and for the presets. */
export function istToday(): string {
  return toIstDay(new Date().toISOString());
}

/** `days` on from an IST date — what the form's "runs for N days" presets set. */
export function addIstDays(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00.000Z`);
  return Number.isNaN(t) ? '' : new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

export type OfferState = 'always' | 'scheduled' | 'live' | 'ending' | 'ended';

export interface OfferStatus {
  state: OfferState;
  /** Whole IST days until the offer closes; null when it has no end. */
  daysLeft: number | null;
  /** Admin-facing summary, e.g. "Live until 5 Nov" or "Ended 3 days ago". */
  label: string;
}

/** Sellable right now — the same rule the server filters public lists by. */
export function isOfferLive(w: OfferWindow, now: number = Date.now()): boolean {
  const start = w.offerStartsAt ? Date.parse(w.offerStartsAt) : NaN;
  const end = w.offerEndsAt ? Date.parse(w.offerEndsAt) : NaN;
  if (!Number.isNaN(start) && start > now) return false;
  if (!Number.isNaN(end) && end < now) return false;
  return true;
}

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Kolkata',
});

/** '5 Nov' — how both the admin chips and the storefront name a date. */
export function formatOfferDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : dayFormat.format(new Date(t));
}

/**
 * Whole IST days between now and the offer's end — 0 on the last day, 1 when it
 * closes tomorrow night.
 *
 * Counted in calendar days rather than by dividing the remaining milliseconds,
 * because "ends in 1 day" has to mean tomorrow, not 24 hours from this instant.
 */
function daysUntil(endIso: string, now: number): number {
  const end = Date.parse(`${toIstDay(endIso)}T00:00:00.000Z`);
  const today = Date.parse(`${toIstDay(new Date(now).toISOString())}T00:00:00.000Z`);
  return Math.round((end - today) / DAY_MS);
}

/** Where a combo sits in its window, with the line the admin screens print. */
export function offerStatus(w: OfferWindow, now: number = Date.now()): OfferStatus {
  const start = w.offerStartsAt ? Date.parse(w.offerStartsAt) : NaN;
  const end = w.offerEndsAt ? Date.parse(w.offerEndsAt) : NaN;
  const hasStart = !Number.isNaN(start);
  const hasEnd = !Number.isNaN(end);

  if (hasEnd && end < now) {
    const ago = -daysUntil(w.offerEndsAt!, now);
    return {
      state: 'ended',
      daysLeft: 0,
      label: ago <= 0 ? 'Ended today' : ago === 1 ? 'Ended yesterday' : `Ended ${ago} days ago`,
    };
  }

  if (hasStart && start > now) {
    return {
      state: 'scheduled',
      daysLeft: hasEnd ? daysUntil(w.offerEndsAt!, now) : null,
      label: hasEnd
        ? `Starts ${formatOfferDate(w.offerStartsAt)} · ends ${formatOfferDate(w.offerEndsAt)}`
        : `Starts ${formatOfferDate(w.offerStartsAt)}`,
    };
  }

  if (!hasEnd) return { state: 'always', daysLeft: null, label: 'No end date' };

  const daysLeft = daysUntil(w.offerEndsAt!, now);
  return {
    state: daysLeft <= COUNTDOWN_DAYS ? 'ending' : 'live',
    daysLeft,
    label: `Live until ${formatOfferDate(w.offerEndsAt)}`,
  };
}

/**
 * The customer-facing countdown, or null when there is nothing worth saying.
 *
 * Only speaks inside the last week: a banner counting down from 40 days is
 * noise, and the urgency is the whole reason the shop sets an end date.
 */
export function countdownLabel(w: OfferWindow, now: number = Date.now()): string | null {
  const status = offerStatus(w, now);
  if (status.state !== 'ending' || status.daysLeft === null) return null;
  if (status.daysLeft <= 0) return 'Offer ends today';
  if (status.daysLeft === 1) return 'Offer ends tomorrow';
  return `Offer ends in ${status.daysLeft} days`;
}

/**
 * How long the offer runs, stated plainly — what a customer looking at a pack
 * for the first time wants to know, well before there is anything to count
 * down to. Null when the combo has no dates, or is over.
 */
export function validityLabel(w: OfferWindow, now: number = Date.now()): string | null {
  const status = offerStatus(w, now);
  if (status.state === 'scheduled') {
    return w.offerStartsAt ? `From ${formatOfferDate(w.offerStartsAt)}` : null;
  }
  if (status.state === 'always' || status.state === 'ended') return null;
  return w.offerEndsAt ? `Valid till ${formatOfferDate(w.offerEndsAt)}` : null;
}

export interface OfferBadge {
  text: string;
  /** Inside the last week — the shop's screens colour this one to stand out. */
  urgent: boolean;
}

/**
 * The single line to print wherever a combo is shown.
 *
 * The countdown wins once the offer is closing, because "ends in 2 days" is
 * what moves someone; the rest of the run states the date instead. One helper
 * so the modal, the announcement bar, the cards and the two detail pages can
 * never disagree about what a combo's dates mean.
 */
export function offerBadge(w: OfferWindow, now: number = Date.now()): OfferBadge | null {
  const countdown = countdownLabel(w, now);
  if (countdown) return { text: countdown, urgent: true };
  const validity = validityLabel(w, now);
  return validity ? { text: validity, urgent: false } : null;
}
