/**
 * The one definition of how a bill's money is worked out.
 *
 * Mirrored verbatim from the backend's `modules/billing/pricing.ts`. The counter
 * has to show the same grand total it is about to post, and the invoice editor
 * has to preview an edit before saving it — so this runs client-side too. The
 * server always recomputes; this copy is never trusted for what is stored. Both
 * copies must change together.
 *
 * Order matters and is the order a customer would expect at the counter:
 *   subtotal -> manual discount -> coupon -> taxable -> GST -> delivery -> round
 */

export type TaxKind = 'intra' | 'inter';

export interface PricingLine {
  /** Rate for one unit — one piece, or one full case in case mode. */
  unitPrice: number;
  /** Units sold: pieces, or cases in case mode. */
  quantity: number;
}

export interface PricingInput {
  lines: PricingLine[];
  discountPercent: number;
  couponDiscount: number;
  packagingFee: number;
  deliveryCharge: number;
  gst: { mode?: 'percent' | 'flat'; rate?: number; amount?: number };
  /**
   * 'inter' moves the whole GST amount into IGST and leaves CGST/SGST at zero.
   * The split is presentational — the tax charged is identical either way, so
   * the grand total never depends on which one applies.
   */
  taxKind?: TaxKind;
  /**
   * Replaces the derived round-off when the admin types one on an editable
   * invoice. The derived value is what makes the printed lines add up, so an
   * override is deliberately narrow: it moves the grand total and nothing else.
   */
  manualRoundOff?: number;
}

export interface PricedLine extends PricingLine {
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
}

