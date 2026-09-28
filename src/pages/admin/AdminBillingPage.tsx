import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type ReactNode,
  type RefObject,
} from 'react';
import type { AppliedCoupon } from '@/types/coupon.ts';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Receipt,
  User,
  UserPlus,
  Phone,
  MapPin,
  Banknote,
  Smartphone,
  CreditCard,
  Clock,
  ShoppingBag,
  X,
  Printer,
  Download,
  Share2,
  RotateCcw,
  CheckCircle2,
  Truck,
  FileText,
  Pause,
  Play,
  Eye,
  History,
  Tag,
  AlertTriangle,
  ArrowRightLeft,
  ChevronRight,
  ChevronDown,
  Building2,
  Pencil,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.ts';
import { useSiteStore } from '@/store/site.ts';
import { ApiRequestError } from '@/lib/api.ts';
import { cn } from '@/lib/utils.ts';
import { Select } from '@/components/atoms/Select.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { isValidGstin, normalizeGstin, gstinStateName, taxKindFor, GSTIN_REQUIRED_TYPES } from '@/lib/gstin.ts';
import { printBillDocument, downloadBillDocument, isCaseBill as billIsCase } from '@/lib/billDocument.ts';
import { computeBillTotals } from '@/lib/billMath.ts';
import { quotationToBill, quotationEstimate, type Quotation, type QuotationStatus } from '@/types/quotation.ts';
import type { QuotationPayload } from '@/services/quotations.ts';
import type {
  AdminProduct,
  Bill,
  BillItem,
  BillPayment,
  BillPaymentMethod,
  CounterSettings,
  Customer,
  CustomerInput,
  CustomerType,
} from '@/types/admin.ts';

// ══════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════

interface CartItem {
  rowId: string; // stable row identity (survives product change within a row)
  productId: string;
  name: string;
  image: string;
  unitPrice: number; // editable rate — per piece, or per CASE in case mode
  mrp: number; // originalPrice ?? price — for strikethrough
  quantity: number; // pieces, or CASES in case mode
  /** What `quantity` counts on this row. */
  unit: 'piece' | 'case';
  /** Pieces in one case, snapshotted so a later catalogue edit can't rewrite a saved bill. */
  piecesPerCase: number;
  stock: number | null; // always in PIECES, whatever the row's unit
  edited: boolean;
}

type InvoiceType = 'invoice' | 'quotation';
type BillingType = 'retail' | 'wholesale';
/**
 * How a wholesale line is priced and counted.
 *
 * 'piece' is the original behaviour and prints the regular tax invoice.
 * 'case' prices off the per-case rate and prints the full-case invoice — a
 * different document entirely, see WholesaleCaseInvoicePDF.
 */
type WholesaleUnit = 'piece' | 'case';
/**
 * Which GST split this bill charges.
 *
 * 'intra' is CGST+SGST, 'inter' is a single IGST line. The rupee total is the
 * same either way — only what the invoice prints, and what the shop files,
 * changes. Derived from the shop's GSTIN state vs the buyer's, and overridable
 * because the cashier is the one who knows when a buyer is registered in one
 * state and taking delivery in another.
 */
type TaxKind = 'intra' | 'inter';
type TableView = 'products' | 'customer-history' | 'product-history' | 'quotations';

interface FormSnapshot {
  invoiceType: InvoiceType;
  billingType: BillingType;
  wholesaleUnit?: WholesaleUnit;
  selectedCustomer: Customer | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  salesperson: string;
  cart: CartItem[];
  discountPercent: number;
  deliveryCharge: number;
  courierDelivery: boolean;
  paymentMethod: BillPaymentMethod;
  cashReceived: string;
  /** Whether that figure was typed. Absent on older held bills, whose figure always was. */
  cashTyped?: boolean;
  paymentRef: string;
  /** Absent on anything held or quoted before inter-state billing existed. */
  taxKind?: TaxKind;
  transport?: string;
  /**
   * The GST as entered. Absent on bills held before it was kept, which then
   * resume on the counter's defaults — the held total already said so.
   */
  gstMode?: 'percent' | 'flat';
  gstRate?: number;
  gstFlatAmount?: number;
  /** The coupon as quoted, and the post-discount figure it was quoted on. */
  coupon?: { code: string; discount: number; base: number };
  /**
   * What this bill was when it was held: a correction to a saved bill, a
   * quotation being re-priced, or one being converted. Held alongside the cart
   * so resuming it goes back into the same record instead of saving the cart as
   * a brand-new bill beside it — which sold the same goods twice.
   */
  editingBill?: Bill | null;
  editingQuotation?: Quotation | null;
  convertingQuotation?: Quotation | null;
}

interface HeldBill {
  id: string;
  heldAt: string;
  customerName: string;
  itemCount: number;
  total: number;
  snapshot: FormSnapshot;
}

/**
 * Turn the form as it stands into what the quotation API takes.
 *
 * Declared as a type here so the save path and the layout editor agree on one
 * shape. The server prices it — nothing on this screen decides a quotation's
 * totals any more than it decides a bill's.
 */
type QuotationDraft = QuotationPayload;

interface ReorderPayload {
  customer?: Customer;
  items?: { productId: string; name: string; unitPrice: number; quantity: number }[];
}

// ══════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════

// Resolved from real categories (slug → display name) at runtime; the usage sites
// fall back to the raw slug when a category isn't found.
let categoryLabels: Record<string, string> = {};

const discountPresets = [0, 40, 50, 55, 60];

const LS_HELD = 'ak_held_bills';
const LS_CAP = 30;

const paymentOptions: { method: BillPaymentMethod; icon: typeof Banknote; label: string }[] = [
  { method: 'cash', icon: Banknote, label: 'Cash' },
  { method: 'upi', icon: Smartphone, label: 'UPI' },
  { method: 'card', icon: CreditCard, label: 'Card' },
  { method: 'credit', icon: Clock, label: 'Credit' },
];

const customerTypes: CustomerType[] = ['retail', 'wholesale', 'dealer', 'other'];

// ══════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════

const inr = (n: number) => n.toLocaleString('en-IN');
const isValidPhone = (p: string) => /^\d{10}$/.test(p.trim());
/** Same phone, tolerant of spaces/dashes/+91 — a customer's stored phone may not
 *  always be a clean 10-digit string, but history should still be found for it. */
const normalizePhone = (p: string) => p.replace(/\D/g, '').slice(-10);
const hasEnoughDigits = (p: string) => normalizePhone(p).length === 10;
/** A coupon code as the server compares it: case and spaces don't matter. */
const normalizeCouponCode = (code?: string | null) => String(code ?? '').trim().toUpperCase().replace(/\s+/g, '');

/**
 * Whether a saved bill's round-off was typed in rather than worked out.
 *
 * The counter has no round-off box, so a correction saved here goes back to
 * automatic rounding. A typed figure shows up as a grand total that is not its
 * pre-rounding total rounded to the rupee, which also catches bills saved
 * before the server kept the `manualRoundOff` flag.
 */
function hasTypedRoundOff(bill: Bill): boolean {
  if (bill.manualRoundOff === null) return false;
  const beforeRounding = Math.round((bill.grandTotal - (bill.roundOff ?? 0)) * 100) / 100;
  return Math.abs(Math.round(beforeRounding) - bill.grandTotal) >= 0.005;
}

/**
 * Pieces a cart row takes off the shelf.
 *
 * The mirror of `piecesFor` on the server. Stock, the stock warning and the
 * bill's `totalQuantity` are all in pieces; only the printed Qty column and the
 * rate are in cases.
 */
function piecesOf(c: { quantity: number; unit: 'piece' | 'case'; piecesPerCase: number }): number {
  return c.unit === 'case' ? c.quantity * Math.max(1, c.piecesPerCase) : c.quantity;
}

let rowSeq = 0;
function newRowId(): string {
  return `row_${Date.now().toString(36)}_${rowSeq++}`;
}

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — ignore */
  }
}

