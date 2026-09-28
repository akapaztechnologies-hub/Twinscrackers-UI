import { useState, useEffect } from 'react';
import { Save, CheckCircle2, Truck, CreditCard, Bell, Shield, Boxes, ShoppingCart, QrCode, Landmark, AlertTriangle, Mail, Send, Loader2, Receipt } from 'lucide-react';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { ErrorNotice, LOAD_FAILED_MESSAGE, errorText, loadErrorText } from '@/components/admin/AdminShared.tsx';
import { cn } from '@/lib/utils.ts';
import type { SiteSettings, ShippingRates, PaymentSettings, InventorySettings, CounterSettings, EmailSettings, AlertSettings, WhatsAppSettings } from '@/types/admin.ts';

const defaultSettings: SiteSettings = {
  siteName: '',
  announcementBar: { text: '', isActive: false },
  shippingRates: {
    freeThreshold: 999,
    standardRate: 99,
    expressRate: 199,
    packagingFee: 0,
    standardDays: '5-7',
    expressDays: '2-3',
    enableStandard: true,
    enableExpress: true,
    customerPaysDeliveryOnly: false,
  },
  checkoutSettings: {
    requireLogin: true,
    offerAccountAfterOrder: true,
    deliveryPointEnabled: false,
    deliveryPointRequired: true,
  },
  paymentSettings: {
    razorpayEnabled: true,
    codEnabled: false,
    codLimit: 5000,
    upiEnabled: false,
    upiId: '',
    upiPayeeName: '',
    bankEnabled: false,
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankBranch: '',
    manualInstructions: '',
    manualWindowMins: 60,
  },
  inventorySettings: {
    showStockToCustomers: false,
    enforceStock: false,
    enforceStockAtCounter: false,
  },
  counterSettings: {
    autoFillCashReceived: false,
    requireCustomerPhone: true,
    allowSharedCustomerPhone: false,
  },
  orderRules: {
    minOrderValue: 0,
  },
  emailSettings: {
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    fromEmail: '',
    fromName: '',
    adminEmail: '',
  },
  alertSettings: {
    newOrderEmail: true,
    newOrderEmailRecipients: '',
    newOrderAttachInvoice: true,
    customerOrderConfirmation: true,
    enquiryEmail: true,
    enquiryEmailRecipients: '',
  },
  whatsappSettings: {
    enabled: false,
    phoneNumberId: '',
    accessToken: '',
    recipients: '',
    templateName: 'new_order',
    templateLanguage: 'en',
    attachInvoice: true,
    lowStockTemplateName: 'low_stock_alert',
    // Customer-facing updates. Off until the shop has templates approved for
    // them — see the WhatsApp card further down this page.
    customerUpdates: false,
    customerTemplates: {
      placed: '',
      confirmed: '',
      processing: '',
      shipped: '',
      delivered: '',
      cancelled: '',
      paymentReceived: '',
      paymentApproved: '',
      paymentRejected: '',
    },
  },
  notificationTemplates: {},
  gstEnabled: true,
  gstRate: 18,
  gstin: '',
};

interface NotifSettings {
  emailOrderUpdates: boolean;
  emailPromotions: boolean;
  smsOrderUpdates: boolean;
  smsPromotions: boolean;
  lowStockAlert: boolean;
  lowStockThreshold: number;
}

interface SecSettings {
  /** Idle minutes before the admin panel signs out. 0 = never. */
  sessionTimeout: number;
  /** Wrong passwords in a row before the account is locked. 0 = never lock. */
  maxLoginAttempts: number;
  /** How long a locked account stays locked. */
  lockoutMinutes: number;
  /** Employees may use "Continue with Google" when its email is theirs. */
  staffGoogleSignIn: boolean;
}

const defaultNotif: NotifSettings = {
  emailOrderUpdates: true,
  emailPromotions: false,
  smsOrderUpdates: false,
  smsPromotions: false,
  lowStockAlert: true,
  lowStockThreshold: 20,
};

const defaultSec: SecSettings = {
  sessionTimeout: 60,
  maxLoginAttempts: 5,
  lockoutMinutes: 15,
  staffGoogleSignIn: false,
};

/**
 * The public read of /admin/settings strips the email, WhatsApp and alert
 * sections and every payment detail. The admin read always carries
 * `smtpPassSet`, so its absence means this page was handed the storefront's
 * copy — and saving that back would blank the UPI id, bank account, WhatsApp
 * setup and alert recipients.
 */
const PARTIAL_LOAD_MESSAGE =
  'Only part of your settings came back (your sign-in may have expired), so saving is switched off to protect them. Reload the page, signing in again if asked.';

type Tab = 'orders' | 'shipping' | 'payment' | 'inventory' | 'billing' | 'email' | 'notifications' | 'security';

const tabs: { id: Tab; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'orders', label: 'Orders', icon: ShoppingCart, description: 'Checkout & minimum order' },
  { id: 'shipping', label: 'Shipping', icon: Truck, description: 'Rates & delivery times' },
  { id: 'payment', label: 'Payment', icon: CreditCard, description: 'Payment methods' },
  { id: 'inventory', label: 'Inventory', icon: Boxes, description: 'Stock visibility & limits' },
  { id: 'billing', label: 'Billing', icon: Receipt, description: 'Counter payment & customers' },
  { id: 'email', label: 'Email', icon: Mail, description: 'SMTP mailbox & sender' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Email, WhatsApp & alerts' },
  { id: 'security', label: 'Security', icon: Shield, description: 'Sessions & access' },
];

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

