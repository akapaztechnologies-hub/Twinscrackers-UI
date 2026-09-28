import type { PermissionAction, RolePermission } from '@/config/admin-screens.ts';

import type { Product, OrderStatus, Order } from './index.ts';
import type { LogoAssets } from '@/lib/logoAssets.ts';
export type { PaymentStatus } from './index.ts';

// =====================
// ADMIN PRODUCT
// =====================

export interface ProductSpecification {
  key: string;
  value: string;
}

export interface AdminProduct extends Product {
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  isActive: boolean;
  tags?: string[];
  specifications?: ProductSpecification[];
}

// =====================
// ADMIN ORDER
// =====================

export interface StatusHistoryEntry {
  status: OrderStatus;
  changedAt: string;
  changedBy: string;
  note?: string;
}

export interface AdminOrder extends Order {
  customerName: string;
  customerEmail: string;
  notes: string;
  statusHistory: StatusHistoryEntry[];
}

// =====================
// CATEGORY
// =====================

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  image?: string;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
  productCount?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// =====================
// SITE SETTINGS
// =====================

export interface AnnouncementBar {
  text: string;
  isActive: boolean;
  link?: string;
}

export interface ShippingRates {
  freeThreshold: number;
  standardRate: number;
  expressRate: number;
  packagingFee: number;
  standardDays: string;
  expressDays: string;
  /** Whether this delivery option is offered to customers at checkout. */
  enableStandard: boolean;
  enableExpress: boolean;
  /**
   * When true, the shop delivers the goods to the customer and the customer
   * only pays the delivery fee (common in Sivakasi cracker shops). A note is
   * shown at checkout explaining this model to the customer.
   */
  customerPaysDeliveryOnly: boolean;
}

export interface PaymentSettings {
  razorpayEnabled: boolean;
  codEnabled: boolean;
  codLimit: number;
  /** Direct UPI — customer scans a QR / opens their UPI app, then uploads proof. */
  upiEnabled: boolean;
  upiId: string;
  upiPayeeName: string;
  /** Direct bank transfer (NEFT/IMPS). No QR — account details are shown instead. */
  bankEnabled: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankBranch: string;
  /** Free text shown to the customer on the manual-payment screen. */
  manualInstructions: string;
  /** Minutes a manual-payment order stays open before it is auto-cancelled. */
  manualWindowMins: number;
}

export interface InventorySettings {
  /** Show on-hand counts and the in/out-of-stock badge on the storefront. */
  showStockToCustomers: boolean;
  /** Treat stock as a hard limit — block add-to-cart and checkout when it runs out. */
  enforceStock: boolean;
  /** The same rule at the shop counter. Independent of the storefront one. */
  enforceStockAtCounter: boolean;
}

/** Settings → Billing: how the shop counter behaves. */
export interface CounterSettings {
  /** Fill the cash Received box with the bill total. */
  autoFillCashReceived: boolean;
  /** A customer must have a phone number to be saved. */
  requireCustomerPhone: boolean;
  /** More than one customer may hold the same phone number. */
  allowSharedCustomerPhone: boolean;
}

export interface OrderRules {
  /**
   * Goods subtotal an online customer must reach before they can check out —
   * before shipping and before any coupon. 0 means no minimum.
   */
  minOrderValue: number;
}

export interface EmailSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  /** Write-only. The API never sends the stored password back; leave blank to keep it. */
  smtpPass: string;
  fromEmail: string;
  /** Blank = use the company name from Content -> Company Info. */
  fromName: string;
  /** Comma-separated. Blank = alert every active admin account. */
  adminEmail: string;
  /** Read-only flag from the API: is a password already stored? */
  smtpPassSet?: boolean;
}

/** Who the shop tells about a new order. Backend key: `notifications`. */
export interface AlertSettings {
  /** Email the shop when a customer places an order. */
  newOrderEmail: boolean;
  /** Comma-separated. Blank = fall back to Email → adminEmail, then all admins. */
  newOrderEmailRecipients: string;
  /** Attach the packing-slip PDF to that email. */
  newOrderAttachInvoice: boolean;
  /** The confirmation the CUSTOMER receives — independent of the shop's alerts. */
  customerOrderConfirmation: boolean;
  /** Email the shop about contact-form and bulk-order submissions. */
  enquiryEmail: boolean;
  /** Comma-separated. Blank = fall back to the general admin recipients. */
  enquiryEmailRecipients: string;
}