function yymm(): string {
  const d = new Date();
  return `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// The estimate number used to be minted here, from a counter in this browser's
// localStorage, in its own `EST-` series. Both are gone: quotations now draw
// `AK-YYMM-#####` from the same server counter invoices do, so the number on a
// quotation IS the number of the invoice it becomes. See the backend's
// `invoiceNumber.ts`.

// ══════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════

export function AdminBillingPage() {
  const user = useAuthStore((s) => s.user);
  const siteConfig = useSiteStore((s) => s.config);

  // Document mode
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('invoice');
  const [billingType, setBillingType] = useState<BillingType>('retail');
  const [wholesaleUnit, setWholesaleUnit] = useState<WholesaleUnit>('piece');
  /** True only while Wholesale + Per Case are both selected. */
  const isCaseMode = billingType === 'wholesale' && wholesaleUnit === 'case';

  // Products
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  // Bumped once real categories resolve so slug→name labels re-render.
  const [, setCategoryLabelsVersion] = useState(0);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Customer
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [salesperson, setSalesperson] = useState(user?.displayName ?? '');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  /** The customer the inline form is correcting; null means it is adding one. */
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [prefillName, setPrefillName] = useState('');
  /**
   * The picked customer's record id, for linking the bill to it. Null for an
   * online account (the picker lists those too) and for no customer at all —
   * those bills are found by phone, as every bill used to be.
   */
  const linkedCustomerId = selectedCustomer && selectedCustomer.source !== 'user' ? selectedCustomer.id : null;
  /**
   * Whether the cashier picked or cleared the customer on this screen. A bill
   * being corrected keeps its link to its customer record unless they did, so a
   * lookup that failed while loading it can never quietly unlink it.
   */
  const customerTouchedRef = useRef(false);

  // Discount / charges
  const [discountPercent, setDiscountPercent] = useState(0);
  // Influencer/promo code applied to this counter sale. Only the code is sent
  // on; `couponDiscount` is the server's quote, re-checked when the bill saves.
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [isCheckingCoupon, setIsCheckingCoupon] = useState(false);
  /**
   * The bill being corrected keeps its own coupon through a cart change, and
   * this is true while that coupon is re-priced for the new cart. Saving
   * waits for it, so the total saved is the one on screen.
   */
  const [isRecheckingCoupon, setIsRecheckingCoupon] = useState(false);
  /**
   * The post-discount figure the applied coupon was quoted on. A coupon read
   * back off a saved bill or quotation is quoted on that record's figure, and
   * dropping it the moment its cart lands on screen — as a bare "the cart
   * changed" check did — lost the coupon on every edit and conversion.
   */
  const couponBaseRef = useRef<number | null>(null);
  const [gstRate, setGstRate] = useState(18);
  // Percent (rate on the taxable amount) vs a flat rupee amount the cashier types
  // directly — some bills need an exact GST figure that doesn't cleanly work out
  // to a round percentage.
  const [gstMode, setGstMode] = useState<'percent' | 'flat'>('flat');
  const [gstFlatAmount, setGstFlatAmount] = useState(0);
  /**
   * True while the GST on screen came from a saved bill, a quotation or a held
   * bill rather than from the shop default. The settings load is async, and
   * landing after `?edit=` had already read a 12% bill used to put it back on
   * the store rate — so saving the correction silently re-taxed the invoice.
   */
  const gstFromRecordRef = useRef(false);
  // Default the GST rate from the admin setting (loads async; still editable per bill).
  // When GST is toggled off store-wide, new bills default to 0%.
  useEffect(() => {
    if (gstFromRecordRef.current) return;
    setGstRate(siteConfig.gstEnabled === false ? 0 : (siteConfig.gstRate ?? 18));
  }, [siteConfig.gstRate, siteConfig.gstEnabled]);
  const [settingsDeliveryCharge, setSettingsDeliveryCharge] = useState(0); // default courier charge from settings
  // Settings → Inventory → "Block Counter Sales at Zero Stock". The server is
  // the real gate; this copy only lets the page explain itself before saving.
  const [enforceStockAtCounter, setEnforceStockAtCounter] = useState(false);
  // Settings → Billing. The server enforces the customer rules as well; this
  // copy decides what the counter asks for and what it fills in.
  const [counterRules, setCounterRules] = useState<CounterSettings>({
    autoFillCashReceived: false,
    requireCustomerPhone: true,
    allowSharedCustomerPhone: false,
  });
  // The shop's own GSTIN, from Settings -> Tax. Its state code is the left half
  // of the CGST+SGST vs IGST decision; without it every sale reads as local.
  const [shopGstin, setShopGstin] = useState('');
  /**
   * null while the split follows the two GSTINs; a value once the cashier has
   * picked one by hand. Kept separate from the derived answer so selecting a
   * different customer re-derives, but an explicit override is never quietly
   * undone underneath the person who set it.
   */
  const [taxKindOverride, setTaxKindOverride] = useState<TaxKind | null>(null);
  /**
   * Carrier / lorry service, typed at the counter and printed in the wholesale
   * pad's Transport box. Collected here rather than only in the invoice editor
   * because the goods leave the shop on the transport named at the till.
   */
  const [transport, setTransport] = useState('');
  /**
   * Asked for once, on the way out.
   *
   * Transport is the one field nobody knows at the start of a case sale — the
   * lorry is decided as the order is being loaded — so it is asked for when
   * Save & Print is pressed rather than sitting in the header all through
   * billing. Never required: Skip prints the invoice with the box empty.
   */
  const [transportDraft, setTransportDraft] = useState('');
  const [transportPromptOpen, setTransportPromptOpen] = useState(false);
  /**
   * The bill this screen is correcting, or null when it is raising a new one.
   *
   * Editing happens HERE rather than on a separate form: this is the screen
   * that knows how to search products, price a case line, apply a coupon and
   * take a payment. A second editor would be a second answer to all of it, and
   * the two would drift. Set from `?edit=<billId>`.
   */
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [courierDelivery, setCourierDelivery] = useState(false);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<BillPaymentMethod>('cash');
  const [cashReceived, setCashReceived] = useState('');
  /**
   * True once the cashier has typed their own figure into Received. Until then,
   * with "Fill Cash Received Automatically" on, the box follows the bill total;
   * Exact hands it back to following.
   */
  const [cashTyped, setCashTyped] = useState(false);
  const [paymentRef, setPaymentRef] = useState('');

  // Tabs + history
  const [tableView, setTableView] = useState<TableView>('products');
  const [customerBills, setCustomerBills] = useState<Bill[]>([]);
  const [customerBillsLoading, setCustomerBillsLoading] = useState(false);

  // Held + quotations
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [quotationsLoading, setQuotationsLoading] = useState(false);
  const [heldPanelOpen, setHeldPanelOpen] = useState(false);
  /**
   * The quotation this screen is re-pricing, or null when it is raising a new
   * one. Set from `?quote=<id>`.
   *
   * The counterpart of `editingBill`, and there for the same reason: saving
   * must go back into the quotation that is already numbered, rather than
   * leaving a second one beside it under a second number. That is exactly what
   * the old localStorage flow did — every Save minted a fresh estimate.
   */
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  /**
   * The quotation being turned into an invoice, from `?convert=<id>`.
   *
   * Kept apart from `editingQuotation` because Save & Print does something
   * different with it: it raises a real bill, under the number the quotation
   * already holds, and marks the quotation converted.
   */
  const [convertingQuotation, setConvertingQuotation] = useState<Quotation | null>(null);

  // Lifecycle
  const [completedBill, setCompletedBill] = useState<Bill | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  /**
   * The same flag, readable synchronously. F8 reaches the save without going
   * through the disabled button, and a held-down key repeats faster than a
   * re-render — each repeat used to post another bill and take the stock again.
   */
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /** Shop settings failed to load; stays up (unlike `notice`) until dismissed. */
  const [settingsWarning, setSettingsWarning] = useState('');
  const [previewBill, setPreviewBill] = useState<Bill | null>(null);

  const headerSearchRef = useRef<HTMLInputElement>(null);
  const tableSearchRef = useRef<HTMLInputElement>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const editBillId = searchParams.get('edit');
  const editQuoteId = searchParams.get('quote');
  const convertQuoteId = searchParams.get('convert');

  /**
   * Seed the whole screen from a saved bill.
   *
   * Runs after the catalogue has loaded, because a cart row carries the
   * product's image, MRP, stock and pack size — none of which live on the bill
   * item. A product that has since been deleted still loads: its line keeps the
   * name and rate the bill was raised with, which is what must reprint.
   */
  /**
   * Put a coupon back on the counter exactly as a saved record carries it.
   *
   * `base` is the post-discount figure it was worked out on, so the "cart
   * changed" check below keeps it for as long as the cart still adds up to that.
   * Passing no code clears whatever coupon the screen was holding.
   */
  const restoreCoupon = useCallback((code: string | undefined, discount: number | undefined, base: number) => {
    setCouponCode('');
    setCouponError('');
    if (code && (discount ?? 0) > 0) {
      // To the paisa, as the counter works it out; float noise from a paise
      // bill would read as a changed cart.
      couponBaseRef.current = Math.round(base * 100) / 100;
      setAppliedCoupon({ code, discount: discount ?? 0, description: '' });
    } else {
      couponBaseRef.current = null;
      setAppliedCoupon(null);
    }
  }, []);

  const loadBillForEdit = useCallback(async (billId: string, catalogue: AdminProduct[]) => {
    setIsLoadingEdit(true);
    try {
      const { getBillById, getCustomers, getBillingCustomerById } = await import('@/services/admin.ts');
      const bill = await getBillById(billId);
      if (!bill) {
        setError('That bill could not be found.');
        return;
      }
      if (bill.status === 'cancelled') {
        setError(`${bill.billNumber} was cancelled — its stock has been returned, so it cannot be edited.`);
        return;
      }
      // One record at a time: a quotation left open underneath would otherwise
      // decide where Save goes.
      setEditingQuotation(null);
      setConvertingQuotation(null);
      setEditingBill(bill);

      const mode = bill.billingMode ?? 'retail';
      setBillingType(mode === 'retail' ? 'retail' : 'wholesale');
      setWholesaleUnit(mode === 'wholesale-case' ? 'case' : 'piece');

      setCart(
        bill.items.map((it) => {
          const p = catalogue.find((x) => x.id === it.productId);
          return {
            rowId: newRowId(),
            productId: it.productId,
            name: it.name,
            image: p?.images?.[0] || '',
            unitPrice: it.unitPrice,
            mrp: p?.originalPrice ?? p?.price ?? it.unitPrice,
            quantity: it.quantity,
            unit: it.unit ?? 'piece',
            piecesPerCase: it.piecesPerCase ?? p?.quantityPerCase ?? 1,
            stock: typeof p?.stockCount === 'number' ? p.stockCount : null,
            // Every line arrives already priced by the bill, so none of them is
            // a fresh pick the rate rules should overwrite.
            edited: true,
          };
        }),
      );

      setCustomerName(bill.customerName ?? '');
      setCustomerPhone(bill.customerPhone ?? '');
      setCustomerAddress(bill.customerAddress ?? '');
      setSalesperson(bill.salesperson ?? '');
      // The customer record itself carries the GSTIN the tax split is derived
      // from, so it is looked up rather than left null.
      setSelectedCustomer(null);
      customerTouchedRef.current = false;
      // The record the bill is linked to, when it has one — a phone may be
      // shared by more than one customer, or be missing altogether.
      const linked = bill.customer ? await getBillingCustomerById(bill.customer) : null;
      if (linked) {
        setSelectedCustomer(linked);
      } else if (bill.customerPhone) {
        const matches = await getCustomers({ search: bill.customerPhone, limit: 5 }).catch(() => [] as Customer[]);
        const digits = normalizePhone(bill.customerPhone);
        const found = matches.find((c) => normalizePhone(c.phone) === digits);
        if (found) setSelectedCustomer(found);
      }

      setDiscountPercent(bill.discountPercent ?? 0);
      // The coupon the bill already carries. Left off, the counter showed a
      // total the coupon amount higher than the saved one, and refused the
      // pre-filled cash as short.
      restoreCoupon(bill.couponCode, bill.couponDiscount, bill.subtotal - bill.totalDiscount);
      gstFromRecordRef.current = true;
      setGstMode(bill.gstMode ?? 'percent');
      setGstRate(bill.gstRate ?? 18);
      setGstFlatAmount(bill.gstAmount ?? 0);
      setDeliveryCharge(bill.deliveryCharge ?? 0);
      setCourierDelivery(Boolean(bill.courierDelivery));
      // Pinned, not derived: the split this bill was raised with is a fact about
      // the bill, and re-deriving it could silently re-tax a filed invoice.
      setTaxKindOverride(bill.taxKind ?? ((bill.totalIgst ?? 0) > 0 ? 'inter' : 'intra'));
      setTransport(bill.caseInvoice?.transport ?? '');
      setPaymentMethod(bill.payment?.method ?? 'cash');
      setPaymentRef(bill.payment?.reference ?? '');
      setCashReceived(bill.payment?.method === 'cash' ? String(bill.payment.amount ?? '') : '');
      setInvoiceType('invoice');
      setTableView('products');
      setNotice(`Editing ${bill.billNumber}. Saving re-prices it and moves stock by the difference.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that bill.');
    } finally {
      setIsLoadingEdit(false);
    }
  }, [restoreCoupon]);

  /**
   * Seed the whole screen from a saved quotation.
   *
   * `mode` decides what Save & Print will then do with it: 're-price' writes
   * back into the same quotation, 'convert' raises the invoice under the
   * quotation's number. Everything up to that point is identical, which is why
   * one loader serves both.
   *
   * Runs after the catalogue has loaded — a cart row carries the product's
   * image, MRP, stock and pack size, none of which are on the quotation item. A
   * product since deleted still loads, keeping the name and rate it was quoted
   * at, because that is what was promised to the customer.
   */
  const loadQuotation = useCallback(
    async (quoteId: string, catalogue: AdminProduct[], mode: 're-price' | 'convert') => {
      setIsLoadingEdit(true);
      try {
        const { getQuotationById } = await import('@/services/quotations.ts');
        const { getCustomers, getBillingCustomerById } = await import('@/services/admin.ts');
        const quote = await getQuotationById(quoteId);
        if (!quote) {
          setError('That quotation could not be found.');
          return;
        }
        if (quote.status === 'converted') {
          setError(
            `${quote.quotationNumber} has already been converted to an invoice — open the bill to change it.`,
          );
          return;
        }
        if (quote.status === 'cancelled') {
          setError(`${quote.quotationNumber} was cancelled and cannot be reopened.`);
          return;
        }

        // Exactly one record open at a time — whichever is left set decides
        // where Save goes, so the other two are cleared rather than trusted.
        setEditingBill(null);
        setConvertingQuotation(mode === 'convert' ? quote : null);
        setEditingQuotation(mode === 'convert' ? null : quote);

        const billingMode = quote.billingMode ?? 'retail';
        setBillingType(billingMode === 'retail' ? 'retail' : 'wholesale');
        setWholesaleUnit(billingMode === 'wholesale-case' ? 'case' : 'piece');

        setCart(
          quote.items.map((it) => {
            const p = catalogue.find((x) => x.id === it.productId);
            return {
              rowId: newRowId(),
              productId: it.productId,
              name: it.name,
              image: p?.images?.[0] || it.image || '',
              unitPrice: it.unitPrice,
              mrp: p?.originalPrice ?? p?.price ?? it.unitPrice,
              quantity: it.quantity,
              unit: it.unit ?? 'piece',
              piecesPerCase: it.piecesPerCase ?? p?.quantityPerCase ?? 1,
              stock: typeof p?.stockCount === 'number' ? p.stockCount : null,
              // Every line arrives at the rate the customer was quoted. None of
              // them is a fresh pick the rate rules should overwrite — the whole
              // point of a quotation is that the price was already agreed.
              edited: true,
            };
          }),
        );

        setCustomerName(quote.customerName ?? '');
        setCustomerPhone(quote.customerPhone ?? '');
        setCustomerAddress(quote.customerAddress ?? '');
        setSalesperson(quote.salesperson ?? '');
        // Whoever was selected before is not this quotation's customer — their
        // GSTIN would otherwise ride along into the invoice.
        setSelectedCustomer(null);
        const linked = quote.customer ? await getBillingCustomerById(quote.customer) : null;
        if (linked) {
          setSelectedCustomer(linked);
        } else if (quote.customerPhone) {
          const matches = await getCustomers({ search: quote.customerPhone, limit: 5 }).catch(
            () => [] as Customer[],
          );
          const digits = normalizePhone(quote.customerPhone);
          const found = matches.find((c) => normalizePhone(c.phone) === digits);
          if (found) setSelectedCustomer(found);
        }

        setDiscountPercent(quote.discountPercent ?? 0);
        // The coupon the customer was quoted with. Without it the counter took
        // the higher, coupon-free total in cash while the server quietly applied
        // the quotation's coupon to the bill it raised.
        restoreCoupon(quote.couponCode, quote.couponDiscount, quote.subtotal - quote.totalDiscount);
        gstFromRecordRef.current = true;
        setGstMode(quote.gstMode ?? 'percent');
        setGstRate(quote.gstRate ?? 18);
        setGstFlatAmount(quote.gstAmount ?? 0);
        setDeliveryCharge(quote.deliveryCharge ?? 0);
        setCourierDelivery(Boolean(quote.courierDelivery));
        // Pinned rather than re-derived: the split this quotation was priced
        // with is what the customer was shown, and re-deriving it could quietly
        // change the tax on a quote already in their hands. The printed page's
        // own choice wins — the layout editor is where the split is changed
        // after the fact, and the rupees are the same either way.
        setTaxKindOverride(
          quote.layout?.taxKind ?? quote.taxKind ?? ((quote.totalIgst ?? 0) > 0 ? 'inter' : 'intra'),
        );
        setTransport(quote.layout?.transport ?? '');
        setInvoiceType(mode === 'convert' ? 'invoice' : 'quotation');
        setTableView('products');
        setNotice(
          mode === 'convert'
            ? `Converting ${quote.quotationNumber} to an invoice — take the payment and Save & Print. It keeps this number.`
            : `Editing ${quote.quotationNumber}. Saving keeps this number.`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load that quotation.');
      } finally {
        setIsLoadingEdit(false);
      }
    },
    [restoreCoupon],
  );

  /** Re-read the quotation list behind the Quotations tab. */
  const refreshQuotations = useCallback(async () => {
    setQuotationsLoading(true);
    try {
      const { getQuotations } = await import('@/services/quotations.ts');
      const { data } = await getQuotations({ limit: 25, sort: 'newest' });
      setQuotations(data);
    } catch {
      /* keep whatever is on screen — an empty list would read as "none exist" */
    } finally {
      setQuotationsLoading(false);
    }
  }, []);

  // ─── Load products + settings + customers + local lists ───
  useEffect(() => {
    // The quotation handoffs used to come through a `localStorage` blob
    // (`ak_convert_quote`) holding a whole form snapshot. They are now `?quote=`
    // and `?convert=` against a real row, so the quotation the counter opens is
    // the same one every other screen and every other device sees.
    (async () => {
      try {
        const { getActiveProducts, getSiteSettings } = await import('@/services/admin.ts');
        // Loaded side by side, and neither can take the other down. A settings
        // failure used to abort this whole block — no catalogue, and a `?edit=`
        // or `?convert=` link that silently opened an empty counter.
        const [prodsResult, settingsResult] = await Promise.allSettled([getActiveProducts(), getSiteSettings()]);
        const prods = prodsResult.status === 'fulfilled' ? prodsResult.value : [];
        setProducts(prods);

        if (settingsResult.status === 'fulfilled' && settingsResult.value) {
          const settings = settingsResult.value;
          const rates = settings.shippingRates;
          setSettingsDeliveryCharge((rates?.standardRate || rates?.packagingFee || 0) as number);
          setEnforceStockAtCounter(Boolean(settings.inventorySettings?.enforceStockAtCounter));
          if (settings.counterSettings) setCounterRules(settings.counterSettings);
          setShopGstin((settings.gstin as string | undefined) ?? '');
        } else {
          // Safe defaults stay on — no courier charge, the stock rule left to
          // the server, a local tax split — and the cashier is told to check
          // them rather than billing on figures nobody loaded.
          setSettingsWarning(
            'Couldn’t load shop settings — check GST, the courier charge and the tax split before billing. Reload to try again.',
          );
        }
        if (prodsResult.status === 'rejected') {
          setError('Couldn’t load the product list. Searching still finds products — reload to try again.');
        }

        // `?edit=<billId>` turns this screen into the editor for that bill. It
        // runs here rather than in its own effect so the catalogue is already
        // loaded — the cart rows are built from it.
        if (editBillId) {
          await loadBillForEdit(editBillId, prods);
          setIsLoadingProducts(false);
          return;
        }

        // `?quote=<id>` re-prices that quotation; `?convert=<id>` turns it into
        // the invoice it was for. Both need the catalogue, same as above.
        if (editQuoteId || convertQuoteId) {
          await loadQuotation(
            (editQuoteId || convertQuoteId) as string,
            prods,
            editQuoteId ? 're-price' : 'convert',
          );
          setIsLoadingProducts(false);
          return;
        }

        // Reorder / repeat-purchase handoff from a customer detail page.
        try {
          const raw = localStorage.getItem('ak_reorder');
          if (raw) {
            localStorage.removeItem('ak_reorder');
            const payload = JSON.parse(raw) as ReorderPayload;
            if (payload.customer) {
              setSelectedCustomer(payload.customer);
              setCustomerName(payload.customer.name || '');
              setCustomerPhone(payload.customer.phone || '');
              setCustomerAddress(payload.customer.address || '');
              if (payload.customer.customerType === 'wholesale' || payload.customer.customerType === 'dealer') {
                setBillingType('wholesale');
              }
            }
            // A new bill is sold from the catalogue, so a hand-written case-pad
            // line (no product) can't be carried over; it would refuse the bill.
            const allItems = payload.items || [];
            const catalogueItems = allItems.filter((it) => it.productId);
            const skipped = allItems.length - catalogueItems.length;
            const restored: CartItem[] = catalogueItems.map((it) => {
              const p = prods.find((x) => x.id === it.productId);
              return {
                rowId: newRowId(),
                productId: it.productId,
                name: it.name,
                image: p?.images?.[0] || '',
                unitPrice: it.unitPrice,
                mrp: p?.originalPrice ?? p?.price ?? it.unitPrice,
                quantity: it.quantity,
                // A reorder handoff carries no unit, so it is a per-piece line.
                unit: 'piece' as const,
                piecesPerCase: p?.quantityPerCase ?? 1,
                stock: typeof p?.stockCount === 'number' ? p.stockCount : null,
                edited: true,
              };
            });
            const skippedNote = skipped
              ? ` ${skipped} hand-written line${skipped === 1 ? ' was' : 's were'} not copied — add ${skipped === 1 ? 'it' : 'them'} again if needed.`
              : '';
            if (restored.length) {
              setCart(restored);
              setNotice(`Loaded ${restored.length} item(s) from a previous purchase — review and save.${skippedNote}`);
            } else if (skipped) {
              setNotice(`Nothing to reorder:${skippedNote}`);
            }
          }
        } catch { /* ignore malformed reorder */ }
      } catch {
        /* products stay empty */
      } finally {
        setIsLoadingProducts(false);
      }
    })();
    void loadCustomers();
    setHeldBills(loadLS<HeldBill[]>(LS_HELD, []));
    void refreshQuotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Re-read the catalogue, and refresh the stock figure on any row already in
   * the cart.
   *
   * Called after every saved bill. The list used to be fetched once on mount and
   * never again, so selling a product and then starting a new bill still showed
   * the stock it had before the sale — which looks exactly like "stock was not
   * deducted" even though the server had decremented it correctly.
   *
   * Rates are deliberately left alone: this refreshes what is ON THE SHELF, and
   * silently re-pricing a line the cashier already agreed with a customer would
   * be a far worse bug than a stale stock count.
   */
  const refreshProducts = useCallback(async () => {
    try {
      const { getActiveProducts } = await import('@/services/admin.ts');
      const fresh = await getActiveProducts();
      setProducts(fresh);
      setCart((prev) =>
        prev.map((row) => {
          const p = fresh.find((x) => x.id === row.productId);
          return p && typeof p.stockCount === 'number' ? { ...row, stock: p.stockCount } : row;
        }),
      );
    } catch {
      /* keep the previous list — a stale count beats an empty picker */
    }
  }, []);

  /** Guards against the double fire below. */
  const lastStockRefresh = useRef(0);

  /*
   * Re-read stock whenever this screen comes back into view.
   *
   * Navigating to Products or Inventory and back already refetches, because
   * the route unmounts. What did not was the way the counter actually works:
   * Billing stays open all day in one tab or on one machine while stock is
   * added or corrected in another. Nothing told this screen, so it went on
   * showing the figures it read at open — which reads as "the stock update did
   * not save" when it saved perfectly well.
   *
   * Only stock moves. `refreshProducts` deliberately leaves rates alone, so a
   * price the cashier has already agreed with a customer standing at the
   * counter cannot change under them.
   */
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState !== 'visible') return;
      // Switching tabs fires focus and visibilitychange together, and a bare
      // window focus fires on any click back into the page. One fetch.
      const now = Date.now();
      if (now - lastStockRefresh.current < 3000) return;
      lastStockRefresh.current = now;
      void refreshProducts();
    };

    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, [refreshProducts]);

  const loadCustomers = useCallback(async () => {
    try {
      const svc = await import('@/services/admin.ts');
      // Preload a bounded working set for the counter picker (the directory + the
      // customer-detail search are the server-side paths for the full base).
      const [directory, usersRes] = await Promise.all([
        svc.getCustomers({ limit: 100 }).catch(() => [] as Customer[]),
        svc.getAllCustomers({ role: 'user', limit: 100 }).catch(() => ({ data: [] as unknown[] })),
      ]);
      // Include online signups (registered users) not already in the POS directory.
      const byPhone = new Set(directory.map((c) => c.phone));
      const userCustomers: Customer[] = (usersRes.data as Array<Record<string, unknown>>)
        .filter((u) => (u.role ?? 'user') === 'user' && u.phone && !byPhone.has(u.phone as string))
        .map((u) => ({
          id: (u.uid || u._id || u.id) as string,
          name: (u.displayName as string) || 'Customer',
          phone: (u.phone as string) || '',
          email: (u.email as string) || undefined,
          address: '',
          city: (u.city as string) || undefined,
          state: (u.state as string) || undefined,
          customerType: 'retail',
          source: 'user',
        }));
      setCustomers([...directory, ...userCustomers]);
    } catch {
      /* keep whatever we have */
    }
  }, []);

  // ─── Category labels (slug → display name) ───
  useEffect(() => {
    (async () => {
      try {
        const { getAllCategories } = await import('@/services/admin.ts');
        const { data } = await getAllCategories();
        categoryLabels = Object.fromEntries(data.map((c) => [c.slug, c.name]));
        setCategoryLabelsVersion((v) => v + 1);
      } catch {
        /* keep previous labels — usage sites fall back to the raw slug */
      }
    })();
  }, []);

  // ─── Transient notice ───
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // ─── Customer history (debounced) ───
  // By the customer record when one is picked, which keeps two customers who
  // share a phone apart; otherwise by the phone on the bill.
  useEffect(() => {
    if (!linkedCustomerId && !hasEnoughDigits(customerPhone)) {
      setCustomerBills([]);
      return;
    }
    let cancelled = false;
    setCustomerBillsLoading(true);
    const t = setTimeout(async () => {
      try {
        const { getBillsByCustomer } = await import('@/services/admin.ts');
        const bills = await getBillsByCustomer(
          linkedCustomerId ? { customerId: linkedCustomerId } : { phone: normalizePhone(customerPhone) },
        );
        if (!cancelled) setCustomerBills(bills);
      } catch {
        if (!cancelled) setCustomerBills([]);
      } finally {
        if (!cancelled) setCustomerBillsLoading(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [customerPhone, linkedCustomerId]);

  // ══════════════════════════════════════════════════
  // Cart operations
  // ══════════════════════════════════════════════════

  /**
   * The rate for one unit of this product in the current mode.
   *
   * In case mode that is the per-case rate, falling back to the per-piece rate
   * multiplied out — a product priced per piece with a known pack size can still
   * be sold by the case without the shop having to re-enter a second figure.
   * Returns null when neither is available, which is what blocks the line.
   */
  const rateFor = useCallback(
    (product: AdminProduct, type: BillingType, unit: WholesaleUnit): number | null => {
      if (type !== 'wholesale') return product.price;
      if (unit === 'piece') return product.wholesalePrice ?? product.originalPrice ?? product.price;
      if (product.wholesalePricePerCase) return product.wholesalePricePerCase;
      const perPiece = product.wholesalePrice ?? product.price;
      return product.quantityPerCase ? perPiece * product.quantityPerCase : null;
    },
    [],
  );

  /** Pieces in one case, or 1 when the row is billed per piece. */
  const packSize = useCallback(
    (product: AdminProduct | undefined, unit: WholesaleUnit) =>
      unit === 'case' ? Math.max(1, product?.quantityPerCase ?? 1) : 1,
    [],
  );

  /**
   * Why a product cannot be sold by the case, or '' when it can. Surfaced as an
   * error rather than guessing a rate — a wholesale invoice priced off a made-up
   * case rate is worse than one that refuses to be raised.
   */
  const caseBlocker = useCallback((product: AdminProduct): string => {
    if (product.wholesalePricePerCase && product.quantityPerCase) return '';
    if (!product.quantityPerCase) {
      return `“${product.name}” has no Quantity per Case set — add it under Products → Pricing.`;
    }
    if (!product.wholesalePricePerCase && !product.wholesalePrice) {
      return `“${product.name}” has no wholesale rate — add a per-case or per-piece rate under Products → Pricing.`;
    }
    return '';
  }, []);

  const addToCart = useCallback(
    (product: AdminProduct) => {
      if (isCaseMode) {
        const blocker = caseBlocker(product);
        if (blocker) {
          setError(blocker);
          return;
        }
      }
      const unit: WholesaleUnit = isCaseMode ? 'case' : 'piece';
      const rate = rateFor(product, billingType, unit);
      if (rate === null) {
        setError(caseBlocker(product) || `No rate available for “${product.name}”.`);
        return;
      }
      setCart((prev) => {
        // Only a row counting the same unit can absorb this one. A reorder can
        // drop a case line into a piece-mode cart, and adding a piece to it
        // would read as one more case.
        const existing = prev.find((c) => c.productId === product.id && c.unit === unit);
        if (existing) {
          return prev.map((c) =>
            c.rowId === existing.rowId ? { ...c, quantity: c.quantity + 1 } : c,
          );
        }
        return [
          ...prev,
          {
            rowId: newRowId(),
            productId: product.id,
            name: product.name,
            image: product.images[0] || '',
            unitPrice: rate,
            mrp: product.originalPrice ?? product.price,
            quantity: 1,
            unit,
            piecesPerCase: packSize(product, unit),
            stock: typeof product.stockCount === 'number' ? product.stockCount : null,
            edited: false,
          },
        ];
      });
      setError('');
    },
    [billingType, isCaseMode, rateFor, packSize, caseBlocker],
  );

  // Replace the product in an existing row (keeps the row + its quantity).
  const changeRowProduct = useCallback(
    (rowId: string, product: AdminProduct) => {
      if (isCaseMode) {
        const blocker = caseBlocker(product);
        if (blocker) {
          setError(blocker);
          return;
        }
      }
      const unit: WholesaleUnit = isCaseMode ? 'case' : 'piece';
      const rate = rateFor(product, billingType, unit);
      if (rate === null) {
        setError(caseBlocker(product) || `No rate available for “${product.name}”.`);
        return;
      }
      setCart((prev) => {
        const target = prev.find((c) => c.rowId === rowId);
        if (!target) return prev;
        // Only a row counting the same unit can absorb this one — the rule
        // addToCart already follows. Merging 5 pieces into a 2-case row read "7".
        const dupe = prev.find((c) => c.productId === product.id && c.unit === unit && c.rowId !== rowId);
        if (dupe) {
          // Product already on another row → merge quantities, drop this row.
          return prev
            .filter((c) => c.rowId !== rowId)
            .map((c) => (c.rowId === dupe.rowId ? { ...c, quantity: c.quantity + target.quantity } : c));
        }
        return prev.map((c) =>
          c.rowId === rowId
            ? {
                ...c,
                productId: product.id,
                name: product.name,
                image: product.images[0] || '',
                unitPrice: rate,
                mrp: product.originalPrice ?? product.price,
                unit,
                piecesPerCase: packSize(product, unit),
                stock: typeof product.stockCount === 'number' ? product.stockCount : null,
                edited: false,
              }
            : c,
        );
      });
      setError('');
    },
    [billingType, isCaseMode, rateFor, packSize, caseBlocker],
  );

  const updateQuantity = useCallback((rowId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.rowId === rowId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c))
        .filter((c) => c.quantity > 0),
    );
  }, []);

  /**
   * Set a row's quantity from the typed box.
   *
   * Never removes the row. This used to drop any line that hit 0, and an
   * emptied number input reads as 0 — so a cashier selecting "5" to type "12"
   * destroyed the line between the two keystrokes. Removing is the minus
   * button's job (and the bin's), both of which are deliberate.
   */
  const setQuantity = useCallback((rowId: string, qty: number) => {
    setCart((prev) => prev.map((c) => (c.rowId === rowId ? { ...c, quantity: Math.max(1, qty) } : c)));
  }, []);

  const setRate = useCallback((rowId: string, rate: number) => {
    setCart((prev) =>
      prev.map((c) => (c.rowId === rowId ? { ...c, unitPrice: Math.max(0, rate), edited: true } : c)),
    );
  }, []);

  /**
   * Override how many pieces are in a case, for this bill only.
   *
   * The catalogue figure is just a default: a shop packs to order, and one
   * customer's case of a given item is not always the next one's. The value is
   * already snapshotted onto the bill item, so a later catalogue change cannot
   * rewrite what this bill said — and stock moves by the number printed here.
   */
  const setPackSize = useCallback((rowId: string, pieces: number) => {
    setCart((prev) =>
      prev.map((c) => (c.rowId === rowId ? { ...c, piecesPerCase: Math.max(1, Math.round(pieces) || 1) } : c)),
    );
  }, []);

  const removeFromCart = useCallback((rowId: string) => {
    setCart((prev) => prev.filter((c) => c.rowId !== rowId));
  }, []);

  /**
   * Re-rate the cart for a new mode.
   *
   * `edited` rows keep the rate the cashier typed — that has always been the
   * rule and a negotiated price must survive a mode flip. Their *unit* still
   * changes, because the row has to count the same thing as every other row on
   * the bill; only the money the cashier chose is preserved.
   */
  const reprice = useCallback(
    (type: BillingType, unit: WholesaleUnit) =>
      setCart((prev) =>
        prev.map((c) => {
          const product = products.find((p) => p.id === c.productId);
          const nextUnit: WholesaleUnit = type === 'wholesale' ? unit : 'piece';
          const pieces = packSize(product, nextUnit);
          if (c.unit === nextUnit && c.edited) return c;

          // Converting between units carries the real volume across rather than
          // the bare number: 300 pieces of a 100-pack becomes 3 cases, not 300.
          const quantity =
            c.unit === nextUnit
              ? c.quantity
              : nextUnit === 'case'
                ? Math.max(1, Math.ceil((c.quantity * c.piecesPerCase) / pieces))
                : Math.max(1, c.quantity * c.piecesPerCase);

          const rate = product ? rateFor(product, type, nextUnit) : null;
          return {
            ...c,
            quantity,
            unit: nextUnit,
            piecesPerCase: pieces,
            unitPrice: c.edited || rate === null ? c.unitPrice : rate,
          };
        }),
      ),
    [products, rateFor, packSize],
  );

  const switchBillingType = useCallback(
    (type: BillingType) => {
      setBillingType(type);
      // Not while Per Case is still selected: case rates are already the
      // wholesale figure, and coming back to Wholesale that way used to take
      // 60% off them — the thing switchWholesaleUnit exists to prevent.
      if (type === 'wholesale' && discountPercent === 0 && wholesaleUnit !== 'case') setDiscountPercent(60);
      if (type === 'retail' && discountPercent === 60) setDiscountPercent(0);
      reprice(type, type === 'wholesale' ? wholesaleUnit : 'piece');
    },
    [discountPercent, reprice, wholesaleUnit],
  );

  const switchWholesaleUnit = useCallback(
    (unit: WholesaleUnit) => {
      setWholesaleUnit(unit);
      reprice(billingType, unit);
      // Case pricing is already the wholesale rate for a whole case, so the
      // per-piece discount the Wholesale tab presets does not belong on top of
      // it — leaving it there would take 60% off an already-wholesale figure.
      if (unit === 'case' && discountPercent === 60) setDiscountPercent(0);
      const blocked = cart
        .map((c) => products.find((p) => p.id === c.productId))
        .filter((p): p is AdminProduct => Boolean(p))
        .filter((p) => unit === 'case' && caseBlocker(p));
      setError(
        blocked.length
          ? `${blocked.length} item(s) have no case pricing yet — set Wholesale Rate (per case) and Quantity per Case under Products.`
          : '',
      );
    },
    [billingType, reprice, discountPercent, cart, products, caseBlocker],
  );

  // ══════════════════════════════════════════════════
  // Customer selection
  //
  // Sits below the cart operations because choosing a customer RE-PRICES the
  // cart: a wholesale record puts the bill on wholesale rates, a retail one
  // puts it back. It therefore has to go through `switchBillingType`, which is
  // defined above.
  // ══════════════════════════════════════════════════

  /** The billing type a customer record implies. */
  const billingTypeForCustomer = useCallback(
    (c: Customer): BillingType =>
      c.customerType === 'wholesale' || c.customerType === 'dealer' ? 'wholesale' : 'retail',
    [],
  );

  /**
   * Copy a customer onto the bill and put the cart on their rates.
   *
   * `fromType` is the billing type to compare against, defaulting to the one on
   * screen. It is passed explicitly by the callers that reset the form first —
   * their state says retail before React has re-rendered, and diffing against
   * the stale value would skip the switch.
   *
   * The switch runs in BOTH directions. It used to only ever upgrade to
   * wholesale, so billing a retail customer straight after a wholesale one
   * quietly charged them the wholesale rate.
   */
  const applyCustomer = useCallback(
    (c: Customer, fromType?: BillingType) => {
      customerTouchedRef.current = true;
      setSelectedCustomer(c);
      setCustomerName(c.name);
      setCustomerPhone(c.phone);
      setCustomerAddress(c.address || '');
      const next = billingTypeForCustomer(c);
      if (next !== (fromType ?? billingType)) switchBillingType(next);
      setSelectorOpen(false);
      setError('');
    },
    [billingType, billingTypeForCustomer, switchBillingType],
  );

  /** Take the customer off the bill, and the bill back off wholesale rates. */
  const clearCustomer = useCallback(
    (fromType?: BillingType) => {
      customerTouchedRef.current = true;
      setSelectedCustomer(null);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      if ((fromType ?? billingType) !== 'retail') switchBillingType('retail');
      setSelectorOpen(false);
    },
    [billingType, switchBillingType],
  );

  /**
   * The customer change waiting on an answer, or null when none is.
   *
   * Changing the customer half-way through a bill re-addresses every line and,
   * now that the type re-prices, can move the money too — so with items in the
   * cart it asks first instead of swapping underneath the cashier. `target` is
   * null when the prompt was opened by Clear rather than by picking someone.
   */
  const [customerSwitch, setCustomerSwitch] = useState<{ target: Customer | null } | null>(null);

  const selectCustomer = useCallback(
    (c: Customer) => {
      // Nothing to lose, no customer to displace, or the same one again.
      if (cart.length === 0 || !selectedCustomer || selectedCustomer.id === c.id) {
        applyCustomer(c);
        return;
      }
      setSelectorOpen(false);
      setCustomerSwitch({ target: c });
    },
    [cart.length, selectedCustomer, applyCustomer],
  );

  const requestClearCustomer = useCallback(() => {
    if (cart.length === 0 || !selectedCustomer) {
      clearCustomer();
      return;
    }
    setCustomerSwitch({ target: null });
  }, [cart.length, selectedCustomer, clearCustomer]);

  const onCustomerSaved = useCallback(
    (c: Customer, wasEdit: boolean) => {
      setCustomers((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
      // Applied directly rather than through `selectCustomer`: the cashier just
      // filled this form in, so there is nothing to warn them they are losing.
      // An edit may have changed the name, phone, address or GSTIN, and all
      // four are copied onto the bill here — leaving the old copy in place
      // would print the figures that were just corrected.
      applyCustomer(c);
      setShowCustomerForm(false);
      setEditingCustomer(null);
      setNotice(`Customer “${c.name}” ${wasEdit ? 'updated' : 'added & selected'}.`);
    },
    [applyCustomer],
  );

  // ══════════════════════════════════════════════════
  // Calculations (billMath.ts, which must equal the server's pricing.ts)
  // ══════════════════════════════════════════════════

  /**
   * The split this bill will be charged at.
   *
   * The server re-derives this the same way and an explicit override is sent
   * with the bill, so what the counter shows is what gets stored. A buyer with
   * no GSTIN, or a shop that has not set its own, falls back to 'intra' — an
   * unregistered walk-in is a local sale.
   */
  const derivedTaxKind: TaxKind = taxKindFor(shopGstin, selectedCustomer?.gstin);
  const taxKind: TaxKind = taxKindOverride ?? derivedTaxKind;

  const packagingFee = 0; // packaging is no longer charged separately; delivery/courier handles it
  const delivery = Math.max(0, Number(deliveryCharge) || 0);
  // Priced by billMath, the mirror of the server's pricing.ts, rather than by a
  // third copy of the sums here: that copy had fallen behind once paise rates
  // and a 100% discount priced differently, and the counter showed one total
  // while the server saved another.
  const totals = computeBillTotals({
    lines: cart.map((c) => ({ unitPrice: c.unitPrice, quantity: c.quantity })),
    discountPercent,
    couponDiscount: appliedCoupon?.discount ?? 0,
    packagingFee,
    deliveryCharge: delivery,
    gst: gstMode === 'flat' ? { mode: 'flat', amount: gstFlatAmount } : { mode: 'percent', rate: gstRate },
    taxKind,
  });
  const { subtotal, totalDiscount, taxableAmount, grandTotal, roundOff } = totals;
  // A coupon stacks on top of the cashier's discount and is worked out on what
  // is left after it. This is the figure a coupon is quoted and re-checked on.
  const afterManualDiscount = Math.round((subtotal - totalDiscount) * 100) / 100;
  const couponDiscount = Math.min(Math.max(0, appliedCoupon?.discount ?? 0), afterManualDiscount);
  // Where the same tax is printed: two halves for a local sale, one IGST line
  // for an inter-state one. The grand total is identical either way, which is
  // why the split can be changed after the rate without re-quoting a customer.
  const cgst = totals.totalCgst;
  const sgst = totals.totalSgst;
  const igst = totals.totalIgst;
  // Half the tax as a fraction of the taxable amount, from either a rate
  // (default 18%) or a flat rupee amount. Only the rate labels read it.
  const gstHalf = gstMode === 'flat'
    ? (taxableAmount > 0 ? Math.max(0, Number(gstFlatAmount) || 0) / 2 / taxableAmount : 0)
    : (Number.isFinite(gstRate) && gstRate >= 0 ? gstRate : 18) / 2 / 100;
  // Pieces, always — `quantity` counts cases on a case line, and stockCount is
  // kept in pieces, so the two can only be compared after this conversion.
  const totalQuantity = cart.reduce((s, c) => s + piecesOf(c), 0);
  const totalCases = cart.reduce((s, c) => s + (c.unit === 'case' ? c.quantity : 0), 0);
  const changeAmount = paymentMethod === 'cash' && cashReceived ? Number(cashReceived) - grandTotal : 0;
  // Settings → Billing → "Fill Cash Received Automatically": the box follows
  // the total until the cashier types a figure of their own. Not on a
  // correction — the server takes no cash figure there (see validate).
  const followTotal = counterRules.autoFillCashReceived && paymentMethod === 'cash' && !editingBill && !cashTyped;
  useEffect(() => {
    if (!followTotal) return;
    setCashReceived(cart.length > 0 ? String(grandTotal) : '');
  }, [followTotal, grandTotal, cart.length]);
  // Rows the shelf cannot cover. A row whose product carries no count at all
  // (stock === null) is unknowable rather than short, and is left out of both
  // the banner and the block — the server is the one that can still refuse it.
  const shortRows = cart.filter((c) => c.stock !== null && piecesOf(c) > c.stock);
  const stockWarning = shortRows.length > 0;
  // A quotation is only an estimate and moves no stock, so the shop's
  // zero-stock rule warns on one instead of refusing it (the owner's call). The
  // rule still refuses the conversion, which runs in 'invoice' mode — that is
  // the sale, and the server claims the stock there.
  const stockBlocks = enforceStockAtCounter && stockWarning && invoiceType !== 'quotation';

  // ══════════════════════════════════════════════════
  // Product history
  // ══════════════════════════════════════════════════

  // Kept apart per unit: a per-case rate and a per-piece rate for the same
  // product are two different prices, and a cancelled bill is not a price the
  // customer ever paid.
  const productHistory = useMemo(() => {
    const map = new Map<
      string,
      { productId: string; unit: 'piece' | 'case'; name: string; lastRate: number; count: number; qty: number }
    >();
    customerBills.forEach((bill) => {
      if (bill.status === 'cancelled') return;
      bill.items.forEach((it) => {
        const unit = it.unit ?? 'piece';
        const key = `${it.productId}|${unit}`;
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
          existing.qty += it.quantity;
        } else {
          map.set(key, { productId: it.productId, unit, name: it.name, lastRate: it.unitPrice, count: 1, qty: it.quantity });
        }
      });
    });
    return Array.from(map.values());
  }, [customerBills]);

  const applyLastRate = useCallback(
    (productId: string, rate: number, unit: 'piece' | 'case') => {
      // A rate only means something against the unit it was billed in. Putting
      // a ₹4,800-a-case figure on a per-piece row is a ₹4,800 sparkler.
      const modeUnit: WholesaleUnit = isCaseMode ? 'case' : 'piece';
      if (unit !== modeUnit) {
        setError(
          unit === 'case'
            ? 'That rate was per case — switch to Wholesale → Per Case to use it.'
            : 'That rate was per piece — switch off Per Case to use it.',
        );
        return;
      }
      setCart((prev) => {
        const existing = prev.find((c) => c.productId === productId && c.unit === unit);
        if (existing) {
          return prev.map((c) =>
            c.rowId === existing.rowId ? { ...c, unitPrice: Math.max(0, rate), edited: true } : c,
          );
        }
        const product = products.find((p) => p.id === productId);
        if (!product) return prev;
        return [
          ...prev,
          {
            rowId: newRowId(),
            productId: product.id,
            name: product.name,
            image: product.images[0] || '',
            unitPrice: Math.max(0, rate),
            mrp: product.originalPrice ?? product.price,
            quantity: 1,
            // Product History records the rate as it was billed, so the row takes
            // the mode the bill is currently in rather than assuming pieces.
            unit: isCaseMode ? ('case' as const) : ('piece' as const),
            piecesPerCase: packSize(product, isCaseMode ? 'case' : 'piece'),
            stock: typeof product.stockCount === 'number' ? product.stockCount : null,
            edited: true,
          },
        ];
      });
      setError('');
      setNotice(`Applied last rate ₹${inr(rate)}${unit === 'case' ? ' per case' : ''}`);
      setTableView('products');
    },
    [products, isCaseMode, packSize],
  );

  // Reorder a whole past bill — add its items (merging quantities) into the current cart.
  const reorderFromBill = useCallback(
    (bill: Bill) => {
      setCart((prev) => {
        const next = [...prev];
        for (const it of bill.items) {
          const unit = it.unit ?? 'piece';
          // Matched on the unit as well as the product: quantities only add up
          // when they count the same thing. Merging 2 CASES into a row holding
          // 5 PIECES used to produce a line reading "7".
          const idx = next.findIndex((c) => c.productId === it.productId && c.unit === unit);
          if (idx >= 0) {
            next[idx] = { ...next[idx], quantity: next[idx].quantity + it.quantity };
          } else {
            const p = products.find((x) => x.id === it.productId);
            next.push({
              rowId: newRowId(),
              productId: it.productId,
              name: it.name,
              image: p?.images?.[0] || '',
              unitPrice: it.unitPrice,
              mrp: p?.originalPrice ?? p?.price ?? it.unitPrice,
              quantity: it.quantity,
              // Carried from the past bill: a case line reordered as pieces
              // would re-price a wholesale order at a per-piece rate.
              unit: it.unit ?? 'piece',
              piecesPerCase: it.piecesPerCase ?? p?.quantityPerCase ?? 1,
              stock: typeof p?.stockCount === 'number' ? p.stockCount : null,
              edited: true,
            });
          }
        }
        return next;
      });
      setTableView('products');
      setNotice(`Added items from ${bill.billNumber} to the bill.`);
    },
    [products],
  );

  // ══════════════════════════════════════════════════
  // Build Bill-shaped object (preview / quotation)
  // ══════════════════════════════════════════════════

  const buildBillObject = useCallback(
    (billNumber: string): Bill => {
      // Lines priced by the same function the server runs, coupon share and
      // all, so a previewed line reads what the saved one will.
      const priced = computeBillTotals({
        lines: cart.map((c) => ({ unitPrice: c.unitPrice, quantity: c.quantity })),
        discountPercent,
        couponDiscount,
        packagingFee,
        deliveryCharge: delivery,
        gst: gstMode === 'flat' ? { mode: 'flat', amount: gstFlatAmount } : { mode: 'percent', rate: gstRate },
        taxKind,
      }).lines;
      const items: BillItem[] = cart.map((c, i) => {
        const lineTaxable = priced[i]?.taxableValue ?? 0;
        const lc = priced[i]?.cgstAmount ?? 0;
        const ls = priced[i]?.sgstAmount ?? 0;
        const li = priced[i]?.igstAmount ?? 0;
        return {
          productId: c.productId,
          name: c.name,
          image: c.image,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          // Carried, not dropped. Without these a previewed or quoted case line
          // reads as loose pieces: the Qty column prints the case count against
          // a per-case rate with nothing saying so.
          unit: c.unit,
          piecesPerCase: c.piecesPerCase,
          taxableValue: lineTaxable,
          cgstAmount: lc,
          sgstAmount: ls,
          igstAmount: li,
          totalAmount: lineTaxable + lc + ls + li,
        };
      });
      const payment: BillPayment = {
        method: paymentMethod,
        amount: grandTotal,
        reference: paymentRef || undefined,
        receivedAmount:
          paymentMethod === 'cash' ? Number(cashReceived || 0) : paymentMethod === 'credit' ? 0 : undefined,
        changeAmount: paymentMethod === 'cash' && changeAmount > 0 ? changeAmount : undefined,
      };
      return {
        id: 'preview',
        billNumber,
        status: 'completed',
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        items,
        discountPercent,
        subtotal,
        totalDiscount,
        packagingFee,
        deliveryCharge: delivery,
        courierDelivery,
        salesperson: salesperson || undefined,
        taxableAmount,
        totalCgst: cgst,
        totalSgst: sgst,
        totalIgst: igst,
        taxKind,
        // The same three fields the saved bill carries. `billDocument.ts` picks
        // the printed document off `billingMode`, so a preview or a quotation
        // built without it printed the retail tax invoice no matter which mode
        // the counter was actually in.
        billingMode: isCaseMode ? 'wholesale-case' : billingType === 'wholesale' ? 'wholesale-piece' : 'retail',
        totalCases: totalCases || undefined,
        caseInvoice: isCaseMode
          ? {
              // The server owns the real pad number; this is the placeholder the
              // preview prints until it does.
              displayNumber: '—',
              invoiceDate: new Date().toISOString(),
              transport: transport.trim() || undefined,
              partyGstin: selectedCustomer?.gstin || undefined,
              partyState: selectedCustomer?.state || undefined,
              taxKind,
            }
          : undefined,
        gstMode,
        gstRate: gstMode === 'flat' ? Number((gstHalf * 200).toFixed(2)) : gstRate,
        gstAmount: gstMode === 'flat' ? gstFlatAmount : undefined,
        grandTotal,
        roundOff,
        payment,
        itemCount: cart.length,
        totalQuantity,
        // Quoted to the customer, so it has to appear on what they are handed —
        // otherwise the total is short by a discount the document cannot explain.
        couponCode: appliedCoupon?.code,
        couponDiscount: couponDiscount || undefined,
        createdAt: new Date().toISOString(),
        createdBy: user?.uid ?? '',
      };
    },
    [
      cart, discountPercent, gstMode, gstRate, gstFlatAmount, gstHalf, paymentMethod, paymentRef, cashReceived, changeAmount, customerName,
      customerPhone, customerAddress, subtotal, totalDiscount, packagingFee, delivery, courierDelivery,
      salesperson, taxableAmount, cgst, sgst, igst, taxKind, grandTotal, roundOff, totalQuantity, user,
      isCaseMode, billingType, totalCases, transport, selectedCustomer, appliedCoupon, couponDiscount,
    ],
  );

  /**
   * The form as the quotation API takes it.
   *
   * Sends inputs, never totals: the server prices a quotation through the same
   * `computeBillTotals` a bill goes through, so a quote and the invoice it
   * becomes can never disagree about the grand total. `buildBillObject` above
   * still exists for what has to be rendered before a round trip — the preview.
   */
  const buildQuotationPayload = useCallback(
    (transportName = transport): QuotationDraft => ({
      items: cart.map((c) => ({
        productId: c.productId,
        name: c.name,
        image: c.image,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        unit: c.unit,
        piecesPerCase: c.piecesPerCase,
      })),
      discount: { percent: discountPercent },
      customer: {
        id: linkedCustomerId ?? undefined,
        name: customerName || undefined,
        phone: customerPhone || undefined,
        address: customerAddress || undefined,
        gstin: selectedCustomer?.gstin || undefined,
      },
      deliveryCharge: delivery,
      courierDelivery,
      salesperson: salesperson || undefined,
      gst: gstMode === 'flat' ? { mode: 'flat', amount: gstFlatAmount } : { mode: 'percent', rate: gstRate },
      couponCode: appliedCoupon?.code,
      // A quotation redeems nothing, so the rupee figure travels with it for the
      // printed page. It is re-validated for real at conversion.
      couponDiscount: appliedCoupon?.discount,
      billingMode: isCaseMode ? 'wholesale-case' : billingType === 'wholesale' ? 'wholesale-piece' : 'retail',
      taxKind,
      // Only what the counter knows. Everything else on the printed page is
      // either seeded by the server or typed in the layout editor, and anything
      // omitted here keeps what the stored layout already had.
      layout: {
        transport: transportName.trim() || undefined,
        partyGstin: selectedCustomer?.gstin || undefined,
        partyState: selectedCustomer?.state || undefined,
        taxKind,
      },
    }),
    [
      cart, discountPercent, selectedCustomer, customerName, customerPhone, customerAddress, delivery,
      courierDelivery, salesperson, gstMode, gstFlatAmount, gstRate, appliedCoupon, isCaseMode,
      billingType, taxKind, transport, linkedCustomerId,
    ],
  );

  // ══════════════════════════════════════════════════
  // Validation
  // ══════════════════════════════════════════════════

  const validate = useCallback((): string => {
    if (cart.length === 0) return 'Add at least one product to continue.';
    // A coupon check still in flight would change the total after it was saved.
    if (isCheckingCoupon || isRecheckingCoupon) return 'One moment, the coupon is still being checked.';

    /**
     * When the shop actually needs to know who this is.
     *
     * A retail counter sale paid then and there does not: somebody walks in,
     * buys a box of sparklers and leaves, and demanding a name and a phone
     * before the bill will print is a queue forming over a record nobody will
     * ever look at. The screen used to require both on EVERY bill.
     *
     * Three cases genuinely need it, and they are the three where the shop has
     * to be able to find this person again:
     *  - credit, because the money is still owed;
     *  - wholesale, because the invoice is a tax document naming a buyer;
     *  - a quotation, because it is handed over to be brought back.
     */
    const needsCustomer =
      paymentMethod === 'credit' || billingType === 'wholesale' || invoiceType === 'quotation';

    if (needsCustomer) {
      if (!customerName.trim()) {
        return paymentMethod === 'credit'
          ? 'A credit bill needs a customer — the shop has to know who owes this.'
          : invoiceType === 'quotation'
            ? 'A quotation needs a customer to be addressed to.'
            : 'A wholesale invoice needs a customer.';
      }
      // The phone is how a bill with no customer record is found again. A bill
      // linked to a picked customer is found through that record, so when the
      // shop has made phone numbers optional (Settings → Billing) it is not
      // asked for.
      const phoneNeeded = counterRules.requireCustomerPhone || !linkedCustomerId;
      if (phoneNeeded && !isValidPhone(customerPhone)) return 'Customer must have a valid 10-digit phone.';
      if (customerPhone.trim() && !isValidPhone(customerPhone)) {
        return 'That phone number is incomplete — finish it or clear it.';
      }
    } else if (customerPhone.trim() && !isValidPhone(customerPhone)) {
      // Optional, but a half-typed number is a typo rather than a walk-in — and
      // a wrong number silently detaches this bill from that customer's history.
      return 'That phone number is incomplete — finish it or clear it.';
    }

    // Not on a correction: the server does not take a cash figure there — the
    // payment follows the re-priced total — so the pre-filled one from the
    // original sale could only ever block a save, never inform it.
    if (invoiceType === 'invoice' && paymentMethod === 'cash' && !editingBill) {
      if (!cashReceived.trim()) return 'Enter the amount received in cash.';
      if (Number(cashReceived) < grandTotal) return 'Amount received is less than the total.';
    }
    // The shop has chosen to treat stock as a hard limit at the counter. The
    // server refuses this too — checking here just means the cashier is told
    // before they hit Save, with the shortfall named.
    if (stockBlocks) {
      return `Not enough stock: ${shortRows
        .map((c) => `${c.name} (${c.stock} left, ${piecesOf(c)} needed)`)
        .join(', ')}`;
    }
    // A full-case sale prints a tax invoice with a GSTIN box on it. Raising one
    // without the buyer's number leaves the shop with an invoice it cannot file,
    // so it is caught here rather than discovered at the printer.
    if (isCaseMode && invoiceType === 'invoice' && !selectedCustomer?.gstin?.trim()) {
      return 'A full-case invoice needs the buyer’s GSTIN — add it to the customer first.';
    }
    return '';
  }, [
    cart, customerName, customerPhone, invoiceType, paymentMethod, cashReceived, grandTotal,
    isCaseMode, selectedCustomer, stockBlocks, shortRows, billingType,
    editingBill, isCheckingCoupon, isRecheckingCoupon, counterRules.requireCustomerPhone, linkedCustomerId,
  ]);

  // ══════════════════════════════════════════════════
  // Snapshot / reset
  // ══════════════════════════════════════════════════

  const buildSnapshot = useCallback(
    (): FormSnapshot => ({
      invoiceType, billingType, wholesaleUnit, selectedCustomer, customerName, customerPhone,
      customerAddress, salesperson, cart, discountPercent, deliveryCharge, courierDelivery,
      paymentMethod, cashReceived, cashTyped, paymentRef,
      taxKind: taxKindOverride ?? undefined, transport,
      gstMode, gstRate, gstFlatAmount,
      coupon:
        appliedCoupon && couponBaseRef.current !== null
          ? { code: appliedCoupon.code, discount: appliedCoupon.discount, base: couponBaseRef.current }
          : undefined,
      editingBill, editingQuotation, convertingQuotation,
    }),
    [
      invoiceType, billingType, wholesaleUnit, selectedCustomer, customerName, customerPhone,
      customerAddress, salesperson, cart, discountPercent, deliveryCharge, courierDelivery,
      paymentMethod, cashReceived, cashTyped, paymentRef, taxKindOverride, transport,
      gstMode, gstRate, gstFlatAmount, appliedCoupon, editingBill, editingQuotation, convertingQuotation,
    ],
  );

  const restoreSnapshot = (s: FormSnapshot) => {
    setInvoiceType(s.invoiceType);
    setBillingType(s.billingType);
    // Held bills and quotations saved before case billing existed have no unit;
    // they were all per-piece, and reading them as such keeps them printable.
    setWholesaleUnit(s.wholesaleUnit ?? 'piece');
    setSelectedCustomer(s.selectedCustomer);
    setCustomerName(s.customerName);
    setCustomerPhone(s.customerPhone);
    setCustomerAddress(s.customerAddress);
    setSalesperson(s.salesperson);
    setCart(s.cart);
    setDiscountPercent(s.discountPercent);
    setDeliveryCharge(s.deliveryCharge);
    setCourierDelivery(s.courierDelivery);
    setPaymentMethod(s.paymentMethod);
    setCashReceived(s.cashReceived);
    setCashTyped(s.cashTyped ?? Boolean(s.cashReceived));
    setPaymentRef(s.paymentRef);
    // Absent means the split was never overridden, so it goes back to following
    // the GSTINs rather than being pinned to whatever it happened to resolve to.
    setTaxKindOverride(s.taxKind ?? null);
    setTransport(s.transport ?? '');
    // The GST it was held with. A bill held before this was kept keeps the
    // defaults the reset just put on screen.
    if (s.gstMode !== undefined) {
      gstFromRecordRef.current = true;
      setGstMode(s.gstMode);
      if (typeof s.gstRate === 'number') setGstRate(s.gstRate);
      setGstFlatAmount(s.gstFlatAmount ?? 0);
    }
    restoreCoupon(s.coupon?.code, s.coupon?.discount, s.coupon?.base ?? 0);
    // Back into the record it was held from, so Save updates that record
    // rather than raising a second bill for goods already sold.
    setEditingBill(s.editingBill ?? null);
    setEditingQuotation(s.editingQuotation ?? null);
    setConvertingQuotation(s.convertingQuotation ?? null);
    const recordParams: Record<string, string> = s.editingBill
      ? { edit: s.editingBill.id }
      : s.editingQuotation
        ? { quote: s.editingQuotation.id }
        : s.convertingQuotation
          ? { convert: s.convertingQuotation.id }
          : {};
    if (Object.keys(recordParams).length > 0) setSearchParams(recordParams, { replace: true });
    setTransportPromptOpen(false);
    setTableView('products');
  };

  /** Drop the coupon and any message about it. */
  const clearCoupon = useCallback(() => {
    couponBaseRef.current = null;
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
  }, []);

  /**
   * Check the typed code against the current cart. The subtotal sent is the
   * post-manual-discount figure, which is what the server prices against — so
   * the quote shown here is the discount the bill will actually carry.
   */
  const applyCoupon = useCallback(async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponError('Enter a coupon code');
      return;
    }
    if (cart.length === 0) {
      setCouponError('Add products first');
      return;
    }
    setIsCheckingCoupon(true);
    setCouponError('');
    try {
      const { validateCounterCoupon } = await import('@/services/coupons.ts');
      // Re-applying the bill's own code after taking it off: named, the bill's
      // own use of it is not counted against the coupon's limits. Without the
      // id a capped or one-per-customer code was refused, and the bill was saved
      // without the discount it already had.
      const ownBillId =
        editingBill && normalizeCouponCode(code) === normalizeCouponCode(editingBill.couponCode)
          ? editingBill.id
          : undefined;
      const applied = await validateCounterCoupon(code, afterManualDiscount, customerPhone || undefined, ownBillId);
      couponBaseRef.current = afterManualDiscount;
      setAppliedCoupon(applied);
      setCouponCode('');
    } catch (e) {
      setAppliedCoupon(null);
      setCouponError(e instanceof Error ? e.message : 'Could not apply that coupon');
    } finally {
      setIsCheckingCoupon(false);
    }
  }, [couponCode, cart.length, afterManualDiscount, customerPhone, editingBill]);

  // The discount depends on the cart and the cashier's percent, so any change to
  // either makes the quote stale. Any other coupon is dropped: re-applying is one
  // click, whereas a silently wrong discount is a wrong bill.
  //
  // The coupon a bill being corrected already carries is re-checked instead,
  // with the bill's id. Dropped, it could not always be put back: a capped or
  // one-per-customer code counted the bill's own use against it and refused.
  useEffect(() => {
    if (!appliedCoupon) return;
    // Still the figure it was quoted on — a record just loaded, or the same
    // cart reached again. Nothing about the discount has changed.
    if (couponBaseRef.current === afterManualDiscount) return;

    const billId =
      editingBill && normalizeCouponCode(appliedCoupon.code) === normalizeCouponCode(editingBill.couponCode)
        ? editingBill.id
        : null;
    if (!billId) {
      couponBaseRef.current = null;
      setAppliedCoupon(null);
      setCouponError('Cart changed — apply the coupon again');
      return;
    }

    const { code } = appliedCoupon;
    const base = afterManualDiscount;
    // Only a complete number: a half-typed one fails validation, and the coupon
    // would come off for a reason that has nothing to do with it.
    const phone = hasEnoughDigits(customerPhone) ? customerPhone : undefined;
    let cancelled = false;
    setIsRecheckingCoupon(true);
    // Short pause so typing a quantity sends one check, not one per keystroke.
    const timer = window.setTimeout(async () => {
      try {
        const { validateCounterCoupon } = await import('@/services/coupons.ts');
        const applied = await validateCounterCoupon(code, base, phone, billId);
        if (cancelled) return;
        couponBaseRef.current = base;
        setAppliedCoupon(applied);
        setCouponError('');
      } catch (e) {
        if (cancelled) return;
        couponBaseRef.current = null;
        setAppliedCoupon(null);
        if (e instanceof ApiRequestError && e.status === 400) {
          setCouponError(`${code} no longer applies to this bill: ${e.message}`);
        } else {
          // The check failed, not the coupon. The code stays in the box so
          // trying again is one press.
          setCouponCode(code);
          setCouponError(`Could not re-check ${code} for the new total. Press Apply to try again.`);
        }
      } finally {
        if (!cancelled) setIsRecheckingCoupon(false);
      }
    }, 300);
    // A newer cart, another coupon or another bill replaces this check.
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setIsRecheckingCoupon(false);
    };
  }, [afterManualDiscount, appliedCoupon, editingBill, customerPhone]);

  const resetForm = useCallback(() => {
    setCart([]);
    clearCoupon();
    setSelectedCustomer(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setDiscountPercent(0);
    setGstRate(siteConfig.gstEnabled === false ? 0 : (siteConfig.gstRate ?? 18));
    // Both halves of the GST entry, not just the rate. `gstMode` defaults to
    // 'flat', so leaving the typed rupee figure behind meant the next bill
    // opened with the previous customer's GST already on it — a wrong total
    // that looks exactly like a correct one.
    setGstMode('flat');
    setGstFlatAmount(0);
    setDeliveryCharge(0);
    setCourierDelivery(false);
    setPaymentMethod('cash');
    setCashReceived('');
    setCashTyped(false);
    setPaymentRef('');
    setBillingType('retail');
    setWholesaleUnit('piece');
    setTaxKindOverride(null);
    setTransport('');
    setTransportDraft('');
    setTransportPromptOpen(false);
    setTableView('products');
    setError('');
    gstFromRecordRef.current = false;
    customerTouchedRef.current = false;
    // Out of whatever record was open, too. A fresh form that still pointed at
    // the bill being corrected saved the next customer's sale OVER that bill;
    // one still pointing at a quotation rewrote it under the same number. Hold
    // and Discard both come through here, and the held snapshot keeps its own
    // record to go back to.
    setEditingBill(null);
    setEditingQuotation(null);
    setConvertingQuotation(null);
    // And off the URL, or a reload lands straight back in that record.
    if (searchParams.has('edit') || searchParams.has('quote') || searchParams.has('convert')) {
      setSearchParams({}, { replace: true });
    }
  }, [siteConfig.gstRate, siteConfig.gstEnabled, clearCoupon, searchParams, setSearchParams]);

  // ══════════════════════════════════════════════════
  // Hold / resume
  // ══════════════════════════════════════════════════

  const holdCurrentBill = useCallback(() => {
    // Mid-save the cart is already on its way to the server; parking a copy of
    // it would only let it be sold a second time.
    if (savingRef.current) return;
    if (cart.length === 0) {
      setError('Nothing to hold — add products first.');
      return;
    }
    const held: HeldBill = {
      id: `held_${Date.now()}`,
      heldAt: new Date().toISOString(),
      customerName: customerName || 'Walk-in',
      itemCount: cart.length,
      total: grandTotal,
      snapshot: buildSnapshot(),
    };
    setHeldBills((prev) => {
      const next = [held, ...prev].slice(0, LS_CAP);
      saveLS(LS_HELD, next);
      return next;
    });
    resetForm();
    setNotice('Bill held. Resume it any time from “Held”.');
  }, [cart, customerName, grandTotal, buildSnapshot, resetForm]);

  const resumeHeldBill = (id: string) => {
    const held = heldBills.find((h) => h.id === id);
    if (!held || savingRef.current) return;
    // A bill already on the counter is parked, not overwritten. Resuming used to
    // replace it outright — and carried its GST into the bill being resumed.
    const parkedCurrent = cart.length > 0;
    if (parkedCurrent) holdCurrentBill();
    else resetForm();
    restoreSnapshot(held.snapshot);
    if (parkedCurrent) setNotice('The bill that was on screen is now under “Held”.');
    setHeldBills((prev) => {
      const next = prev.filter((h) => h.id !== id);
      saveLS(LS_HELD, next);
      return next;
    });
    setHeldPanelOpen(false);
  };

  const discardHeldBill = (id: string) => {
    setHeldBills((prev) => {
      const next = prev.filter((h) => h.id !== id);
      saveLS(LS_HELD, next);
      return next;
    });
  };

  // ══════════════════════════════════════════════════
  // Opening a saved quotation
  // ══════════════════════════════════════════════════

  /** A quotation waiting to be opened over a bill already in progress. */
  const [pendingQuotation, setPendingQuotation] = useState<{ quote: Quotation; mode: 're-price' | 'convert' } | null>(
    null,
  );

  /**
   * Load a saved quotation into this screen, to re-price or to convert.
   *
   * The URL is updated alongside, so a reload lands back on the same quotation
   * instead of an empty counter — the same contract `?edit=` has for bills.
   */
  const openQuotation = useCallback(
    (quote: Quotation, mode: 're-price' | 'convert') => {
      if (cart.length > 0) {
        setPendingQuotation({ quote, mode });
        return;
      }
      setSearchParams(mode === 're-price' ? { quote: quote.id } : { convert: quote.id }, { replace: true });
      void loadQuotation(quote.id, products, mode);
    },
    [cart.length, products, loadQuotation, setSearchParams],
  );

  const cancelQuotationById = useCallback(
    async (id: string) => {
      try {
        const { cancelQuotation } = await import('@/services/quotations.ts');
        const cancelled = await cancelQuotation(id);
        void refreshQuotations();
        setNotice(`Quotation ${cancelled.quotationNumber} cancelled.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not cancel that quotation.');
      }
    },
    [refreshQuotations],
  );

  // ══════════════════════════════════════════════════
  // Customer switch resolution
  //
  // Lives here rather than with the rest of the customer code because two of
  // the three answers go through Hold and Reset, which are defined above.
  // ══════════════════════════════════════════════════

  /**
   * Settle a pending customer change.
   *
   *  - 'keep'    — change who the bill is for, leave the items alone. The cart
   *                is re-priced if the new customer bills at a different rate.
   *  - 'hold'    — park the bill under the customer it was built for, then
   *                start a clean one for the new customer. Nothing is lost.
   *  - 'discard' — throw the bill away and start fresh.
   */
  const resolveCustomerSwitch = useCallback(
    (action: 'keep' | 'hold' | 'discard') => {
      const target = customerSwitch?.target ?? null;
      setCustomerSwitch(null);

      if (action === 'keep') {
        if (target) applyCustomer(target);
        else clearCustomer();
        return;
      }

      if (action === 'hold') {
        // Snapshots the bill as it stands — old customer and all — and resets
        // the form. Held bills are what the cashier goes back to, so this is
        // the answer that loses nothing.
        holdCurrentBill();
      } else {
        resetForm();
      }
      // Both branches have just put the form back on retail with an empty cart,
      // which is what the new customer's type has to be compared against.
      if (target) applyCustomer(target, 'retail');
      setNotice(
        target
          ? action === 'hold'
            ? `Bill held. Now billing ${target.name}.`
            : `Bill discarded. Now billing ${target.name}.`
          : action === 'hold'
            ? 'Bill held and the customer cleared.'
            : 'Bill discarded.',
      );
    },
    [customerSwitch, applyCustomer, clearCustomer, holdCurrentBill, resetForm],
  );

  // ══════════════════════════════════════════════════
  // Preview / Share / Save
  // ══════════════════════════════════════════════════

  /**
   * What the number box shows before the server has issued one.
   *
   * The same placeholder for both documents now, because they are the same
   * series: a quotation is issued with the `AK-` number the invoice will carry.
   * A quotation or bill already being edited shows its real number instead —
   * that number is settled and saving will not change it.
   */
  const provisionalNumber =
    editingQuotation?.quotationNumber ??
    convertingQuotation?.quotationNumber ??
    editingBill?.billNumber ??
    `AK-${yymm()}-•••••`;

  const handlePreview = useCallback(() => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setPreviewBill(buildBillObject(provisionalNumber));
  }, [validate, buildBillObject, provisionalNumber]);

  const handleShare = useCallback(() => {
    if (!isValidPhone(customerPhone)) {
      setError('A valid 10-digit phone number is needed to share.');
      return;
    }
    if (cart.length === 0) {
      setError('Add products before sharing.');
      return;
    }
    const label = invoiceType === 'quotation' ? 'Estimate' : 'Bill';
    const text = [
      `*${siteConfig.name}* — ${label}`,
      `${customerName || 'Customer'}`,
      isCaseMode ? `${cart.length} item(s), ${totalCases} case(s)` : `${cart.length} item(s), Qty ${totalQuantity}`,
      `Total: ₹${inr(grandTotal)}`,
      `Thank you for shopping with us! 🎆`,
    ].join('%0A');
    window.open(`https://wa.me/91${customerPhone.trim()}?text=${text}`, '_blank');
  }, [customerPhone, cart, invoiceType, customerName, totalQuantity, totalCases, isCaseMode, grandTotal, siteConfig.name]);

  const handleSaveAndPrint = useCallback(async (opts?: { transport?: string; skipTransportPrompt?: boolean }) => {
    // One save at a time, and none once this sale is done. The button is
    // disabled for both, but F8 and the transport prompt reach here without it —
    // and each extra call raised another bill for the same goods.
    if (savingRef.current || isLoadingEdit || completedBill) return;
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');

    // The lorry is only known once the order is loaded, so the case pad's
    // Transport box is asked for here rather than in the header. Skipping is a
    // normal outcome — plenty of orders are collected by the buyer — so this
    // gates nothing, it only offers. Asked for on a case QUOTATION too, now
    // that one prints the pad.
    if (isCaseMode && !opts?.skipTransportPrompt) {
      setTransportDraft(transport);
      setTransportPromptOpen(true);
      return;
    }
    const effectiveTransport = opts?.transport ?? transport;

    // ── Quotation: saved on the server, printed on its own document ──
    if (invoiceType === 'quotation') {
      savingRef.current = true;
      setIsSaving(true);
      try {
        const { createQuotation, updateQuotation } = await import('@/services/quotations.ts');
        const payload = buildQuotationPayload(effectiveTransport);

        // Re-priced in place when this screen was opened on an existing
        // quotation, so it keeps its number. Saving used to mint a new estimate
        // every single time, which is how one quote became four.
        const saved = editingQuotation
          ? await updateQuotation(editingQuotation.id, payload)
          : await createQuotation(payload);

        setEditingQuotation(saved);
        void refreshQuotations();
        // Through the document chooser, not straight to the tax invoice. A
        // wholesale-case quotation prints the ruled case pad, a per-piece or
        // retail one the tax invoice — the same rule the invoice follows, so
        // the customer is quoted on the document they will be billed on.
        await printBillDocument(quotationToBill(saved), true, quotationEstimate(saved));
        setNotice(
          editingQuotation
            ? `Quotation ${saved.quotationNumber} updated & sent to print.`
            : `Quotation ${saved.quotationNumber} saved & sent to print.`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save that quotation. Please try again.');
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
      return;
    }

    // ── Converting a quotation into the invoice it was for ──
    if (convertingQuotation) {
      savingRef.current = true;
      setIsSaving(true);
      try {
        const { convertQuotation } = await import('@/services/quotations.ts');
        // The coupon travels explicitly, always: a code applies it (re-checked
        // by the server), `null` removes it. Leaving it out made the server fall
        // back to the quotation's own coupon, which the counter had not shown —
        // so the cash taken and the bill saved disagreed by the coupon.
        const { bill } = await convertQuotation(convertingQuotation.id, {
          payment: {
            method: paymentMethod,
            amount: grandTotal,
            reference: paymentRef || undefined,
            receivedAmount:
              paymentMethod === 'cash' ? Number(cashReceived || 0) : paymentMethod === 'credit' ? 0 : undefined,
            changeAmount: paymentMethod === 'cash' && changeAmount > 0 ? changeAmount : undefined,
          },
          // Sent because the counter may have changed its mind on the way
          // through — a quotation is an offer, not a commitment.
          items: cart.map((c) => ({
            productId: c.productId,
            name: c.name,
            image: c.image,
            quantity: c.quantity,
            unitPrice: c.unitPrice,
            unit: c.unit,
            piecesPerCase: c.piecesPerCase,
          })),
          discount: { percent: discountPercent },
          deliveryCharge: delivery,
          courierDelivery,
          salesperson: salesperson || undefined,
          gst: gstMode === 'flat' ? { mode: 'flat', amount: gstFlatAmount } : { mode: 'percent', rate: gstRate },
          couponCode: appliedCoupon?.code ?? null,
          taxKind,
          transport: effectiveTransport.trim() || undefined,
        });
        setConvertingQuotation(null);
        setCompletedBill(bill);
        void refreshQuotations();
        void refreshProducts();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not convert that quotation. Please try again.');
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
      return;
    }

    // Invoice: real bill
    savingRef.current = true;
    setIsSaving(true);
    try {
      const { createBill, updateBill } = await import('@/services/admin.ts');

      // Correcting a saved bill, rather than raising a new one. The server
      // re-prices from these figures and reconciles stock against what the bill
      // used to hold, so the bill keeps its number and only the difference moves.
      if (editingBill) {
        const updated = await updateBill(editingBill.id, {
          // The coupon is sent explicitly: the code on screen keeps or applies
          // it, `null` takes it off. Left out, the server kept whatever the bill
          // had, whatever the counter showed.
          couponCode: appliedCoupon?.code ?? null,
          // Automatic rounding, always: this screen has no round-off box and
          // shows the rounded total. Left out, a round-off typed on the case
          // pad was kept, and the bill saved a different total from the screen.
          manualRoundOff: null,
          items: cart.map((c) => ({
            // A hand-written line from the case pad has no product. It must go
            // up without one: an empty id fails validation, so the whole
            // correction was refused.
            productId: c.productId || undefined,
            name: c.name,
            quantity: c.quantity,
            unitPrice: c.unitPrice,
            unit: c.unit,
            piecesPerCase: c.piecesPerCase,
          })),
          discountPercent,
          deliveryCharge: delivery,
          gst: gstMode === 'flat' ? { mode: 'flat', amount: gstFlatAmount } : { mode: 'percent', rate: gstRate },
          taxKind,
          customer: {
            // Re-linked to whoever is picked now; unlinked only when the
            // cashier took the customer off (see customerTouchedRef).
            id: linkedCustomerId ?? (customerTouchedRef.current ? null : undefined),
            name: customerName || undefined,
            phone: customerPhone || undefined,
            address: customerAddress || undefined,
            gstin: selectedCustomer?.gstin || undefined,
          },
          payment: { method: paymentMethod, reference: paymentRef || undefined },
          // Only a case bill prints a pad; the server ignores this on the rest.
          ...(isCaseMode ? { invoice: { transport: transport.trim() || undefined, taxKind } } : {}),
        });
        setCompletedBill(updated);
        setEditingBill(null);
        void refreshProducts();
        return;
      }

      const billItems: BillItem[] = cart.map((c) => ({
        productId: c.productId,
        name: c.name,
        image: c.image,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        // The server expands a case line back to pieces before it touches stock,
        // so these two travel with every item rather than being inferred there.
        unit: c.unit,
        piecesPerCase: c.piecesPerCase,
        taxableValue: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalAmount: 0,
      }));
      const payment: BillPayment = {
        method: paymentMethod,
        amount: grandTotal,
        reference: paymentRef || undefined,
        receivedAmount:
          paymentMethod === 'cash' ? Number(cashReceived || 0) : paymentMethod === 'credit' ? 0 : undefined,
        changeAmount: paymentMethod === 'cash' && changeAmount > 0 ? changeAmount : undefined,
      };
      const bill = await createBill(
        billItems,
        payment,
        { percent: discountPercent },
        {
          // Links the bill to the customer record, so their history and credit
          // stay theirs even when another customer shares the phone.
          id: linkedCustomerId ?? undefined,
          name: customerName || undefined,
          phone: customerPhone || undefined,
          address: customerAddress || undefined,
          // Sent on every bill, not just case bills: it is what the server
          // compares against the shop's GSTIN when no split was chosen here.
          gstin: selectedCustomer?.gstin || undefined,
        },
        user?.uid ?? '',
        packagingFee,
        delivery,
        { courierDelivery, salesperson: salesperson || undefined },
        gstMode === 'flat' ? { mode: 'flat', amount: gstFlatAmount } : { mode: 'percent', rate: gstRate },
        appliedCoupon?.code,
        {
          mode: isCaseMode ? 'wholesale-case' : billingType === 'wholesale' ? 'wholesale-piece' : 'retail',
          // Sent so the stored split is the one the cashier was shown, rather
          // than whatever the server would re-derive from the GSTINs.
          taxKind,
          // Only the presentation fields the counter knows. The server assigns
          // the pad number and the HSN, and owns every total.
          caseInvoice: isCaseMode
            ? {
                partyGstin: selectedCustomer?.gstin,
                partyState: selectedCustomer?.state,
                transport: effectiveTransport.trim() || undefined,
                taxKind,
              }
            : undefined,
        },
      );
      setCompletedBill(bill);
      // The sale has moved stock. Re-read it now so the next bill shows what is
      // actually on the shelf rather than the figure loaded when the page opened.
      void refreshProducts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate bill. Please try again.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [
    isLoadingEdit, completedBill,
    validate, invoiceType, customerName, customerPhone, customerAddress, grandTotal,
    cart, paymentMethod, paymentRef, cashReceived, changeAmount, discountPercent, gstMode, gstRate, gstFlatAmount, packagingFee, delivery,
    courierDelivery, salesperson, user, appliedCoupon, isCaseMode, billingType, selectedCustomer,
    // The quotation being worked on has to be current here, not captured from
    // an earlier render: a stale null would save a brand-new quotation beside
    // the one the cashier opened, under a second number — the exact bug this
    // whole path was rewritten to fix.
    editingQuotation, convertingQuotation, buildQuotationPayload, refreshQuotations,
    taxKind, transport, refreshProducts, editingBill, linkedCustomerId,
  ]);

  const handleNewBill = () => {
    setCompletedBill(null);
    // Also leaves whatever bill or quotation was open, URL included — so a
    // reload does not drop straight back into the one just finished with.
    resetForm();
    setInvoiceType('invoice');
    headerSearchRef.current?.focus();
  };

  // ══════════════════════════════════════════════════
  // Keyboard shortcuts
  // ══════════════════════════════════════════════════

  /**
   * An overlay is asking the cashier something.
   *
   * While one is, the counter shortcuts are off: F8 firing behind a dialog
   * saved the bill the dialog was asking about, which is the one thing every
   * one of these prompts exists to prevent.
   */
  const overlayOpen =
    heldPanelOpen || Boolean(previewBill) || transportPromptOpen || Boolean(customerSwitch) || showCustomerForm;

  useEffect(() => {
    function isTyping(el: EventTarget | null) {
      const tag = (el as HTMLElement)?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }
    function handleKey(e: KeyboardEvent) {
      if (overlayOpen) return;
      // Nothing on the counter is live while a save is in flight or the "Bill
      // Generated" screen is up. The cart is still in state behind that screen,
      // so F8 there — pressed to print — raised a second bill for the same goods,
      // and F10 parked an already-sold cart to be sold again.
      if (completedBill || isSaving) {
        if (e.key === 'F8' || e.key === 'F7' || e.key === 'F9' || e.key === 'F10') e.preventDefault();
        return;
      }
      if (e.key === 'F8') {
        e.preventDefault();
        void handleSaveAndPrint();
      } else if (e.key === 'F7') {
        e.preventDefault();
        handlePreview();
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleShare();
      } else if (e.key === 'F10') {
        e.preventDefault();
        holdCurrentBill();
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        headerSearchRef.current?.focus();
      } else if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        setTableView('products');
        setTimeout(() => tableSearchRef.current?.focus(), 0);
      } else if (e.key === '/' && !isTyping(e.target)) {
        e.preventDefault();
        headerSearchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleSaveAndPrint, handlePreview, handleShare, holdCurrentBill, overlayOpen, completedBill, isSaving]);

  // ══════════════════════════════════════════════════
  // Unsaved-work guard
  // ══════════════════════════════════════════════════

  /**
   * Warn before a reload or a closed tab takes a bill with it.
   *
   * A counter bill lives entirely in this component until Save & Print, so a
   * stray Ctrl+R or a closed tab loses however long the cashier spent building
   * it. The browser's own prompt is the only one that can stop those two; Hold
   * is the answer offered everywhere inside the app.
   */
  useEffect(() => {
    if (cart.length === 0 || completedBill) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [cart.length, completedBill]);

  // ══════════════════════════════════════════════════
  // Confirmation screen
  // ══════════════════════════════════════════════════

  if (completedBill) {
    return <BillConfirmation bill={completedBill} onNewBill={handleNewBill} />;
  }

  // A blocked sale is refused by `validate` anyway; greying the button out
  // means the cashier finds out while they can still fix the cart, rather than
  // after pressing Save.
  // `isLoadingEdit` guards the window where `?edit=` has been read but the
  // bill's lines are not in the cart yet — saving then would post an empty bill
  // over a real one.
  const canSave = cart.length > 0 && !isSaving && !isLoadingEdit && !stockBlocks;

  // ══════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-4 lg:-m-6 xl:-m-8 bg-surface-50 dark:bg-surface-950">
      {/* ─── Single-row context header ─── */}
      <div className="bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 px-4 py-2.5">
        <div className="flex flex-col xl:flex-row gap-2.5 xl:items-center">
          <div className="flex-1 min-w-0">
            <ProductSearchBox
              products={products}
              cart={cart}
              onSelect={addToCart}
              inputRef={headerSearchRef}
              placeholder="Search products to add…  (Alt+S)"
            />
          </div>
          <div className="flex-1 min-w-0">
            <CustomerSelector
              selected={selectedCustomer}
              customers={customers}
              open={selectorOpen}
              setOpen={setSelectorOpen}
              onSelect={selectCustomer}
              onAddNew={(name) => {
                setPrefillName(name);
                setEditingCustomer(null);
                setSelectorOpen(false);
                setShowCustomerForm(true);
              }}
              onEdit={(c) => {
                setEditingCustomer(c);
                setSelectorOpen(false);
                setShowCustomerForm(true);
              }}
              onClear={requestClearCustomer}
            />
          </div>
          <PillToggle
            value={invoiceType}
            onChange={setInvoiceType}
            options={[
              { value: 'invoice', label: 'Invoice', icon: <Receipt size={13} /> },
              { value: 'quotation', label: 'Quotation', icon: <FileText size={13} /> },
            ]}
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            <PillToggle
              value={billingType}
              onChange={switchBillingType}
              options={[
                { value: 'retail', label: 'Retail' },
                { value: 'wholesale', label: 'Wholesale' },
              ]}
            />
            {/* Only meaningful once Wholesale is on, and hidden otherwise so the
                retail counter never sees a control it cannot use. Per Case
                switches the printed document, not just the rate. */}
            {billingType === 'wholesale' && (
              <PillToggle
                value={wholesaleUnit}
                onChange={switchWholesaleUnit}
                options={[
                  { value: 'piece', label: 'Per Piece' },
                  { value: 'case', label: 'Per Case' },
                ]}
              />
            )}
            <button
              onClick={() => {
                setTableView('products');
                setTimeout(() => tableSearchRef.current?.focus(), 0);
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-brand-500 text-white text-caption font-semibold hover:bg-brand-600 transition-colors whitespace-nowrap"
            >
              <Plus size={15} /> Add Item
              <kbd className="hidden xl:inline text-[10px] font-mono bg-white/20 rounded px-1 py-0.5">Alt+N</kbd>
            </button>
          </div>
        </div>
      </div>


      {/* ─── Editing an existing bill ───
          Loud on purpose: this screen normally raises a NEW bill, and the one
          thing a cashier must not do is keep typing here thinking they are. */}
      {(editingBill || editingQuotation || convertingQuotation) && (
        <div className="px-4 pt-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300">
            <span className="flex items-center gap-1.5 text-caption font-semibold">
              {convertingQuotation ? <ArrowRightLeft size={13} /> : <Pencil size={13} />}
              {editingBill
                ? `Editing ${editingBill.billNumber}`
                : convertingQuotation
                  ? `Converting ${convertingQuotation.quotationNumber}`
                  : `Editing quotation ${editingQuotation?.quotationNumber}`}
            </span>
            <span className="text-[11px] opacity-80">
              {(() => {
                const was = editingBill?.grandTotal ?? editingQuotation?.grandTotal ?? convertingQuotation?.grandTotal ?? 0;
                const drift = grandTotal !== was ? ` · now ₹${inr(grandTotal)}` : '';
                if (editingBill) {
                  return `Was ₹${inr(was)}${drift} · saving keeps the number and moves stock by the difference.`;
                }
                if (convertingQuotation) {
                  // The whole point of the shared series: no second number is
                  // issued, so the customer's estimate and their invoice match.
                  return `Quoted ₹${inr(was)}${drift} · the invoice keeps this number and takes the stock.`;
                }
                return `Quoted ₹${inr(was)}${drift} · saving keeps this number instead of raising a second quotation.`;
              })()}
            </span>
            <button
              type="button"
              onClick={handleNewBill}
              className="ml-auto text-[11px] font-semibold underline hover:no-underline"
            >
              Cancel &amp; start a new bill
            </button>
            {/* Saving here sends automatic rounding, so say so before a typed
                figure quietly disappears from the total. */}
            {editingBill && hasTypedRoundOff(editingBill) && (
              <span className="basis-full flex items-center gap-1.5 text-[11px] font-medium">
                <AlertTriangle size={12} className="flex-shrink-0" />
                The typed round-off will be replaced by automatic rounding — set it again on the case pad if needed.
              </span>
            )}
          </div>
        </div>
      )}

      {/* ─── Banners ─── */}
      {settingsWarning && (
        <div className="px-4 pt-2">
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 text-caption font-medium">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="flex-1">{settingsWarning}</span>
            <button onClick={() => setSettingsWarning('')} aria-label="Dismiss"><X size={14} /></button>
          </div>
        </div>
      )}
      {(error || notice) && (
        <div className="px-4 pt-2">
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium">
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError('')}><X size={14} /></button>
            </div>
          )}
          {notice && !error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 text-caption font-medium">
              <CheckCircle2 size={14} className="flex-shrink-0" />
              <span className="flex-1">{notice}</span>
            </div>
          )}
        </div>
      )}

      {/* ─── Main split ─── */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-surface-200 dark:border-surface-800">
          {showCustomerForm ? (
            <CustomerFormInline
              prefillName={prefillName}
              editing={editingCustomer}
              requirePhone={counterRules.requireCustomerPhone}
              onClose={() => {
                setShowCustomerForm(false);
                setEditingCustomer(null);
              }}
              onSaved={onCustomerSaved}
            />
          ) : (
          <>
          <div className="flex items-center gap-1 px-3 pt-2 border-b border-surface-200 dark:border-surface-800 overflow-x-auto no-scrollbar bg-white dark:bg-surface-900">
            <TabButton icon={<ShoppingBag size={13} />} label="Products" count={cart.length} active={tableView === 'products'} onClick={() => setTableView('products')} />
            <TabButton icon={<History size={13} />} label="Customer History" count={customerBills.length} active={tableView === 'customer-history'} onClick={() => setTableView('customer-history')} />
            <TabButton icon={<Tag size={13} />} label="Product History" count={productHistory.length} active={tableView === 'product-history'} onClick={() => setTableView('product-history')} />
            <TabButton icon={<FileText size={13} />} label="Quotations" count={quotations.length} active={tableView === 'quotations'} onClick={() => setTableView('quotations')} />
          </div>

          <div className="flex-1 overflow-y-auto">
            {tableView === 'products' && (
              <ProductsTab
                cart={cart}
                billingType={billingType}
                discountPercent={discountPercent}
                onQtyDelta={updateQuantity}
                onQty={setQuantity}
                onRate={setRate}
                onPackSize={setPackSize}
                isCaseMode={isCaseMode}
                onRemove={removeFromCart}
                onChangeProduct={changeRowProduct}
                products={products}
                isLoadingProducts={isLoadingProducts}
                onAdd={addToCart}
                tableSearchRef={tableSearchRef}
              />
            )}
            {tableView === 'customer-history' && (
              <CustomerHistoryTab ready={Boolean(linkedCustomerId) || hasEnoughDigits(customerPhone)} loading={customerBillsLoading} bills={customerBills} onReorder={reorderFromBill} />
            )}
            {tableView === 'product-history' && (
              <ProductHistoryTab ready={Boolean(linkedCustomerId) || hasEnoughDigits(customerPhone)} rows={productHistory} onUseRate={applyLastRate} />
            )}
            {tableView === 'quotations' && (
              <QuotationsTab
                quotations={quotations}
                loading={quotationsLoading}
                // Both open this screen on the quotation rather than restoring a
                // snapshot of the form: the row on the server is the quotation,
                // and editing has to write back into it under its own number.
                onEdit={(q) => openQuotation(q, 're-price')}
                onConvert={(q) => openQuotation(q, 'convert')}
                onPrint={(q) => printBillDocument(quotationToBill(q), true, quotationEstimate(q))}
                onCancel={cancelQuotationById}
              />
            )}
          </div>
          </>
          )}
        </div>

        {/* RIGHT */}
        <div className="w-[360px] xl:w-[400px] flex-shrink-0 flex flex-col bg-white dark:bg-surface-900 min-h-0">
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-label uppercase tracking-wider text-surface-400 font-semibold">Order Summary</h2>
                <span className="text-caption text-surface-400">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="space-y-1.5">
                <SummaryRow
                  // In case mode the figure that matters to the cashier is
                  // cases; pieces stay visible because that is what leaves stock.
                  label={isCaseMode ? `Subtotal (${totalCases} cases · ${totalQuantity} pcs)` : `Subtotal (${totalQuantity} qty)`}
                  value={`₹${inr(subtotal)}`}
                />
                {totalDiscount > 0 && (
                  <SummaryRow label={`Discount (${discountPercent}%)`} value={`-₹${inr(totalDiscount)}`} accent="green" />
                )}
                {couponDiscount > 0 && (
                  <SummaryRow label={`Coupon ${appliedCoupon?.code}`} value={`-₹${inr(couponDiscount)}`} accent="green" />
                )}
                <SummaryRow label="Taxable" value={`₹${inr(taxableAmount)}`} muted />
                {taxKind === 'inter' ? (
                  <SummaryRow label={`IGST (${Number((gstHalf * 200).toFixed(2))}%)`} value={`₹${inr(igst)}`} muted />
                ) : (
                  <>
                    <SummaryRow label={`CGST (${Number((gstHalf * 100).toFixed(2))}%)`} value={`₹${inr(cgst)}`} muted />
                    <SummaryRow label={`SGST (${Number((gstHalf * 100).toFixed(2))}%)`} value={`₹${inr(sgst)}`} muted />
                  </>
                )}
              </div>

              {/* All manual entry fields grouped together at the bottom */}
              <div className="mt-3 pt-2.5 border-t border-surface-100 dark:border-surface-800 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-caption text-surface-500">
                    Courier delivery
                    {settingsDeliveryCharge > 0 && <span className="text-surface-400"> · ₹{inr(settingsDeliveryCharge)}</span>}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={courierDelivery}
                    onClick={() => {
                      const next = !courierDelivery;
                      setCourierDelivery(next);
                      setDeliveryCharge(next ? settingsDeliveryCharge : 0);
                    }}
                    className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0', courierDelivery ? 'bg-brand-500' : 'bg-surface-300 dark:bg-surface-600')}
                  >
                    <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform', courierDelivery ? 'translate-x-5' : 'translate-x-1')} />
                  </button>
                </div>

                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5 text-caption text-surface-500"><Truck size={12} /> Delivery / Packaging</span>
                  <div className="flex items-center gap-1">
                    <span className="text-caption text-surface-400">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={deliveryCharge || ''}
                      onChange={(e) => setDeliveryCharge(Math.max(0, Number(e.target.value)))}
                      placeholder="0"
                      className="w-16 text-right py-0.5 px-1.5 rounded-md border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-caption font-medium text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-brand-500/30 tabular-nums"
                    />
                  </div>
                </div>

                {/* GST — percent or a flat rupee amount, split evenly into CGST + SGST */}
                <div className="flex justify-between items-center">
                  <span className="text-caption text-surface-500">GST</span>
                  <div className="flex items-center gap-1">
                    <div className="flex rounded-md border border-surface-200 dark:border-surface-700 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setGstMode('percent')}
                        className={cn('px-1.5 py-0.5 text-caption font-medium transition-colors', gstMode === 'percent' ? 'bg-brand-500 text-white' : 'bg-surface-50 dark:bg-surface-800 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700')}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => setGstMode('flat')}
                        className={cn('px-1.5 py-0.5 text-caption font-medium transition-colors border-l border-surface-200 dark:border-surface-700', gstMode === 'flat' ? 'bg-brand-500 text-white' : 'bg-surface-50 dark:bg-surface-800 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700')}
                      >
                        ₹
                      </button>
                    </div>
                    {gstMode === 'percent' ? (
                      <>
                        <input
                          type="number"
                          min="0"
                          max="28"
                          step="0.5"
                          value={Number.isFinite(gstRate) ? gstRate : ''}
                          onChange={(e) => setGstRate(Math.max(0, Number(e.target.value)))}
                          placeholder="18"
                          className="w-16 text-right py-0.5 px-1.5 rounded-md border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-caption font-medium text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-brand-500/30 tabular-nums"
                        />
                      </>
                    ) : (
                      <>
                        <span className="text-caption text-surface-400">₹</span>
                        <input
                          type="number"
                          min="0"
                          value={gstFlatAmount || ''}
                          onChange={(e) => setGstFlatAmount(Math.max(0, Number(e.target.value)))}
                          placeholder="0"
                          className="w-16 text-right py-0.5 px-1.5 rounded-md border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-caption font-medium text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-brand-500/30 tabular-nums"
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Tax split — CGST+SGST for a sale inside the state, a single
                    IGST line for one outside it. Same rupees either way; this
                    only decides what the invoice prints and what gets filed.
                    Follows the two GSTINs until the cashier overrides it. */}
                <div>
                  <div className="flex justify-between items-center">
                    <span className="text-caption text-surface-500">Tax split</span>
                    <div className="flex rounded-md border border-surface-200 dark:border-surface-700 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setTaxKindOverride('intra')}
                        className={cn('px-2 py-0.5 text-caption font-medium transition-colors', taxKind === 'intra' ? 'bg-brand-500 text-white' : 'bg-surface-50 dark:bg-surface-800 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700')}
                      >
                        CGST+SGST
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaxKindOverride('inter')}
                        className={cn('px-2 py-0.5 text-caption font-medium transition-colors border-l border-surface-200 dark:border-surface-700', taxKind === 'inter' ? 'bg-brand-500 text-white' : 'bg-surface-50 dark:bg-surface-800 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700')}
                      >
                        IGST
                      </button>
                    </div>
                  </div>
                  {taxKindOverride === null ? (
                    <p className="mt-1 text-[11px] text-surface-400">
                      {!shopGstin
                        ? 'Add the shop GSTIN under Settings → Tax to detect this automatically.'
                        : !selectedCustomer?.gstin
                          ? 'No buyer GSTIN — treated as a local sale.'
                          : `Auto: ${gstinStateName(selectedCustomer.gstin) || 'buyer'} ${taxKind === 'inter' ? 'is outside' : 'matches'} ${gstinStateName(shopGstin) || 'the shop state'}.`}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTaxKindOverride(null)}
                      className="mt-1 text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      Set by hand — use the GSTIN instead ({derivedTaxKind === 'inter' ? 'IGST' : 'CGST+SGST'})
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-caption font-medium text-surface-600 dark:text-surface-400">Discount</span>
                  <div className="flex items-center gap-1">
                    <span className="text-caption text-surface-400">%</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                      className="w-16 text-right py-0.5 px-1.5 rounded-md border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-caption font-medium text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-brand-500/30 tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {discountPresets.map((p) => (
                    <button
                      key={p}
                      onClick={() => setDiscountPercent(p)}
                      className={cn('flex-1 py-1 rounded-md text-caption font-medium transition-colors', discountPercent === p ? 'bg-brand-500 text-white' : 'bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700')}
                    >
                      {p === 0 ? 'None' : `${p}%`}
                    </button>
                  ))}
                </div>

                {/* Influencer / promo code */}
                {appliedCoupon ? (
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10">
                    <span className="min-w-0 truncate font-mono text-caption font-bold tracking-wider text-emerald-700 dark:text-emerald-300">
                      {appliedCoupon.code}
                    </span>
                    <span className="shrink-0 text-caption text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {isRecheckingCoupon ? 'Re-checking…' : `-₹${inr(couponDiscount)}`}
                    </span>
                    <button
                      type="button"
                      onClick={clearCoupon}
                      className="shrink-0 p-0.5 rounded text-emerald-700/70 dark:text-emerald-400/70 hover:bg-emerald-500/10"
                      aria-label="Remove coupon"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          if (couponError) setCouponError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void applyCoupon();
                          }
                        }}
                        placeholder="Coupon code"
                        maxLength={32}
                        className="flex-1 min-w-0 py-1 px-2 rounded-md border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-caption font-mono tracking-wider uppercase text-surface-900 dark:text-surface-100 placeholder:font-sans placeholder:tracking-normal placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
                      />
                      <button
                        type="button"
                        onClick={() => void applyCoupon()}
                        disabled={isCheckingCoupon || cart.length === 0}
                        className="shrink-0 px-2.5 py-1 rounded-md bg-surface-100 dark:bg-surface-800 text-caption font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 disabled:opacity-50 transition-colors"
                      >
                        {isCheckingCoupon ? '…' : 'Apply'}
                      </button>
                    </div>
                    {couponError && (
                      <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{couponError}</p>
                    )}
                  </div>
                )}
              </div>

              {stockWarning && (
                <div
                  className={cn(
                    'mt-3 rounded-lg p-2.5 text-[11px]',
                    stockBlocks
                      ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300'
                      : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
                  )}
                >
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle size={12} className="flex-shrink-0" />
                    {stockBlocks
                      ? 'This bill cannot be saved — not enough stock'
                      : invoiceType === 'quotation'
                        ? 'Short on stock (the quotation will still save)'
                        : 'Short on stock (the bill will still save)'}
                  </p>
                  <ul className="mt-1.5 space-y-0.5 tabular-nums">
                    {shortRows.map((c) => (
                      <li key={c.rowId} className="flex justify-between gap-2">
                        <span className="truncate">{c.name}</span>
                        <span className="flex-shrink-0 font-medium">{c.stock} left · {piecesOf(c)} needed</span>
                      </li>
                    ))}
                  </ul>
                  {invoiceType === 'quotation' && enforceStockAtCounter && (
                    <p className="mt-1.5 text-[10px] opacity-80">
                      A quotation doesn’t use stock. Converting it to a bill will be stopped until the stock is there.
                    </p>
                  )}
                  {invoiceType !== 'quotation' && !enforceStockAtCounter && (
                    <p className="mt-1.5 text-[10px] opacity-80">
                      Turn on Settings → Inventory → “Block Counter Sales at Zero Stock” to refuse these instead.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Payment */}
            <div className="px-4 py-3">
              <h2 className="text-label uppercase tracking-wider text-surface-400 font-semibold mb-2">Payment</h2>
              <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                {paymentOptions.map(({ method, icon: Icon, label }) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={cn('flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-colors', paymentMethod === method ? 'bg-brand-500 text-white' : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700')}
                  >
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>

              {paymentMethod === 'cash' && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-caption text-surface-500 w-20 flex-shrink-0">Received</span>
                    <input
                      type="number"
                      value={cashReceived}
                      onChange={(e) => {
                        setCashReceived(e.target.value);
                        setCashTyped(true);
                      }}
                      // Selected on entry, so typing what the customer handed
                      // over replaces a filled-in total instead of adding to it.
                      onFocus={(e) => e.target.select()}
                      placeholder={String(grandTotal)}
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-body-sm font-semibold text-surface-900 dark:text-surface-100 placeholder:text-surface-300 focus:outline-none focus:ring-1 focus:ring-brand-500/30 tabular-nums"
                    />
                    {/* Most counter sales are paid to the rupee, and the bill
                        will not save until this box is filled — so the commonest
                        answer is one tap rather than retyping the total. With
                        the box filled automatically, this also sets it back to
                        following the total after a typed figure. */}
                    <button
                      type="button"
                      onClick={() => {
                        setCashReceived(String(grandTotal));
                        setCashTyped(false);
                      }}
                      disabled={cart.length === 0 || cashReceived === String(grandTotal)}
                      className="flex-shrink-0 px-2 py-1.5 rounded-lg bg-surface-100 dark:bg-surface-800 text-caption font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 disabled:opacity-40 transition-colors"
                    >
                      Exact
                    </button>
                  </div>
                  {cashReceived && Number(cashReceived) >= grandTotal && (
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-green-50 dark:bg-green-500/10">
                      <span className="text-caption text-green-600 dark:text-green-400">Change to return</span>
                      <span className="text-body-sm font-bold text-green-600 dark:text-green-400 tabular-nums">₹{inr(changeAmount)}</span>
                    </div>
                  )}
                </div>
              )}
              {paymentMethod === 'credit' && (
                <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10">
                  <span className="text-caption font-medium text-amber-700 dark:text-amber-400">Balance Due (unpaid)</span>
                  <span className="text-body-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums">₹{inr(grandTotal)}</span>
                </div>
              )}
              {(paymentMethod === 'upi' || paymentMethod === 'card') && (
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder={paymentMethod === 'upi' ? 'UPI Txn ID (optional)' : 'Card Ref No. (optional)'}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-caption text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Bottom action bar ─── */}
      <footer className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-surface-900 border-t border-surface-200 dark:border-surface-800">
        <ActionButton icon={<Pause size={15} />} label="Held" badge={heldBills.length || undefined} onClick={() => setHeldPanelOpen(true)} />
        <ActionButton icon={<Pause size={15} />} label="Hold" kbd="F10" onClick={holdCurrentBill} disabled={cart.length === 0 || isSaving} />
        <ActionButton icon={<Share2 size={15} />} label="Share" kbd="F9" onClick={handleShare} disabled={cart.length === 0} />
        <ActionButton icon={<Eye size={15} />} label="Preview" kbd="F7" onClick={handlePreview} disabled={cart.length === 0} />
        <button
          onClick={() => void handleSaveAndPrint()}
          disabled={!canSave}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-body-sm hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shadow-brand-500/20"
        >
          <Printer size={16} />
          {isSaving
            ? 'Saving…'
            : editingBill
              ? `Update ${editingBill.billNumber}  ·  ₹${inr(grandTotal)}`
              : convertingQuotation
                ? `Invoice ${convertingQuotation.quotationNumber}  ·  ₹${inr(grandTotal)}`
                : editingQuotation
                  ? `Update ${editingQuotation.quotationNumber}  ·  ₹${inr(grandTotal)}`
                  : invoiceType === 'quotation'
                    ? `Save Quotation & Print  ·  ₹${inr(grandTotal)}`
                    : `Save & Print  ·  ₹${inr(grandTotal)}`}
          <kbd className="hidden lg:inline text-[10px] font-mono bg-white/20 rounded px-1 py-0.5 ml-1">F8</kbd>
        </button>
      </footer>

      {/* ─── Overlays ─── */}
      {heldPanelOpen && (
        <HeldBillsPanel held={heldBills} onResume={resumeHeldBill} onDiscard={discardHeldBill} onClose={() => setHeldPanelOpen(false)} />
      )}
      {previewBill && (
        <PreviewModal bill={previewBill} isEstimate={invoiceType === 'quotation'} onClose={() => setPreviewBill(null)} />
      )}
      {pendingQuotation && (
        <ConfirmDialog
          open
          variant="warning"
          title={`Open ${pendingQuotation.quote.quotationNumber}?`}
          description={`This counter has ${cart.length} item${cart.length !== 1 ? 's' : ''} on it worth ₹${inr(grandTotal)}. Hold the bill first if you want it back — opening the quotation replaces what is on screen.`}
          confirmLabel="Hold this bill & open"
          cancelLabel="Stay here"
          onConfirm={() => {
            const { quote, mode } = pendingQuotation;
            setPendingQuotation(null);
            // Held rather than discarded: the cashier asked to look at a
            // quotation, not to throw away the bill they were building.
            holdCurrentBill();
            setSearchParams(mode === 're-price' ? { quote: quote.id } : { convert: quote.id }, { replace: true });
            void loadQuotation(quote.id, products, mode);
          }}
          onCancel={() => setPendingQuotation(null)}
        />
      )}
      {customerSwitch && (
        <CustomerSwitchPrompt
          from={selectedCustomer}
          to={customerSwitch.target}
          itemCount={cart.length}
          total={grandTotal}
          repricing={
            customerSwitch.target
              ? billingTypeForCustomer(customerSwitch.target) !== billingType
              : billingType !== 'retail'
          }
          onKeep={() => resolveCustomerSwitch('keep')}
          onHold={() => resolveCustomerSwitch('hold')}
          onDiscard={() => resolveCustomerSwitch('discard')}
          onCancel={() => setCustomerSwitch(null)}
        />
      )}
      {transportPromptOpen && (
        <TransportPrompt
          value={transportDraft}
          onChange={setTransportDraft}
          onCancel={() => setTransportPromptOpen(false)}
          onConfirm={(name) => {
            setTransportPromptOpen(false);
            setTransport(name);
            // Passed explicitly rather than read back off state: the save runs in
            // this same tick, before the setState above has landed.
            void handleSaveAndPrint({ transport: name, skipTransportPrompt: true });
          }}
        />
      )}
    </div>
  );
}

/**
 * Asks for the carrier on the way to the printer, and takes "none" for an
 * answer. Skip is a first-class button, not a dismissal — a case order the
 * buyer collects themselves has no transport to name, and that must not be
 * harder than typing one.
 */
/**
 * Asked before the customer on a half-built bill is changed.
 *
 * The cashier's real problem is not "are you sure" — it is that they have a
 * cart they do not want to lose and a customer they picked by mistake, or a
 * second customer who walked up while the first was still deciding. So this
 * offers the three things they actually want to do with the bill in progress
 * rather than a yes/no, and every one of them keeps the work: Hold parks it
 * where it can be resumed, Keep carries it over, and only Discard throws
 * anything away.
 */
function CustomerSwitchPrompt({
  from,
  to,
  itemCount,
  total,
  repricing,
  onKeep,
  onHold,
  onDiscard,
  onCancel,
}: {
  from: Customer | null;
  to: Customer | null;
  itemCount: number;
  total: number;
  /** True when the two customers bill at different rates, so Keep moves money. */
  repricing: boolean;
  onKeep: () => void;
  onHold: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const toLabel = to ? to.name : 'no customer';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-surface-900 shadow-xl border border-surface-200 dark:border-surface-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-800">
          <h2 className="flex items-center gap-2 font-display font-semibold text-body-lg text-surface-900 dark:text-surface-50">
            <AlertTriangle size={18} className="text-amber-500" />
            {to ? 'Change the customer on this bill?' : 'Clear the customer on this bill?'}
          </h2>
          <p className="mt-1.5 text-caption text-surface-500 dark:text-surface-400">
            There {itemCount === 1 ? 'is' : 'are'}{' '}
            <span className="font-semibold text-surface-700 dark:text-surface-200">
              {itemCount} item{itemCount !== 1 ? 's' : ''} worth ₹{inr(total)}
            </span>{' '}
            on this bill for{' '}
            <span className="font-semibold text-surface-700 dark:text-surface-200">{from?.name ?? 'this customer'}</span>.
            What should happen to {itemCount === 1 ? 'it' : 'them'}?
          </p>
          {repricing && (
            <p className="mt-2 flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <span>
                {toLabel} bills at a different rate — keeping the items will re-price every line that has not
                been typed over by hand.
              </span>
            </p>
          )}
        </div>

        <div className="px-5 py-4 space-y-2">
          <SwitchChoice
            icon={<ArrowRightLeft size={16} />}
            title={to ? `Keep the items, bill them to ${to.name}` : 'Keep the items, just clear the customer'}
            detail={
              repricing
                ? 'Nothing is lost. Rates you typed by hand are kept; the rest re-price.'
                : 'Nothing is lost. The same items, addressed to someone else.'
            }
            onClick={onKeep}
            tone="brand"
          />
          <SwitchChoice
            icon={<Pause size={16} />}
            title={`Hold this bill${from ? ` for ${from.name}` : ''}, start a fresh one`}
            detail="Parks it under “Held” so it can be resumed later, exactly as it is."
            onClick={onHold}
            tone="default"
          />
          <SwitchChoice
            icon={<Trash2 size={16} />}
            title="Discard this bill and start again"
            detail="The items, discount and payment on it are thrown away."
            onClick={onDiscard}
            tone="danger"
          />
        </div>

        <div className="px-5 py-3 border-t border-surface-100 dark:border-surface-800">
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 rounded-xl text-body-sm font-medium text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
          >
            Cancel — leave the bill as it is
          </button>
        </div>
      </div>
    </div>
  );
}

function SwitchChoice({
  icon,
  title,
  detail,
  onClick,
  tone,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  tone: 'brand' | 'default' | 'danger';
}) {
  const tones = {
    brand: 'border-brand-500/30 hover:border-brand-500/60 hover:bg-brand-500/[0.04] text-brand-600 dark:text-brand-400',
    default: 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-500',
    danger: 'border-surface-200 dark:border-surface-700 hover:border-red-500/50 hover:bg-red-500/[0.04] text-surface-400 hover:text-red-500',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('w-full flex items-start gap-3 text-left px-3.5 py-3 rounded-xl border transition-colors', tones[tone])}
    >
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-body-sm font-semibold text-surface-900 dark:text-surface-100">{title}</span>
        <span className="block mt-0.5 text-[11px] text-surface-500 dark:text-surface-400">{detail}</span>
      </span>
    </button>
  );
}

function TransportPrompt({
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-surface-900 shadow-xl border border-surface-200 dark:border-surface-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-800">
          <h2 className="flex items-center gap-2 font-display font-semibold text-body-lg text-surface-900 dark:text-surface-50">
            <Truck size={18} className="text-brand-500" /> Transport
          </h2>
          <p className="mt-1 text-caption text-surface-500 dark:text-surface-400">
            Which lorry or courier is carrying this order? Printed in the Transport box on the invoice. Optional — skip if the buyer is collecting it.
          </p>
        </div>
        <div className="px-5 py-4">
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onConfirm(value.trim()); }
              if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            }}
            placeholder="e.g. Muthu Mari Travels"
            maxLength={80}
            className="w-full py-2.5 px-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40"
          />
        </div>
        <div className="px-5 py-3 border-t border-surface-100 dark:border-surface-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 rounded-xl text-body-sm text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
          >
            Back to bill
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onConfirm('')}
              className="px-4 py-2 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 font-medium text-body-sm hover:bg-surface-50 dark:hover:bg-surface-800"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => onConfirm(value.trim())}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-500 text-white font-semibold text-body-sm hover:bg-brand-600"
            >
              <Printer size={15} /> Save & Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Product search box (header + in-table)
// ══════════════════════════════════════════════════════════════════

function ProductSearchBox({
  products,
  cart,
  onSelect,
  inputRef,
  placeholder,
  variant = 'box',
  autoFocus = false,
  onCancel,
}: {
  products: AdminProduct[];
  cart: CartItem[];
  onSelect: (p: AdminProduct) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder: string;
  variant?: 'box' | 'row';
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  // Server matches are tagged with the query they belong to, so a stale response
  // from a previous keystroke is never shown for the current query.
  const [serverHits, setServerHits] = useState<{ q: string; items: AdminProduct[] }>({ q: '', items: [] });
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const isRow = variant === 'row';

  // Debounced server-side search so the picker finds ANY product in the catalog
  // (not just the preloaded working set) and stays fast with thousands of items —
  // each query is an indexed lookup returning at most a handful of rows.
  useEffect(() => {
    const s = q.trim();
    if (!s) return; // empty query shows nothing; nothing to fetch
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { getActiveProducts } = await import('@/services/admin.ts');
        const res = await getActiveProducts(s);
        if (!cancelled) setServerHits({ q: s, items: res });
      } catch {
        if (!cancelled) setServerHits({ q: s, items: [] });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const results = useMemo(() => {
    const s = q.trim();
    if (!s) return [];
    const ls = s.toLowerCase();
    // Instant matches from the preloaded set, then server matches for the SAME
    // query (whole catalog), merged and de-duplicated so keystrokes feel instant.
    const local = products.filter(
      (p) =>
        p.name.toLowerCase().includes(ls) ||
        p.category.toLowerCase().includes(ls) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(ls))),
    );
    const server = serverHits.q === s ? serverHits.items : [];
    const seen = new Set<string>();
    const merged: AdminProduct[] = [];
    for (const p of [...local, ...server]) {
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      merged.push(p);
      if (merged.length >= 8) break;
    }
    return merged;
  }, [products, serverHits, q]);

  // Position the dropdown with fixed coords so it escapes any overflow container,
  // and auto-flip above the input when there isn't room below.
  const updatePos = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = isRow ? Math.min(Math.max(r.width, 320), 480) : r.width;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const NEEDED = 300;
    const spaceBelow = window.innerHeight - r.bottom;
    const dropAbove = spaceBelow < NEEDED && r.top > spaceBelow;
    setPos(dropAbove ? { left, bottom: window.innerHeight - r.top + 4, width } : { left, top: r.bottom + 4, width });
  };

  useEffect(() => {
    if (!open) return;
    const onWin = () => updatePos();
    window.addEventListener('scroll', onWin, true);
    window.addEventListener('resize', onWin);
    return () => {
      window.removeEventListener('scroll', onWin, true);
      window.removeEventListener('resize', onWin);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (p: AdminProduct) => {
    onSelect(p);
    setQ('');
    setIdx(0);
    ref.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) {
      if (e.key === 'Escape') {
        setQ('');
        onCancel?.();
        ref.current?.blur();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[idx]) pick(results[idx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQ('');
      onCancel?.();
    }
  };

  return (
    <div className="relative">
      <Search
        size={isRow ? 14 : 16}
        className={cn('absolute top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none', isRow ? 'left-2.5' : 'left-3')}
      />
      <input
        ref={ref}
        type="text"
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setIdx(0);
          updatePos();
        }}
        onFocus={() => { setOpen(true); updatePos(); }}
        onBlur={() => setTimeout(() => { setOpen(false); onCancel?.(); }, 150)}
        onKeyDown={onKey}
        className={cn(
          'w-full text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none transition-shadow',
          isRow
            ? 'pl-8 pr-7 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-caption focus:ring-1 focus:ring-brand-500/30 focus:border-brand-500/40'
            : 'pl-9 pr-8 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-body-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40',
        )}
      />
      {q && (
        <button
          onMouseDown={(e) => { e.preventDefault(); setQ(''); ref.current?.focus(); }}
          className={cn('absolute top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600', isRow ? 'right-2' : 'right-3')}
        >
          <X size={isRow ? 12 : 14} />
        </button>
      )}
      {open && results.length > 0 && pos && createPortal(
        <div
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 60 }}
          className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl max-h-72 overflow-y-auto"
        >
          {results.map((p, i) => {
            const inCart = cart.find((c) => c.productId === p.id);
            return (
              <button
                key={p.id}
                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                onMouseEnter={() => setIdx(i)}
                className={cn('w-full flex items-center gap-3 px-3 py-2 text-left transition-colors', i === idx ? 'bg-brand-500/10' : 'hover:bg-surface-50 dark:hover:bg-surface-800')}
              >
                {p.images[0] ? (
                  <img src={p.images[0] || undefined} alt="" className="w-9 h-9 rounded-lg object-contain p-0.5 flex-shrink-0 bg-surface-100" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center flex-shrink-0">
                    <ShoppingBag size={14} className="text-surface-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-caption font-medium text-surface-900 dark:text-surface-100 truncate">{p.name}</p>
                  <p className="text-caption text-surface-400">{categoryLabels[p.category] ?? p.category}</p>
                </div>
                <span className="text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">₹{inr(p.price)}</span>
                {inCart ? (
                  <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400 flex-shrink-0">×{inCart.quantity}</span>
                ) : (
                  <Plus size={15} className="text-brand-500 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Customer selector + form
// ══════════════════════════════════════════════════════════════════

function CustomerSelector({
  selected,
  customers,
  open,
  setOpen,
  onSelect,
  onAddNew,
  onEdit,
  onClear,
}: {
  selected: Customer | null;
  customers: Customer[];
  open: boolean;
  setOpen: (v: boolean) => void;
  onSelect: (c: Customer) => void;
  onAddNew: (name: string) => void;
  onEdit: (c: Customer) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState('');
  // Server matches tagged with their query, so a stale response never shows.
  const [serverHits, setServerHits] = useState<{ q: string; items: Customer[] }>({ q: '', items: [] });

  // Debounced server-side search so the picker finds ANY customer by name/phone
  // (not just the preloaded working set) and stays fast with a large customer base.
  useEffect(() => {
    const s = q.trim();
    if (!s) return; // empty query shows the preloaded working set; nothing to fetch
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { getCustomers } = await import('@/services/admin.ts');
        const res = await getCustomers({ search: s, limit: 50 });
        if (!cancelled) setServerHits({ q: s, items: res });
      } catch {
        if (!cancelled) setServerHits({ q: s, items: [] });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const filtered = useMemo(() => {
    const s = q.trim();
    if (!s) return customers.slice(0, 60);
    const ls = s.toLowerCase();
    // Instant matches from the preloaded set, then server matches for the SAME
    // query (whole customer base), merged and de-duplicated by id/phone.
    const local = customers.filter(
      (c) =>
        c.name.toLowerCase().includes(ls) ||
        c.phone.includes(s) ||
        (c.city || '').toLowerCase().includes(ls) ||
        (c.area || '').toLowerCase().includes(ls) ||
        (c.contactPerson || '').toLowerCase().includes(ls),
    );
    const server = serverHits.q === s ? serverHits.items : [];
    const seen = new Set<string>();
    const merged: Customer[] = [];
    for (const c of [...local, ...server]) {
      const key = c?.id || c?.phone;
      if (!c || !key || seen.has(key)) continue;
      seen.add(key);
      merged.push(c);
      if (merged.length >= 60) break;
    }
    return merged;
  }, [customers, serverHits, q]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-2 h-9 px-3 rounded-xl border bg-surface-50 dark:bg-surface-800 text-body-sm transition-colors',
          selected ? 'border-brand-500/40 text-surface-900 dark:text-surface-100' : 'border-surface-200 dark:border-surface-700 text-surface-400',
        )}
      >
        <User size={15} className="flex-shrink-0 text-surface-400" />
        <span className="flex-1 text-left truncate">
          {selected ? (
            <>
              <span className="font-medium">{selected.name}</span>
              {selected.phone && <span className="text-surface-400 ml-1.5">· {selected.phone}</span>}
            </>
          ) : (
            'Select customer *'
          )}
        </span>
        {selected ? (
          <span className="flex items-center gap-1.5 flex-shrink-0">
            {/* A registered site user is not a row in the customer directory, so
                there is nothing here that could be saved back — their profile
                is edited under Users, which the eye already links to. */}
            {selected.source !== 'user' && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(selected); }}
                title="Edit this customer"
                className="text-surface-400 hover:text-brand-600"
              >
                <Pencil size={14} />
              </button>
            )}
            <a
              href={`/admin/${selected.source === 'user' ? 'users' : 'customers'}/${selected.id}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Open customer profile in a new tab"
              className="text-surface-400 hover:text-brand-600"
            >
              <Eye size={14} />
            </a>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="text-surface-400 hover:text-red-500"
            >
              <X size={14} />
            </button>
          </span>
        ) : (
          <ChevronDown size={15} className="flex-shrink-0 text-surface-400" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg overflow-hidden">
            <div className="p-2 border-b border-surface-100 dark:border-surface-800">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search customers by name or phone…"
                  className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-caption text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
                />
              </div>
            </div>
            <button
              onClick={() => onAddNew(q.trim())}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-caption font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 border-b border-surface-100 dark:border-surface-800"
            >
              <UserPlus size={15} /> Add New Customer{q.trim() ? ` “${q.trim()}”` : ''}
            </button>
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-center text-caption text-surface-400 py-6">No customers found</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id + (c.source ?? '')}
                    onClick={() => { onSelect(c); setQ(''); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-surface-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-caption font-medium text-surface-900 dark:text-surface-100 truncate">{c.name}</p>
                      <p className="text-[11px] text-surface-400 truncate">
                        {c.phone}
                        {c.city ? ` · ${c.city}` : c.area ? ` · ${c.area}` : ''}
                      </p>
                    </div>
                    <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0', c.source === 'user' ? 'bg-surface-100 dark:bg-surface-800 text-surface-400' : 'bg-brand-500/10 text-brand-600 dark:text-brand-400')}>
                      {c.source === 'user' ? 'User' : c.customerType}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Add a customer, or correct the one already on the bill.
 *
 * Both live in one component because the billing counter is where a missing
 * GSTIN or a wrong phone is actually noticed — a second, near-identical edit
 * form would be the thing that drifts the day a field is added.
 * `editing` decides which of the two it is.
 */
function CustomerFormInline({
  prefillName,
  editing,
  requirePhone,
  onClose,
  onSaved,
}: {
  prefillName: string;
  editing: Customer | null;
  /** Settings → Billing → "Phone Number Required for Customers". */
  requirePhone: boolean;
  onClose: () => void;
  onSaved: (c: Customer, wasEdit: boolean) => void;
}) {
  const [form, setForm] = useState<CustomerInput>({
    name: editing?.name ?? prefillName,
    contactPerson: editing?.contactPerson ?? '',
    phone: editing?.phone ?? '',
    whatsapp: editing?.whatsapp ?? '',
    email: editing?.email ?? '',
    address: editing?.address ?? '',
    area: editing?.area ?? '',
    city: editing?.city ?? '',
    district: editing?.district ?? '',
    state: editing?.state ?? '',
    pincode: editing?.pincode ?? '',
    customerType: editing?.customerType ?? 'retail',
    gstin: editing?.gstin ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  /**
   * Who already holds the phone or GSTIN being typed.
   *
   * Neither was checked at all before, so the counter could build a second
   * record for a customer already in the book — which quietly splits that
   * customer's bills, credit ledger and lifetime value across two rows, because
   * bills are tied to a customer by phone. The server refuses the save either
   * way; this is so the cashier finds out at the field rather than after
   * filling the whole form in.
   */
  const [duplicate, setDuplicate] = useState<{
    field: 'phone' | 'gstin';
    customer: { id: string; name: string; phone: string };
    /** A shared phone the shop allows: shown, but does not stop the save. */
    allowed?: boolean;
  } | null>(null);
  // Only a customer who already has a number must keep one — the server's rule.
  // A record saved without one while the setting was off can still be edited.
  const phoneRequired = requirePhone && (!editing || Boolean(editing.phone));

  const set = (k: keyof CustomerInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Debounced: this fires while somebody is typing a phone number.
  useEffect(() => {
    const phone = form.phone.trim();
    const gstin = (form.gstin ?? '').trim();
    // Only once there is something complete enough to be a real collision.
    const phoneReady = isValidPhone(phone);
    const gstinReady = isValidGstin(gstin);
    if (!phoneReady && !gstinReady) {
      setDuplicate(null);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { checkCustomerDuplicate } = await import('@/services/admin.ts');
        const result = await checkCustomerDuplicate({
          phone: phoneReady ? phone : undefined,
          gstin: gstinReady ? gstin : undefined,
          excludeId: editing?.id,
        });
        if (!cancelled) {
          setDuplicate(
            result.duplicate ? { field: result.field, customer: result.customer, allowed: result.allowed } : null,
          );
        }
      } catch {
        // A failed check must not block the form — the server still refuses a
        // real duplicate on save.
        if (!cancelled) setDuplicate(null);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.phone, form.gstin, editing?.id]);

  // A wholesale sale is raised as a tax invoice that must carry the buyer's
  // GSTIN, and its state code is what decides CGST+SGST vs IGST on that invoice
  // — so it is collected at the point the customer is created, not chased later.
  const gstinRequired = GSTIN_REQUIRED_TYPES.includes(form.customerType);
  const showGstin = gstinRequired || form.customerType === 'dealer';

  /** Abandon this form and put the customer who already holds the value on the bill. */
  const selectExisting = async (customerId: string) => {
    setErr('');
    try {
      const { getBillingCustomerById } = await import('@/services/admin.ts');
      const existing = await getBillingCustomerById(customerId);
      if (!existing) {
        setErr('Could not open that customer. Search for them in the picker instead.');
        return;
      }
      // `false` — nothing was edited, this is the record as it already stands.
      onSaved(existing, false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open that customer.');
    }
  };

  const submit = async () => {
    if (!form.name.trim() || !form.address.trim() || (phoneRequired && !form.phone.trim())) {
      setErr(phoneRequired ? 'Name, phone and address are required.' : 'Name and address are required.');
      return;
    }
    if (form.phone.trim() && !isValidPhone(form.phone)) {
      setErr('Enter a valid 10-digit phone number.');
      return;
    }
    if (gstinRequired && !form.gstin?.trim()) {
      setErr('A GSTIN is required for wholesale customers.');
      return;
    }
    if (form.gstin?.trim() && !isValidGstin(form.gstin)) {
      setErr('Enter a valid 15-character GSTIN (e.g. 33ABIFP1692E1ZA).');
      return;
    }
    if (duplicate && !duplicate.allowed) {
      setErr(
        duplicate.field === 'phone'
          ? `That phone number already belongs to “${duplicate.customer.name}”. Select them instead of adding a second record.`
          : `That GSTIN already belongs to “${duplicate.customer.name}”. Two parties cannot share a GSTIN.`,
      );
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const { createCustomer, updateCustomer } = await import('@/services/admin.ts');
      const payload = { ...form, name: form.name.trim(), phone: form.phone.trim() };
      const saved = editing
        ? await updateCustomer(editing.id, payload)
        : await createCustomer(payload);
      onSaved(saved, Boolean(editing));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save customer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-surface-900">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-200 dark:border-surface-800">
        <h2 className="font-display font-semibold text-body-sm text-surface-900 dark:text-surface-50 flex items-center gap-2">
          {editing ? <Pencil size={16} className="text-brand-500" /> : <UserPlus size={16} className="text-brand-500" />}
          {editing ? `Edit ${editing.name}` : 'Add Customer'}
        </h2>
        <button onClick={onClose} className="inline-flex items-center gap-1 text-caption text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"><X size={14} /> Cancel</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {err && <div className="mb-3 flex items-center gap-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium"><AlertTriangle size={14} /> {err}</div>}

        {/* Caught while the field is being typed, not on Save. The offer to
            open the existing customer is the point of it — being told "already
            exists" and left to go and find them is barely better than not
            being told. */}
        {duplicate && !err && (
          <div className="mb-3 flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-caption font-medium">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="flex-1 min-w-0">
              This {duplicate.field === 'phone' ? 'phone number' : 'GSTIN'} is already saved under{' '}
              <span className="font-semibold">{duplicate.customer.name}</span>
              {duplicate.customer.phone && duplicate.field === 'gstin' && ` (${duplicate.customer.phone})`}.
              {duplicate.field === 'gstin'
                ? ' Two parties cannot share a GSTIN.'
                : duplicate.allowed
                  ? ' If this is a different customer using the same number, you can still save — each keeps their own bills and credit.'
                  : ' Their bills and credit are tied to it — adding a second record would split their history.'}
            </span>
            <button
              type="button"
              onClick={() => void selectExisting(duplicate.customer.id)}
              className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-semibold transition-colors"
            >
              Use {duplicate.customer.name}
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <Field label="Customer Name" required icon={<User size={13} />} value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Rajesh Kumar" />
          <Field label="Contact Person" value={form.contactPerson ?? ''} onChange={(v) => set('contactPerson', v)} placeholder="Person to contact" />
          <Field label="Phone" required={phoneRequired} icon={<Phone size={13} />} value={form.phone} onChange={(v) => set('phone', v.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder={phoneRequired ? '10-digit mobile' : '10-digit mobile (optional)'} />
          <Field label="WhatsApp" icon={<Smartphone size={13} />} value={form.whatsapp ?? ''} onChange={(v) => set('whatsapp', v.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="WhatsApp number" />
          <Field label="Email" value={form.email ?? ''} onChange={(v) => set('email', v)} type="email" placeholder="name@example.com" />
          <Field label="Area" value={form.area ?? ''} onChange={(v) => set('area', v)} placeholder="e.g. Anna Nagar" />
          <Field label="City" icon={<Building2 size={13} />} value={form.city ?? ''} onChange={(v) => set('city', v)} placeholder="e.g. Sivakasi" />
          <Field label="District" value={form.district ?? ''} onChange={(v) => set('district', v)} placeholder="e.g. Virudhunagar" />
          <Field label="State" value={form.state ?? ''} onChange={(v) => set('state', v)} placeholder="e.g. Tamil Nadu" />
          <Field label="Pincode" value={form.pincode ?? ''} onChange={(v) => set('pincode', v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6-digit PIN" />
          <div className="col-span-2 lg:col-span-3 xl:col-span-4">
            <FieldLabel label="Address" required />
            <div className="relative">
              <MapPin size={13} className="absolute left-3 top-3 text-surface-400" />
              <textarea
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                rows={2}
                placeholder="Door no, street, area, landmark…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 resize-none"
              />
            </div>
          </div>
          <div>
            <FieldLabel label="Customer Type" />
            <Select
              value={form.customerType}
              onChange={(v) => {
                set('customerType', v);
                setErr('');
              }}
              options={customerTypes.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
              size="md"
            />
          </div>
          {showGstin && (
            <div>
              <FieldLabel label="GSTIN" required={gstinRequired} />
              <div className="relative">
                <FileText size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  value={form.gstin ?? ''}
                  // Stored bare and uppercase, so a pasted number with spaces or
                  // dashes validates instead of being rejected for its formatting.
                  onChange={(e) => set('gstin', normalizeGstin(e.target.value).slice(0, 15))}
                  placeholder="33ABIFP1692E1ZA"
                  maxLength={15}
                  className={cn(
                    'w-full pl-9 pr-3 py-2 rounded-xl border bg-surface-50 dark:bg-surface-800 text-body-sm font-mono tracking-wide text-surface-900 dark:text-surface-100 placeholder:text-surface-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-brand-500/20',
                    form.gstin && !isValidGstin(form.gstin)
                      ? 'border-amber-400 dark:border-amber-500/50'
                      : 'border-surface-200 dark:border-surface-700 focus:border-brand-500/40',
                  )}
                />
              </div>
              <p className="mt-1 text-[11px] text-surface-400">
                {form.gstin && isValidGstin(form.gstin)
                  ? `Valid — ${gstinStateName(form.gstin)}`
                  : form.gstin
                    ? `${form.gstin.length}/15 characters`
                    : gstinRequired
                      ? 'Required for wholesale billing'
                      : 'Optional'}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-surface-200 dark:border-surface-800 flex gap-2 justify-end">
        <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 font-medium text-body-sm hover:bg-surface-50 dark:hover:bg-surface-800">Cancel</button>
        <button onClick={submit} disabled={saving} className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-body-sm hover:bg-brand-600 disabled:opacity-50">
          {editing ? <Pencil size={15} /> : <UserPlus size={15} />}
          {saving ? 'Saving…' : editing ? 'Save Changes' : 'Save Customer'}
        </button>
      </div>
    </div>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block mb-1 text-caption font-medium text-surface-600 dark:text-surface-400">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  icon,
  type = 'text',
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  icon?: ReactNode;
  type?: string;
  inputMode?: 'numeric' | 'text' | 'email';
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <div className="relative">
        {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">{icon}</div>}
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full pr-3 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40',
            icon ? 'pl-9' : 'pl-3',
          )}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Small shared components
// ══════════════════════════════════════════════════════════════════

function PillToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
}) {
  return (
    <div className="inline-flex items-center h-9 rounded-xl bg-surface-100 dark:bg-surface-800 p-1 flex-shrink-0">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'inline-flex items-center gap-1.5 h-full px-3.5 rounded-lg text-caption font-semibold transition-colors',
            value === opt.value ? 'bg-brand-500 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300',
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A numeric cell that does not fight the person typing into it.
 *
 * A plain controlled `<input type="number">` bound straight to cart state has
 * no room for the half-finished states typing goes through: an emptied box
 * reads as `0`, a lone "-" reads as `0`, and both get written back to the cart
 * and echoed straight into the box. That is what made clearing Qty delete the
 * line, and what made clearing Rate leave a "0" to type around.
 *
 * So while the field has focus it keeps the raw string, and only values that
 * actually parse (and clear `min`) reach the cart. The cart keeps the last good
 * number; blur snaps the box back to whatever the cart ended up holding.
 */
function NumberCell({
  value,
  onCommit,
  min = 0,
  step,
  className,
  inputRef,
  onEnter,
  ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  step?: number;
  className?: string;
  inputRef?: (el: HTMLInputElement | null) => void;
  onEnter?: () => void;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      ref={inputRef}
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      aria-label={ariaLabel}
      value={draft ?? String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === '') return; // mid-edit — leave the cart on its last good value
        const n = Number(raw);
        if (Number.isFinite(n) && n >= min) onCommit(n);
      }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault();
          setDraft(null);
          onEnter();
        }
      }}
      className={className}
    />
  );
}

function TabButton({ icon, label, count, active, onClick }: { icon: ReactNode; label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 text-caption font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
        active ? 'text-brand-600 dark:text-brand-400 border-brand-500' : 'text-surface-500 border-transparent hover:text-surface-700 dark:hover:text-surface-300',
      )}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className={cn('inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-bold', active ? 'bg-brand-500 text-white' : 'bg-surface-100 dark:bg-surface-800 text-surface-500')}>{count}</span>
      )}
    </button>
  );
}

function SummaryRow({ label, value, muted, accent }: { label: string; value: string; muted?: boolean; accent?: 'green' }) {
  return (
    <div className="flex justify-between text-caption">
      <span className={cn(accent === 'green' ? 'text-green-600' : muted ? 'text-surface-400' : 'text-surface-500')}>{label}</span>
      <span className={cn('tabular-nums', accent === 'green' ? 'text-green-600' : muted ? 'text-surface-400' : 'text-surface-600 dark:text-surface-300')}>{value}</span>
    </div>
  );
}

function ActionButton({ icon, label, kbd, badge, onClick, disabled }: { icon: ReactNode; label: string; kbd?: string; badge?: number; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="relative inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 text-caption font-medium hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {kbd && <kbd className="hidden xl:inline text-[9px] font-mono text-surface-400 border border-surface-200 dark:border-surface-700 rounded px-1">{kbd}</kbd>}
      {badge !== undefined && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-fire-500 text-white text-[10px] font-bold flex items-center justify-center">{badge}</span>}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════
// Products tab — in-table add + editable line items
// ══════════════════════════════════════════════════════════════════

function ProductsTab({
  cart,
  billingType,
  discountPercent,
  onQtyDelta,
  onQty,
  onRate,
  onPackSize,
  isCaseMode,
  onRemove,
  onChangeProduct,
  products,
  isLoadingProducts,
  onAdd,
  tableSearchRef,
}: {
  cart: CartItem[];
  billingType: BillingType;
  discountPercent: number;
  onQtyDelta: (rowId: string, d: number) => void;
  onQty: (rowId: string, q: number) => void;
  onRate: (rowId: string, r: number) => void;
  onPackSize: (rowId: string, pieces: number) => void;
  /** Case mode counts cases, not pieces — the columns say so. */
  isCaseMode: boolean;
  onRemove: (rowId: string) => void;
  onChangeProduct: (rowId: string, p: AdminProduct) => void;
  products: AdminProduct[];
  isLoadingProducts: boolean;
  onAdd: (p: AdminProduct) => void;
  tableSearchRef: RefObject<HTMLInputElement | null>;
}) {
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingQtyRef = useRef<string | null>(null);

  // After a product is added via the in-table search, jump focus to its qty field.
  useEffect(() => {
    const pid = pendingQtyRef.current;
    if (!pid) return;
    pendingQtyRef.current = null;
    const row = cart.find((c) => c.productId === pid);
    const el = row ? qtyRefs.current[row.rowId] : null;
    if (el) {
      el.focus();
      el.select();
    }
  }, [cart]);

  const addAndFocusQty = (p: AdminProduct) => {
    pendingQtyRef.current = p.id;
    onAdd(p);
  };

  const backToSearch = () => tableSearchRef.current?.focus();

  // Item, Qty, Stock, Rate, Amount, remove — plus Pcs/Case in case mode and MRP
  // outside it. Derived rather than written as a literal: the two modes happen
  // to come to the same total today, and a future column would silently break
  // the add-row's span if this were hard-coded.
  const spanAfterSno =
    6 + // Item, Qty, Stock, Rate, Amount, remove
    (isCaseMode ? 1 : 0) + // Pcs / Case
    (isCaseMode ? 0 : 1); // MRP

  return (
    <div className="p-3">
      <div className="rounded-xl border border-surface-200 dark:border-surface-800 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="text-label uppercase tracking-wider text-surface-400 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-100 dark:border-surface-800 whitespace-nowrap">
              <th className="text-left font-semibold py-2 pl-3 w-12">S.No</th>
              <th className="text-center font-semibold py-2">Item</th>
              <th className="text-center font-semibold py-2 w-32">{isCaseMode ? 'Cases' : 'Qty'}</th>
              {/* Pack size is what turns cases into the pieces that leave stock,
                  so in case mode it is a column, not a grey sub-label. */}
              {isCaseMode && <th className="text-center font-semibold py-2 w-20">Pcs / Case</th>}
              <th className="text-center font-semibold py-2 w-16">Stock</th>
              {/* A per-PIECE MRP sitting next to a per-CASE rate reads as though
                  the shop is selling below cost. Hidden rather than recomputed:
                  a "case MRP" is a number the shop has never quoted. */}
              {!isCaseMode && <th className="text-right font-semibold py-2 w-20">MRP</th>}
              <th className="text-center font-semibold py-2 w-24">{isCaseMode ? 'Rate / Case' : 'Rate'}</th>
              <th className="text-right font-semibold py-2 w-24 pr-3">Amount</th>
              <th className="py-2 w-10 pr-2" />
            </tr>
          </thead>
          <tbody>
            {cart.map((item, idx) => {
              const lineAmount = item.unitPrice * item.quantity;
              const overStock = item.stock !== null && piecesOf(item) > item.stock;
              const editing = editingRowId === item.rowId;
              return (
                <tr key={item.rowId} className="border-b border-surface-50 dark:border-surface-800/50 hover:bg-surface-50/60 dark:hover:bg-surface-800/30 whitespace-nowrap">
                  <td className="py-1.5 pl-3 text-caption text-surface-400 tabular-nums align-middle">{idx + 1}</td>
                  <td className="py-1.5 px-2 align-middle">
                    {editing ? (
                      <ProductSearchBox
                        products={products}
                        cart={cart}
                        variant="row"
                        autoFocus
                        onSelect={(p) => { onChangeProduct(item.rowId, p); setEditingRowId(null); }}
                        onCancel={() => setEditingRowId(null)}
                        placeholder="Search to replace this product…"
                      />
                    ) : (
                      <button type="button" onClick={() => setEditingRowId(item.rowId)} className="w-full text-center group">
                        <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400">{item.name}</p>
                        <div className="flex items-center justify-center gap-1.5">
                          {billingType === 'wholesale' && <span className="text-[10px] font-semibold text-fire-600 dark:text-fire-400">WHOLESALE</span>}
                          {item.unit === 'case' && (
                            <span className="text-[10px] font-semibold text-brand-600 dark:text-brand-400">
                              {item.quantity} x {item.piecesPerCase} = {piecesOf(item)} pcs
                            </span>
                          )}
                          <span className="text-[10px] text-surface-300 group-hover:text-surface-400">tap to change</span>
                        </div>
                      </button>
                    )}
                  </td>
                  <td className="py-1.5 align-middle">
                    <div className="flex items-center justify-center gap-1 flex-nowrap">
                      <button onClick={() => onQtyDelta(item.rowId, -1)} className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700"><Minus size={12} /></button>
                      <NumberCell
                        inputRef={(el) => { qtyRefs.current[item.rowId] = el; }}
                        value={item.quantity}
                        min={1}
                        onCommit={(n) => onQty(item.rowId, n)}
                        onEnter={backToSearch}
                        ariaLabel={isCaseMode ? `Cases of ${item.name}` : `Quantity of ${item.name}`}
                        className="w-12 flex-shrink-0 text-center py-1 rounded-md border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-caption font-bold text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-brand-500/30 tabular-nums"
                      />
                      <button onClick={() => onQtyDelta(item.rowId, 1)} className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700"><Plus size={12} /></button>
                    </div>
                  </td>
                  {isCaseMode && (
                    <td className="py-1.5 align-middle">
                      <NumberCell
                        value={item.piecesPerCase}
                        min={1}
                        step={1}
                        onCommit={(n) => onPackSize(item.rowId, n)}
                        ariaLabel={`Pieces per case of ${item.name}`}
                        className="w-14 mx-auto block text-center py-1 rounded-md border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-caption font-medium text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-brand-500/30 tabular-nums"
                      />
                    </td>
                  )}
                  <td className="py-1.5 text-center align-middle">
                    <span className={cn('text-caption tabular-nums font-medium', overStock ? 'text-amber-600' : item.stock === null ? 'text-surface-300' : 'text-surface-500')}>
                      {item.stock ?? '—'}
                    </span>
                    {/* Stock is kept in pieces. In case mode the cashier is
                        thinking in cases, so show how many that actually is. */}
                    {isCaseMode && item.stock !== null && (
                      <span className="block text-[10px] text-surface-400 tabular-nums">
                        {Math.floor(item.stock / Math.max(1, item.piecesPerCase))} cs
                      </span>
                    )}
                  </td>
                  {!isCaseMode && (
                    <td className="py-1.5 text-right align-middle">
                      <span className="text-caption text-surface-400 tabular-nums">₹{inr(item.mrp)}</span>
                    </td>
                  )}
                  <td className="py-1.5 align-middle">
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="text-caption text-surface-400">₹</span>
                      <NumberCell
                        value={item.unitPrice}
                        min={0}
                        onCommit={(n) => onRate(item.rowId, n)}
                        onEnter={backToSearch}
                        ariaLabel={isCaseMode ? `Rate per case for ${item.name}` : `Rate for ${item.name}`}
                        className="w-16 text-right py-1 px-1.5 rounded-md border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-caption font-semibold text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-brand-500/30 tabular-nums"
                      />
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 text-right align-middle">
                    <span className="text-body-sm font-semibold text-surface-900 dark:text-surface-100 tabular-nums">₹{inr(lineAmount)}</span>
                    {discountPercent > 0 && <p className="text-[10px] text-green-600 tabular-nums">-{discountPercent}%</p>}
                  </td>
                  <td className="py-1.5 pr-2 text-right align-middle">
                    <button onClick={() => onRemove(item.rowId)} className="p-1 rounded text-surface-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}

            {/* Trailing add row — the search jumps here after each product is chosen */}
            <tr className="bg-brand-500/[0.04]">
              <td className="py-2 pl-3 text-caption text-brand-500 tabular-nums align-middle">{cart.length + 1}</td>
              <td className="py-2 pr-2" colSpan={spanAfterSno}>
                <ProductSearchBox
                  products={products}
                  cart={cart}
                  variant="row"
                  inputRef={tableSearchRef}
                  onSelect={addAndFocusQty}
                  placeholder={isLoadingProducts ? 'Loading products…' : 'Search a product to add to this bill…  (Alt+N)'}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {cart.length === 0 && (
        <p className="text-center text-caption text-surface-400 mt-3">Search a product in the row above and pick it — the cursor jumps straight to Qty. Type the quantity, press Enter, and you’re back on the search for the next item.</p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// History / quotations tabs
// ══════════════════════════════════════════════════════════════════

function CustomerHistoryTab({ ready, loading, bills, onReorder }: { ready: boolean; loading: boolean; bills: Bill[]; onReorder: (b: Bill) => void }) {
  if (!ready) return <TabHint icon={<History size={22} className="text-surface-300" />} text="Select a customer to see their past bills." />;
  if (loading)
    return (
      <div className="flex items-center justify-center py-12"><div className="w-7 h-7 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" /></div>
    );
  if (bills.length === 0) return <TabHint icon={<History size={22} className="text-surface-300" />} text="No previous bills for this customer." />;
  return (
    <table className="w-full">
      <thead>
        <tr className="text-label uppercase tracking-wider text-surface-400 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-100 dark:border-surface-800">
          <th className="text-left font-semibold py-2 pl-4">Bill</th>
          <th className="text-left font-semibold py-2">Date</th>
          <th className="text-left font-semibold py-2">Time</th>
          <th className="text-center font-semibold py-2 w-16">Items</th>
          <th className="text-center font-semibold py-2 w-24">Payment</th>
          <th className="text-right font-semibold py-2 w-28">Total</th>
          <th className="text-right font-semibold py-2 pr-4 w-28">Action</th>
        </tr>
      </thead>
      <tbody>
        {bills.map((b) => (
          <tr key={b.id} className="border-b border-surface-50 dark:border-surface-800/50 hover:bg-surface-50/60 dark:hover:bg-surface-800/30">
            <td className="py-2 pl-4 text-caption font-semibold font-mono text-surface-900 dark:text-surface-100">{b.billNumber}</td>
            <td className="py-2 text-caption text-surface-500">{new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
            <td className="py-2 text-caption text-surface-500">{new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
            <td className="py-2 text-center text-caption text-surface-500 tabular-nums">{b.itemCount}</td>
            <td className="py-2 text-center text-[11px] font-semibold text-surface-500">{b.payment.method.toUpperCase()}</td>
            <td className="py-2 text-right text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">₹{inr(b.grandTotal)}</td>
            <td className="py-2 pr-4 text-right">
              <button onClick={() => onReorder(b)} title="Add these items to the current bill" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[11px] font-semibold hover:bg-brand-500/20 transition-colors">
                <RotateCcw size={12} /> Reorder
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProductHistoryTab({ ready, rows, onUseRate }: { ready: boolean; rows: { productId: string; unit: 'piece' | 'case'; name: string; lastRate: number; count: number; qty: number }[]; onUseRate: (id: string, rate: number, unit: 'piece' | 'case') => void }) {
  if (!ready) return <TabHint icon={<Tag size={22} className="text-surface-300" />} text="Select a customer to see what they've bought before and their last-paid rates." />;
  if (rows.length === 0) return <TabHint icon={<Tag size={22} className="text-surface-300" />} text="No purchase history for this customer yet." />;
  return (
    <table className="w-full">
      <thead>
        <tr className="text-label uppercase tracking-wider text-surface-400 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-100 dark:border-surface-800">
          <th className="text-left font-semibold py-2 pl-4">Product</th>
          <th className="text-center font-semibold py-2 w-24">Bought</th>
          <th className="text-center font-semibold py-2 w-20">Qty</th>
          <th className="text-right font-semibold py-2 w-28">Last rate</th>
          <th className="text-right font-semibold py-2 pr-4 w-24">Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.productId}|${r.unit}`} className="border-b border-surface-50 dark:border-surface-800/50 hover:bg-surface-50/60 dark:hover:bg-surface-800/30">
            <td className="py-2 pl-4 text-caption font-medium text-surface-900 dark:text-surface-100">{r.name}</td>
            <td className="py-2 text-center text-caption text-surface-500 tabular-nums">{r.count}×</td>
            <td className="py-2 text-center text-caption text-surface-500 tabular-nums">{r.qty}{r.unit === 'case' ? ' cs' : ''}</td>
            <td className="py-2 text-right text-caption font-bold text-surface-900 dark:text-surface-100 tabular-nums">₹{inr(r.lastRate)}{r.unit === 'case' ? ' / case' : ''}</td>
            <td className="py-2 pr-4 text-right">
              <button onClick={() => onUseRate(r.productId, r.lastRate, r.unit)} title="Add this product at the last-paid rate" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[11px] font-semibold hover:bg-brand-500/20 transition-colors">
                <ChevronRight size={12} /> Use
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** How a quotation's billing mode reads on screen. */
const billingModeLabel: Record<string, string> = {
  retail: 'Retail',
  'wholesale-piece': 'Wholesale / piece',
  'wholesale-case': 'Wholesale / case',
};

const quotationStatusStyle: Record<QuotationStatus, string> = {
  open: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  converted: 'text-brand-600 dark:text-brand-400 bg-brand-500/10',
  expired: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  cancelled: 'text-surface-400 bg-surface-500/10',
};

function QuotationsTab({
  quotations,
  loading,
  onEdit,
  onConvert,
  onPrint,
  onCancel,
}: {
  quotations: Quotation[];
  loading: boolean;
  onEdit: (q: Quotation) => void;
  onConvert: (q: Quotation) => void;
  onPrint: (q: Quotation) => void;
  onCancel: (id: string) => void;
}) {
  if (loading && quotations.length === 0) {
    return <TabHint icon={<FileText size={22} className="text-surface-300" />} text="Loading quotations…" />;
  }
  if (quotations.length === 0) {
    return (
      <TabHint
        icon={<FileText size={22} className="text-surface-300" />}
        text="Saved quotations appear here, for every counter. Switch to Quotation mode and Save to create one."
      />
    );
  }

  return (
    <div className="divide-y divide-surface-50 dark:divide-surface-800/50">
      {quotations.map((q) => {
        // A converted or cancelled quotation is settled: its number now belongs
        // to an invoice, or to nothing. Reprinting is still fair; changing it
        // is not.
        const settled = q.status === 'converted' || q.status === 'cancelled';
        return (
          <div key={q.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-9 h-9 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center flex-shrink-0">
              <FileText size={15} className="text-surface-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-caption font-semibold text-surface-900 dark:text-surface-100 font-mono">
                  {q.quotationNumber}
                </p>
                <span className={cn('px-1.5 py-px rounded text-[10px] font-semibold capitalize', quotationStatusStyle[q.status])}>
                  {q.status}
                </span>
              </div>
              <p className="text-[11px] text-surface-400 truncate">
                {q.customerName || 'Customer'} ·{' '}
                {new Date(q.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                {q.billingMode && q.billingMode !== 'retail' && ` · ${billingModeLabel[q.billingMode]}`}
              </p>
            </div>
            <span className="text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">
              ₹{inr(q.grandTotal)}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => onEdit(q)}
                disabled={settled}
                title={settled ? 'Settled — cannot be edited' : 'Edit this quotation'}
                className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => onConvert(q)}
                disabled={settled}
                title={settled ? 'Already settled' : 'Convert to invoice — keeps this number'}
                className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ArrowRightLeft size={13} />
              </button>
              <button
                onClick={() => onPrint(q)}
                title="Print quotation"
                className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800"
              >
                <Printer size={13} />
              </button>
              <button
                onClick={() => onCancel(q.id)}
                disabled={settled}
                title={settled ? 'Already settled' : 'Cancel this quotation'}
                className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TabHint({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-2.5">{icon}</div>
      <p className="text-caption text-surface-400 max-w-xs">{text}</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Held bills panel
// ══════════════════════════════════════════════════════════════════

function HeldBillsPanel({ held, onResume, onDiscard, onClose }: { held: HeldBill[]; onResume: (id: string) => void; onDiscard: (id: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white dark:bg-surface-900 rounded-t-2xl sm:rounded-2xl border border-surface-200 dark:border-surface-800 shadow-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-800">
          <h2 className="font-display font-semibold text-body-sm text-surface-900 dark:text-surface-50 flex items-center gap-2"><Pause size={15} className="text-brand-500" /> Held Bills ({held.length})</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {held.length === 0 ? (
            <p className="text-center text-caption text-surface-400 py-10">No held bills.</p>
          ) : (
            <div className="divide-y divide-surface-50 dark:divide-surface-800/50">
              {held.map((h) => (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-caption font-semibold text-surface-900 dark:text-surface-100 truncate">{h.customerName}</p>
                    <p className="text-[11px] text-surface-400">{h.itemCount} items · ₹{inr(h.total)} · {new Date(h.heldAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <button onClick={() => onResume(h.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-[11px] font-semibold hover:bg-brand-600"><Play size={12} /> Resume</button>
                  <button onClick={() => onDiscard(h.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Preview modal
// ══════════════════════════════════════════════════════════════════

function PreviewModal({ bill, isEstimate, onClose }: { bill: Bill; isEstimate: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-100 dark:border-surface-800">
          <div>
            <h2 className="font-display font-semibold text-body-sm text-surface-900 dark:text-surface-50">{isEstimate ? 'Estimate Preview' : 'Invoice Preview'}</h2>
            <p className="text-caption text-surface-400 font-mono">{bill.billNumber}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {bill.customerName && (
            <p className="text-caption text-surface-500 mb-2">
              <span className="font-medium text-surface-900 dark:text-surface-100">{bill.customerName}</span>
              {bill.customerPhone ? ` · ${bill.customerPhone}` : ''}
            </p>
          )}
          <div className="divide-y divide-surface-50 dark:divide-surface-800/50">
            {bill.items.map((it, i) => (
              <div key={it.productId + i} className="flex items-center justify-between py-1.5 text-caption">
                <span className="text-surface-700 dark:text-surface-300 truncate mr-2">{it.name} <span className="text-surface-400">×{it.quantity}</span></span>
                <span className="tabular-nums text-surface-900 dark:text-surface-100">₹{inr(it.unitPrice * it.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-2.5 border-t border-surface-100 dark:border-surface-800 space-y-1">
            <PreviewRow label="Subtotal" value={bill.subtotal} />
            {bill.totalDiscount > 0 && <PreviewRow label={`Discount (${bill.discountPercent}%)`} value={-bill.totalDiscount} accent />}
            {bill.packagingFee > 0 && <PreviewRow label="Packaging" value={bill.packagingFee} />}
            {/* The split this bill actually carries. It read "CGST + SGST"
                unconditionally, so an inter-state bill previewed as ₹0 tax
                while the printed invoice showed the IGST it really charged. */}
            {(bill.totalIgst ?? 0) > 0 ? (
              <PreviewRow label="IGST" value={bill.totalIgst ?? 0} />
            ) : (
              <PreviewRow label="CGST + SGST" value={bill.totalCgst + bill.totalSgst} />
            )}
            {(bill.deliveryCharge ?? 0) > 0 && <PreviewRow label={bill.courierDelivery ? 'Courier' : 'Delivery'} value={bill.deliveryCharge ?? 0} />}
          </div>
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-brand-500/10 px-3.5 py-2.5">
            <span className="text-body-sm font-bold text-surface-900 dark:text-surface-50">Net Payable</span>
            <span className="text-heading-sm font-bold text-brand-600 dark:text-brand-400 tabular-nums">₹{inr(bill.grandTotal)}</span>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-surface-100 dark:border-surface-800">
          <button
            disabled={busy}
            // Through the chooser, so previewing a full-case bill and printing
            // from here gives the ruled pad rather than the retail invoice.
            onClick={async () => { setBusy(true); try { await printBillDocument(bill, isEstimate); } finally { setBusy(false); } }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-body-sm hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            <Printer size={16} /> {busy ? 'Preparing…' : 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex justify-between text-caption">
      <span className={accent ? 'text-green-600' : 'text-surface-500'}>{label}</span>
      <span className={cn('tabular-nums', accent ? 'text-green-600' : 'text-surface-700 dark:text-surface-300')}>{value < 0 ? '-' : ''}₹{inr(Math.abs(value))}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Bill confirmation
// ══════════════════════════════════════════════════════════════════

function BillConfirmation({ bill, onNewBill }: { bill: Bill; onNewBill: () => void }) {
  const siteConfig = useSiteStore(s => s.config);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const isCredit = bill.payment.method === 'credit';
  // Which document this bill prints is decided in one place for the whole app —
  // see lib/billDocument.ts. The rule used to live here, which is exactly why
  // the Bills list and the detail page kept printing the wrong one.
  const isCaseBill = billIsCase(bill);

  const withPdf = async (fn: () => Promise<void>) => {
    setIsPdfLoading(true);
    try { await fn(); } finally { setIsPdfLoading(false); }
  };

  const printDoc = () => printBillDocument(bill);
  const downloadDoc = () => downloadBillDocument(bill);
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] -m-4 lg:-m-6 xl:-m-8 bg-surface-50 dark:bg-surface-950 p-4">
      <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-lg max-w-md w-full">
        <div className="flex flex-col items-center text-center p-6 pb-4">
          <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center mb-3"><CheckCircle2 size={28} className="text-green-500" /></div>
          <h2 className="font-display font-bold text-body-lg text-surface-900 dark:text-surface-50">Bill Generated</h2>
          <p className="text-caption text-surface-400 mt-1">{new Date(bill.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="px-6 pb-4">
          <div className="rounded-xl bg-surface-50 dark:bg-surface-800/50 p-4 space-y-2.5">
            <Row label="Bill No." value={<span className="font-mono font-bold">{bill.billNumber}</span>} />
            {bill.customerName && <Row label="Customer" value={bill.customerName} />}
            {bill.salesperson && <Row label="Salesperson" value={bill.salesperson} />}
            <Row label="Items" value={`${bill.itemCount} items (${bill.totalQuantity} qty)`} />
            {bill.discountPercent > 0 && <Row label="Discount" value={<span className="text-green-600">{bill.discountPercent}% (-₹{inr(bill.totalDiscount)})</span>} />}
            {bill.packagingFee > 0 && <Row label="Packaging" value={`₹${inr(bill.packagingFee)}`} />}
            {(bill.deliveryCharge ?? 0) > 0 && <Row label={bill.courierDelivery ? 'Courier delivery' : 'Delivery'} value={`₹${inr(bill.deliveryCharge ?? 0)}`} />}
            <Row label={bill.gstMode === 'flat' ? 'GST (Flat)' : `${bill.taxKind === 'inter' || (bill.totalIgst ?? 0) > 0 ? 'IGST' : 'GST'} (${bill.gstRate ?? 18}%)`} value={`₹${inr(bill.totalCgst + bill.totalSgst + (bill.totalIgst ?? 0))}`} />
            {isCaseBill && <Row label="Cases" value={`${bill.totalCases ?? 0} case(s)`} />}
            <div className="flex justify-between items-center pt-2 border-t border-surface-200 dark:border-surface-700">
              <span className="text-body-sm font-bold text-surface-900 dark:text-surface-100">Total</span>
              <span className="text-body-lg font-bold text-brand-600 dark:text-brand-400 tabular-nums">₹{inr(bill.grandTotal)}</span>
            </div>
            {isCredit ? (
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10">
                <span className="text-caption font-medium text-amber-700 dark:text-amber-400">CREDIT · Balance Due</span>
                <span className="text-body-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums">₹{inr(bill.grandTotal)}</span>
              </div>
            ) : (
              <Row label="Payment" value={<span className="capitalize">{bill.payment.method}{bill.payment.changeAmount && bill.payment.changeAmount > 0 ? ` (Change: ₹${inr(bill.payment.changeAmount)})` : ''}</span>} />
            )}
          </div>
        </div>
        <div className="px-6 pb-6">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <button disabled={isPdfLoading} onClick={() => void withPdf(printDoc)} className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors disabled:opacity-50">
              <Printer size={16} /><span className="text-caption font-medium">Print</span>
            </button>
            <button disabled={isPdfLoading} onClick={() => void withPdf(downloadDoc)} className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors disabled:opacity-50">
              <Download size={16} /><span className="text-caption font-medium">PDF</span>
            </button>
              <button
                onClick={() => {
                  if (!bill.customerPhone) return;
                  const text = `Bill: ${bill.billNumber}%0ATotal: ₹${bill.grandTotal}%0AThank you for shopping at ${siteConfig.name}!`;
                  window.open(`https://wa.me/91${bill.customerPhone}?text=${text}`, '_blank');
                }}
                disabled={!bill.customerPhone}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors disabled:opacity-40"
            >
              <Share2 size={16} /><span className="text-caption font-medium">WhatsApp</span>
            </button>
          </div>
          {isCaseBill && (
            <Link
              to={`/admin/bills/${bill.id}/case-invoice`}
              className="mb-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-200 dark:border-brand-500/30 text-brand-600 dark:text-brand-400 font-semibold text-body-sm hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
            >
              <FileText size={16} /> Edit Invoice
            </Link>
          )}
          <button onClick={onNewBill} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-500 text-white font-semibold text-body-sm hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20">
            <RotateCcw size={16} /> New Bill
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-caption text-surface-500">{label}</span>
      <span className="text-caption font-medium text-surface-900 dark:text-surface-100">{value}</span>
    </div>
  );
}
