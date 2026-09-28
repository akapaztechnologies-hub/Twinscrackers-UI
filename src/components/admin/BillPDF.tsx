import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { Bill } from '@/types/admin.ts';
import { useSiteStore } from '@/store/site.ts';
import { pdfLogoSrc } from '@/lib/pdfLogo.ts';
import { buildPdfColors, lighten, pdfWebsite, pdfJoin, type PdfColors } from '@/lib/pdfTheme.ts';
import { InvoiceLetterheadPdf } from '@/components/admin/InvoiceLetterheadPdf.tsx';
import { toLetterhead } from '@/types/invoiceLetterhead.ts';
import { numberToWords } from '@/lib/numberToWords.ts';
import { gstinStateCode, gstinStateName } from '@/lib/gstin.ts';

// ─── Helpers ───

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ─── Styles (built per-render so the admin's accent color flows through) ───

/**
 * Room the fixed bottom bar needs, so the last item rows stop above it.
 *
 * The bar is absolute, so nothing in the flow knows its height: at a flat 80pt
 * the two-row bar already overlapped the lowest line on a full page, and every
 * extra row (the discount breakdown, the quotation notice) covered more of it.
 */
function bottomReserve(extraRows: number): number {
  return 96 + extraRows * 20;
}

function makeStyles(C: PdfColors, extraBarRows = 0) {
  return StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: C.text,
    paddingTop: 24,
    paddingBottom: bottomReserve(extraBarRows),
    paddingHorizontal: 28,
  },

  // The ruled box around the whole sheet. Absolute and `fixed` so it frames
  // every page without taking part in the flow — a bordered wrapper would push
  // the absolute bottom bar out of its corner.
  pageFrame: {
    position: 'absolute',
    top: 14,
    left: 16,
    right: 16,
    bottom: 24,
    border: `1.4 solid ${C.primary}`,
    borderRadius: 8,
  },

  // Classic letterhead — the shop's printed head, matching the wholesale pad.
  letterhead: {
    // -12 = the 28pt page padding less the 16pt frame inset: flush to the frame,
    // never past it.
    marginHorizontal: -12,
    marginTop: 0,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
    minHeight: 108,
    borderBottom: `1.4 solid ${C.primary}`,
  },
  // Header band
  headerBand: {
    backgroundColor: C.primary,
    marginHorizontal: -28,
    marginTop: -24,
    paddingVertical: 16,
    paddingHorizontal: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  shopName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: C.white,
    letterSpacing: 1,
  },
  shopTagline: {
    fontSize: 8,
    color: C.primaryTintStrong,
    marginTop: 2,
  },
  shopDetail: {
    fontSize: 7,
    color: C.primaryTintSoft,
    marginTop: 1,
  },
  invoiceLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: C.white,
    textAlign: 'right',
  },
  invoiceMeta: {
    fontSize: 7.5,
    color: C.primaryTintSoft,
    textAlign: 'right',
    marginTop: 2,
  },

  // Info row (3 columns)
  infoRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 8,
  },
  infoBox: {
    flex: 1,
    border: `1 solid ${C.primary}`,
    borderRadius: 5,
    padding: 8,
  },
  infoTitle: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 8.5,
    color: C.dark,
    fontFamily: 'Helvetica-Bold',
    marginTop: 1.5,
  },
  infoMuted: {
    fontSize: 8,
    color: C.text,
    marginTop: 1.5,
  },

  // Table
  // The grid is one ruled box: an outer border, a rule under every row, and a
  // divider between every column. Cells carry the padding so those dividers
  // run the full height of the row.
  tableBox: {
    marginTop: 12,
    border: `1 solid ${C.primary}`,
    borderRadius: 5,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.primary,
  },
  tableHeaderText: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    paddingVertical: 6,
    paddingHorizontal: 7,
    borderRight: `0.7 solid ${C.white}`,
  },
  tableRow: {
    flexDirection: 'row',
    borderTop: `0.7 solid ${C.primary}`,
  },
  tableRowAlt: {
    backgroundColor: C.light,
  },
  tableCell: {
    fontSize: 9,
    color: C.dark,
    paddingVertical: 6,
    paddingHorizontal: 7,
    borderRight: `0.7 solid ${C.primary}`,
  },
  tableCellBold: {
    fontSize: 9,
    color: C.dark,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 6,
    paddingHorizontal: 7,
    borderRight: `0.7 solid ${C.primary}`,
  },
  // The last cell in a row stops at the box's own border rather than drawing a
  // second rule beside it.
  cellLast: { borderRight: 'none' },

  // Packing slip only: the tick box a packer marks. react-pdf has no <input>, so
  // it is a drawn square inside a cell that carries the row's column rule.
  colPack: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRight: `0.7 solid ${C.primary}`,
  },
  checkbox: { width: 10, height: 10, border: `0.9 solid ${C.dark}`, borderRadius: 1 },

  // Columns: #, Item, Qty, Rate, Disc, Amount.
  // Centred rather than right-aligned, and wider than they were: each cell now
  // carries its own padding, so a right-aligned figure would sit hard against
  // the divider to its right instead of inside its column.
  colSno:  { width: 32, textAlign: 'center' },
  colName: { flex: 1 },
  colQty:  { width: 58, textAlign: 'center' },
  colRate: { width: 74, textAlign: 'center' },
  colDisc: { width: 66, textAlign: 'center' },
  colAmt:  { width: 84, textAlign: 'center' },

  // Bottom bar (fixed)
  bottomBar: {
    position: 'absolute',
    bottom: 34,
    left: 28,
    right: 28,
    borderRadius: 5,
    overflow: 'hidden',
  },
  bottomRow1: {
    flexDirection: 'row',
    backgroundColor: C.primary,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  bottomCol: {
    flex: 1,
    alignItems: 'center',
    borderRight: `0.7 solid ${C.white}`,
    paddingHorizontal: 4,
  },
  bottomColLast: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  bottomColLabel: {
    fontSize: 7,
    color: C.primaryTintStrong,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bottomColValue: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: C.white,
    marginTop: 1,
  },
  bottomColGrandValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: C.white,
    marginTop: 1,
    letterSpacing: 0.3,
  },
  bottomRow2: {
    backgroundColor: C.primaryDeep,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  bottomWordsText: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#FECACA',
    textAlign: 'center',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 9,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 7,
    color: C.text,
    textAlign: 'center',
  },

  subDivider: {
    borderTop: `0.5 solid ${C.border}`,
    marginTop: 4,
    paddingTop: 4,
  },
  });
}

