/**
 * How an order is named on screen.
 *
 * Orders carry an `ORD-YYMM-#####` from the moment they are placed. Ones
 * placed before that series existed have none until the backfill has run, and
 * for those the old display — the first eight characters of the Mongo id — is
 * still the only handle there is.
 *
 * Every screen goes through here so the two cases are written once, and so the
 * `#` that used to be typed in front of the id does not end up in front of a
 * number that already reads as one.
 */
export function orderRef(order: { orderNumber?: string; id?: string; _id?: string } | null | undefined): string {
  if (!order) return '—';
  if (order.orderNumber?.trim()) return order.orderNumber.trim();

  const id = String(order.id ?? order._id ?? '');
  return id ? `#${id.slice(0, 8).toUpperCase()}` : '—';
}