const hintClass = 'text-caption text-surface-400 mt-1';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-body-md font-semibold text-surface-900 dark:text-surface-100">{children}</h3>;
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-5', className)}>
      {children}
    </div>
  );
}

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [notifSettings, setNotifSettings] = useState<NotifSettings>(defaultNotif);
  const [secSettings, setSecSettings] = useState<SecSettings>(defaultSec);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Set when the settings did not load completely. Every section is saved
  // whole, so saving after a failed load would write the defaults over them.
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [testTo, setTestTo] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { getSiteSettings, getContentSection } = await import('@/services/admin.ts');
        const [result, notif, sec] = await Promise.all([
          getSiteSettings(),
          getContentSection<NotifSettings>('notification-settings'),
          getContentSection<SecSettings>('security-settings'),
        ]);
        if (!result) {
          setLoadError(LOAD_FAILED_MESSAGE);
          return;
        }
        if (typeof result.emailSettings?.smtpPassSet !== 'boolean') {
          setLoadError(PARTIAL_LOAD_MESSAGE);
          return;
        }
        setSettings({
            ...defaultSettings,
            ...result,
            // Nested sections merge field-by-field: a section saved before a new
            // field existed would otherwise leave that input uncontrolled.
            shippingRates: { ...defaultSettings.shippingRates, ...result.shippingRates },
            paymentSettings: { ...defaultSettings.paymentSettings, ...result.paymentSettings },
            checkoutSettings: { ...defaultSettings.checkoutSettings, ...result.checkoutSettings },
            inventorySettings: { ...defaultSettings.inventorySettings, ...result.inventorySettings },
            counterSettings: { ...defaultSettings.counterSettings, ...result.counterSettings },
            orderRules: { ...defaultSettings.orderRules, ...result.orderRules },
            emailSettings: { ...defaultSettings.emailSettings, ...result.emailSettings, smtpPass: '' },
            alertSettings: { ...defaultSettings.alertSettings, ...result.alertSettings },
            // accessToken blanked for the same reason as smtpPass: the API sends
            // back only accessTokenSet, and an empty field means "keep it".
            whatsappSettings: { ...defaultSettings.whatsappSettings, ...result.whatsappSettings, accessToken: '' },
          });
        if (notif) setNotifSettings({ ...defaultNotif, ...notif });
        if (sec) setSecSettings({ ...defaultSec, ...sec });
      } catch (err) {
        setLoadError(loadErrorText(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (loadError) return;
    setIsSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      const { updateSiteSettings, updateContentSection } = await import('@/services/admin.ts');
      await Promise.all([
        // Only shipping + payment live here now; store name & announcement are owned by Admin → Content.
        updateSiteSettings({ shippingRates: settings.shippingRates, paymentSettings: settings.paymentSettings, checkoutSettings: settings.checkoutSettings, inventorySettings: settings.inventorySettings, counterSettings: settings.counterSettings, orderRules: settings.orderRules, emailSettings: settings.emailSettings, alertSettings: settings.alertSettings, whatsappSettings: settings.whatsappSettings, gstEnabled: settings.gstEnabled, gstRate: settings.gstRate, gstin: settings.gstin }),
        updateContentSection('notification-settings', notifSettings as unknown as Record<string, unknown>),
        updateContentSection('security-settings', secSettings as unknown as Record<string, unknown>),
      ]);
      // The password field is write-only: once saved, clear it so the form shows
      // "a password is stored" rather than re-sending it on the next save.
      if (settings.emailSettings.smtpPass) {
        setSettings((s) => ({
          ...s,
          emailSettings: { ...s.emailSettings, smtpPass: '', smtpPassSet: true },
        }));
      }
      if (settings.whatsappSettings.accessToken) {
        setSettings((s) => ({
          ...s,
          whatsappSettings: { ...s.whatsappSettings, accessToken: '', accessTokenSet: true },
        }));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(errorText(err, 'Your settings could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const updateShipping = (field: keyof ShippingRates, value: string | number | boolean) => {
    setSettings((s) => ({ ...s, shippingRates: { ...s.shippingRates, [field]: value } }));
  };

  const updatePayment = (field: keyof PaymentSettings, value: boolean | number | string) => {
    setSettings((s) => ({ ...s, paymentSettings: { ...s.paymentSettings, [field]: value } }));
  };

  const updateInventory = (field: keyof InventorySettings, value: boolean) => {
    setSettings((s) => ({ ...s, inventorySettings: { ...s.inventorySettings, [field]: value } }));
  };

  const updateCounter = (field: keyof CounterSettings, value: boolean) => {
    setSettings((s) => ({ ...s, counterSettings: { ...s.counterSettings, [field]: value } }));
  };

  const updateEmail = (field: keyof EmailSettings, value: string | number) => {
    setSettings((s) => ({ ...s, emailSettings: { ...s.emailSettings, [field]: value } }));
  };

  const updateAlerts = (field: keyof AlertSettings, value: string | boolean) => {
    setSettings((s) => ({ ...s, alertSettings: { ...s.alertSettings, [field]: value } }));
  };

  const updateWhatsApp = (
    field: keyof WhatsAppSettings,
    // The customer template names travel as one object, so this takes more than
    // the scalars the rest of the card sets.
    value: string | boolean | WhatsAppSettings['customerTemplates'],
  ) => {
    setSettings((s) => ({ ...s, whatsappSettings: { ...s.whatsappSettings, [field]: value } }));
  };

  /** Prove the mailbox works before an order confirmation depends on it. */
  const handleTestEmail = async () => {
    setTestResult(null);
    setIsTesting(true);
    try {
      const { sendTestEmail } = await import('@/services/admin.ts');
      setTestResult({ ok: true, message: await sendTestEmail(testTo.trim() || undefined) });
    } catch (err) {
      const detail =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        'Could not send the test email.';
      setTestResult({ ok: false, message: detail });
    } finally {
      setIsTesting(false);
    }
  };

  const ship = settings.shippingRates;
  const pay = settings.paymentSettings;
  const inv = settings.inventorySettings;
  const counter = settings.counterSettings;
  const em = settings.emailSettings;
  const alerts = settings.alertSettings;
  const wa = settings.whatsappSettings;
  const siteName = settings.siteName;
  // Switched on but not actually sendable — the same "configured but incomplete"
  // warning the UPI and bank sections give, for the same reason: silence is
  // indistinguishable from "no orders yet".
  const whatsappIncomplete =
    wa.enabled &&
    (!wa.phoneNumberId.trim() ||
      (!wa.accessToken.trim() && !wa.accessTokenSet) ||
      !wa.recipients.trim() ||
      !wa.templateName.trim());
  // A method that is switched on but missing the details it needs would render a
  // QR that pays nobody, so checkout treats it as unavailable — flag it here.
  // Switching both delivery options off leaves checkout with nothing to offer.
  const noShippingMethod = ship.enableStandard === false && ship.enableExpress === false;
  /*
   * "To Pay": the courier collects the delivery charge from the customer on
   * arrival, so the shop quotes no shipping rate at all. Switching both delivery
   * options off is then the correct setup, not a mistake — the warning below
   * only applies when the shop is meant to be charging for delivery itself.
   */
  const toPayOnly = ship.customerPaysDeliveryOnly === true;
  const upiIncomplete = pay.upiEnabled && !pay.upiId.trim();
  const bankIncomplete = pay.bankEnabled && (!pay.bankAccountNumber.trim() || !pay.bankIfsc.trim());

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  // Nothing is offered for editing: the form would show the built-in defaults,
  // which read as "your UPI id and bank details are gone" when they are not.
  if (loadError) {
    return (
      <SectionCard className="space-y-4">
        <ErrorNotice message={loadError} />
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors"
        >
          Reload
        </button>
      </SectionCard>
    );
  }

  return (
    <div className="flex gap-6 min-h-0">
      {/* Vertical Tab Navigation
          Pinned while the panel beside it scrolls. `self-start` is what makes
          that possible: as a stretched flex child the column is as tall as the
          whole page and has nothing to stick to. `<main>` is the scrollport, so
          top-0 is its top edge; the max-height keeps the list itself scrollable
          if tabs ever outgrow a short window. */}
      <div className="hidden md:flex flex-col w-56 flex-shrink-0 space-y-1 self-start sticky top-0 max-h-[calc(100dvh-7rem)] overflow-y-auto no-scrollbar">
        {tabs.map(({ id, label, icon: Icon, description }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-start gap-3 w-full px-3.5 py-3 rounded-xl text-left transition-colors',
              activeTab === id
                ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800',
            )}
          >
            <Icon size={18} className="mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className={cn('text-body-sm font-medium', activeTab === id ? 'text-brand-600 dark:text-brand-400' : 'text-surface-700 dark:text-surface-200')}>
                {label}
              </p>
              <p className="text-caption text-surface-400 truncate">{description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Mobile horizontal tabs */}
      <div className="flex md:hidden gap-1 overflow-x-auto pb-1 -mb-1 scrollbar-hide absolute top-0 left-0 right-0">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-body-sm font-medium whitespace-nowrap transition-colors',
              activeTab === id
                ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800',
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Content Header — tab title + save */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-body-lg text-surface-900 dark:text-surface-50">
              {tabs.find((t) => t.id === activeTab)?.label}
            </h2>
            <p className="text-caption text-surface-400">
              {tabs.find((t) => t.id === activeTab)?.description}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 text-body-sm text-green-600 dark:text-green-400 font-medium">
                <CheckCircle2 size={16} />
                Saved
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
            >
              <Save size={15} />
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        <ErrorNotice message={saveError} onDismiss={() => setSaveError('')} />

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <SectionCard>
            {/* The tab is already one card, so these are sections inside it
                rather than cards of their own — a card nested in a card reads
                as two panels crammed together. */}
            <div className="space-y-5">
              <SectionTitle>Checkout</SectionTitle>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">
                      Require login to order
                    </p>
                    <p className="text-caption text-surface-400 mt-0.5">
                      {settings.checkoutSettings.requireLogin
                        ? 'Customers must sign in or create an account before they can place an order.'
                        : 'Customers can order as a guest. The order is saved against their phone number, so a repeat order joins the same history and they can claim it as an account later.'}
                    </p>
                  </div>
                  <Toggle
                    checked={settings.checkoutSettings.requireLogin}
                    onChange={(v) =>
                      setSettings((s) => ({
                        ...s,
                        checkoutSettings: { ...s.checkoutSettings, requireLogin: v },
                      }))
                    }
                  />
                </div>

                {!settings.checkoutSettings.requireLogin && (
                  <div className="pt-4 border-t border-surface-100 dark:border-surface-800">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">
                          Offer an account after ordering
                        </p>
                        <p className="text-caption text-surface-400 mt-0.5">
                          Ask the guest to set a password on the confirmation page — never before the order.
                          The account picks up the order they just placed.
                        </p>
                      </div>
                      <Toggle
                        checked={settings.checkoutSettings.offerAccountAfterOrder}
                        onChange={(v) =>
                          setSettings((s) => ({
                            ...s,
                            checkoutSettings: { ...s.checkoutSettings, offerAccountAfterOrder: v },
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* A rule, not a rail: the divider is what separates the two
                sections now that neither has a card around it. */}
            <div className="mt-6 pt-6 border-t border-surface-100 dark:border-surface-800 space-y-5">
              <SectionTitle>Minimum Order Value</SectionTitle>
              <div className="max-w-sm">
                <label className={labelClass}>Minimum Order Value (INR)</label>
                <input
                  type="number"
                  value={settings.orderRules.minOrderValue}
                  onChange={(e) =>
                    setSettings((st) => ({
                      ...st,
                      // Clamped at zero: a negative floor would read as "no
                      // minimum" to the server anyway, so never store one.
                      orderRules: { ...st.orderRules, minOrderValue: Math.max(0, Number(e.target.value) || 0) },
                    }))
                  }
                  className={inputClass}
                  min="0"
                  step="50"
                />
                <p className={hintClass}>
                  Customers must reach this cart value before they can check out. Set to{' '}
                  <strong>0</strong> for no minimum.
                </p>
              </div>

              <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-800/50 p-4 space-y-2">
                <p className="text-body-sm font-medium text-surface-700 dark:text-surface-300">
                  {settings.orderRules.minOrderValue > 0
                    ? `Online orders below ₹${settings.orderRules.minOrderValue.toLocaleString('en-IN')} will be blocked at checkout.`
                    : 'No minimum — customers can order any amount.'}
                </p>
                <ul className="text-caption text-surface-500 dark:text-surface-400 space-y-1 list-disc pl-4">
                  <li>Measured on the cart value of the goods — before delivery charges and before any coupon.</li>
                  <li>Applies to online orders only. Bills you raise in Billing are not affected.</li>
                  <li>The cart shows customers how much more they need to add.</li>
                </ul>
              </div>
            </div>
          </SectionCard>
        )}

        {activeTab === 'shipping' && (
          <>
            <SectionCard>
              <div className="space-y-4">
                {/* Collection points. Fireworks cannot be delivered to a door —
                    Class 1 explosives — so every online order already ends at a
                    parcel office. This decides whether the customer picks which
                    one, or the shop settles it by phone afterwards. */}
                <div className="pt-4 border-t border-surface-100 dark:border-surface-800">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <SectionTitle>Let customers choose their parcel office</SectionTitle>
                      <p className="text-caption text-surface-400 mt-0.5">
                        {settings.checkoutSettings.deliveryPointEnabled
                          ? 'At checkout, customers are shown the parcel offices near their pincode and pick where to collect from. Manage the list under Delivery Points.'
                          : 'Off — the shop arranges transport after the order, as now. Load your parcel offices under Delivery Points before switching this on.'}
                      </p>
                    </div>
                    <Toggle
                      checked={settings.checkoutSettings.deliveryPointEnabled}
                      onChange={(v) =>
                        setSettings((s) => ({
                          ...s,
                          checkoutSettings: { ...s.checkoutSettings, deliveryPointEnabled: v },
                        }))
                      }
                    />
                  </div>

                  {settings.checkoutSettings.deliveryPointEnabled && (
                    <div className="mt-4 pl-4 border-l-2 border-surface-100 dark:border-surface-800">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <SectionTitle>Require a choice before paying</SectionTitle>
                          <p className="text-caption text-surface-400 mt-0.5">
                            The nearest office is preselected, so most customers just press Continue. Switch off
                            to let them skip it and have the shop choose later.
                          </p>
                        </div>
                        <Toggle
                          checked={settings.checkoutSettings.deliveryPointRequired}
                          onChange={(v) =>
                            setSettings((s) => ({
                              ...s,
                              checkoutSettings: { ...s.checkoutSettings, deliveryPointRequired: v },
                            }))
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            {noShippingMethod && !toPayOnly && (
              <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-body-sm bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <span>
                  Both delivery options are switched off, so checkout shows no delivery method and
                  charges nothing for delivery. Turn one back on, or switch on
                  &ldquo;Customer pays delivery fee only&rdquo; below if the customer settles the
                  delivery charge on arrival.
                </span>
              </div>
            )}
            {noShippingMethod && toPayOnly && (
              <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-body-sm bg-brand-500/10 text-brand-700 dark:text-brand-400">
                <Truck size={16} className="mt-0.5 flex-shrink-0" />
                <span>
                  <span className="font-semibold">To Pay delivery is on.</span> No delivery charge is
                  added at checkout — the customer pays it when the order reaches them. Customers can
                  order normally.
                </span>
              </div>
            )}
            <SectionCard className={cn(ship.enableStandard === false && 'opacity-60')}>
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SectionTitle>Standard Shipping</SectionTitle>
                    <p className={hintClass}>Shown to customers at checkout</p>
                  </div>
                  <Toggle
                    checked={ship.enableStandard !== false}
                    onChange={(v) => updateShipping('enableStandard', v)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Rate (INR)</label>
                    <input
                      type="number"
                      value={settings.shippingRates.standardRate}
                      onChange={(e) => updateShipping('standardRate', Number(e.target.value))}
                      className={inputClass}
                      min="0"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Delivery Time</label>
                    <input
                      type="text"
                      value={settings.shippingRates.standardDays}
                      onChange={(e) => updateShipping('standardDays', e.target.value)}
                      className={inputClass}
                      placeholder="5-7"
                    />
                    <p className={hintClass}>e.g. 5-7 business days</p>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard className={cn(ship.enableExpress === false && 'opacity-60')}>
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SectionTitle>Express Shipping</SectionTitle>
                    <p className={hintClass}>Shown to customers at checkout</p>
                  </div>
                  <Toggle
                    checked={ship.enableExpress !== false}
                    onChange={(v) => updateShipping('enableExpress', v)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Rate (INR)</label>
                    <input
                      type="number"
                      value={settings.shippingRates.expressRate}
                      onChange={(e) => updateShipping('expressRate', Number(e.target.value))}
                      className={inputClass}
                      min="0"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Delivery Time</label>
                    <input
                      type="text"
                      value={settings.shippingRates.expressDays}
                      onChange={(e) => updateShipping('expressDays', e.target.value)}
                      className={inputClass}
                      placeholder="2-3"
                    />
                    <p className={hintClass}>e.g. 2-3 business days</p>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard>
              <div className="space-y-5">
                <SectionTitle>Free Shipping & Packaging</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Free Shipping Threshold (INR)</label>
                    <input
                      type="number"
                      value={settings.shippingRates.freeThreshold}
                      onChange={(e) => updateShipping('freeThreshold', Number(e.target.value))}
                      className={inputClass}
                      min="0"
                    />
                    <p className={hintClass}>Orders above this amount get free standard shipping</p>
                  </div>
                  <div>
                    <label className={labelClass}>Packaging Fee (INR)</label>
                    <input
                      type="number"
                      value={settings.shippingRates.packagingFee}
                      onChange={(e) => updateShipping('packagingFee', Number(e.target.value))}
                      className={inputClass}
                      min="0"
                    />
                    <p className={hintClass}>Optional — can be toggled per bill in Billing</p>
                  </div>
                </div>

                {/* Delivery-fee-only model */}
                <div className="pt-4 border-t border-surface-100 dark:border-surface-800">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-body-sm font-medium text-surface-700 dark:text-surface-300">
                        Customer pays delivery fee only
                      </p>
                      <p className={hintClass}>
                        Your shop delivers the goods to the customer's door. The customer only pays the
                        delivery charge — not a separate "shipping" cost. A note explaining this is shown
                        to customers at checkout. Common for Sivakasi cracker shops.
                      </p>
                    </div>
                    <Toggle
                      checked={ship.customerPaysDeliveryOnly === true}
                      onChange={(v) => updateShipping('customerPaysDeliveryOnly', v)}
                    />
                  </div>
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {/* Payment Tab */}
        {activeTab === 'payment' && (
          <>
            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionTitle>Razorpay</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">Accept online payments via UPI, cards, and net banking</p>
                  </div>
                  <Toggle
                    checked={settings.paymentSettings.razorpayEnabled}
                    onChange={(v) => updatePayment('razorpayEnabled', v)}
                  />
                </div>
              </div>
            </SectionCard>


            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionTitle>Cash on Delivery</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">Allow customers to pay when order is delivered</p>
                  </div>
                  <Toggle
                    checked={settings.paymentSettings.codEnabled}
                    onChange={(v) => updatePayment('codEnabled', v)}
                  />
                </div>
                {settings.paymentSettings.codEnabled && (
                  <div className="pt-4 border-t border-surface-100 dark:border-surface-800">
                    <div className="max-w-sm">
                      <label className={labelClass}>COD Limit (INR)</label>
                      <input
                        type="number"
                        value={settings.paymentSettings.codLimit}
                        onChange={(e) => updatePayment('codLimit', Number(e.target.value))}
                        className={inputClass}
                        min="0"
                      />
                      <p className={hintClass}>Maximum order value allowed for COD</p>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-2.5">
                    <QrCode size={18} className="mt-0.5 text-surface-400 flex-shrink-0" />
                    <div>
                      <SectionTitle>Direct UPI</SectionTitle>
                      <p className="text-caption text-surface-400 mt-0.5">
                        Show a QR for the exact order amount. The customer pays from their UPI app and
                        uploads proof, which you verify by hand.
                      </p>
                    </div>
                  </div>
                  <Toggle checked={pay.upiEnabled} onChange={(v) => updatePayment('upiEnabled', v)} />
                </div>

                {pay.upiEnabled && (
                  <div className="pt-4 border-t border-surface-100 dark:border-surface-800 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>UPI ID</label>
                        <input
                          type="text"
                          value={pay.upiId}
                          onChange={(e) => updatePayment('upiId', e.target.value.trim())}
                          className={inputClass}
                          placeholder="yourstore@okicici"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <p className={hintClass}>The QR is built from this. Double-check it — a typo sends money elsewhere.</p>
                      </div>
                      <div>
                        <label className={labelClass}>Payee Name</label>
                        <input
                          type="text"
                          value={pay.upiPayeeName}
                          onChange={(e) => updatePayment('upiPayeeName', e.target.value)}
                          className={inputClass}
                          placeholder="Your company name"
                        />
                        <p className={hintClass}>Shown in the customer's UPI app before they confirm.</p>
                      </div>
                    </div>
                    {upiIncomplete && (
                      <p className="flex items-start gap-2 text-caption text-amber-600 dark:text-amber-400">
                        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                        UPI is on but the UPI ID is blank, so checkout will keep hiding it.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-2.5">
                    <Landmark size={18} className="mt-0.5 text-surface-400 flex-shrink-0" />
                    <div>
                      <SectionTitle>Bank Transfer</SectionTitle>
                      <p className="text-caption text-surface-400 mt-0.5">
                        NEFT / IMPS account details, shown as copyable text. Bank transfers have no QR
                        standard, so only UPI gets a scannable code.
                      </p>
                    </div>
                  </div>
                  <Toggle checked={pay.bankEnabled} onChange={(v) => updatePayment('bankEnabled', v)} />
                </div>

                {pay.bankEnabled && (
                  <div className="pt-4 border-t border-surface-100 dark:border-surface-800 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Account Holder Name</label>
                        <input
                          type="text"
                          value={pay.bankAccountName}
                          onChange={(e) => updatePayment('bankAccountName', e.target.value)}
                          className={inputClass}
                          placeholder="Your company name"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Account Number</label>
                        <input
                          type="text"
                          value={pay.bankAccountNumber}
                          onChange={(e) => updatePayment('bankAccountNumber', e.target.value.replace(/\s/g, ''))}
                          className={inputClass}
                          placeholder="123456789012"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>IFSC Code</label>
                        <input
                          type="text"
                          value={pay.bankIfsc}
                          onChange={(e) => updatePayment('bankIfsc', e.target.value.toUpperCase().replace(/\s/g, ''))}
                          className={inputClass}
                          placeholder="ICIC0001234"
                          maxLength={11}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Bank Name</label>
                        <input
                          type="text"
                          value={pay.bankName}
                          onChange={(e) => updatePayment('bankName', e.target.value)}
                          className={inputClass}
                          placeholder="ICICI Bank"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelClass}>Branch</label>
                        <input
                          type="text"
                          value={pay.bankBranch}
                          onChange={(e) => updatePayment('bankBranch', e.target.value)}
                          className={inputClass}
                          placeholder="Sivakasi"
                        />
                      </div>
                    </div>
                    {bankIncomplete && (
                      <p className="flex items-start gap-2 text-caption text-amber-600 dark:text-amber-400">
                        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                        Bank transfer is on but the account number or IFSC is blank, so checkout will keep hiding it.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>

            {(pay.upiEnabled || pay.bankEnabled) && (
              <SectionCard>
                <div className="space-y-5">
                  <SectionTitle>Manual Payment Options</SectionTitle>
                  <div>
                    <label className={labelClass}>Instructions for the customer</label>
                    <textarea
                      value={pay.manualInstructions}
                      onChange={(e) => updatePayment('manualInstructions', e.target.value)}
                      className={cn(inputClass, 'min-h-[84px] resize-y')}
                      placeholder="Pay the exact amount shown, then upload the payment screenshot and enter the UTR / reference number."
                    />
                    <p className={hintClass}>Shown above the QR on the payment screen. Leave blank to use the default wording.</p>
                  </div>
                  <div className="max-w-sm">
                    <label className={labelClass}>Payment Window (minutes)</label>
                    <input
                      type="number"
                      value={pay.manualWindowMins}
                      onChange={(e) => updatePayment('manualWindowMins', Math.max(5, Number(e.target.value) || 0))}
                      className={inputClass}
                      min="5"
                      max="1440"
                    />
                    <p className={hintClass}>
                      How long the order stays open for payment before it is auto-cancelled. Orders where
                      proof was already uploaded are never auto-cancelled — they wait for your review.
                    </p>
                  </div>
                </div>
              </SectionCard>
            )}

            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionTitle>GST / Tax</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">Charge &amp; show GST on bills and online orders</p>
                  </div>
                  <Toggle
                    checked={settings.gstEnabled ?? true}
                    onChange={(v) => setSettings((s) => ({ ...s, gstEnabled: v }))}
                  />
                </div>
                {(settings.gstEnabled ?? true) && (
                  <div className="max-w-sm pt-4 border-t border-surface-100 dark:border-surface-800">
                    <label className={labelClass}>GST Rate (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="28"
                      step="0.5"
                      value={settings.gstRate ?? 18}
                      onChange={(e) => setSettings((s) => ({ ...s, gstRate: Math.max(0, Number(e.target.value)) }))}
                      className={inputClass}
                    />
                    <p className={hintClass}>
                      Total GST split evenly into CGST + SGST. Used as the default on new POS bills
                      (editable per bill) and to show the GST breakup on online orders. Fireworks (HSN 3604) = 18%.
                    </p>

                    <div className="mt-4">
                      <label className={labelClass}>GSTIN</label>
                      <input
                        type="text"
                        value={settings.gstin ?? ''}
                        onChange={(e) => setSettings((s) => ({ ...s, gstin: e.target.value.toUpperCase() }))}
                        placeholder="33ABCDE1234F1Z5"
                        maxLength={15}
                        className={inputClass}
                      />
                      <p className={hintClass}>Your 15-character GST number — printed on invoices. Leave blank to hide it.</p>
                    </div>
                  </div>
                )}
                {!(settings.gstEnabled ?? true) && (
                  <p className={hintClass}>GST is off — bills and online orders will show 0% GST.</p>
                )}
              </div>
            </SectionCard>
          </>
        )}

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <>
            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionTitle>Show Stock to Customers</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">
                      Display the on-hand count and the In Stock / Out of Stock badge on the storefront.
                    </p>
                  </div>
                  <Toggle
                    checked={inv.showStockToCustomers}
                    onChange={(v) => updateInventory('showStockToCustomers', v)}
                  />
                </div>
                <p className={cn(hintClass, 'pt-3 border-t border-surface-100 dark:border-surface-800')}>
                  {inv.showStockToCustomers
                    ? 'Customers can see how many units are left.'
                    : 'Stock is hidden — the count is stripped from the storefront API, not just the page, so it is not visible in the browser either. You still see real numbers everywhere in the admin panel.'}
                </p>
              </div>
            </SectionCard>

            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionTitle>Treat Stock as a Hard Limit</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">
                      Block add-to-cart and checkout once a product runs out.
                    </p>
                  </div>
                  <Toggle checked={inv.enforceStock} onChange={(v) => updateInventory('enforceStock', v)} />
                </div>
                <p className={cn(hintClass, 'pt-3 border-t border-surface-100 dark:border-surface-800')}>
                  {inv.enforceStock
                    ? 'Orders are rejected when stock runs out, and a product is taken off sale automatically at zero.'
                    : 'Orders always go through. Stock still decrements and may go negative — a negative count is your signal for how many units to source from another shop.'}
                </p>

                <div className="flex items-center justify-between gap-4 pt-3 border-t border-surface-100 dark:border-surface-800">
                  <div>
                    <SectionTitle>Block Counter Sales at Zero Stock</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">
                      Stop a bill being saved in Billing when the shelf cannot cover it.
                    </p>
                  </div>
                  <Toggle
                    checked={inv.enforceStockAtCounter}
                    onChange={(v) => updateInventory('enforceStockAtCounter', v)}
                  />
                </div>
                <p className={hintClass}>
                  {inv.enforceStockAtCounter
                    ? 'Billing refuses a sale it cannot cover and names the product that is short. Nothing is saved, so no bill number is used up.'
                    : 'Billing shows a warning but still saves. Separate from the storefront rule above, because a customer standing at your counter is not the same as a website order.'}
                </p>
                {!inv.enforceStock && (
                  <p className="flex items-start gap-2 text-caption text-surface-500 dark:text-surface-400">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
                    To take a product off sale entirely, set it to Inactive in Products — that hides it from
                    the storefront regardless of stock.
                  </p>
                )}
              </div>
            </SectionCard>
          </>
        )}

        {/* Billing Tab */}
        {activeTab === 'billing' && (
          <>
            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <SectionTitle>Fill Cash Received Automatically</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">
                      In Billing, the cash “Received” box fills in with the bill total by itself.
                    </p>
                  </div>
                  <Toggle
                    checked={counter.autoFillCashReceived}
                    onChange={(v) => updateCounter('autoFillCashReceived', v)}
                  />
                </div>
                <p className={cn(hintClass, 'pt-3 border-t border-surface-100 dark:border-surface-800')}>
                  {counter.autoFillCashReceived
                    ? 'The amount follows the total as items are added. The cashier types only when the customer hands over more, to see the change to return.'
                    : 'The cashier types the amount received, or presses “Exact”, before the bill can be saved.'}
                </p>
              </div>
            </SectionCard>

            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <SectionTitle>Phone Number Required for Customers</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">
                      A customer cannot be saved without a phone number.
                    </p>
                  </div>
                  <Toggle
                    checked={counter.requireCustomerPhone}
                    onChange={(v) => updateCounter('requireCustomerPhone', v)}
                  />
                </div>
                <p className={cn(hintClass, 'pt-3 border-t border-surface-100 dark:border-surface-800')}>
                  {counter.requireCustomerPhone
                    ? 'Every customer must have a 10-digit phone number.'
                    : 'Phone number is optional. A customer without one cannot be sent the bill on WhatsApp.'}
                </p>

                <div className="flex items-center justify-between gap-4 pt-3 border-t border-surface-100 dark:border-surface-800">
                  <div>
                    <SectionTitle>Allow the Same Phone for More Than One Customer</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">
                      For families or agents who use one mobile number for several customers.
                    </p>
                  </div>
                  <Toggle
                    checked={counter.allowSharedCustomerPhone}
                    onChange={(v) => updateCounter('allowSharedCustomerPhone', v)}
                  />
                </div>
                <p className={hintClass}>
                  {counter.allowSharedCustomerPhone
                    ? 'A number already in use shows a warning, with a button to pick that customer instead, but it can still be saved. Each customer keeps their own bills and credit.'
                    : 'A phone number already saved under another customer is refused, so one customer is never added twice.'}
                </p>
              </div>
            </SectionCard>
          </>
        )}

        {/* Notifications Tab */}
        {/* Email Tab */}
        {activeTab === 'email' && (
          <>
            <SectionCard>
              <div className="space-y-5">
                <div>
                  <SectionTitle>Outgoing Mailbox (SMTP)</SectionTitle>
                  <p className={hintClass}>
                    Used for order confirmations, password resets and payment alerts. For Gmail, use an
                    App Password — your normal account password will be rejected.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>SMTP Host</label>
                    <input type="text" value={em.smtpHost} onChange={(e) => updateEmail('smtpHost', e.target.value)} className={inputClass} placeholder="smtp.gmail.com" />
                  </div>
                  <div>
                    <label className={labelClass}>Port</label>
                    <input type="number" value={em.smtpPort} onChange={(e) => updateEmail('smtpPort', Number(e.target.value))} className={inputClass} placeholder="587" />
                    <p className={hintClass}>587 (TLS) or 465 (SSL)</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>SMTP Username</label>
                    <input type="text" autoComplete="off" value={em.smtpUser} onChange={(e) => updateEmail('smtpUser', e.target.value)} className={inputClass} placeholder="you@gmail.com" />
                  </div>
                  <div>
                    <label className={labelClass}>SMTP Password / App Password</label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={em.smtpPass}
                      onChange={(e) => updateEmail('smtpPass', e.target.value)}
                      className={inputClass}
                      placeholder={em.smtpPassSet ? '•••••••• (saved — leave blank to keep)' : 'abcd efgh ijkl mnop'}
                    />
                    <p className={hintClass}>
                      {em.smtpPassSet
                        ? 'A password is stored. It is never sent back to this page — type a new one only to replace it.'
                        : 'Google Account → Security → 2-Step Verification → App passwords.'}
                    </p>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard>
              <div className="space-y-5">
                <div>
                  <SectionTitle>Sender &amp; Alerts</SectionTitle>
                  <p className={hintClass}>How your emails appear, and who gets notified about payments.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>From Address</label>
                    <input type="email" value={em.fromEmail} onChange={(e) => updateEmail('fromEmail', e.target.value)} className={inputClass} placeholder={em.smtpUser || 'noreply@yourstore.com'} />
                    <p className={hintClass}>Blank uses the SMTP username. Gmail ignores addresses it does not own.</p>
                  </div>
                  <div>
                    <label className={labelClass}>Sender Name</label>
                    <input type="text" value={em.fromName} onChange={(e) => updateEmail('fromName', e.target.value)} className={inputClass} placeholder={siteName || 'Your company name'} />
                    <p className={hintClass}>Blank follows your company name from Content → Company Info.</p>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Admin Alert Recipients</label>
                  <input type="text" value={em.adminEmail} onChange={(e) => updateEmail('adminEmail', e.target.value)} className={inputClass} placeholder="owner@yourstore.com, manager@yourstore.com" />
                  <p className={hintClass}>Where “payment awaiting verification” alerts go. Comma-separate for several. Blank emails every active admin account.</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard>
              <div className="space-y-4">
                <div>
                  <SectionTitle>Send a Test Email</SectionTitle>
                  <p className={hintClass}>
                    Save first — the test uses the stored settings. A wrong password otherwise fails silently in production.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} className={inputClass} placeholder="Leave blank to send to your own account" />
                  <button
                    type="button"
                    onClick={handleTestEmail}
                    disabled={isTesting}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-body-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity flex-shrink-0"
                  >
                    {isTesting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    {isTesting ? 'Sending…' : 'Send Test'}
                  </button>
                </div>
                {testResult && (
                  <div
                    className={cn(
                      'flex items-start gap-2 rounded-xl px-4 py-3 text-body-sm',
                      testResult.ok
                        ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                        : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400',
                    )}
                  >
                    {testResult.ok ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />}
                    <span className="break-words">{testResult.message}</span>
                  </div>
                )}
              </div>
            </SectionCard>
          </>
        )}

        {activeTab === 'notifications' && (
          <>
            {/* ─── New order alerts: the only section here that is actually wired
                to the backend. Everything below it is legacy UI. ─── */}
            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionTitle>New Order Alerts</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">
                      Email the shop the moment a customer places an order, so nobody has to watch this panel
                    </p>
                  </div>
                  <Toggle
                    checked={alerts.newOrderEmail}
                    onChange={(v) => updateAlerts('newOrderEmail', v)}
                  />
                </div>

                {alerts.newOrderEmail && (
                  <div className="pt-4 border-t border-surface-100 dark:border-surface-800 space-y-4">
                    <div>
                      <label className={labelClass}>Send new order alerts to</label>
                      <input
                        type="text"
                        value={alerts.newOrderEmailRecipients}
                        onChange={(e) => updateAlerts('newOrderEmailRecipients', e.target.value)}
                        className={inputClass}
                        placeholder="owner@example.com, packing@example.com"
                      />
                      <p className={hintClass}>
                        Separate several addresses with commas. Leave blank to use the admin address from the
                        Email tab{em.adminEmail ? ` (${em.adminEmail})` : ''}, or every admin account if that is
                        blank too.
                      </p>
                    </div>

                    <div className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-body-sm font-medium text-surface-700 dark:text-surface-200">
                          Attach the invoice PDF
                        </p>
                        <p className="text-caption text-surface-400">
                          Sends the packing slip with the alert, so the order can be picked without opening the panel
                        </p>
                      </div>
                      <Toggle
                        checked={alerts.newOrderAttachInvoice}
                        onChange={(v) => updateAlerts('newOrderAttachInvoice', v)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard>
              <div className="flex items-center justify-between">
                <div>
                  <SectionTitle>Customer Order Confirmation</SectionTitle>
                  <p className="text-caption text-surface-400 mt-0.5">
                    The confirmation email the customer receives. Independent of the shop's own alerts above.
                  </p>
                </div>
                <Toggle
                  checked={alerts.customerOrderConfirmation}
                  onChange={(v) => updateAlerts('customerOrderConfirmation', v)}
                />
              </div>
            </SectionCard>

            {/* Enquiries are unpaid leads, so they get their own switch and their
                own recipients: a shop that wants order alerts kept quiet may
                still want every quote request the moment it lands. */}
            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionTitle>Enquiry Alerts</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">
                      Email the shop when someone uses the contact form or asks for a bulk quote
                    </p>
                  </div>
                  <Toggle
                    checked={alerts.enquiryEmail}
                    onChange={(v) => updateAlerts('enquiryEmail', v)}
                  />
                </div>

                {alerts.enquiryEmail && (
                  <div className="pt-4 border-t border-surface-100 dark:border-surface-800">
                    <label className={labelClass}>Send enquiry alerts to</label>
                    <input
                      type="text"
                      value={alerts.enquiryEmailRecipients}
                      onChange={(e) => updateAlerts('enquiryEmailRecipients', e.target.value)}
                      className={inputClass}
                      placeholder="sales@example.com, owner@example.com"
                    />
                    <p className={hintClass}>
                      Separate several addresses with commas. Leave blank to use the admin address from the
                      Email tab{em.adminEmail ? ` (${em.adminEmail})` : ''}, or every admin account if that is
                      blank too. Every enquiry is also kept in Admin &rarr; Contact Messages and Bulk Orders,
                      whether or not this is switched on.
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ─── WhatsApp ─── */}
            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionTitle>WhatsApp Alerts</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">
                      Send the same new-order alert, with the invoice, to a WhatsApp number
                    </p>
                  </div>
                  <Toggle checked={wa.enabled} onChange={(v) => updateWhatsApp('enabled', v)} />
                </div>

                {!wa.enabled && (
                  <div className="flex gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                    <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-caption text-amber-800 dark:text-amber-300">
                      Needs a Meta WhatsApp Business account and an approved <strong>new_order</strong> message
                      template before it can be switched on. Order alerts keep arriving by email until then.
                    </p>
                  </div>
                )}

                {wa.enabled && (
                  <div className="pt-4 border-t border-surface-100 dark:border-surface-800 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Phone Number ID</label>
                        <input
                          type="text"
                          value={wa.phoneNumberId}
                          onChange={(e) => updateWhatsApp('phoneNumberId', e.target.value.trim())}
                          className={inputClass}
                          placeholder="123456789012345"
                        />
                        <p className={hintClass}>From Meta → WhatsApp → API Setup. An ID, not a phone number.</p>
                      </div>

                      <div>
                        <label className={labelClass}>Access Token</label>
                        <input
                          type="password"
                          value={wa.accessToken}
                          onChange={(e) => updateWhatsApp('accessToken', e.target.value)}
                          className={inputClass}
                          placeholder={wa.accessTokenSet ? '•••••••• (saved)' : 'Permanent System User token'}
                          autoComplete="new-password"
                        />
                        <p className={hintClass}>
                          {wa.accessTokenSet
                            ? 'A token is saved. Leave blank to keep it, or paste a new one to replace it.'
                            : 'Stored securely and never shown again after saving.'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>Send alerts to</label>
                      <input
                        type="text"
                        value={wa.recipients}
                        onChange={(e) => updateWhatsApp('recipients', e.target.value)}
                        className={inputClass}
                        placeholder="919876543210, 919876543211"
                      />
                      <p className={hintClass}>
                        Country code first, no “+” or spaces. Commas for several numbers. This is the phone that
                        receives the alert — it does not have to be the number messages are sent from.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Template Name</label>
                        <input
                          type="text"
                          value={wa.templateName}
                          onChange={(e) => updateWhatsApp('templateName', e.target.value.trim())}
                          className={inputClass}
                          placeholder="new_order"
                        />
                        <p className={hintClass}>Must match the template approved in WhatsApp Manager exactly.</p>
                      </div>
                      <div>
                        <label className={labelClass}>Template Language</label>
                        <input
                          type="text"
                          value={wa.templateLanguage}
                          onChange={(e) => updateWhatsApp('templateLanguage', e.target.value.trim())}
                          className={inputClass}
                          placeholder="en"
                        />
                        <p className={hintClass}>The language code the template was approved under, e.g. en.</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2.5 border-t border-surface-100 dark:border-surface-800">
                      <div>
                        <p className="text-body-sm font-medium text-surface-700 dark:text-surface-200">
                          Attach the invoice PDF
                        </p>
                        <p className="text-caption text-surface-400">
                          Requires the template to have a Document header. Turn off to send text only.
                        </p>
                      </div>
                      <Toggle
                        checked={wa.attachInvoice}
                        onChange={(v) => updateWhatsApp('attachInvoice', v)}
                      />
                    </div>

                    <div className="pt-4 border-t border-surface-100 dark:border-surface-800">
                      <label className={labelClass}>Low-stock WhatsApp template name</label>
                      <input
                        type="text"
                        value={wa.lowStockTemplateName ?? ''}
                        onChange={(e) => updateWhatsApp('lowStockTemplateName', e.target.value.trim())}
                        className={inputClass}
                        placeholder="low_stock_alert"
                      />
                      <p className={hintClass}>
                        The approved template for low-stock alerts — {'{{1}}'} the product, {'{{2}}'} the stock
                        left, {'{{3}}'} your threshold. Sent to the numbers above when Low Stock Alerts is on
                        (Notifications tab). Leave blank to get low-stock alerts by email only.
                      </p>
                    </div>

                    {/* ── Messages to the customer ──
                        Everything above tells the shop. This tells the person
                        who ordered, on the number they ordered with. Separate
                        switch because it needs its own Meta templates, and a
                        shop usually gets its own alerts working first. */}
                    <div className="pt-4 border-t border-surface-100 dark:border-surface-800">
                      <div className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="text-body-sm font-medium text-surface-700 dark:text-surface-200">
                            Message customers about their order
                          </p>
                          <p className="text-caption text-surface-400">
                            Sends to the number on the order. Name an approved template below for each
                            update you want sent — leave one blank and it is not sent.
                          </p>
                        </div>
                        <Toggle
                          checked={Boolean(wa.customerUpdates)}
                          onChange={(v) => updateWhatsApp('customerUpdates', v)}
                        />
                      </div>

                      {wa.customerUpdates && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                          {/* One per moment the shop already emails about, so
                              WhatsApp can say everything email says. Fill in
                              only the ones you want sent. */}
                          {(
                            [
                              ['placed', 'Order placed', 'order_placed'],
                              ['paymentReceived', 'Payment proof received', 'payment_received'],
                              ['paymentApproved', 'Payment approved', 'payment_approved'],
                              ['paymentRejected', 'Payment rejected — needs {{3}} reason', 'payment_rejected'],
                              ['confirmed', 'Order confirmed', 'order_confirmed'],
                              ['processing', 'Order being packed', 'order_processing'],
                              ['shipped', 'Order shipped — {{3}} is the tracking id', 'order_shipped'],
                              ['delivered', 'Order delivered', 'order_delivered'],
                              ['cancelled', 'Order cancelled', 'order_cancelled'],
                            ] as const
                          ).map(([key, label, example]) => (
                            <div key={key}>
                              <label className="block text-caption font-medium text-surface-500 mb-1">
                                {label}
                              </label>
                              <input
                                type="text"
                                value={wa.customerTemplates?.[key] ?? ''}
                                onChange={(e) =>
                                  updateWhatsApp('customerTemplates', {
                                    ...(wa.customerTemplates ?? {}),
                                    [key]: e.target.value.trim(),
                                  })
                                }
                                placeholder={example}
                                className="input-field"
                              />
                            </div>
                          ))}
                          <p className="sm:col-span-2 text-caption text-surface-400">
                            Each template takes {'{{1}}'} the customer's name and {'{{2}}'} the order
                            number. Shipped and Payment rejected take a third, {'{{3}}'} — the tracking
                            id and the reason. Create them in Meta Business Manager as UTILITY
                            templates with no header. Leave a box blank and that message is not sent.
                          </p>
                        </div>
                      )}
                    </div>

                    {whatsappIncomplete && (
                      <div className="flex gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                        <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-caption text-amber-800 dark:text-amber-300">
                          WhatsApp is switched on but still missing details, so nothing will be sent. Email alerts
                          are unaffected.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard>
              <div className="space-y-4">
                <SectionTitle>Email Notifications</SectionTitle>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2.5 border-b border-surface-100 dark:border-surface-800 last:border-0">
                    <div>
                      <p className="text-body-sm font-medium text-surface-700 dark:text-surface-200">Order Updates</p>
                      <p className="text-caption text-surface-400">Email customers when order status changes</p>
                    </div>
                    <Toggle
                      checked={notifSettings.emailOrderUpdates}
                      onChange={(v) => setNotifSettings((s) => ({ ...s, emailOrderUpdates: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-body-sm font-medium text-surface-700 dark:text-surface-200">Promotional Emails</p>
                      <p className="text-caption text-surface-400">Marketing and offer emails to customers</p>
                    </div>
                    <Toggle
                      checked={notifSettings.emailPromotions}
                      onChange={(v) => setNotifSettings((s) => ({ ...s, emailPromotions: v }))}
                    />
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* No SMS card: the shop has no SMS channel, so switches for it
                could only ever pretend. WhatsApp above covers the same ground. */}

            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionTitle>Low Stock Alerts</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">Get notified when products are running low</p>
                  </div>
                  <Toggle
                    checked={notifSettings.lowStockAlert}
                    onChange={(v) => setNotifSettings((s) => ({ ...s, lowStockAlert: v }))}
                  />
                </div>
                {notifSettings.lowStockAlert && (
                  <div className="pt-4 border-t border-surface-100 dark:border-surface-800">
                    <div className="max-w-sm">
                      <label className={labelClass}>Stock Threshold</label>
                      <input
                        type="number"
                        value={notifSettings.lowStockThreshold}
                        onChange={(e) => setNotifSettings((s) => ({ ...s, lowStockThreshold: Math.max(1, Number(e.target.value) || 0) }))}
                        className={inputClass}
                        min="1"
                      />
                      <p className={hintClass}>Alert when stock falls below this number</p>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          </>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <>
            <SectionCard>
              <div className="space-y-5">
                <SectionTitle>Session Management</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Session Timeout (minutes)</label>
                    <input
                      type="number"
                      value={secSettings.sessionTimeout}
                      onChange={(e) => setSecSettings((s) => ({ ...s, sessionTimeout: Math.max(0, Number(e.target.value) || 0) }))}
                      className={inputClass}
                      min="0"
                      max="1440"
                    />
                    <p className={hintClass}>Sign the admin panel out after this many idle minutes. 0 = never.</p>
                  </div>
                  <div>
                    <label className={labelClass}>Max Login Attempts</label>
                    <input
                      type="number"
                      value={secSettings.maxLoginAttempts}
                      onChange={(e) => setSecSettings((s) => ({ ...s, maxLoginAttempts: Math.max(0, Number(e.target.value) || 0) }))}
                      className={inputClass}
                      min="0"
                      max="20"
                    />
                    <p className={hintClass}>Lock an account after this many wrong passwords in a row. 0 = never lock.</p>
                  </div>
                  <div>
                    <label className={labelClass}>Lock for (minutes)</label>
                    <input
                      type="number"
                      value={secSettings.lockoutMinutes}
                      onChange={(e) => setSecSettings((s) => ({ ...s, lockoutMinutes: Math.max(1, Number(e.target.value) || 0) }))}
                      className={inputClass}
                      min="1"
                      max="1440"
                      disabled={secSettings.maxLoginAttempts === 0}
                    />
                    <p className={hintClass}>How long a locked account waits before it can try again.</p>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <SectionTitle>Employees Can Sign In with Google</SectionTitle>
                    <p className="text-caption text-surface-400 mt-0.5">
                      Let employees use “Continue with Google” on the login page.
                    </p>
                  </div>
                  <Toggle
                    checked={secSettings.staffGoogleSignIn}
                    onChange={(v) => setSecSettings((s) => ({ ...s, staffGoogleSignIn: v }))}
                  />
                </div>
                <p className={cn(hintClass, 'pt-3 border-t border-surface-100 dark:border-surface-800')}>
                  {secSettings.staffGoogleSignIn
                    ? 'Works only when the Google account’s email is exactly the email saved on the employee. Their password keeps working too. Check each employee’s email is typed correctly — whoever owns that address can sign in.'
                    : 'Employees sign in with their email and the password you set for them. Your own admin account is not affected by this switch.'}
                </p>
              </div>
            </SectionCard>

            <SectionCard>
              <div className="space-y-4">
                <SectionTitle>Security Status</SectionTitle>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-500/10">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                      <Shield size={16} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-body-sm font-medium text-surface-700 dark:text-surface-200">JWT Authentication</p>
                      <p className="text-caption text-surface-400">Email/password and Google sign-in enabled</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <Shield size={16} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-body-sm font-medium text-surface-700 dark:text-surface-200">API Security</p>
                      <p className="text-caption text-surface-400">Role-based access control enforced</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50">
                    <div className="w-8 h-8 rounded-lg bg-surface-200 dark:bg-surface-700 flex items-center justify-center flex-shrink-0">
                      <Shield size={16} className="text-surface-400" />
                    </div>
                    <div>
                      <p className="text-body-sm font-medium text-surface-700 dark:text-surface-200">Two-Factor Authentication</p>
                      <p className="text-caption text-surface-400">Not yet configured</p>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </>
        )}

      </div>
    </div>
  );
}
