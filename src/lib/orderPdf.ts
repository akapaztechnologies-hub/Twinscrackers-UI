import type { Bill, BillItem, BillPayment } from '@/types/admin.ts';
import { preparePdfLogo } from '@/lib/pdfLogo.ts';
import { prepareLetterheadAssets } from '@/lib/letterheadAssets.ts';
import { useSiteStore } from '@/store/site.ts';
import { orderRef } from '@/lib/orderRef.ts';

/**
 * Minimal order shape the order documents need. Both the customer `Order`
 * (types/index) and the `AdminOrder` (types/admin) satisfy it structurally.
 */
export interface OrderPDFData {
  id: string;
  createdAt: string;
  status: string;
  items: { productId?: string; image?: string; name: string; quantity: number; price: number }[];
  subtotal: number;
  /** The coupon's rupees off the (GST-inclusive) subtotal. */
  discount?: number;
  couponCode?: string;
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
  paymentMethod?: string;
  paymentId?: string;
  userId?: string;
}

/**
 * Render an order through the tax invoice component (code-split — react-pdf is
 * heavy). The packing slip is that same document with a tick box per line, so it
 * follows every change made to the invoice template.
 *
 * The letterhead's emblems and Tamil font are read synchronously during the
 * render, so they are fetched here first or they silently drop off the page.
 */
async function renderOrderBlob(order: OrderPDFData, isPackingSlip: boolean): Promise<Blob> {
  const [{ pdf }, { BillPDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/admin/BillPDF.tsx'),
    preparePdfLogo(),
    prepareLetterheadAssets(useSiteStore.getState().config.invoiceTemplate),
  ]);
  return pdf(BillPDF({ bill: orderToBill(order), isPackingSlip })).toBlob();
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Open a PDF in a print dialog. Falls back to a hidden iframe when the popup is
 * blocked, so printing never silently no-ops (see audit gap-feature-5).
 */
function printBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.addEventListener('load', () => printWindow.print());
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }

  // Popup blocked — print via a hidden iframe instead.
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };
  document.body.appendChild(iframe);
  setTimeout(() => {
    iframe.remove();
    URL.revokeObjectURL(url);
  }, 60000);
}

/** The document's own filename-safe reference. */
const refOf = (order: { orderNumber?: string; id: string }) =>
  orderRef(order).replace(/^#/, '');

/** Download the order copy / packing slip as a PDF file. */
export async function downloadOrderCopy(order: OrderPDFData): Promise<void> {
  saveBlob(await renderOrderBlob(order, true), `order-${refOf(order)}.pdf`);
}

/** Open the order copy / packing slip in a print dialog. */
export async function printOrderCopy(order: OrderPDFData): Promise<void> {
  printBlob(await renderOrderBlob(order, true));
}

// ─── Order -> invoice (Bill) mapping ───

/**
 * Order.paymentMethod is a free string; Bill.payment.method is a closed union
 * the invoice renders verbatim. Map across rather than cast, so a direct UPI
 * transfer prints as "UPI" instead of the raw "UPI_MANUAL" enum value.
 */
function orderPaymentMethodToBill(method: string | undefined): BillPayment['method'] {
  switch ((method || '').toLowerCase()) {
    case 'upi_manual':
    case 'upi':
    case 'razorpay':
      return 'upi';
    case 'cod':
    case 'cash':
      return 'cash';
    case 'credit':
      return 'credit';
    default:
      return 'card';
  }
}

/**
 * Map an online Order to the POS invoice (Bill) shape. Online prices are
 * GST-INCLUSIVE, so we back out the tax that's already inside each price to show
 * the proper taxable + CGST + SGST breakup, while the grand total stays exactly
 * what the customer paid.
 */
function orderToBill(order: OrderPDFData): Bill {
  const gstRate = order.gstRate ?? 0;
  const div = 100 + gstRate;

  const items: BillItem[] = order.items.map((it) => {
    const lineInclusive = it.price * it.quantity;
    const taxableValue = gstRate > 0 ? Math.round((lineInclusive * 100) / div) : lineInclusive;
    const gstOnLine = lineInclusive - taxableValue;
    const cgst = Math.round(gstOnLine / 2);
    const sgst = gstOnLine - cgst;
    return {
      productId: it.productId ?? '',
      name: it.name,
      image: it.image ?? '',
      quantity: it.quantity,
      unitPrice: gstRate > 0 ? (it.price * 100) / div : it.price, // ex-GST rate
      taxableValue,
      cgstAmount: cgst,
      sgstAmount: sgst,
      totalAmount: taxableValue + cgst + sgst,
    };
  });

  // Header totals from the order-level values so they're exact (= amount paid).
  //
  // A coupon comes off the GST-inclusive subtotal before the tax inside it is
  // worked out, exactly as the server prices the order. It used to be ignored
  // here, so a couponed order printed a taxable value and tax on the full
  // price and a grand total the figures above it did not reach.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const discount = Math.min(Math.max(0, order.discount ?? 0), order.subtotal);
  const netSubtotal = round2(order.subtotal - discount);
  const totalGst = order.gstAmount ?? (gstRate > 0 ? Math.round((netSubtotal * gstRate) / div) : 0);
  const totalCgst = Math.round(totalGst / 2);
  const totalSgst = totalGst - totalCgst;
  const taxableAmount = round2(netSubtotal - totalGst);
  // On a tax invoice a discount reduces the taxable value, so the coupon prints
  // as its before-GST share: the lines' ex-GST total less the taxable amount.
  // That keeps Subtotal − Coupon = Taxable, and Taxable + tax + delivery = the
  // grand total the customer paid.
  const linesExGst = round2(items.reduce((sum, it) => sum + it.taxableValue, 0));
  const subtotalExGst = discount > 0 ? linesExGst : taxableAmount;
  const couponExGst = discount > 0 ? Math.max(0, round2(subtotalExGst - taxableAmount)) : 0;
  const addr = order.shippingAddress;

  return {
    id: order.id,
    billNumber: refOf(order),
    status: 'completed',
    customerName: addr?.fullName || '',
    customerPhone: addr?.phone || '',
    customerAddress: [addr?.addressLine1, addr?.addressLine2, addr?.city, addr?.state, addr?.pincode]
      .filter(Boolean)
      .join(', '),
    items,
    discountPercent: 0,
    subtotal: subtotalExGst,
    totalDiscount: 0,
    couponCode: order.couponCode,
    couponDiscount: couponExGst || undefined,
    packagingFee: 0,
    deliveryCharge: order.shipping || 0,
    courierDelivery: false,
    taxableAmount,
    totalCgst,
    totalSgst,
    gstRate,
    grandTotal: order.total,
    roundOff: 0,
    payment: {
      method: orderPaymentMethodToBill(order.paymentMethod),
      amount: order.total,
      reference: order.paymentId,
    },
    itemCount: items.length,
    totalQuantity: order.items.reduce((sum, i) => sum + i.quantity, 0),
    createdAt: order.createdAt,
    createdBy: order.userId || '',
  } as Bill;
}

/** Download the customer's GST invoice for an online order. */
export async function downloadOrderInvoice(order: OrderPDFData): Promise<void> {
  saveBlob(await renderOrderBlob(order, false), `invoice-${refOf(order)}.pdf`);
}

/** Print the customer's GST invoice (popup, with hidden-iframe fallback). */
export async function printOrderInvoice(order: OrderPDFData): Promise<void> {
  printBlob(await renderOrderBlob(order, false));
}
