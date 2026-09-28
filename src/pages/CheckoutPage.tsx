import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Truck, CreditCard, CheckCircle, ShieldCheck, Wallet, AlertCircle, Plus, Banknote, QrCode, Loader2 } from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { UpiPaymentPanel } from '@/components/order/UpiPaymentPanel.tsx';
import { CouponField } from '@/components/order/CouponField.tsx';
import { useCartStore } from '@/store/cart.ts';
import { useAuthStore } from '@/store/auth.ts';
import { useRazorpay } from '@/hooks/useRazorpay.ts';
import { createOrder, getAddresses } from '@/services/firestore.ts';
import { getProductsByIds } from '@/services/products.ts';
import {
  getPaymentMethods,
  initiateManualPayment,
  type InitiateManualPaymentInput,
  type ManualPaymentSession,
} from '@/services/payments.ts';
import { useSiteStore } from '@/store/site.ts';
import api, { ApiRequestError } from '@/lib/api.ts';
import { orderMinimum } from '@/lib/orderMinimum.ts';
import { formatPrice, cn } from '@/lib/utils.ts';
import { adoptGuestSession, refreshCurrentUser, type GuestSession } from '@/lib/guestOrder.ts';
import { DeliveryPointPicker, type DropPointStatus } from '@/components/order/DeliveryPointPicker.tsx';
import { realEmail } from '@/components/guestEmail.ts';
import type { DropPoint as DropPointType } from '@/services/delivery.ts';
import type { OrderItem, Address, AvailablePaymentMethods, Product } from '@/types/index.ts';
import type { AppliedCoupon } from '@/types/coupon.ts';

type CheckoutStep = 'information' | 'shipping' | 'payment';

interface PaymentChip { id: string; label: string; }

interface CheckoutContent {
  steps: { information: string; shipping: string; payment: string };
  headings: { information: string; shipping: string; payment: string; orderSummary: string };
  emptyCart: { title: string; subtitle: string; ctaLabel: string; ctaLink: string };
  placeholders: {
    email: string; firstName: string; lastName: string; phone: string;
    address: string; city: string; state: string; pincode: string;
  };
  shipping: { methodLabel: string; standardLabel: string; standardPriceLabel: string; expressLabel: string };
  paymentCard: { title: string; badge: string; description: string };
  paymentChips: PaymentChip[];
  securityNote: string;
  summary: { subtotal: string; savings: string; shipping: string; free: string; total: string; each: string };
  nav: { back: string; continue: string; processing: string; creatingOrder: string; payPrefix: string };
  validation: {
    emailRequired: string; emailInvalid: string; firstNameRequired: string; lastNameRequired: string;
    phoneRequired: string; phoneInvalid: string; addressRequired: string; cityRequired: string;
    stateRequired: string; pincodeRequired: string; pincodeInvalid: string;
    gatewayNotConfigured: string; verificationFailed: string; paymentFailed: string;
  };
}

interface StoreFlowData {
  checkout: CheckoutContent;
  [key: string]: unknown;
}

const checkoutDefaults: CheckoutContent = {
  steps: { information: 'Information', shipping: 'Shipping', payment: 'Payment' },
  headings: {
    information: 'Contact Information',
    shipping: 'Shipping Address',
    payment: 'Payment',
    orderSummary: 'Order Summary',
  },
  emptyCart: {
    title: 'Your Cart is Empty',
    subtitle: 'Add some products before checking out.',
    ctaLabel: 'Browse Products',
    ctaLink: '/shop',
  },
  placeholders: {
    email: 'Email address',
    firstName: 'First name',
    lastName: 'Last name',
    phone: 'Phone number',
    address: 'Street address',
    city: 'City',
    state: 'State',
    pincode: 'PIN Code',
  },
  shipping: {
    methodLabel: 'Shipping Method',
    // The days come from Settings -> Shipping, shown under the label.
    standardLabel: 'Standard Delivery',
    standardPriceLabel: 'FREE',
    expressLabel: 'Express Delivery',
  },
  paymentCard: {
    title: 'Pay with Razorpay',
    badge: 'RECOMMENDED',
    description: 'Cards, UPI, Net Banking, Wallets — all payment methods in one secure checkout.',
  },
  paymentChips: [
    { id: 'c1', label: 'UPI' },
    { id: 'c2', label: 'Visa' },
    { id: 'c3', label: 'Mastercard' },
    { id: 'c4', label: 'Net Banking' },
    { id: 'c5', label: 'Wallets' },
  ],
  securityNote: 'Payment is processed securely by Razorpay. Your financial details are never shared with us.',
  summary: {
    subtotal: 'Subtotal',
    savings: 'Savings',
    shipping: 'Shipping',
    free: 'FREE',
    total: 'Total',
    each: 'each',
  },
  nav: {
    back: 'Back',
    continue: 'Continue',
    processing: 'Processing...',
    creatingOrder: 'Creating Order...',
    payPrefix: 'Pay',
  },
  validation: {
    emailRequired: 'Email is required',
    emailInvalid: 'Invalid email address',
    firstNameRequired: 'First name is required',
    lastNameRequired: 'Last name is required',
    phoneRequired: 'Phone is required',
    phoneInvalid: 'Enter a valid 10-digit phone number',
    addressRequired: 'Address is required',
    cityRequired: 'City is required',
    stateRequired: 'State is required',
    pincodeRequired: 'PIN code is required',
    pincodeInvalid: 'Enter a valid 6-digit PIN code',
    gatewayNotConfigured: 'Payment gateway is not configured.',
    verificationFailed: 'Payment verification failed. Please contact support.',
    paymentFailed: 'Payment failed. Please try again.',
  },
};

const storeFlowDefaults: StoreFlowData = { checkout: checkoutDefaults };

// Split a stored "First Last" name into the checkout's separate name fields.
const splitName = (fullName: string): { firstName: string; lastName: string } => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
};

// Flatten a saved Address into the checkout form's flat field shape.
const addressToPatch = (addr: Address) => {
  const { firstName, lastName } = splitName(addr.fullName);
  return {
    firstName,
    lastName,
    phone: addr.phone || '',
    address: addr.addressLine1 + (addr.addressLine2 ? `, ${addr.addressLine2}` : ''),
    city: addr.city,
    state: addr.state,
    pincode: addr.pincode,
  };
};