export interface PricingResult {
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  taxKind: TaxKind;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  gstMode: 'percent' | 'flat';
  /** Effective total GST % — entered directly, or derived from a flat amount. */
  gstRate: number;
  gstAmount?: number;
  deliveryCharge: number;
  grandTotal: number;
  roundOff: number;
  lines: PricedLine[];
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Split `total` across lines in proportion to `weights` so the shares add up to
 * `total` exactly (largest-remainder method), and — when `caps` is given — no
 * line's share ever passes its cap.
 *
 * Rounding each line on its own is what used to make the printed lines disagree
 * with the printed total — three ₹5 lines at 10% off each rounded ₹0.50 up to ₹1,
 * taking ₹3 off lines whose bill only took ₹2 — and could leave the last line of
 * a coupon split negative. Whole rupees are handed out first, largest fraction
 * first; any paise left over (a flat GST split) go to the line next in line.
 *
 * Worked in whole paise, so the sum is exact rather than float-close. The caps
 * are what keep a discount or coupon from taking more off a line than the line
 * is worth: with paise prices a whole-rupee share could otherwise overshoot a
 * ₹99.50 line by 50 paise and leave it negative.
 */
export function allocate(total: number, weights: number[], caps?: number[]): number[] {
  const toPaise = (n: number) => Math.round(n * 100);
  const totalP = toPaise(total);
  const weightP = weights.map((w) => Math.max(0, toPaise(w)));
  const sumW = weightP.reduce((s, w) => s + w, 0);
  if (totalP <= 0 || sumW <= 0) return weights.map(() => 0);

  const capP = weightP.map((_, i) => (caps ? Math.max(0, toPaise(caps[i] ?? 0)) : Infinity));
  const exact = weightP.map((w) => (totalP * w) / sumW);
  // Whole rupees first, never past a line's exact share or its cap.
  const shares = exact.map((e, i) => Math.min(capP[i], Math.floor(e / 100 + 1e-9) * 100));
  let left = totalP - shares.reduce((s, v) => s + v, 0);

  const order = exact
    .map((e, i) => ({ i, frac: e - shares[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
    .filter(({ i }) => weightP[i] > 0);

  // One more rupee each to the largest remainders, where the line has room.
  let progress = true;
  while (left >= 100 && progress) {
    progress = false;
    for (const { i } of order) {
      if (left < 100) break;
      if (shares[i] + 100 > capP[i]) continue;
      shares[i] += 100;
      left -= 100;
      progress = true;
    }
  }
  // Then the paise, in the same order, each line only up to its room.
  for (const { i } of order) {
    if (left <= 0) break;
    const take = Math.min(left, capP[i] - shares[i]);
    if (take <= 0) continue;
    shares[i] += take;
    left -= take;
  }
  // Only reachable when the caps cannot hold the total, which computeBillTotals
  // never asks for; the total still wins, so the lines add up.
  if (left > 0 && order.length) shares[order[0].i] += left;

  return shares.map((p) => p / 100);
}

export function computeBillTotals(input: PricingInput): PricingResult {
  const lines = input.lines ?? [];
  // Capped at 100: past it the "discount" becomes a payment to the customer and
  // every figure below goes negative.
  const discountPercent = Math.min(100, Math.max(0, safeNumber(input.discountPercent)));
  const packagingFee = Math.max(0, safeNumber(input.packagingFee));
  const deliveryCharge = Math.max(0, safeNumber(input.deliveryCharge));
  const taxKind: TaxKind = input.taxKind === 'inter' ? 'inter' : 'intra';

  // Each line to the paisa, and the subtotal as their sum, so the lines and the
  // totals below are built from exactly the same figures.
  const lineSubtotals = lines.map((l) => round2(safeNumber(l.unitPrice) * safeNumber(l.quantity)));
  const subtotal = round2(lineSubtotals.reduce((sum, v) => sum + v, 0));
  // Never more than the subtotal: at 100% a paise subtotal (₹99.50) would round
  // to a ₹100 discount and price the bill below zero.
  const totalDiscount = Math.min(subtotal, Math.round(subtotal * (discountPercent / 100)));
  const afterManual = round2(subtotal - totalDiscount);

  // A coupon stacks on the cashier's discount and is worked out on what is left
  // after it. Clamped so a stale coupon can never drive the taxable base below 0.
  const couponDiscount = Math.min(Math.max(0, safeNumber(input.couponDiscount)), afterManual);
  const taxableAmount = round2(afterManual - couponDiscount);
  const taxBase = taxableAmount + packagingFee;

  // Both GST modes reduce to "half the tax as a fraction of taxBase", so every
  // total and line below is computed once instead of branching on mode. In
  // 'inter' mode that same figure is doubled back into a single IGST amount.
  const gstMode = input.gst?.mode === 'flat' ? 'flat' : 'percent';
  let gstHalf: number;
  let gstRate: number;
  let gstAmount: number | undefined;

  if (gstMode === 'flat') {
    const flat = Math.max(0, safeNumber(input.gst?.amount));
    gstHalf = taxBase > 0 ? flat / 2 / taxBase : 0;
    gstRate = taxBase > 0 ? Math.round((flat / taxBase) * 10000) / 100 : 0;
    gstAmount = flat;
  } else {
    gstRate = Math.max(0, safeNumber(input.gst?.rate, 18));
    gstHalf = gstRate / 2 / 100;
  }

  // A percent rate rounds each half to whole rupees, as it always has. A flat
  // amount is what the cashier typed, so it is split to the paisa instead: rounding
  // ₹101 into two whole halves charged ₹102 (or ₹100) — never the ₹101 entered.
  const roundHalf = gstMode === 'flat' ? round2 : Math.round;
  const half = roundHalf(taxBase * gstHalf);
  const totalCgst = taxKind === 'intra' ? half : 0;
  const totalSgst = taxKind === 'intra' ? half : 0;
  const totalIgst = taxKind === 'inter' ? half * 2 : 0;

  // Delivery / courier is a non-taxable pass-through added after GST.
  const rawTotal = taxBase + totalCgst + totalSgst + totalIgst + deliveryCharge;
  const derivedTotal = Math.round(rawTotal);
  const hasManualRoundOff = input.manualRoundOff !== undefined && Number.isFinite(input.manualRoundOff);
  const roundOff = hasManualRoundOff
    ? Math.round(safeNumber(input.manualRoundOff) * 100) / 100
    : Math.round((derivedTotal - rawTotal) * 100) / 100;
  const grandTotal = hasManualRoundOff ? Math.round((rawTotal + roundOff) * 100) / 100 : derivedTotal;

  // The manual discount, the coupon and the tax are each worked out once on the
  // whole bill and then shared across the lines (see `allocate`), so the printed
  // lines add up to the printed totals. The packaging fee has no line of its own,
  // so its share of the tax stays in the totals only: the lines carry the tax on
  // the goods, which is the whole tax whenever there is no packaging fee.
  // Discount and coupon are capped at what each line is worth, so no line is
  // ever priced below zero.
  const lineDiscounts = allocate(totalDiscount, lineSubtotals, lineSubtotals);
  const afterManualLines = lineSubtotals.map((s, i) => round2(s - lineDiscounts[i]));
  const lineCoupons = allocate(couponDiscount, afterManualLines, afterManualLines);
  const lineTaxables = afterManualLines.map((a, i) => round2(a - lineCoupons[i]));
  const goodsHalf = packagingFee > 0 ? Math.min(half, roundHalf(taxableAmount * gstHalf)) : half;
  const lineHalves = allocate(goodsHalf, lineTaxables);

  const pricedLines: PricedLine[] = lines.map((line, index) => {
    const lineTaxable = lineTaxables[index];
    const lineHalf = lineHalves[index];
    const cgstAmount = taxKind === 'intra' ? lineHalf : 0;
    const sgstAmount = taxKind === 'intra' ? lineHalf : 0;
    const igstAmount = taxKind === 'inter' ? lineHalf * 2 : 0;

    return {
      ...line,
      taxableValue: lineTaxable,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalAmount: lineTaxable + cgstAmount + sgstAmount + igstAmount,
    };
  });

  return {
    subtotal,
    totalDiscount,
    taxableAmount,
    taxKind,
    totalCgst,
    totalSgst,
    totalIgst,
    gstMode,
    gstRate,
    ...(gstAmount !== undefined ? { gstAmount } : {}),
    deliveryCharge,
    grandTotal,
    roundOff,
    lines: pricedLines,
  };
}

/**
 * Pieces a line moves off the shelf.
 *
 * The reason `unit` exists on a bill item at all: in case mode `quantity` counts
 * cases, and decrementing stock by it would take 3 pieces off for a 3-case sale.
 */
export function piecesFor(item: { quantity: number; unit?: string; piecesPerCase?: number }): number {
  const multiplier = item.unit === 'case' ? Math.max(1, safeNumber(item.piecesPerCase, 1)) : 1;
  return safeNumber(item.quantity) * multiplier;
}
