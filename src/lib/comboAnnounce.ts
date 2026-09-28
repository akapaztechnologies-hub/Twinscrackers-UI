/** How long a published combo pack counts as "new" for on-site announcements
 *  (banner, toast, homepage section) before it quietly stops being surfaced. */
export const NEW_COMBO_WINDOW_DAYS = 7;

/**
 * Is this combo new enough to announce?
 *
 * Dated from the offer's start where there is one, falling back to when the
 * combo was created. A pack built three weeks before Diwali and scheduled for
 * the 1st would otherwise have used up its whole "new" week sitting unpublished
 * and would go on sale announced by nothing.
 */
export function isWithinWindow(
  createdAt: string | undefined,
  days: number = NEW_COMBO_WINDOW_DAYS,
  offerStartsAt?: string | null,
): boolean {
  const since = offerStartsAt || createdAt;
  if (!since) return false;
  const started = new Date(since).getTime();
  if (Number.isNaN(started)) return false;
  return Date.now() - started <= days * 24 * 60 * 60 * 1000;
}