/** Meta WhatsApp Cloud API. Backend key: `whatsapp`. */
export interface WhatsAppSettings {
  enabled: boolean;
  /** From Meta → WhatsApp → API Setup. An ID, not a phone number. */
  phoneNumberId: string;
  /** Write-only. The API never sends the stored token back; leave blank to keep it. */
  accessToken: string;
  /** E.164 digits, no '+'. Comma-separated. e.g. 919876543210 */
  recipients: string;
  templateName: string;
  templateLanguage: string;
  /**
   * The approved template the low-stock alert is sent with. Only the shop knows
   * which one Meta approved for it; the server falls back to `low_stock_alert`.
   */
  lowStockTemplateName?: string;
  attachInvoice: boolean;
  /** Read-only flag from the API: is a token already stored? */
  accessTokenSet?: boolean;
  /**
   * Send order updates to the CUSTOMER as well as the shop.
   *
   * Separate from `enabled`, which governs the shop's own alerts: these need
   * their own Meta-approved templates, and a shop normally has its alerts
   * running well before it starts messaging customers.
   */
  customerUpdates?: boolean;
  /** Approved template name per event. Blank means that update is not sent. */
  customerTemplates?: {
    placed?: string;
    confirmed?: string;
    processing?: string;
    shipped?: string;
    delivered?: string;
    cancelled?: string;
    paymentReceived?: string;
    paymentApproved?: string;
    paymentRejected?: string;
  };
}

export interface SiteSettings {
  siteName: string;
  announcementBar: AnnouncementBar;
  shippingRates: ShippingRates;
  paymentSettings: PaymentSettings;
  checkoutSettings: CheckoutSettings;
  inventorySettings: InventorySettings;
  counterSettings: CounterSettings;
  orderRules: OrderRules;
  emailSettings: EmailSettings;
  alertSettings: AlertSettings;
  whatsappSettings: WhatsAppSettings;
  notificationTemplates: Record<string, string>;
  /** Whether GST is charged/shown at all. When false, 0% is applied everywhere. */
  gstEnabled?: boolean;
  /** Total GST % (CGST+SGST) applied to POS bills + online GST breakup. */
  gstRate?: number;
  /** Business GSTIN printed on invoices. */
  gstin?: string;
}

export interface HeroSlideAdmin {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  image: string;
  isActive: boolean;
  order: number;
}

export interface HeroSettings {
  slides: HeroSlideAdmin[];
  featuredProductIds: string[];
}

// =====================
// DASHBOARD & ANALYTICS
// =====================

export interface DashboardKPIs {
  totalRevenue: number;
  ordersToday: number;
  totalCustomers: number;
  lowStockCount: number;
  revenueChange: number;
  ordersChange: number;
  customersChange: number;
}

export interface DailyAnalytics {
  date: string;
  revenue: number;
  orderCount: number;
  newCustomers: number;
  productsSold: Record<string, number>;
  ordersByStatus: Record<string, number>;
}

// =====================
// PAGINATION
// =====================

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  page?: number;
  totalPages?: number;
}

// =====================
// TABLE
// =====================

export interface TableColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

// =====================
// CONTENT MANAGEMENT
// =====================

export interface ContentSection {
  id: string;
  type: 'header' | 'hero' | 'about' | 'features' | 'how-it-works' | 'testimonials' | 'footer' | 'cta' | 'custom';
  title: string;
  content: Record<string, unknown>;
  isActive: boolean;
  order: number;
  updatedAt: string;
}

export interface AdminTestimonial {
  id: string;
  name: string;
  location: string;
  rating: number;
  text: string;
  avatar: string;
  isActive: boolean;
  order: number;
}

