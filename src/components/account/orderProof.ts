/**
 * Reading the "proof of an order" a customer types — the order number and the
 * amount from their confirmation — the same way on every form that asks.
 */

/** The number as the server matches it: trimmed, without the "#" older orders are shown with. */
export function cleanOrderNumber(text: string): string {
  return text.trim().replace(/^#/, '');
}

/** The amount in rupees, or null when it is not a positive number. "₹2,450" and "2450.00" both read. */
export function parseOrderAmount(text: string): number | null {
  const value = Number(text.replace(/[₹,\s]/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}