// ─── Component ───

/**
 * `isPackingSlip` prints an online order's packing slip through this same
 * component, so the slip is the invoice plus a tick box per line — every change
 * to the invoice template (letterhead, colours, terms, footer) reaches both.
 */
/**
 * The quotation stationery, when this is printing one.
 *
 * Passed in rather than read from the store because the quotation template
 * lives in Content, not in site config, and only the callers that know they are
 * printing a quotation should pay to fetch it. Everything here is optional —
 * an estimate printed without it falls back to the invoice's own wording,
 * which is what happened before there was a quotation template at all.
 */
export interface EstimateChrome {
  /** Boxed title, from Settings → Quotation Template. */
  docTitle?: string;
  /** ISO date printed under the number. */
  validUntil?: string;
  /** Replaces the invoice's standing terms on a quotation. */
  terms?: string;
  /** The "this is not a tax invoice" line, printed under the totals. */
  notice?: string;
}

export function BillPDF({
  bill,
  isEstimate = false,
  isPackingSlip = false,
  estimate,
}: {
  bill: Bill;
  isEstimate?: boolean;
  isPackingSlip?: boolean;
  /** Only read when `isEstimate` is on. */
  estimate?: EstimateChrome;
}) {
  const siteConfig = useSiteStore.getState().config;
  const tpl = siteConfig.invoiceTemplate;
  // The shop's classic letterhead, printed in place of the coloured band when
  // Content -> Invoice has it switched on — the same head the wholesale pad
  // uses, so a retail customer and a wholesale one get the same stationery.
  const useLetterhead = Boolean(tpl?.useLetterhead);
  const letterhead = toLetterhead(tpl?.letterhead);
  // One document, one colour. With the letterhead on, its ink drives the table
  // head, the totals bar AND every rule on the sheet — a blue letterhead above
  // grey boxes and a red table reads as three documents stapled together. The
  // rules take a wash of the ink rather than the ink itself, so they frame the
  // content instead of competing with it.
  /**
   * The editable printed face of this bill, when it has one.
   *
   * Stored under `caseInvoice` for historical reasons — it was built for the
   * wholesale pad — but every billing mode carries one now, which is what lets
   * a retail invoice's number, date, party details and notes be corrected after
   * it was raised. None of it is money; the Bill still owns every figure.
   */
  const layout = bill.caseInvoice;

  // What the customer's total is made of, between the subtotal and the tax.
  // None of it was printed: a 60% discount or a coupon left the bottom bar
  // reading "Subtotal ₹10,000 … Grand Total ₹4,720" with nothing between.
  const couponOff = bill.couponDiscount ?? 0;
  const roundOff = bill.roundOff ?? 0;
  const showBreakdown = bill.totalDiscount > 0 || couponOff > 0 || Math.abs(roundOff) >= 0.005;
  const extraBarRows = (showBreakdown ? 1 : 0) + (isEstimate && estimate?.notice ? 1 : 0);

  const C = buildPdfColors(useLetterhead ? letterhead.inkColor : tpl?.accentColor);
  const s = makeStyles(useLetterhead ? { ...C, border: lighten(C.primary, 0.72) } : C, extraBarRows);
  // Resolved ahead of render by `preparePdfLogo()`. Undefined means every
  // candidate failed, and the header lays out without a mark rather than
  // reserving a gap for an image that will never arrive.
  const logoSrc = pdfLogoSrc();
  const gstRate = bill.gstRate ?? 18;
  const gstHalf = gstRate / 2;
  // An inter-state sale prints one IGST figure instead of the CGST+SGST pair.
  // The printed page's own split wins — the layout editor is where it is
  // changed, and on a quotation it can be changed without re-pricing — then the
  // bill's flag. `taxKind` is absent on every bill raised before the counter
  // could set it, so a non-zero IGST amount is the last fallback: a 0%
  // inter-state bill has an amount of zero and only the flag to go on.
  const splitKind = layout?.taxKind ?? bill.taxKind;
  const isInterState = splitKind ? splitKind === 'inter' : (bill.totalIgst ?? 0) > 0;
  // The same rupees under whichever split prints. Reading IGST off a bill that
  // was priced CGST+SGST (or the reverse) printed its tax as nil.
  const gstTotal = (bill.totalCgst ?? 0) + (bill.totalSgst ?? 0) + (bill.totalIgst ?? 0);
  const printIgst = isInterState ? gstTotal : 0;
  const printCgst = isInterState ? 0 : (bill.totalIgst ?? 0) > 0 ? gstTotal / 2 : (bill.totalCgst ?? 0);
  const printSgst = isInterState ? 0 : (bill.totalIgst ?? 0) > 0 ? gstTotal / 2 : (bill.totalSgst ?? 0);
  // The shop's own HSN and state, not a hard-coded "3604" and "Tamil Nadu (33)":
  // the same app prints for more than one shop. The page's HSN first, then the
  // shop's (Settings → Tax), then the fireworks HSN the server also defaults to.
  const shopHsn = (siteConfig as { hsnCode?: string }).hsnCode;
  const hsnCode = layout?.hsnCode?.trim() || shopHsn?.trim() || '3604';
  const shopStateCode = gstinStateCode(siteConfig.gstin);
  const shopState = gstinStateName(siteConfig.gstin);
  // A quotation prints its own terms when it has them — the invoice's terms
  // are about a sale that has happened, which is not what this document is.

  const termsSource = isEstimate && estimate?.terms ? estimate.terms : tpl?.termsText || '';
  const termsLines = termsSource.split('\n').map((l) => l.trim()).filter(Boolean);
  const bankLines = (tpl?.bankDetails || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const footerNote = tpl?.footerNote || 'Computer-generated invoice';
  const domain = pdfWebsite(tpl?.website, siteConfig.url);
  return (
    <Document>
      <Page size="A4" style={s.page} wrap>

        {/* The ruled box around the sheet. `fixed` repeats it on every page. */}
        <View style={s.pageFrame} fixed />

        {/* ═══ CLASSIC LETTERHEAD ═══
            Not `fixed`: unlike the band, a full letterhead on every page of a
            long bill would cost more room than the continuation is worth.
            No number/date row either — this document already prints both in
            the Invoice card immediately below, unlike the wholesale pad. */}
        {useLetterhead && (
          <View style={s.letterhead}>
            <InvoiceLetterheadPdf
              letterhead={letterhead}
              contentWidth={535}
              titleOverride={
                isEstimate ? estimate?.docTitle || 'QUOTATION' : isPackingSlip ? 'PACKING SLIP' : undefined
              }
            />
          </View>
        )}

        {/* ═══ RED HEADER BAND (repeats on every page) ═══ */}
        {!useLetterhead && (
        <View style={s.headerBand} fixed>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {logoSrc ? <Image src={logoSrc} style={{ width: 40, height: 40, marginRight: 8 }} /> : null}
            <View>
              <Text style={s.shopName}>{siteConfig.name.toUpperCase()}</Text>
              <Text style={s.shopTagline}>{siteConfig.tagline}</Text>
              <Text style={s.shopDetail}>{siteConfig.contact.address}</Text>
              <Text style={s.shopDetail}>{pdfJoin([siteConfig.contact.phone && `Ph: ${siteConfig.contact.phone}`, domain], ' | ')}</Text>
            </View>
          </View>
          <View>
            <Text style={s.invoiceLabel}>
              {isEstimate
                ? estimate?.docTitle || 'QUOTATION'
                : isPackingSlip
                  ? 'ORDER COPY / PACKING SLIP'
                  : 'TAX INVOICE'}
            </Text>
            {isEstimate || isPackingSlip ? (
              <Text style={s.invoiceMeta}>Not a Tax Invoice</Text>
            ) : (
              <>
                <Text style={s.invoiceMeta}>HSN: {hsnCode} | GST: {bill.gstMode === 'flat' ? 'Flat' : `${gstRate}%`}</Text>
                {siteConfig.gstin ? <Text style={s.invoiceMeta}>GSTIN: {siteConfig.gstin}</Text> : null}
              </>
            )}
          </View>
        </View>
        )}

        {/* ═══ INFO ROW: Invoice | Customer + Payment | Terms ═══ */}
        <View style={s.infoRow}>
          {/* Invoice Details */}
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>{isEstimate ? 'Quotation' : isPackingSlip ? 'Order' : 'Invoice'}</Text>
            {/* The layout editor's number and date win over the bill's own.
                Without this, editing a retail invoice's printed layout changed
                the stored fields and nothing on the paper. `billNumber` stays
                the internal key either way. */}
            <Text style={s.infoValue}>{layout?.displayNumber || bill.billNumber}</Text>
            <Text style={s.infoValue}>{fmtDate(layout?.invoiceDate || bill.createdAt)}</Text>
            {/* A quotation with no end date on it is one the shop can be held
                to at last year's prices. */}
            {isEstimate && estimate?.validUntil ? (
              <Text style={s.infoValue}>Valid until {fmtDate(estimate.validUntil)}</Text>
            ) : null}
            {shopState ? <Text style={s.infoMuted}>{shopState} ({shopStateCode})</Text> : null}
          </View>

          {/* Customer (& Payment, on anything that has actually been paid) */}
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>{isEstimate ? 'Customer' : 'Customer & Payment'}</Text>
            {/* A retail counter sale paid on the spot no longer has to name
                anybody, so the box says what it is rather than sitting blank. */}
            <Text style={s.infoValue}>{bill.customerName || 'Walk-in Customer'}</Text>
            <Text style={s.infoMuted}>{bill.customerPhone}</Text>
            {bill.customerAddress ? <Text style={s.infoMuted}>{bill.customerAddress}</Text> : null}
            {/* Corrected in the layout editor. A buyer's GSTIN on the invoice is
                what lets them claim the input credit, so it has to print. */}
            {layout?.partyGstin ? <Text style={s.infoMuted}>GSTIN: {layout.partyGstin}</Text> : null}
            {layout?.partyState ? <Text style={s.infoMuted}>{layout.partyState}</Text> : null}
            {layout?.transport ? <Text style={s.infoMuted}>Transport: {layout.transport}</Text> : null}
            {/* No payment block on a quotation. Nothing has been paid, and
                printing "Paid via CASH" on an offer is both wrong and the kind
                of wrong a customer will quote back at the shop. */}
            {!isEstimate && (
              <View style={s.subDivider}>
                <Text style={s.infoValue}>Paid via {bill.payment.method.toUpperCase()}</Text>
                {bill.payment.reference ? (
                  <Text style={s.infoMuted}>Ref: {bill.payment.reference}</Text>
                ) : null}
                {bill.payment.receivedAmount != null && bill.payment.method === 'cash' && (
                  <Text style={s.infoMuted}>Received: Rs. {fmt(bill.payment.receivedAmount)}{bill.payment.changeAmount && bill.payment.changeAmount > 0 ? `  |  Change: Rs. ${fmt(bill.payment.changeAmount)}` : ''}</Text>
                )}
              </View>
            )}
          </View>

          {/* Terms */}
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>Terms</Text>
            {termsLines.map((line, i) => (
              <Text key={i} style={s.infoMuted}>{i + 1}. {line}</Text>
            ))}
            {/* Whatever was typed against this one bill, under the standing
                terms it applies on top of. */}
            {layout?.notes ? <Text style={s.infoMuted}>{layout.notes}</Text> : null}
            <Text style={s.infoMuted}>E. & O.E.</Text>
            {bankLines.length > 0 && (
              <View style={s.subDivider}>
                <Text style={s.infoTitle}>Bank Details</Text>
                {bankLines.map((line, i) => (
                  <Text key={i} style={s.infoMuted}>{line}</Text>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ═══ ITEMS GRID ═══ */}
        <View style={s.tableBox}>
          <View style={s.tableHeader}>
            {isPackingSlip && (
              <Text style={[s.tableHeaderText, { width: 38, textAlign: 'center' }]}>Pack</Text>
            )}
            <Text style={[s.tableHeaderText, s.colSno]}>#</Text>
            <Text style={[s.tableHeaderText, s.colName]}>Item</Text>
            <Text style={[s.tableHeaderText, s.colQty]}>Qty</Text>
            <Text style={[s.tableHeaderText, s.colRate]}>Rate</Text>
            {bill.discountPercent > 0 && (
              <Text style={[s.tableHeaderText, s.colDisc]}>Disc ({bill.discountPercent}%)</Text>
            )}
            <Text style={[s.tableHeaderText, s.colAmt, s.cellLast]}>Amount</Text>
          </View>

          {bill.items.map((item, i) => {
            const lineTotal = item.unitPrice * item.quantity;
            const lineDiscount = bill.discountPercent > 0 ? Math.round(lineTotal * bill.discountPercent / 100) : 0;
            return (
              <View key={item.productId + i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]} wrap={false}>
                {isPackingSlip && (
                  <View style={s.colPack}>
                    <View style={s.checkbox} />
                  </View>
                )}
                <Text style={[s.tableCell, s.colSno]}>{i + 1}</Text>
                <Text style={[s.tableCellBold, s.colName]}>{item.name}</Text>
                <Text style={[s.tableCell, s.colQty]}>{item.quantity}</Text>
                <Text style={[s.tableCell, s.colRate]}>{fmt(item.unitPrice)}</Text>
                {bill.discountPercent > 0 && (
                  <Text style={[s.tableCell, s.colDisc, { color: '#16A34A' }]}>-{fmt(lineDiscount)}</Text>
                )}
                <Text style={[s.tableCellBold, s.colAmt, s.cellLast]}>{fmt(lineTotal - lineDiscount)}</Text>
              </View>
            );
          })}
        </View>

        {/* ═══ BOTTOM BAR (fixed at bottom on every page) ═══ */}
        <View style={s.bottomBar} fixed>
          {/* Row 1 — columns */}
          <View style={s.bottomRow1}>
            <View style={s.bottomCol}>
              <Text style={s.bottomColLabel}>Products</Text>
              <Text style={s.bottomColValue}>{bill.itemCount}</Text>
            </View>
            {isInterState ? (
              <View style={s.bottomCol}>
                <Text style={s.bottomColLabel}>{bill.gstMode === 'flat' ? 'IGST' : `IGST @ ${gstRate}%`}</Text>
                <Text style={s.bottomColValue}>Rs. {fmt(printIgst)}</Text>
              </View>
            ) : (
              <>
                <View style={s.bottomCol}>
                  <Text style={s.bottomColLabel}>{bill.gstMode === 'flat' ? 'CGST' : `CGST @ ${gstHalf}%`}</Text>
                  <Text style={s.bottomColValue}>Rs. {fmt(printCgst)}</Text>
                </View>
                <View style={s.bottomCol}>
                  <Text style={s.bottomColLabel}>{bill.gstMode === 'flat' ? 'SGST' : `SGST @ ${gstHalf}%`}</Text>
                  <Text style={s.bottomColValue}>Rs. {fmt(printSgst)}</Text>
                </View>
              </>
            )}
            {bill.packagingFee > 0 && (
              <View style={s.bottomCol}>
                <Text style={s.bottomColLabel}>Packaging</Text>
                <Text style={s.bottomColValue}>Rs. {fmt(bill.packagingFee)}</Text>
              </View>
            )}
            {(bill.deliveryCharge ?? 0) > 0 && (
              <View style={s.bottomCol}>
                <Text style={s.bottomColLabel}>{bill.courierDelivery ? 'Courier' : 'Delivery'}</Text>
                <Text style={s.bottomColValue}>Rs. {fmt(bill.deliveryCharge ?? 0)}</Text>
              </View>
            )}
            <View style={s.bottomCol}>
              <Text style={s.bottomColLabel}>Total Qty</Text>
              <Text style={s.bottomColValue}>{bill.totalQuantity}</Text>
            </View>
            <View style={s.bottomCol}>
              <Text style={s.bottomColLabel}>Subtotal</Text>
              <Text style={s.bottomColValue}>Rs. {fmt(bill.subtotal)}</Text>
            </View>
            <View style={s.bottomColLast}>
              <Text style={s.bottomColLabel}>Grand Total</Text>
              <Text style={s.bottomColGrandValue}>Rs. {fmt(bill.grandTotal)}</Text>
            </View>
          </View>
          {/* Row 1b — from the subtotal to the taxable value, so the bar adds up:
              Subtotal − Discount − Coupon = Taxable, + tax + charges ± round-off
              = Grand Total. Only printed when there is something in between. */}
          {showBreakdown ? (
            <View style={s.bottomRow2}>
              <Text style={s.bottomWordsText}>
                {pdfJoin(
                  [
                    bill.totalDiscount > 0
                      ? `Discount (${bill.discountPercent}%): -Rs. ${fmt(bill.totalDiscount)}`
                      : undefined,
                    couponOff > 0
                      ? `Coupon${bill.couponCode ? ` ${bill.couponCode}` : ''}: -Rs. ${fmt(couponOff)}`
                      : undefined,
                    `Taxable: Rs. ${fmt(bill.taxableAmount ?? bill.subtotal - bill.totalDiscount - couponOff)}`,
                    Math.abs(roundOff) >= 0.005
                      ? `Round off: ${roundOff < 0 ? '-' : '+'}Rs. ${fmt(Math.abs(roundOff))}`
                      : undefined,
                  ],
                  '   |   ',
                )}
              </Text>
            </View>
          ) : null}
          {/* Row 2 — amount in words */}
          <View style={s.bottomRow2}>
            <Text style={s.bottomWordsText}>Rupees {numberToWords(bill.grandTotal)}</Text>
          </View>
          {/* The one line that stops this document being mistaken for a tax
              invoice. Printed right under the grand total, where anybody
              reading the figure cannot miss it. */}
          {isEstimate && estimate?.notice ? (
            <View style={s.bottomRow2}>
              <Text style={s.bottomWordsText}>{estimate.notice}</Text>
            </View>
          ) : null}
        </View>

        {/* ═══ FOOTER ═══ */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{pdfJoin([footerNote, domain])}</Text>
        </View>

      </Page>
    </Document>
  );
}
