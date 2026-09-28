import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { useSiteStore } from '@/store/site.ts';
import { pdfLogoSrc } from '@/lib/pdfLogo.ts';
import { buildPdfColors, pdfWebsite, pdfJoin, type PdfColors } from '@/lib/pdfTheme.ts';
import { orderRef } from '@/lib/orderRef.ts';

/**
 * Minimal order shape this slip needs. Both the customer `Order` (types/index)
 * and the `AdminOrder` (types/admin) satisfy it structurally, so one component
 * serves both the customer "order copy" and the admin "packing slip".
 */
export interface OrderPDFData {
  id: string;
  createdAt: string;
  status: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  shipping: number;
  gstRate?: number;
  gstAmount?: number;
  total: number;
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  customerName?: string;
  customerEmail?: string;
  paymentMethod?: string;
}

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

function makeStyles(C: PdfColors) {
  return StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: C.text,
    paddingTop: 24,
    paddingBottom: 70,
    paddingHorizontal: 28,
  },

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
  shopName: { fontSize: 18, fontWeight: 'bold', color: C.white, letterSpacing: 1 },
  shopTagline: { fontSize: 8, color: C.primaryTintStrong, marginTop: 2 },
  shopDetail: { fontSize: 7, color: C.primaryTintSoft, marginTop: 1 },
  docLabel: { fontSize: 11, fontWeight: 'bold', color: C.white, textAlign: 'right' },
  docMeta: { fontSize: 7.5, color: C.primaryTintSoft, textAlign: 'right', marginTop: 2 },

  infoRow: { flexDirection: 'row', marginTop: 14, gap: 8 },
  infoBox: { flex: 1, border: `1 solid ${C.border}`, borderRadius: 4, padding: 7 },
  infoTitle: {
    fontSize: 6, fontWeight: 'bold', color: C.muted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3,
  },
  infoValue: { fontSize: 7.5, color: C.dark, marginTop: 1 },
  infoMuted: { fontSize: 6.5, color: C.muted, marginTop: 1 },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.primary,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 12,
  },
  tableHeaderText: {
    fontSize: 7, fontWeight: 'bold', color: C.white,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottom: `0.5 solid ${C.border}`,
    alignItems: 'center',
  },
  tableRowAlt: { backgroundColor: C.light },
  tableCell: { fontSize: 7.5, color: C.text },
  tableCellBold: { fontSize: 7.5, color: C.dark, fontWeight: 'bold' },

  // Columns: Pack, #, Item, Qty, Rate, Amount
  colPack: { width: 30, alignItems: 'center', justifyContent: 'center' },
  colSno:  { width: 22 },
  colName: { flex: 1 },
  colQty:  { width: 40, textAlign: 'right' },
  colRate: { width: 70, textAlign: 'right' },
  colAmt:  { width: 80, textAlign: 'right' },

  // Printed checkbox (react-pdf has no <input> — draw an empty bordered square)
  checkbox: { width: 10, height: 10, border: `0.8 solid ${C.dark}`, borderRadius: 1 },

  bottomBar: {
    position: 'absolute',
    bottom: 28,
    left: 28,
    right: 28,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: C.primary,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  bottomCol: { flex: 1, alignItems: 'center' },
  bottomColLabel: { fontSize: 6, color: C.primaryTintStrong, textTransform: 'uppercase', letterSpacing: 0.3 },
  bottomColValue: { fontSize: 8.5, fontWeight: 'bold', color: C.white, marginTop: 1 },
  bottomColGrand: { fontSize: 11, fontWeight: 'bold', color: C.white, marginTop: 1, letterSpacing: 0.3 },

  footer: {
    position: 'absolute',
    bottom: 12,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
    footerText: { fontSize: 6, color: C.muted },
  });
}

// ─── Component ───