export function CheckoutPage() {
  const { items, totalPrice, totalSavings, clearCart } = useCartStore();
  const { user, isAuthenticated: hasSession } = useAuthStore();
  /*
   * A guest who ordered earlier in this browser holds a token that opens only
   * those orders — not an account. For everything here (the sign-in rule, the
   * guest banner, saved addresses, which a guest token is refused) they are
   * checking out as a guest again.
   */
  const isAuthenticated = hasSession && !user?.isGuest;
  /**
   * Whether this customer has to sign in before the order can be placed.
   *
   * Admin-configurable (Settings → Checkout). When guest checkout is on, an
   * order needs no account at all — the server attaches it to a passwordless
   * customer record keyed on the phone number typed into this form, so a repeat
   * guest order joins the same history and a later signup inherits it.
   */
  const mustSignIn = useSiteStore((s) => s.config.requireLoginToOrder) && !isAuthenticated;
  const siteConfig = useSiteStore(s => s.config);
  const store = storeFlowDefaults;
  const c = { ...checkoutDefaults, ...store.checkout };
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isLoading: isRazorpayLoading, isProcessing, error: paymentError, openPayment } = useRazorpay();

  // Only the code is ever sent on. `appliedCoupon.discount` is the server's
  // quote, shown so the customer can see what they save — the charge is priced
  // from the code again server-side.
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);

  const [currentStep, setCurrentStep] = useState<CheckoutStep>('information');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express'>('standard');
  /**
   * The parcel office this order will be collected from.
   *
   * Only the id travels with the order — the server reads the branch back out
   * of the database and snapshots it, so a client cannot invent a collection
   * point and the order keeps saying where it actually went after the branch
   * moves. The full `dropPoint` is kept here only to show on the summary.
   */
  const [dropPointId, setDropPointId] = useState<string | undefined>();
  const [dropPoint, setDropPoint] = useState<DropPointType | undefined>();
  const [dropPointError, setDropPointError] = useState('');
  /**
   * Whether the shop needs a collection office for this address, as the picker
   * last reported it. Kept here because the picker only exists on the Shipping
   * step, and the answer is needed on the Payment step.
   */
  const [dropPointStatus, setDropPointStatus] = useState<DropPointStatus | null>(null);
  const [payMethod, setPayMethod] = useState<'razorpay' | 'cod' | 'upi_manual'>('razorpay');
  // Which methods the admin has switched on, and the live manual-payment session
  // once one is started. Null session = still on the method-choice screen.
  const [methods, setMethods] = useState<AvailablePaymentMethods | null>(null);
  const [upiSession, setUpiSession] = useState<ManualPaymentSession | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /**
   * True from the Pay tap until the Razorpay window is open.
   *
   * Asking the server for a Razorpay order takes a round trip — seconds on a
   * cold start — and nothing else marks the button busy in that gap, so a
   * second tap raised a second Razorpay order and a second payment window. The
   * ref closes the same gap for two taps landing before React re-renders.
   */
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  /** Held by whichever payment path is running, so a second tap cannot start another. */
  const submitLockRef = useRef(false);
  /** Set when the catalogue re-read found prices that moved since the cart was filled. */
  const [priceNote, setPriceNote] = useState('');
  /**
   * The Razorpay payment went through but the order it paid for is still being
   * built on the server (see handlePayment). Shown in place of the checkout.
   */
  const [paymentReceived, setPaymentReceived] = useState<{ paymentId: string; detail: string } | null>(null);
  /** A server reply worth showing that is not a failure — kept apart from the red error box. */
  const [formNotice, setFormNotice] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
  });
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  // Pre-fill contact details from the signed-in profile so returning customers
  // don't re-type them. Guarded with `prev.x ||` so it never clobbers edits.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const { firstName, lastName } = splitName(user.displayName || '');
    setFormData((prev) => ({
      ...prev,
      // Never a guest record's `@guest.invalid` filler — see realEmail.
      email: prev.email || realEmail(user.email),
      firstName: prev.firstName || firstName,
      lastName: prev.lastName || lastName,
      phone: prev.phone || user.phone || '',
    }));
  }, [isAuthenticated, user]);

  // Load saved addresses and auto-select the default for one-tap checkout.
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setSavedAddresses([]);
      setSelectedAddressId(null);
      return;
    }
    let cancelled = false;
    getAddresses(user.uid)
      .then((list) => {
        if (cancelled || list.length === 0) return;
        setSavedAddresses(list);
        const preferred = list.find((a) => a.isDefault) ?? list[0];
        setSelectedAddressId(preferred.id);
        // Auto-fill only empty fields — this fires late (async), so it must not
        // clobber anything the customer has already typed, nor overwrite the
        // profile-derived name with a single-word saved name (which would blank
        // lastName and block validation).
        const patch = addressToPatch(preferred);
        setFormData((prev) => ({
          ...prev,
          firstName: prev.firstName || patch.firstName,
          lastName: prev.lastName || patch.lastName,
          phone: prev.phone || patch.phone,
          address: prev.address || patch.address,
          city: prev.city || patch.city,
          state: prev.state || patch.state,
          pincode: prev.pincode || patch.pincode,
        }));
      })
      .catch(() => { /* fall back to manual entry */ });
    return () => { cancelled = true; };
  }, [isAuthenticated, user]);

  // Which payment methods the admin has enabled. Public endpoint — fetched once.
  useEffect(() => {
    let active = true;
    getPaymentMethods().then((m) => {
      if (active) setMethods(m);
    });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Re-read every cart line from the catalogue once, on arrival.
   *
   * A cart line keeps a copy of the product as it was when it went in the
   * basket, and the server prices the order from today's catalogue. Without
   * this, a price changed since then left the summary and the "Place Order ·
   * ₹…" button quoting the old figure while the order was charged the new one —
   * silently, for cash on delivery. Refreshing here makes what the customer
   * sees what they pay, and says so when something moved.
   *
   * One request for the whole basket, not one per line: a Diwali cart runs to
   * forty or eighty lines, and that many round trips on every checkout visit
   * is seconds on a phone. A line missing from the answer (delisted, offer
   * ended) is left as it is — the order API names it when the customer tries
   * to pay, which is the clearer message. A failed lookup changes nothing.
   */
  useEffect(() => {
    const lines = useCartStore.getState().items;
    if (lines.length === 0) return;
    let cancelled = false;

    (async () => {
      let found: Product[];
      try {
        found = await getProductsByIds(lines.map((line) => line.product.id));
      } catch {
        return;
      }
      if (cancelled) return;
      const fresh = new Map<string, Product>();
      for (const product of found) {
        if (product?.id) fresh.set(product.id, product);
      }
      if (fresh.size === 0) return;

      const changed = useCartStore
        .getState()
        .items.filter((line) => {
          const next = fresh.get(line.product.id);
          return next && next.price !== line.product.price;
        }).length;

      // Quantities are re-read inside the update, so an edit made while the
      // lookup was in flight is kept; only the product copy is replaced.
      useCartStore.setState((state) => ({
        items: state.items.map((line) => {
          const next = fresh.get(line.product.id);
          return next ? { ...line, product: next } : line;
        }),
      }));

      if (changed > 0) {
        setPriceNote(
          `The price of ${changed} item${changed === 1 ? '' : 's'} has changed since ${
            changed === 1 ? 'it was' : 'they were'
          } added to your cart. The total below is today's price.`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Delivery options and prices come from Settings -> Shipping.
   *
   * These were previously hard-coded (express always ₹199, standard always
   * free), so changing a rate in the admin had no effect on what a customer
   * actually paid.
   */
  const shippingConfig = siteConfig.shipping;
  const shippingOptions = useMemo(
    () =>
      (
        [
          { id: 'standard' as const, enabled: shippingConfig.enableStandard !== false, rate: shippingConfig.standardRate ?? 0, days: shippingConfig.standardDays },
          { id: 'express' as const, enabled: shippingConfig.enableExpress !== false, rate: shippingConfig.expressRate ?? 0, days: shippingConfig.expressDays },
        ]
      ).filter((option) => option.enabled),
    [shippingConfig],
  );

  // Orders over the free-shipping threshold pay nothing for standard delivery;
  // express is a paid upgrade and is never waived.
  const qualifiesForFreeShipping =
    (shippingConfig.freeThreshold ?? 0) > 0 && totalPrice() >= (shippingConfig.freeThreshold ?? 0);

  const rateFor = (method: 'standard' | 'express') => {
    const option = shippingOptions.find((o) => o.id === method);
    if (!option) return 0;
    return method === 'standard' && qualifiesForFreeShipping ? 0 : option.rate;
  };

  // If the admin switches an option off while a customer is mid-checkout, fall
  // back to whichever one is still available rather than charging for a method
  // that is no longer offered.
  const activeShippingMethod = shippingOptions.some((o) => o.id === shippingMethod)
    ? shippingMethod
    : (shippingOptions[0]?.id ?? 'standard');

  useEffect(() => {
    if (activeShippingMethod !== shippingMethod) setShippingMethod(activeShippingMethod);
  }, [activeShippingMethod, shippingMethod]);

  const shippingCost = rateFor(activeShippingMethod);
  const couponDiscount = appliedCoupon?.discount ?? 0;
  // Prices are GST-inclusive — the customer pays the listed price; GST is the
  // portion already inside it (shown only as a breakup, not added on top). The
  // coupon comes off before the breakup, matching how the server prices it.
  const gstRate = siteConfig.gstEnabled !== false ? (siteConfig.gstRate ?? 18) : 0;
  const discountedSubtotal = Math.max(0, totalPrice() - couponDiscount);
  const gstAmount = gstRate > 0 ? Math.round((discountedSubtotal * gstRate) / (100 + gstRate)) : 0;
  const orderTotal = discountedSubtotal + shippingCost;

  // Measured on the goods subtotal, before shipping and before the coupon —
  // the same basis the server uses, so the button and the API always agree.
  const minimum = orderMinimum(siteConfig, totalPrice());

  /** Cart in the shape every coupon/pricing call wants. */
  const cartLines = useMemo(
    () => items.map((it) => ({ productId: it.product.id, quantity: it.quantity })),
    [items],
  );

  // Every method is gated on what the admin enabled in Settings. `methods` is
  // null while the call is in flight, which reads as "nothing available yet" —
  // showing a gateway that is switched off is worse than showing a spinner.
  const codLimit = methods?.cod.limit && methods.cod.limit > 0 ? methods.cod.limit : Infinity;
  const razorpayAvailable = !!methods?.razorpay.enabled;
  const codAvailable = !!methods?.cod.enabled && orderTotal <= codLimit;
  // Direct UPI / bank transfer, verified by hand. Only offered once the admin has
  // actually filled in the details — an enabled-but-blank method is unusable.
  const manualAvailable = !!methods?.manual.enabled;

  const availableMethods = useMemo(
    () =>
      [
        razorpayAvailable ? ('razorpay' as const) : null,
        codAvailable ? ('cod' as const) : null,
        manualAvailable ? ('upi_manual' as const) : null,
      ].filter((m): m is 'razorpay' | 'cod' | 'upi_manual' => m !== null),
    [razorpayAvailable, codAvailable, manualAvailable],
  );

  const useCod = payMethod === 'cod' && codAvailable;
  const useManual = payMethod === 'upi_manual' && manualAvailable;

  // `payMethod` defaults to razorpay, so if that gateway is off the selection
  // has to move — otherwise Place Order would open a gateway nobody enabled.
  useEffect(() => {
    if (availableMethods.length === 0) return;
    if (!availableMethods.includes(payMethod)) setPayMethod(availableMethods[0]);
  }, [availableMethods, payMethod]);

  const steps: { id: CheckoutStep; label: string; icon: typeof Lock }[] = [
    { id: 'information', label: c.steps.information, icon: Lock },
    { id: 'shipping', label: c.steps.shipping, icon: Truck },
    { id: 'payment', label: c.steps.payment, icon: CreditCard },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Editing an address field means it no longer matches the picked saved
    // address, so flip the picker to "new address".
    if (selectedAddressId && ['address', 'city', 'state', 'pincode'].includes(name)) {
      setSelectedAddressId(null);
    }
    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSelectSavedAddress = (addr: Address) => {
    setSelectedAddressId(addr.id);
    setFormData((prev) => ({ ...prev, ...addressToPatch(addr) }));
    setFormErrors((prev) => {
      const next = { ...prev };
      for (const k of ['firstName', 'lastName', 'phone', 'address', 'city', 'state', 'pincode']) delete next[k];
      return next;
    });
  };

  const handleUseNewAddress = () => {
    setSelectedAddressId(null);
    setFormData((prev) => ({ ...prev, address: '', city: '', state: '', pincode: '' }));
  };

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!formData.email.trim()) errors.email = c.validation.emailRequired;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      errors.email = c.validation.emailInvalid;

    if (!formData.firstName.trim()) errors.firstName = c.validation.firstNameRequired;
    if (!formData.lastName.trim()) errors.lastName = c.validation.lastNameRequired;
    if (!formData.phone.trim()) errors.phone = c.validation.phoneRequired;
    else if (!/^(?:\+?91|0)?[6-9]\d{9}$/.test(formData.phone.replace(/[\s-]/g, '')))
      errors.phone = c.validation.phoneInvalid;

    // Mirror the backend Zod minimums (addressLine1 >= 5, city/state >= 2) so a
    // too-short value is caught here instead of failing POST /orders after the
    // customer has already paid.
    if (formData.address.trim().length < 5) errors.address = c.validation.addressRequired;
    if (formData.city.trim().length < 2) errors.city = c.validation.cityRequired;
    if (formData.state.trim().length < 2) errors.state = c.validation.stateRequired;
    if (!formData.pincode.trim()) errors.pincode = c.validation.pincodeRequired;
    else if (!/^\d{6}$/.test(formData.pincode))
      errors.pincode = c.validation.pincodeInvalid;

    setFormErrors(errors);
    return errors;
  };

  /**
   * Why the order cannot go ahead yet for want of a collection office, or ''.
   *
   * The server refuses an order with no office whenever the shop requires one.
   * For Razorpay that refusal came AFTER the money was taken — the customer
   * paid and no order was created — and it happened to anyone who tapped
   * Continue before the office lookup landed, or whose area has no office. So
   * the answer has to be settled here, before any payment starts.
   */
  const dropPointProblem = (() => {
    const s = dropPointStatus;
    if (!s) return '';
    // While the lookup is out, or after it failed, only the shop's saved rule
    // says whether an office can hold the order up. A shop known to have
    // offices off or optional must not be stopped by a slow or failed lookup;
    // an unknown or required rule still waits, since the server refuses an
    // office-less order when one is required.
    const mayNeedOffice =
      siteConfig.deliveryPointMode === 'required' || siteConfig.deliveryPointMode === 'unknown';
    if (s.loading) return mayNeedOffice ? 'Still finding parcel offices near you — one moment.' : '';
    if (s.failed) return mayNeedOffice ? 'We could not load the parcel offices. Please try again.' : '';
    if (!s.enabled || !s.required || dropPointId) return '';
    if (!s.hasOptions) return 'We cannot take this order online for this address yet. Please contact us.';
    return 'Choose where you would like to collect this order.';
  })();

  /**
   * Everything that must hold before any payment method starts. Sends the
   * customer to the step that needs fixing and returns false otherwise.
   */
  const validateCheckout = (): boolean => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      if (errors.email || errors.firstName || errors.lastName || errors.phone) setCurrentStep('information');
      else setCurrentStep('shipping');
      return false;
    }
    if (dropPointProblem) {
      setDropPointError(dropPointProblem);
      setCurrentStep('shipping');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    // Leaving Shipping settles the collection office too — see dropPointProblem.
    if (currentStep === 'shipping' && dropPointProblem) {
      setDropPointError(dropPointProblem);
      return;
    }
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  const handlePayment = async () => {
    if (submitLockRef.current) return;
    if (!validateCheckout()) return;

    // Only when the shop requires an account. With guest checkout on, the
    // order goes through with no sign-in and the server attaches it to a
    // phone-keyed guest record.
    if (mustSignIn) {
      navigate("/login", { state: { from: "/checkout" } });
      return;
    }

    const razorpayKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
    if (!razorpayKeyId) {
      setFormErrors({ submit: c.validation.gatewayNotConfigured });
      return;
    }

    submitLockRef.current = true;
    setIsStartingPayment(true);
    setFormNotice('');
    try {
      // Step 1: Create Razorpay order on backend. We send the cart + shipping
      // method (NOT a total) so the server prices it from the DB — the amount is
      // tamper-proof because the client never dictates it.
      const paymentOrder: { id: string; amount: number; currency: string } =
        await api.post('/payments/create-order', {
          items: cartLines,
          shippingMethod,
          couponCode: appliedCoupon?.code,
          // The snapshot is what the order is priced and recovered from — the
          // webhook rebuilds the order from it if the browser never comes back,
          // so it has to carry the collection office and the receipt address.
          dropPointId,
          customerEmail: formData.email.trim(),
          // Sent so the server can snapshot a pending order (webhook recovery).
          shippingAddress: {
            fullName: `${formData.firstName} ${formData.lastName}`,
            phone: formData.phone,
            addressLine1: formData.address,
            city: formData.city,
            state: formData.state,
            pincode: formData.pincode,
          },
        });

      // Step 2: Open Razorpay with server-generated order
      await openPayment({
        key: razorpayKeyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency || 'INR',
        name: siteConfig.name,
        description: `Order — ${items.length} item${items.length > 1 ? 's' : ''}`,
        order_id: paymentOrder.id,
        prefill: {
          name: `${formData.firstName} ${formData.lastName}`,
          email: formData.email,
          contact: formData.phone,
        },
        theme: {
          color: '#F59E0B',
        },
        handler: async (response) => {
          setIsSubmitting(true);
          try {
            // Step 3: Verify payment signature on backend
            await api.post('/payments/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            // Step 4: Create order in database
            const orderItems: OrderItem[] = items.map((item) => ({
              productId: item.product.id,
              name: item.product.name,
              slug: item.product.slug,
              image: item.product.images?.[0],
              price: item.product.price,
              quantity: item.quantity,
            }));

            const orderPayload = {
              // Empty for a guest — the server takes the customer from the
              // token, or resolves a phone-keyed guest record when there is none.
              userId: user?.uid ?? '',
              items: orderItems,
              subtotal: totalPrice(),
              couponCode: appliedCoupon?.code,
              discount: couponDiscount,
              shipping: shippingCost,
              shippingMethod,
              total: orderTotal,
              status: 'pending' as const,
              // Only the id travels; the server reads the branch back and snapshots it.

              dropPointId,
              // Where the receipt and status updates go. A guest's customer
              // record carries only a placeholder address, so without this they
              // never heard about their order at all.
              customerEmail: formData.email.trim(),

              shippingAddress: {
                id: '',
                label: 'Checkout',
                fullName: `${formData.firstName} ${formData.lastName}`,
                phone: formData.phone,
                addressLine1: formData.address,
                city: formData.city,
                state: formData.state,
                pincode: formData.pincode,
                isDefault: false,
              },
              paymentMethod: 'razorpay',
              paymentId: response.razorpay_payment_id,
              razorpayOrderId: response.razorpay_order_id,
            };

            // The customer has already paid — never lose the order. Retry the save
            // when retrying can help (no answer at all, or a server error); the
            // backend is idempotent on razorpayOrderId so retries (or a webhook)
            // can't create duplicates. A 4xx is a decision, not a blip — asking
            // again only gets the same answer, so it stops the loop.
            let orderId: string | undefined;
            let guestSession: GuestSession | undefined;
            let refusal: ApiRequestError | undefined;
            for (let attempt = 0; attempt < 3 && !orderId && !refusal; attempt++) {
              try {
                const created = await createOrder(user?.uid ?? '', orderPayload);
                orderId = created.id;
                guestSession = created.guestSession;
              } catch (err) {
                if (err instanceof ApiRequestError && err.status !== undefined && err.status < 500) {
                  refusal = err;
                } else if (attempt < 2) {
                  await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
                }
              }
            }

            /*
             * 409: the cart changed after the payment was set up, so what was
             * sent no longer matches what was paid for. The money is safe — the
             * server builds the real order from what was paid for, through the
             * Razorpay webhook — so the customer is told their order is on its
             * way in, not that something failed. The cart is cleared because
             * what they paid for is what is being ordered.
             */
            if (!orderId && refusal?.status === 409) {
              clearCart();
              setPaymentReceived({ paymentId: response.razorpay_payment_id, detail: refusal.message });
              return;
            }

            if (!orderId) {
              setFormErrors({
                submit: `Payment succeeded but saving your order failed. Please contact support with Payment ID ${response.razorpay_payment_id}.${
                  refusal?.message ? ` (${refusal.message})` : ''
                }`,
              });
              return;
            }

            // A guest order comes back with a session for the customer record
            // the server attached it to. Adopting it signs them in, so the
            // confirmation page fetches the order the ordinary way.
            if (adoptGuestSession(guestSession)) await refreshCurrentUser();
            clearCart();
            navigate(`/order-confirmation/${orderId}`);
          } catch {
            setFormErrors({
              submit: `${c.validation.verificationFailed} (Payment ID: ${response.razorpay_payment_id})`,
            });
          } finally {
            setIsSubmitting(false);
          }
        },
        modal: {
          confirm_close: true,
        },
      });
    } catch (err) {
      setFormErrors({ submit: err instanceof Error ? err.message : c.validation.paymentFailed });
    } finally {
      // The window is open (or failed to), so `isProcessing` / the error now
      // own the button.
      submitLockRef.current = false;
      setIsStartingPayment(false);
    }
  };

  /**
   * Start a direct-UPI payment. The order is created now so the customer has
   * something to pay against, and the server prices it — only the cart and
   * address are sent, never a total, so the amount on the QR cannot be forged.
   */
  const handleManualOrder = async () => {
    if (submitLockRef.current) return;
    if (!validateCheckout()) return;
    // Only when the shop requires an account. With guest checkout on, the
    // order goes through with no sign-in and the server attaches it to a
    // phone-keyed guest record.
    if (mustSignIn) {
      navigate("/login", { state: { from: "/checkout" } });
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setFormErrors({});
    setFormNotice('');
    try {
      const input: InitiateManualPaymentInput = {
        items: cartLines,
        shippingMethod,
        couponCode: appliedCoupon?.code,
        // Direct UPI raises the order itself, so it needs the collection point
        // and the receipt address exactly as the other two paths do.
        dropPointId,
        customerEmail: formData.email.trim(),
        shippingAddress: {
          fullName: `${formData.firstName} ${formData.lastName}`,
          phone: formData.phone,
          addressLine1: formData.address,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode,
        },
      };
      const session = await initiateManualPayment(input);
      // Direct UPI raises the order itself, so a guest is signed in HERE
      // rather than at the end — they have to be authenticated to upload their
      // payment proof in the step that follows.
      if (adoptGuestSession(session.guestSession)) await refreshCurrentUser();
      setUpiSession(session);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        // "Your payment is already being set up" — a second tap (or a second
        // tab) while the first request is still creating the order. Nothing
        // failed: say what the server said and stay on this step, so the
        // payment details appear when the first request lands, or a tap in a
        // moment picks up the same open payment.
        setFormNotice(err.message || 'Your payment is already being set up.');
      } else {
        setFormErrors({
          submit: err instanceof Error ? err.message : 'Could not start the payment. Please try again.',
        });
      }
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Place a Cash-on-Delivery order — no Razorpay, order is created as unpaid.
  const handleCodOrder = async () => {
    if (submitLockRef.current) return;
    if (!validateCheckout()) return;
    // Only when the shop requires an account. With guest checkout on, the
    // order goes through with no sign-in and the server attaches it to a
    // phone-keyed guest record.
    if (mustSignIn) {
      navigate("/login", { state: { from: "/checkout" } });
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setFormErrors({});
    setFormNotice('');
    try {
      const orderItems: OrderItem[] = items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        image: item.product.images?.[0],
        price: item.product.price,
        quantity: item.quantity,
      }));

      const codPayload = {
        userId: user?.uid ?? '',
        items: orderItems,
        subtotal: totalPrice(),
        couponCode: appliedCoupon?.code,
        discount: couponDiscount,
        shipping: shippingCost,
        shippingMethod,
        total: orderTotal,
        status: 'pending' as const,
        // Only the id travels; the server reads the branch back and snapshots it.

        dropPointId,
        // Where the receipt goes — see the Razorpay payload above.
        customerEmail: formData.email.trim(),

        shippingAddress: {
          id: '',
          label: 'Checkout',
          fullName: `${formData.firstName} ${formData.lastName}`,
          phone: formData.phone,
          addressLine1: formData.address,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode,
          isDefault: false,
        },
        paymentMethod: 'cod',
      };

      const { id: orderId, guestSession } = await createOrder(user?.uid ?? '', codPayload);

      // A guest order comes back with a session for the customer record the
      // server attached it to. Adopting it signs them in, so the confirmation
      // page fetches the order the ordinary way.
      if (adoptGuestSession(guestSession)) await refreshCurrentUser();
      clearCart();
      navigate(`/order-confirmation/${orderId}`);
    } catch (err) {
      setFormErrors({ submit: err instanceof Error ? err.message : 'Could not place your order. Please try again.' });
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Checked before the empty-cart screen: the cart is cleared on the way here,
  // and "Your cart is empty" is the wrong thing to show someone who just paid.
  if (paymentReceived) {
    return (
      <div className="pt-24 min-h-screen flex items-center justify-center px-4 bg-surface-50 dark:bg-surface-950">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-emerald-500" />
          </div>
          <h1 className="font-display font-bold text-heading-lg text-surface-900 dark:text-surface-50">
            Payment received
          </h1>
          <p className="mt-3 text-body-md text-surface-600 dark:text-surface-300">
            We're confirming your order — it will appear in My Orders within a few minutes.
          </p>
          {/* A guest has no My Orders to look in; the receipt is how they hear. */}
          {!isAuthenticated && formData.email.trim() && (
            <p className="mt-2 text-body-sm text-surface-500">
              We'll send the confirmation to {formData.email.trim()}.
            </p>
          )}
          <p className="mt-3 text-body-sm text-surface-500">
            Payment ID: <span className="font-mono font-medium text-surface-700 dark:text-surface-200">{paymentReceived.paymentId}</span>
          </p>
          {paymentReceived.detail && (
            <p className="mt-2 text-caption text-surface-400">{paymentReceived.detail}</p>
          )}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            {isAuthenticated && (
              <Link to="/account/orders">
                <Button>View My Orders</Button>
              </Link>
            )}
            <Link to="/shop">
              <Button variant={isAuthenticated ? 'outline' : 'primary'}>Continue Shopping</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="pt-24 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">
            {c.emptyCart.title}
          </h1>
          <p className="mt-4 text-body-lg text-surface-500">
            {c.emptyCart.subtitle}
          </p>
          <Link to={c.emptyCart.ctaLink} className="mt-6 inline-block">
            <Button>{c.emptyCart.ctaLabel}</Button>
          </Link>
        </div>
      </div>
    );
  }

  const inputClass = cn(
    'w-full px-4 py-3 rounded-xl text-body-md',
    'bg-white dark:bg-surface-850',
    'border border-surface-200 dark:border-surface-700',
    'text-surface-900 dark:text-surface-100',
    'placeholder:text-surface-400 dark:placeholder:text-surface-500',
    'focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500',
    'transition-colors',
  );

  const errorInputClass = cn(
    'w-full px-4 py-3 rounded-xl text-body-md',
    'bg-white dark:bg-surface-850',
    'border border-red-500',
    'text-surface-900 dark:text-surface-100',
    'placeholder:text-surface-400 dark:placeholder:text-surface-500',
    'focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500',
    'transition-colors',
  );

  const getInputClass = (field: string) => formErrors[field] ? errorInputClass : inputClass;

  return (
    <div className="pt-16 lg:pt-18 min-h-screen bg-surface-50 dark:bg-surface-950">

      <Container size="wide">
        <div className="py-8 lg:py-12">
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-4 mb-10">
            {steps.map((step, i) => {
              const StepIcon = step.icon;
              const isCompleted = i < currentStepIndex;
              const isCurrent = step.id === currentStep;
              return (
                <div key={step.id} className="flex items-center gap-2">
                  {i > 0 && (
                    <div className={cn(
                      'w-12 h-px',
                      isCompleted ? 'bg-brand-500' : 'bg-surface-300 dark:bg-surface-700',
                    )} />
                  )}
                  <button
                    onClick={() => i <= currentStepIndex && setCurrentStep(step.id)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-xl text-body-sm font-medium transition-colors',
                      isCompleted && 'text-brand-500',
                      isCurrent && 'bg-brand-500/10 text-brand-500 border border-brand-500/20',
                      !isCompleted && !isCurrent && 'text-surface-400',
                    )}
                  >
                    {isCompleted ? <CheckCircle size={16} /> : <StepIcon size={16} />}
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
            {/* Form Section */}
            <div className="lg:col-span-3">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-white dark:bg-surface-900 rounded-2xl p-6 lg:p-8 border border-surface-200 dark:border-surface-800"
              >
                {currentStep === 'information' && (
                  <>
                    <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50 mb-6">
                      {c.headings.information}
                    </h2>

                    {/* Guest checkout is on and nobody is signed in: say so, and
                        put signing in one tap away for the returning customers
                        who would rather have their addresses filled in. Framed
                        as an option, never as a gate — the order goes through
                        either way, which is the entire point of the setting. */}
                    {!isAuthenticated && !siteConfig.requireLoginToOrder && (
                      <div className="mb-6 flex flex-wrap items-center gap-3 p-4 rounded-xl bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700">
                        <div className="flex-1 min-w-[180px]">
                          <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">
                            Checking out as a guest
                          </p>
                          <p className="mt-0.5 text-caption text-surface-500 dark:text-surface-400">
                            No account needed. Already have one? Sign in and we'll fill this in for you.
                          </p>
                        </div>
                        <Link
                          to="/login"
                          state={{ from: '/checkout' }}
                          className="flex-shrink-0 px-4 py-2 rounded-xl border border-surface-300 dark:border-surface-600 text-body-sm font-semibold text-surface-700 dark:text-surface-200 hover:bg-white dark:hover:bg-surface-800 transition-colors"
                        >
                          Sign in
                        </Link>
                      </div>
                    )}
                    <div className="space-y-4">
                      <div>
                        <input name="email" type="email" placeholder={c.placeholders.email} value={formData.email} onChange={handleInputChange} className={getInputClass('email')} />
                        {formErrors.email && <p className="mt-1 text-caption text-red-500">{formErrors.email}</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <input name="firstName" placeholder={c.placeholders.firstName} value={formData.firstName} onChange={handleInputChange} className={getInputClass('firstName')} />
                          {formErrors.firstName && <p className="mt-1 text-caption text-red-500">{formErrors.firstName}</p>}
                        </div>
                        <div>
                          <input name="lastName" placeholder={c.placeholders.lastName} value={formData.lastName} onChange={handleInputChange} className={getInputClass('lastName')} />
                          {formErrors.lastName && <p className="mt-1 text-caption text-red-500">{formErrors.lastName}</p>}
                        </div>
                      </div>
                      <div>
                        <input name="phone" type="tel" placeholder={c.placeholders.phone} value={formData.phone} onChange={handleInputChange} className={getInputClass('phone')} />
                        {formErrors.phone && <p className="mt-1 text-caption text-red-500">{formErrors.phone}</p>}
                      </div>
                    </div>
                  </>
                )}

                {currentStep === 'shipping' && (
                  <>
                    <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50 mb-6">
                      {c.headings.shipping}
                    </h2>

                    {savedAddresses.length > 0 && (
                      <div className="mb-6">
                        <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100 mb-3">
                          Deliver to a saved address
                        </p>
                        <div className="space-y-2">
                          {savedAddresses.map((addr) => {
                            const selected = selectedAddressId === addr.id;
                            return (
                              <button
                                key={addr.id}
                                type="button"
                                onClick={() => handleSelectSavedAddress(addr)}
                                className={cn(
                                  'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                                  selected
                                    ? 'border-brand-500 bg-brand-500/5'
                                    : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600',
                                )}
                              >
                                <div className={cn(
                                  'mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                                  selected ? 'border-brand-500' : 'border-surface-300 dark:border-surface-600',
                                )}>
                                  {selected && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">{addr.fullName}</span>
                                    <span className="px-2 py-0.5 rounded bg-surface-100 dark:bg-surface-800 text-caption font-bold uppercase text-surface-500">{addr.label}</span>
                                    {addr.isDefault && <span className="text-caption font-bold text-brand-500">Default</span>}
                                  </div>
                                  <p className="text-caption text-surface-500 mt-0.5">
                                    {addr.addressLine1}{addr.addressLine2 ? `, ${addr.addressLine2}` : ''}, {addr.city}, {addr.state} — {addr.pincode}
                                  </p>
                                  <p className="text-caption text-surface-400">{addr.phone}</p>
                                </div>
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={handleUseNewAddress}
                            className={cn(
                              'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                              selectedAddressId === null
                                ? 'border-brand-500 bg-brand-500/5'
                                : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600',
                            )}
                          >
                            <div className={cn(
                              'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                              selectedAddressId === null ? 'border-brand-500' : 'border-surface-300 dark:border-surface-600',
                            )}>
                              {selectedAddressId === null && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                            </div>
                            <span className="flex items-center gap-1.5 text-body-sm font-medium text-surface-700 dark:text-surface-300">
                              <Plus size={15} /> Use a new address
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <input name="address" placeholder={c.placeholders.address} value={formData.address} onChange={handleInputChange} className={getInputClass('address')} />
                        {formErrors.address && <p className="mt-1 text-caption text-red-500">{formErrors.address}</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <input name="city" placeholder={c.placeholders.city} value={formData.city} onChange={handleInputChange} className={getInputClass('city')} />
                          {formErrors.city && <p className="mt-1 text-caption text-red-500">{formErrors.city}</p>}
                        </div>
                        <div>
                          <input name="state" placeholder={c.placeholders.state} value={formData.state} onChange={handleInputChange} className={getInputClass('state')} />
                          {formErrors.state && <p className="mt-1 text-caption text-red-500">{formErrors.state}</p>}
                        </div>
                      </div>
                      <div>
                        <input name="pincode" placeholder={c.placeholders.pincode} value={formData.pincode} onChange={handleInputChange} className={getInputClass('pincode')} />
                        {formErrors.pincode && <p className="mt-1 text-caption text-red-500">{formErrors.pincode}</p>}
                      </div>
                    </div>

                    <div className="mt-6 p-4 rounded-xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-800">
                      {shippingConfig.customerPaysDeliveryOnly && (
                        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-brand-500/10 border border-brand-500/20">
                          <Truck size={16} className="mt-0.5 flex-shrink-0 text-brand-500" />
                          <p className="text-body-sm text-surface-700 dark:text-surface-300">
                            <span className="font-semibold text-surface-900 dark:text-surface-100">We deliver to your door.</span>{' '}
                            {shippingOptions.length === 0
                              ? 'Your order will be brought to your address, and the delivery charge is collected when it reaches you — nothing is added to this total.'
                              : 'Your order will be brought to your address — you only pay the delivery fee below.'}
                          </p>
                        </div>
                      )}
                      {/* Which parcel office the order goes to. Not mounted at
                          all when the shop's saved rule has the chooser off, so
                          a failed lookup can't show an error there; otherwise it
                          renders nothing until the address can be searched on. */}
                      {siteConfig.deliveryPointMode !== 'off' && (
                      <div className="mb-6">
                        <DeliveryPointPicker
                          address={{
                            pincode: formData.pincode,
                            city: formData.city,
                            state: formData.state,
                          }}
                          value={dropPointId}
                          onChange={(id, point) => {
                            setDropPointId(id);
                            setDropPoint(point);
                            if (dropPointError) setDropPointError('');
                          }}
                          onStatusChange={(status) => {
                            setDropPointStatus(status);
                            // A settled answer replaces a "still loading" or
                            // "try again" message from an earlier attempt.
                            if (!status.loading) setDropPointError('');
                          }}
                          error={dropPointError}
                        />
                      </div>
                      )}

                      <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">{c.shipping.methodLabel}</p>
                      <div className="mt-3 space-y-2">
                        {/*
                         * No paid option on offer — either "To Pay" delivery, or the
                         * shop has switched both methods off. Say so plainly instead
                         * of leaving an empty box under a "Delivery method" heading;
                         * the server prices this at zero either way.
                         */}
                        {shippingOptions.length === 0 && (
                          <div className="flex items-center justify-between p-3 rounded-lg border border-surface-200 dark:border-surface-700">
                            <div className="flex items-center gap-3">
                              <Truck size={16} className="flex-shrink-0 text-surface-400" />
                              <div>
                                <span className="text-body-sm font-medium text-surface-700 dark:text-surface-300">
                                  {shippingConfig.customerPaysDeliveryOnly ? 'Pay on delivery' : 'Delivery'}
                                </span>
                                <span className="block text-caption text-surface-400">
                                  {shippingConfig.customerPaysDeliveryOnly
                                    ? 'Delivery charge collected when your order arrives'
                                    : 'We will contact you about delivery'}
                                </span>
                              </div>
                            </div>
                            <span className="text-body-sm font-bold text-surface-700 dark:text-surface-300">
                              {/* Not "FREE" under To Pay — they do pay, just not now. */}
                              {shippingConfig.customerPaysDeliveryOnly ? 'On delivery' : c.shipping.standardPriceLabel}
                            </span>
                          </div>
                        )}
                        {shippingOptions.map((option) => {
                          const selected = activeShippingMethod === option.id;
                          const cost = rateFor(option.id);
                          const label =
                            option.id === 'standard' ? c.shipping.standardLabel : c.shipping.expressLabel;
                          return (
                            <label
                              key={option.id}
                              onClick={() => setShippingMethod(option.id)}
                              className={cn(
                                'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                                selected
                                  ? 'border-brand-500 bg-brand-500/5'
                                  : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600',
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                                    selected ? 'border-brand-500' : 'border-surface-300 dark:border-surface-600',
                                  )}
                                >
                                  {selected && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                                </div>
                                <div>
                                  <span
                                    className={cn(
                                      'text-body-sm font-medium',
                                      selected
                                        ? 'text-surface-900 dark:text-surface-100'
                                        : 'text-surface-700 dark:text-surface-300',
                                    )}
                                  >
                                    {label}
                                  </span>
                                  {option.days && (
                                    <span className="block text-caption text-surface-400">
                                      {option.days} business days
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span
                                className={cn(
                                  'text-body-sm font-bold',
                                  selected ? 'text-brand-500' : 'text-surface-700 dark:text-surface-300',
                                )}
                              >
                                {option.id === 'standard' && qualifiesForFreeShipping
                                  ? c.shipping.standardPriceLabel
                                  : formatPrice(cost)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* A started UPI payment replaces the method chooser — the order
                    already exists and the panel owns the rest of the flow. */}
                {currentStep === 'payment' && upiSession && (
                  <>
                    <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50 mb-6">
                      Complete your payment
                    </h2>
                    <UpiPaymentPanel
                      payment={upiSession.payment}
                      paymentStatus={upiSession.order.paymentStatus}
                      onSubmitted={() => {
                        clearCart();
                        navigate(`/order-confirmation/${upiSession.payment.orderId}`);
                      }}
                      onExpired={() => {
                        setUpiSession(null);
                        // Someone may have paid and still be finding the UTR
                        // when the clock ran out. "Start again" alone led them
                        // to pay a second time, so say what to do instead.
                        setFormErrors({
                          submit:
                            'The payment window closed before we received your payment proof. If you have already paid, do not pay again — contact us with your UTR / reference number and we will match it. Otherwise, start again below.',
                        });
                      }}
                    />
                  </>
                )}

                {currentStep === 'payment' && !upiSession && (
                  <>
                    <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50 mb-6">
                      {c.headings.payment}
                    </h2>

                    {/* Payment method options */}
                    <div className="space-y-3">
                      {!methods && (
                        <div className="flex items-center gap-3 p-5 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm text-surface-500">
                          <Loader2 size={16} className="animate-spin" />
                          Loading payment options…
                        </div>
                      )}

                      {methods && availableMethods.length === 0 && (
                        <div className="flex items-start gap-3 p-5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                          <AlertCircle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-50">
                              No payment methods are available right now
                            </p>
                            <p className="text-body-sm text-surface-500 mt-0.5">
                              Please contact us to complete your order.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Razorpay (online) */}
                      {razorpayAvailable && (
                      <button
                        type="button"
                        onClick={() => setPayMethod('razorpay')}
                        className={cn(
                          'w-full text-left p-5 rounded-xl border-2 transition-colors',
                          payMethod === 'razorpay'
                            ? 'border-brand-500 bg-brand-500/5'
                            : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600',
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center', payMethod === 'razorpay' ? 'border-brand-500' : 'border-surface-300 dark:border-surface-600')}>
                              {payMethod === 'razorpay' && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                            </div>
                            <Wallet size={20} className="text-brand-500" />
                            <span className="text-body-md font-semibold text-surface-900 dark:text-surface-100">{c.paymentCard.title}</span>
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-brand-500/10 text-caption font-bold text-brand-600 dark:text-brand-400">{c.paymentCard.badge}</span>
                        </div>
                        <p className="text-body-sm text-surface-500 ml-10">{c.paymentCard.description}</p>
                      </button>
                      )}

                      {/* Cash on Delivery (shown when enabled + within limit) */}
                      {codAvailable && (
                        <button
                          type="button"
                          onClick={() => setPayMethod('cod')}
                          className={cn(
                            'w-full text-left p-5 rounded-xl border-2 transition-colors',
                            payMethod === 'cod'
                              ? 'border-brand-500 bg-brand-500/5'
                              : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600',
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center', payMethod === 'cod' ? 'border-brand-500' : 'border-surface-300 dark:border-surface-600')}>
                              {payMethod === 'cod' && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                            </div>
                            <Banknote size={20} className="text-emerald-500" />
                            <span className="text-body-md font-semibold text-surface-900 dark:text-surface-100">Cash on Delivery</span>
                          </div>
                          <p className="text-body-sm text-surface-500 ml-10 mt-1">Pay in cash when your order is delivered to your door.</p>
                        </button>
                      )}

                      {/* Direct UPI / bank transfer — verified manually by us */}
                      {manualAvailable && (
                        <button
                          type="button"
                          onClick={() => setPayMethod('upi_manual')}
                          className={cn(
                            'w-full text-left p-5 rounded-xl border-2 transition-colors',
                            payMethod === 'upi_manual'
                              ? 'border-brand-500 bg-brand-500/5'
                              : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600',
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center', payMethod === 'upi_manual' ? 'border-brand-500' : 'border-surface-300 dark:border-surface-600')}>
                              {payMethod === 'upi_manual' && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                            </div>
                            <QrCode size={20} className="text-violet-500" />
                            <span className="text-body-md font-semibold text-surface-900 dark:text-surface-100">
                              {methods?.manual.upi ? 'UPI / Bank Transfer' : 'Bank Transfer'}
                            </span>
                          </div>
                          <p className="text-body-sm text-surface-500 ml-10 mt-1">
                            {methods?.manual.upi
                              ? 'Scan a QR with the exact amount, then upload your payment screenshot. We confirm your order once verified.'
                              : 'Transfer to our account, then upload your payment screenshot. We confirm your order once verified.'}
                          </p>
                        </button>
                      )}
                    </div>

                    {/* Razorpay-only extras */}
                    {payMethod === 'razorpay' && razorpayAvailable && (
                      <>
                        <div className="mt-4 flex items-center gap-3 px-1">
                          {c.paymentChips.map((chip) => (
                            <span key={chip.id} className="px-2.5 py-1.5 rounded-lg bg-surface-100 dark:bg-surface-850 text-caption font-medium text-surface-500">
                              {chip.label}
                            </span>
                          ))}
                        </div>
                        <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-surface-50 dark:bg-surface-850">
                          <ShieldCheck size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                          <p className="text-body-sm text-surface-500">{c.securityNote}</p>
                        </div>
                      </>
                    )}

                    {/* Error display */}
                    {(paymentError || formErrors.submit) && (
                      <div className="mt-4 flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                        <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                        <p className="text-body-sm text-red-600 dark:text-red-400">
                          {paymentError || formErrors.submit}
                        </p>
                      </div>
                    )}

                    {/* Not an error — e.g. a payment already being set up. */}
                    {formNotice && !paymentError && !formErrors.submit && (
                      <div className="mt-4 flex items-center gap-2 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
                        <p className="text-body-sm text-amber-700 dark:text-amber-300">{formNotice}</p>
                      </div>
                    )}
                  </>
                )}

                {/* Navigation — hidden once a UPI payment is in progress, since
                    the payment panel carries its own submit action.
                    On a phone these stack (`col-reverse` keeps the primary
                    action on top); side by side they collide and both wrap. */}
                <div
                  className={cn(
                    'mt-8 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3',
                    upiSession && 'hidden',
                  )}
                >
                  {currentStepIndex > 0 ? (
                    <button
                      onClick={handleBack}
                      className="py-2 text-body-sm font-medium text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors sm:py-0"
                    >
                      &larr; {c.nav.back}
                    </button>
                  ) : (
                    <div />
                  )}
                  {currentStep === 'payment' ? (
                    <Button
                      size="lg"
                      fullWidth
                      className="sm:w-auto whitespace-nowrap"
                      onClick={useManual ? handleManualOrder : useCod ? handleCodOrder : handlePayment}
                      isLoading={isStartingPayment || isRazorpayLoading || isProcessing || isSubmitting}
                      disabled={
                        isStartingPayment ||
                        isRazorpayLoading ||
                        isProcessing ||
                        isSubmitting ||
                        availableMethods.length === 0 ||
                        !minimum.meetsMinimum
                      }
                    >
                      {useManual ? <QrCode size={16} /> : useCod ? <Truck size={16} /> : <Lock size={16} />}
                      {isProcessing
                        ? c.nav.processing
                        : isSubmitting
                          ? c.nav.creatingOrder
                          : useManual
                            ? `Continue to Pay · ${formatPrice(orderTotal)}`
                            : useCod
                              ? `Place Order · ${formatPrice(orderTotal)}`
                              : `${c.nav.payPrefix} ${formatPrice(orderTotal)}`}
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      fullWidth
                      className="sm:w-auto"
                      onClick={handleNext}
                      // Held while the parcel offices load, so a quick tap past
                      // Shipping cannot leave the office unchosen.
                      isLoading={currentStep === 'shipping' && !!dropPointStatus?.loading}
                    >
                      {c.nav.continue}
                    </Button>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-2">
              <div className="sticky top-24 bg-white dark:bg-surface-900 rounded-2xl p-6 border border-surface-200 dark:border-surface-800">
                <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50 mb-4">
                  {c.headings.orderSummary}
                </h3>

                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.product.id} className="flex items-center gap-3">
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-surface-100 dark:bg-surface-850 flex-shrink-0">
                        <img src={item.product.images?.[0] || undefined} alt={item.product.name} className="h-full w-full object-contain p-1" />
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-brand-500 text-surface-950 text-caption font-bold flex items-center justify-center">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 truncate">{item.product.name}</p>
                        <p className="text-caption text-surface-500">{formatPrice(item.product.price)} {c.summary.each}</p>
                      </div>
                      <span className="text-body-sm font-bold text-surface-900 dark:text-surface-100">
                        {formatPrice(item.product.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                {priceNote && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-body-sm text-amber-800 dark:text-amber-200">{priceNote}</p>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-surface-200 dark:border-surface-800 space-y-2">
                  <div className="flex justify-between text-body-sm text-surface-500">
                    <span>{c.summary.subtotal}</span>
                    <span>{formatPrice(totalPrice())}</span>
                  </div>
                  {totalSavings() > 0 && (
                    <div className="flex justify-between text-body-sm text-emerald-600 dark:text-emerald-400">
                      <span>{c.summary.savings}</span>
                      <span>-{formatPrice(totalSavings())}</span>
                    </div>
                  )}
                  {couponDiscount > 0 && (
                    <div className="flex justify-between text-body-sm text-emerald-600 dark:text-emerald-400">
                      <span>Coupon {appliedCoupon?.code}</span>
                      <span>-{formatPrice(couponDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-body-sm text-surface-500">
                    <span>{c.summary.shipping}</span>
                    <span className={cn(
                      'font-medium',
                      shippingCost === 0 && qualifiesForFreeShipping
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-surface-900 dark:text-surface-100',
                    )}>
                      {shippingCost === 0 && qualifiesForFreeShipping ? c.summary.free : formatPrice(shippingCost)}
                    </span>
                  </div>
                  {gstAmount > 0 && (
                    <div className="flex justify-between text-caption text-surface-400">
                      <span>Incl. GST ({gstRate}%)</span>
                      <span>{formatPrice(gstAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-3 border-t border-surface-200 dark:border-surface-800">
                    <span className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">{c.summary.total}</span>
                    <span className="font-display font-bold text-heading-sm text-brand-600 dark:text-brand-400">{formatPrice(orderTotal)}</span>
                  </div>

                  {/* Where they collect, kept in view while they pay. This is
                      the part of the order a customer most often wants to
                      double-check before committing — it decides how far they
                      drive. */}
                  {dropPoint && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface-50 dark:bg-surface-800/50 px-3 py-2.5">
                      <Truck size={14} className="mt-0.5 shrink-0 text-surface-400" />
                      <div className="min-w-0 text-caption">
                        <p className="font-semibold text-surface-800 dark:text-surface-200">Collect from</p>
                        <p className="text-surface-500 dark:text-surface-400">
                          {dropPoint.name} — {[dropPoint.city, dropPoint.pincode].filter(Boolean).join(' ')}
                        </p>
                      </div>
                    </div>
                  )}
                  {!minimum.meetsMinimum && (
                    <div className="flex items-start gap-2 mt-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                      <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="text-body-sm text-amber-800 dark:text-amber-200">
                        <p>{minimum.message}</p>
                        <Link to="/shop" className="font-medium underline underline-offset-2">
                          Continue shopping
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-5 border-t border-dashed border-surface-200 dark:border-surface-800">
                  {!appliedCoupon && (
                    <p className="mb-2 text-body-sm font-medium text-surface-700 dark:text-surface-300">
                      Have a coupon code?
                    </p>
                  )}
                  <CouponField
                    items={cartLines}
                    applied={appliedCoupon}
                    onApply={setAppliedCoupon}
                    autoCode={searchParams.get('coupon') ?? undefined}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