export interface TrustBadge {
  id: string;
  icon: string;
  title: string;
  value: string;
  isActive: boolean;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface FAQCategory {
  id: string;
  name: string;
  icon: string;
  items: FAQItem[];
  order: number;
}

export interface CompanyInfo {
  name: string;
  tagline: string;
  description: string;
  phone: string;
  email: string;
  whatsapp: string;
  address: string;
  city: string;
  state: string;
  socialInstagram: string;
  socialFacebook: string;
  socialYoutube: string;
  socialTelegram: string;
  logo: string;
  /**
   * Every size derived from `logo` by the upload pipeline — favicon, apple
   * touch icon, PWA icons, header mark, loading screen, share card. Absent
   * when the admin pasted a URL rather than uploading a file.
   */
  logoAssets?: LogoAssets | null;
  footerBlurb: string;
  whatsappMessage: string;
  whatsappTooltip: string;
}

export interface FooterSettings {
  copyrightText: string;
  badges: string[];
}

export interface Feature {
  id: string;
  title: string;
  description: string;
  icon: string;
  isActive: boolean;
  order: number;
}

export interface HowItWorksStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  order: number;
}

// =====================
// ADMIN SETTINGS (EXPANDED)
// =====================

export interface StoreSettings {
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  timezone: string;
  logo?: string;
}

export interface ShippingSettings {
  freeThreshold: number;
  standardRate: number;
  expressRate: number;
  standardDays: string;
  expressDays: string;
  enableExpress: boolean;
  restrictedPincodes: string[];
}

export interface NotificationSettings {
  emailOrderUpdates: boolean;
  emailPromotions: boolean;
  smsOrderUpdates: boolean;
  smsPromotions: boolean;
  lowStockAlert: boolean;
  lowStockThreshold: number;
}

export interface SecuritySettings {
  twoFactorEnabled: boolean;
  sessionTimeout: number;
  passwordExpiry: number;
  maxLoginAttempts: number;
}

export interface AdminSettings {
  store: StoreSettings;
  shipping: ShippingSettings;
  notifications: NotificationSettings;
  security: SecuritySettings;
}

// =====================
// ADMIN PROFILE
// =====================