export function OrderPDF({ order }: { order: OrderPDFData }) {
  const siteConfig = useSiteStore.getState().config;
  const s = makeStyles(buildPdfColors(siteConfig.invoiceTemplate?.accentColor));
  // Resolved ahead of render by `preparePdfLogo()`. Undefined means every
  // candidate failed, and the header lays out without a mark rather than
  // reserving a gap for an image that will never arrive.
  const logoSrc = pdfLogoSrc();
  const distinctProducts = order.items.length;
  const totalQuantity = order.items.reduce((sum, it) => sum + it.quantity, 0);
  const contactPhone = siteConfig.contact.phone;
  const contactAddress = siteConfig.contact.address;
  const domain = pdfWebsite(siteConfig.invoiceTemplate?.website, siteConfig.url);

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>

        {/* ═══ HEADER BAND (repeats every page) ═══ */}
        <View style={s.headerBand} fixed>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {logoSrc ? <Image src={logoSrc} style={{ width: 40, height: 40, marginRight: 8 }} /> : null}
            <View>
              <Text style={s.shopName}>{siteConfig.name.toUpperCase()}</Text>
              <Text style={s.shopTagline}>{siteConfig.tagline}</Text>
              <Text style={s.shopDetail}>{contactAddress}</Text>
              <Text style={s.shopDetail}>{pdfJoin([contactPhone && `Ph: ${contactPhone}`, domain], ' | ')}</Text>
            </View>
          </View>
          <View>
            <Text style={s.docLabel}>ORDER COPY / PACKING SLIP</Text>
            <Text style={s.docMeta}>Order {orderRef(order)}</Text>
            <Text style={s.docMeta}>{fmtDate(order.createdAt)}</Text>
          </View>
        </View>

        {/* ═══ INFO ROW: Order | Ship To ═══ */}
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>Order</Text>
            <Text style={s.infoValue}>{orderRef(order)}</Text>
            <Text style={s.infoMuted}>Placed: {fmtDate(order.createdAt)}</Text>
            <Text style={s.infoMuted}>Status: {order.status.charAt(0).toUpperCase() + order.status.slice(1)}</Text>
            {order.paymentMethod ? <Text style={s.infoMuted}>Payment: {order.paymentMethod}</Text> : null}
          </View>

          <View style={s.infoBox}>
            <Text style={s.infoTitle}>Ship To</Text>
            <Text style={s.infoValue}>{order.shippingAddress.fullName}</Text>
            <Text style={s.infoMuted}>{order.shippingAddress.addressLine1}</Text>
            {order.shippingAddress.addressLine2 ? <Text style={s.infoMuted}>{order.shippingAddress.addressLine2}</Text> : null}
            <Text style={s.infoMuted}>
              {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.pincode}
            </Text>
            <Text style={s.infoMuted}>Phone: {order.shippingAddress.phone}</Text>
          </View>
        </View>

        {/* ═══ TABLE HEADER (repeats every page) ═══ */}
        <View style={s.tableHeader} fixed>
          <Text style={[s.tableHeaderText, s.colPack]}>Pack</Text>
          <Text style={[s.tableHeaderText, s.colSno]}>#</Text>
          <Text style={[s.tableHeaderText, s.colName]}>Product</Text>
          <Text style={[s.tableHeaderText, s.colQty]}>Qty</Text>
          <Text style={[s.tableHeaderText, s.colRate]}>Unit Price</Text>
          <Text style={[s.tableHeaderText, s.colAmt]}>Line Total</Text>
        </View>

        {/* ═══ ROWS ═══ */}
        {order.items.map((item, i) => (
          <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]} wrap={false}>
            <View style={s.colPack}>
              <View style={s.checkbox} />
            </View>
            <Text style={[s.tableCell, s.colSno]}>{i + 1}</Text>
            <Text style={[s.tableCellBold, s.colName]}>{item.name}</Text>
            <Text style={[s.tableCell, s.colQty]}>{item.quantity}</Text>
            <Text style={[s.tableCell, s.colRate]}>Rs. {fmt(item.price)}</Text>
            <Text style={[s.tableCellBold, s.colAmt]}>Rs. {fmt(item.price * item.quantity)}</Text>
          </View>
        ))}

        {/* ═══ BOTTOM BAR (fixed every page) ═══ */}
        <View style={s.bottomBar} fixed>
          <View style={s.bottomCol}>
            <Text style={s.bottomColLabel}>Products</Text>
            <Text style={s.bottomColValue}>{distinctProducts}</Text>
          </View>
          <View style={s.bottomCol}>
            <Text style={s.bottomColLabel}>Total Qty</Text>
            <Text style={s.bottomColValue}>{totalQuantity}</Text>
          </View>
          <View style={s.bottomCol}>
            <Text style={s.bottomColLabel}>Subtotal</Text>
            <Text style={s.bottomColValue}>Rs. {fmt(order.subtotal)}</Text>
          </View>
          <View style={s.bottomCol}>
            <Text style={s.bottomColLabel}>Shipping</Text>
            <Text style={s.bottomColValue}>{order.shipping === 0 ? 'Free' : `Rs. ${fmt(order.shipping)}`}</Text>
          </View>
          {(order.gstAmount ?? 0) > 0 && (
            <View style={s.bottomCol}>
              <Text style={s.bottomColLabel}>Incl. GST {order.gstRate ?? 18}%</Text>
              <Text style={s.bottomColValue}>Rs. {fmt(order.gstAmount ?? 0)}</Text>
            </View>
          )}
          <View style={s.bottomCol}>
            <Text style={s.bottomColLabel}>Grand Total</Text>
            <Text style={s.bottomColGrand}>Rs. {fmt(order.total)}</Text>
          </View>
        </View>

        {/* ═══ FOOTER ═══ */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{pdfJoin(['Order copy / packing slip — not a tax invoice', domain])}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>

      </Page>
    </Document>
  );
}
