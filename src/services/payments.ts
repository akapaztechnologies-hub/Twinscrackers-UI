import api from '@/lib/api.ts';
import type { GuestSession } from '@/lib/guestOrder.ts';
import type {
  AvailablePaymentMethods,
  ManualPayment,
  ManualPaymentInstructions,
  PaymentStatus,
} from '@/types/index.ts';

/**
 * Direct UPI / bank transfer — the manually verified payment route.
 *
 * The payable amount is never sent from here. `initiateManualPayment` posts only
 * the cart and address; the server reprices, creates the order, and builds the
 * QR from its own total. That is what makes the amount on the QR trustworthy.
 */

export interface ManualPaymentSession {
  order: { id?: string; _id?: string; total: number; paymentStatus: PaymentStatus };
  payment: ManualPaymentInstructions;
  /**
   * Present only when this order was placed as a GUEST.
   *
   * Direct UPI RAISES the order, so it is a guest entry point in its own right
   * — and on a shop where it is the only enabled method, it is the only one.
   * It is a guest-order token: it opens this order (and any earlier guest
   * orders from the same browser) and nothing else, which is what lets the
   * guest upload their payment proof without an account.
   */
  guestSession?: GuestSession;
}

export interface InitiateManualPaymentInput {
  items: { productId: string; quantity: number }[];
  shippingMethod?: string;
  /** The parcel office the customer will collect from, when the shop asks. */
  dropPointId?: string;
  /** The code only — the server decides what it is worth. */
  couponCode?: string;
  /** Where the receipt goes — the only email a guest order has. */
  customerEmail?: string;
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
  };
}

/** Which payment methods the admin has switched on. Public — no auth needed. */
export async function getPaymentMethods(): Promise<AvailablePaymentMethods | null> {
  try {
    return await api.get('/payments/methods');
  } catch {
    return null;
  }
}

/** Create the order and get its QR / bank details. Safe to retry — the server
 *  returns the existing open payment rather than stacking up duplicate orders. */
export async function initiateManualPayment(
  input: InitiateManualPaymentInput,
): Promise<ManualPaymentSession> {
  return api.post('/payments/upi/initiate', input);
}

/** Re-fetch instructions for an order already awaiting payment. */
export async function getManualPayment(orderId: string): Promise<{
  payment: ManualPaymentInstructions;
  paymentStatus: PaymentStatus;
  manualPayment: ManualPayment | null;
}> {
  return api.get(`/payments/upi/${orderId}`);
}

// =====================
// ADMIN
// =====================

/** One order waiting on an admin decision, with the flags worth reacting to. */
export interface PendingVerification {
  _id: string;
  /** `ORD-YYMM-#####`, what the customer quotes. Absent on orders from before the series. */
  orderNumber?: string;
  total: number;
  status: string;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  items: { name: string; quantity: number; price: number }[];
  shippingAddress?: { fullName: string; phone: string; city: string; state: string };
  manualPayment?: ManualPayment;
  /** This exact screenshot also backs another order. */
  duplicateScreenshot: boolean;
  /** The customer's stated amount differs from what we priced. */
  amountMismatch: boolean;
}

export async function getPendingVerifications(options?: { page?: number; limit?: number }): Promise<{
  data: PendingVerification[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}> {
  return api.get('/admin/orders/pending-payments', { params: options });
}

/** Approve or reject a submitted payment. A rejection must carry a reason. */
export async function reviewManualPayment(
  orderId: string,
  input: { approve: boolean; reason?: string },
): Promise<void> {
  await api.post(`/admin/orders/${orderId}/verify-payment`, input);
}

/** Upload the screenshot + UTR. Multipart, so the JSON content-type is dropped. */
export async function submitPaymentProof(
  orderId: string,
  input: { utr: string; claimedAmount?: number; screenshot: File },
): Promise<void> {
  const form = new FormData();
  form.append('screenshot', input.screenshot);
  form.append('utr', input.utr);
  if (input.claimedAmount !== undefined) form.append('claimedAmount', String(input.claimedAmount));

  await api.post(`/payments/upi/${orderId}/proof`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