export interface AdminProfile {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  photoURL: string | null;
  role: string;
  department?: string;
  bio?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLogEntry {
  id: string;
  action: string;
  details: string;
  timestamp: string;
  device?: string;
  ip?: string;
}

// =====================
// ANALYTICS (ENHANCED)
// =====================

export interface RevenueBreakdown {
  today: number;
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
  todayChange: number;
  weekChange: number;
  monthChange: number;
}

export interface CustomerInsight {
  newCustomers: number;
  returningCustomers: number;
  newChange: number;
  returningChange: number;
}

export interface AnalyticsKPI {
  label: string;
  value: number;
  change: number;
  trend: 'up' | 'down' | 'neutral';
}

// =====================
// BILLING / POS
// =====================

export type BillPaymentMethod = 'cash' | 'upi' | 'card' | 'credit';
export type BillStatus = 'completed' | 'held' | 'cancelled';

// =====================
// BILLING CUSTOMER (directory)
// =====================

export type CustomerType = 'retail' | 'wholesale' | 'dealer' | 'other';

export interface Customer {
  id: string;
  name: string;
  contactPerson?: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address: string;
  area?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  customerType: CustomerType;
  /** Buyer's GSTIN. Required for wholesale — see `src/lib/gstin.ts`. */
  gstin?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  /** 'user' when derived from a registered site user rather than the customer directory. */
  source?: 'customer' | 'user';
  /** registered-user uid when this customer is (also) an online account. */
  userUid?: string;
}

export type CustomerInput = Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'source' | 'userUid'>;

export interface CustomerStats {
  lifetimeValue: number;
  billCount: number;
  totalQuantity: number;
  aov: number;
  firstPurchase: string | null;
  lastPurchase: string | null;
  paymentMix: Record<string, { count: number; amount: number }>;
  creditBilled: number;
  creditPaid: number;
  creditOutstanding: number;
  topProducts: { productId: string; name: string; quantity: number; spend: number; lastBought: string }[];
}

export interface CreditLedgerEntry {
  type: 'bill' | 'payment';
  id: string;
  ref: string;
  amount: number; // + debit (credit bill), − credit (repayment)
  date: string;
  note?: string;
  balance: number;
}

export interface CreditLedger {
  entries: CreditLedgerEntry[];
  outstanding: number;
}

export interface BillItem {
  productId: string;
  name: string;
  image: string;
  /** Units sold: pieces, or full CASES when `unit` is 'case'. */
  quantity: number;
  /** Rate for one unit — per piece, or per case in case mode. */
  unitPrice: number;
  /** What `quantity` counts. Absent on bills raised before case billing existed. */
  unit?: 'piece' | 'case';
  /** Pieces in one case, snapshotted at bill time. */
  piecesPerCase?: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  /** Non-zero only on an inter-state invoice, where it replaces CGST+SGST. */
  igstAmount?: number;
  totalAmount: number;
}

/** Which pricing path raised a bill. Absent on pre-existing rows, read as 'retail'. */
export type BillingMode = 'retail' | 'wholesale-piece' | 'wholesale-case';

/**
 * The editable printed face of a full-case wholesale invoice. Presentation only
 * — every money figure still lives on the Bill itself.
 */
export interface CaseInvoice {
  /** The "No :" printed on the pad. Editable; billNumber stays the internal key. */
  displayNumber: string;
  invoiceDate: string;
  transport?: string;
  partyGstin?: string;
  partyState?: string;
  hsnCode?: string;
  /** 'inter' prints IGST in place of CGST+SGST. */
  taxKind: 'intra' | 'inter';
  /** The pad's unlabelled continuation rule, under the party block. */
  notes?: string;
  editedAt?: string;
  editedBy?: string;
}

export interface BillPayment {
  method: BillPaymentMethod;
  amount: number;
  reference?: string;
  receivedAmount?: number;
  changeAmount?: number;
}

export interface Bill {
  id: string;
  billNumber: string;
  status: BillStatus;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  /** The customer record this bill was raised for, when one was picked. Absent on older bills. */
  customer?: string;
  items: BillItem[];
  discountPercent: number;
  subtotal: number;
  totalDiscount: number;
  packagingFee: number;
  deliveryCharge?: number;
  courierDelivery?: boolean;
  salesperson?: string;
  taxableAmount: number;
  totalCgst: number;
  totalSgst: number;
  /** Inter-state total GST. Non-zero only when totalCgst/totalSgst are zero. */
  totalIgst?: number;
  /** Which split was charged. Absent on older bills, which are all 'intra'. */
  taxKind?: 'intra' | 'inter';
  /** Set when the bill was corrected after it was raised. */
  editedAt?: string;
  editedBy?: string;
  billingMode?: BillingMode;
  /** Present only on a 'wholesale-case' bill. */
  caseInvoice?: CaseInvoice;
  /** Cases sold on a case bill. `totalQuantity` stays in pieces. */
  totalCases?: number;
  /** 'flat' bills were entered as a rupee amount (in gstAmount); gstRate is then a derived display-only figure. Optional: older bills default to percent/18. */
  gstMode?: 'percent' | 'flat';
  /** Total GST % applied (CGST+SGST). Optional: older bills default to 18. */
  gstRate?: number;
  /** Flat rupee GST amount, when gstMode is 'flat'. */
  gstAmount?: number;
  grandTotal: number;
  roundOff: number;
  /**
   * A round-off the counter typed in by hand, kept so a re-save does not fall
   * back to automatic rounding. `null`/absent means the rounding is automatic.
   */
  manualRoundOff?: number | null;
  payment: BillPayment;
  /** Later part-payments recorded against a credit bill (udhaar settlements). */
  settlements?: BillSettlement[];
  itemCount: number;
  totalQuantity: number;
  /** Influencer/promo code applied at the counter, if any. */
  couponCode?: string;
  couponDiscount?: number;
  /** Set once the bill is voided. */
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
  createdAt: string;
  createdBy: string;
}

export interface BillSettlement {
  amount: number;
  method: string;
  note?: string;
  date: string;
  recordedBy?: string;
}

// =====================
// SUPPLIER MANAGEMENT
// (mirrors the "Supplier Management" sheet in Fireworks_CRM.xlsx)
// =====================

export interface Supplier {
  id: string;
  /** Human-facing code, auto-generated e.g. SUP001 (Excel "Supplier ID"). */
  supplierCode: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  city: string;
  /** Excel "Products Supplied" — a comma list like "Aerial, Ground". */
  productsSupplied: string[];
  /** Excel "Total Ordered (₹)". */
  totalOrdered: number;
  /** Excel "Amount Paid (₹)". */
  amountPaid: number;
  /** Excel "PESO Licensed" (Yes/No). */
  pesoLicensed: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Excel "Balance (Auto ₹)" is derived: totalOrdered − amountPaid (see supplierBalance()).
export type SupplierInput = Omit<Supplier, 'id' | 'supplierCode' | 'createdAt' | 'updatedAt'>;

// =====================
// EXPENSE TRACKER
// (mirrors the "Expense Tracker" sheet in Fireworks_CRM.xlsx)
// =====================

/** Master category list — from the workbook's Settings → Expense Category dropdown. */
export const EXPENSE_CATEGORIES = [
  'Transport',
  'Loading',
  'Packing',
  'Staff',
  'Rent',
  'Electricity',
  'Maintenance',
  'License Fee',
  'Miscellaneous',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: string;
  /** Excel "Date" — ISO date string (YYYY-MM-DD). */
  date: string;
  /** Excel "Expense Category" — one of EXPENSE_CATEGORIES (kept as string for flexibility). */
  category: string;
  description: string;
  /** Excel "Amount (₹)". */
  amount: number;
  /** Excel "GST (₹)". */
  gst: number;
  /** Excel "Paid To". */
  paidTo: string;
  createdAt: string;
  updatedAt: string;
}

// Excel "Total (Auto ₹)" is derived: amount + gst (see expenseTotal()).
export type ExpenseInput = Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>;

// =====================
// STOREFRONT ENQUIRIES
// =====================

/**
 * A message a visitor sent from the storefront: either the contact form or the
 * bulk-order quote request. Both are one collection on the server with a `type`
 * discriminator, and two screens in the admin panel — answering a safety
 * question and quoting a wedding are different jobs.
 */
export type EnquiryType = 'contact' | 'bulk';

/** Contact messages are a support queue: read it, deal with it, close it. */
export const CONTACT_STATUSES = ['new', 'in_progress', 'resolved', 'spam', 'archived'] as const;

/**
 * Bulk requests are a sales pipeline. `won`/`lost` are the only record of
 * whether these enquiries earn anything, which is what makes the list worth
 * keeping past the week it arrived.
 */
export const BULK_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost', 'spam', 'archived'] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export type BulkStatus = (typeof BULK_STATUSES)[number];
export type EnquiryStatus = ContactStatus | BulkStatus;

export const ENQUIRY_STATUSES: Record<EnquiryType, readonly EnquiryStatus[]> = {
  contact: CONTACT_STATUSES,
  bulk: BULK_STATUSES,
};

/** Sentence-case labels; the raw values are snake_case and read badly on screen. */
export const ENQUIRY_STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  resolved: 'Resolved',
  contacted: 'Contacted',
  quoted: 'Quoted',
  won: 'Won',
  lost: 'Lost',
  spam: 'Spam',
  archived: 'Archived',
};

export interface Enquiry {
  id: string;
  type: EnquiryType;
  name: string;
  email: string;
  phone: string;
  message: string;
  /** Contact form only — the dropdown value, e.g. 'general' | 'safety'. */
  subject: string;
  /** Bulk form only. */
  company: string;
  eventType: string;
  /** The budget *band* the customer picked, e.g. '25k-50k'. Not an amount. */
  budget: string;
  /** What the shop quoted. Admin-entered; 0 means not quoted yet. */
  quotedAmount: number;
  status: EnquiryStatus;
  adminNotes: string;
  /** The admin who last moved it along, when the server populated one. */
  handledByName: string;
  handledAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Counts behind the KPI cards on both enquiry screens. */
export interface EnquiryStats {
  total: number;
  thisWeek: number;
  /** Sum of `quotedAmount` across won bulk enquiries. Always 0 for contact. */
  wonValue: number;
  byStatus: Record<string, number>;
}

export interface EnquiryListResult {
  data: Enquiry[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

/** What an admin may change. The visitor's own words are never editable. */
export interface EnquiryPatch {
  status?: EnquiryStatus;
  adminNotes?: string;
  quotedAmount?: number;
}

/**
 * The contact form's subject values. A lookup rather than something derived,
 * because the shop can add its own options in Admin -> Content -> Contact Page;
 * anything not listed here is prettified from its slug instead (see
 * `enquiryLabel` in services/enquiries.ts).
 */
export const ENQUIRY_SUBJECT_LABEL: Record<string, string> = {
  general: 'General enquiry',
  bulk: 'Bulk order enquiry',
  support: 'Order support',
  safety: 'Safety question',
  partnership: 'Business partnership',
};

export const ENQUIRY_EVENT_LABEL: Record<string, string> = {
  wedding: 'Wedding / Reception',
  festival: 'Festival / Diwali',
  corporate: 'Corporate event',
  retail: 'Retail / Resale',
  other: 'Other',
};

/** Budget *bands* offered by the bulk form — not amounts the shop quoted. */
export const ENQUIRY_BUDGET_LABEL: Record<string, string> = {
  '10k-25k': '₹10,000 – ₹25,000',
  '25k-50k': '₹25,000 – ₹50,000',
  '50k-1l': '₹50,000 – ₹1,00,000',
  '1l+': '₹1,00,000+',
};

// =====================
// ACCESS CONTROL (ROLES & EMPLOYEES)
// =====================

/**
 * A role the owner created in the portal. `permissions` is the screen access
 * matrix; `isSystem` roles (Super Admin) are read-only, and `isSuperAdmin`
 * grants every screen regardless of what `permissions` lists.
 */
export interface AdminRole {
  id: string;
  name: string;
  description: string;
  permissions: RolePermission[];
  isSystem: boolean;
  isSuperAdmin: boolean;
  isActive: boolean;
  /** How many employees currently hold it — a role in use cannot be deleted. */
  employeeCount: number;
  createdAt: string;
  updatedAt: string;
}

export type AdminRoleInput = {
  name: string;
  description?: string;
  isActive?: boolean;
};

/** One screen as the role editor renders it, from the backend's registry. */
export interface AdminScreen {
  key: string;
  label: string;
  group: string;
  description: string;
}

export interface ScreenCatalogue {
  screens: AdminScreen[];
  groups: Record<string, string>;
  actions: PermissionAction[];
}

/** A staff account. Backed by a User document carrying a `staffRole`. */
export interface Employee {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  employeeCode: string;
  designation: string;
  joinedAt: string;
  isActive: boolean;
  roleId: string;
  roleName: string;
  isSuperAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeInput {
  displayName: string;
  email: string;
  /** Create only. The admin hands the credentials over; the employee changes it later. */
  password?: string;
  phone?: string;
  employeeCode?: string;
  designation?: string;
  joinedAt?: string;
  staffRole: string;
  isActive?: boolean;
}

/**
 * Whether customers must have an account to order online.
 *
 * Settings → Checkout. `requireLogin: true` is how the shop has always worked
 * and stays the default, so a deploy never quietly opens guest ordering. With
 * it off, a guest order attaches to a passwordless customer record keyed on
 * their phone number, and a repeat order from that number joins the same
 * history.
 */
export interface CheckoutSettings {
  requireLogin: boolean;
  /** Offer the guest an account on the confirmation page, after the order. */
  offerAccountAfterOrder: boolean;
  /**
   * Let the customer choose which transport line carries their order and which
   * of its offices they collect from.
   *
   * Off by default so it appears only once the shop has loaded its drop points
   * — switching it on with an empty list would hand every customer an empty
   * chooser.
   */
  deliveryPointEnabled: boolean;
  /** Whether they must choose before paying. The nearest office is preselected. */
  deliveryPointRequired: boolean;
}
