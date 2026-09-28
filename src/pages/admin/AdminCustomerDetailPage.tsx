import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  Smartphone,
  Mail,
  MapPin,
  User,
  Receipt,
  Tag,
  Wallet,
  ShoppingBag,
  Pencil,
  Plus,
  IndianRupee,
  TrendingUp,
  Clock,
  Repeat,
  AlertTriangle,
  CheckCircle2,
  X,
  Banknote,
  CreditCard,
  Save,
  RotateCcw,
  FileText,
  Building2,
  Globe,
  Store,
} from 'lucide-react';
import { Avatar } from '@/components/atoms/Avatar.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { StatusBadge } from '@/components/admin/StatusBadge.tsx';
import { cn } from '@/lib/utils.ts';
import { isValidGstin, normalizeGstin, gstinStateName, GSTIN_REQUIRED_TYPES } from '@/lib/gstin.ts';
import type { Customer, CustomerStats, CreditLedger, Bill, CustomerInput } from '@/types/admin.ts';
import type { Order } from '@/types/index.ts';

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const norm = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);

type Tab = 'bills' | 'products' | 'credit' | 'orders';

interface Segment {
  label: string;
  cls: string;
}

function segmentOf(stats: CustomerStats | null): Segment {
  if (!stats || stats.billCount === 0) return { label: 'New', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' };
  const days = stats.lastPurchase ? Math.floor((Date.now() - new Date(stats.lastPurchase).getTime()) / 86400000) : 9999;
  if (days <= 30 && stats.billCount >= 5) return { label: 'Champion', cls: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400' };
  if (days <= 60) return { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' };
  if (days <= 180) return { label: 'At risk', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' };
  return { label: 'Dormant', cls: 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400' };
}

function daysAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

const payColors: Record<string, string> = { cash: 'bg-green-500', upi: 'bg-blue-500', card: 'bg-purple-500', credit: 'bg-amber-500' };

export function AdminCustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [ledger, setLedger] = useState<CreditLedger | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isOnline, setIsOnline] = useState(false); // online-only customer (registered account, no counter bills)

  const [tab, setTab] = useState<Tab>('bills');
  const [showEdit, setShowEdit] = useState(false);
  /** 'create' turns the edit drawer into "give this online account a counter record". */
  const [editMode, setEditMode] = useState<'edit' | 'create'>('edit');
  const [showPay, setShowPay] = useState(false);

  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState('');

  const load = useCallback(async () => {
    const svc = await import('@/services/admin.ts');
    const c = await svc.getBillingCustomerById(id);

    if (c) {
      // ── POS / billing customer ──
      setIsOnline(false);
      // Online orders are only filled in below when an account matches this
      // phone; without the reset, the previous customer's orders stayed on screen.
      setOrders([]);
      setCustomer(c);
      setNotes(c.notes || '');
      setNotesDirty(false);
      const [statsRes, billsRes, ledgerRes] = await Promise.all([
        svc.getCustomerStats(id).catch(() => null),
        svc.getBillsByCustomer({ customerId: c.id }).catch(() => [] as Bill[]),
        svc.getCreditLedger(id).catch(() => null),
      ]);
      setStats(statsRes);
      setBills(billsRes);
      setLedger(ledgerRes);
      // Online orders: if this customer also has a registered account with the same phone.
      try {
        const phoneKey = norm(c.phone);
        if (phoneKey) {
          const usersRes = await svc.getAllCustomers({ search: phoneKey, limit: 20 });
          const match = (usersRes.data as Array<{ uid: string; phone?: string }>).find((u) => norm(u.phone) === phoneKey);
          if (match) {
            const o = await svc.getCustomerOrders(match.uid).catch(() => [] as Order[]);
            setOrders(o);
          }
        }
      } catch { /* ignore */ }
      setLoading(false);
      return;
    }

    // ── Online-only customer (registered account, no counter bills) ──
    const u = await svc.getCustomerById(id);
    if (!u) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setIsOnline(true);
    const o = await svc.getCustomerOrders(u.uid).catch(() => [] as Order[]);
    // Cancelled orders, and money handed back (or owed back) after a cancel, are
    // not spend — counting a refunded order would inflate the lifetime value.
    const live = o.filter(
      (ord) => ord.status !== 'cancelled' && ord.paymentStatus !== 'refund_due' && ord.paymentStatus !== 'refunded',
    );
    const totalSpent = live.reduce((s, ord) => s + (ord.total || 0), 0);
    const totalQty = live.reduce((s, ord) => s + (ord.items?.reduce((a, it) => a + (it.quantity || 0), 0) || 0), 0);
    // COD / unpaid orders still owed on delivery.
    const pending = live.filter((ord) => ord.paymentStatus !== 'paid').reduce((s, ord) => s + (ord.total || 0), 0);
    const dates = live.map((ord) => ord.createdAt).filter(Boolean).sort();

    // Products bought, derived from their online orders.
    const pm = new Map<string, { productId: string; name: string; quantity: number; spend: number; lastBought: string }>();
    for (const ord of live) {
      for (const it of ord.items || []) {
        const key = it.productId || it.name;
        const e = pm.get(key) || { productId: it.productId || '', name: it.name, quantity: 0, spend: 0, lastBought: ord.createdAt };
        e.quantity += it.quantity || 0;
        e.spend += (it.price || 0) * (it.quantity || 0);
        if (ord.createdAt > e.lastBought) e.lastBought = ord.createdAt;
        pm.set(key, e);
      }
    }

    // Online accounts carry no profile address — surface the phone/address they
    // last checked out with (server enriches this, with the latest order as backup).
    const ship = (u.latestShippingAddress || o[0]?.shippingAddress || null) as
      | { phone?: string; addressLine1?: string; addressLine2?: string; city?: string; state?: string; pincode?: string }
      | null;
    setCustomer({
      id: u.uid,
      name: u.displayName || u.email || 'Customer',
      phone: u.phone || ship?.phone || '',
      email: u.email,
      address: [ship?.addressLine1, ship?.addressLine2].filter(Boolean).join(', '),
      city: u.city || ship?.city,
      state: ship?.state,
      pincode: ship?.pincode,
      customerType: 'retail',
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      // Tagged so the profile can say where this record came from, rather than
      // the page inferring it from which endpoint happened to answer.
      source: 'user',
      userUid: u.uid,
      notes: '',
    } as Customer);
    setStats({
      lifetimeValue: totalSpent,
      billCount: live.length,
      totalQuantity: totalQty,
      aov: live.length ? Math.round(totalSpent / live.length) : 0,
      firstPurchase: dates[0] || null,
      lastPurchase: dates[dates.length - 1] || null,
      paymentMix: {},
      creditBilled: 0,
      creditPaid: 0,
      creditOutstanding: pending,
      topProducts: [...pm.values()].sort((a, b) => b.spend - a.spend),
    } as CustomerStats);
    setBills([]);
    setLedger(null);
    setOrders(o);
    setTab('orders');
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    void load();
  }, [load]);

  const saveNotes = async () => {
    setNotesSaving(true);
    setNotesError('');
    try {
      const { updateCustomer } = await import('@/services/admin.ts');
      const updated = await updateCustomer(id, { notes });
      setCustomer(updated);
      setNotesDirty(false);
    } catch (err) {
      // Stays dirty so the note is not lost — and says why it is still unsaved.
      setNotesError(err instanceof Error && err.message ? err.message : 'The note could not be saved.');
    } finally {
      setNotesSaving(false);
    }
  };

  const segment = useMemo(() => segmentOf(stats), [stats]);
  const outstanding = ledger?.outstanding ?? stats?.creditOutstanding ?? 0;
  const products = stats?.topProducts ?? [];

  // Reorder: start a new bill pre-filled with a past purchase's items + this customer.
  const reorder = (bill: Bill) => {
    if (!customer) return;
    const payload = {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        customerType: customer.customerType,
        source: 'customer',
      },
      items: bill.items.map((it) => ({ productId: it.productId, name: it.name, unitPrice: it.unitPrice, quantity: it.quantity })),
    };
    try {
      localStorage.setItem('ak_reorder', JSON.stringify(payload));
    } catch { /* ignore */ }
    navigate('/admin/billing');
  };

  if (loading) return <DetailShell><CenterSpinner /></DetailShell>;
  if (notFound || !customer) {
    return (
      <DetailShell>
        <div className="flex flex-col items-center justify-center h-full text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center"><User size={26} className="text-surface-400" /></div>
          <p className="text-body-md font-medium text-surface-700 dark:text-surface-300">Customer not found</p>
          <Link to="/admin/customers" className="text-caption text-brand-600 dark:text-brand-400 hover:underline">← Back to Customers</Link>
        </div>
      </DetailShell>
    );
  }

  // Everything the shop can hold about a customer, in the order it is asked
  // for. Rendered even when blank: a wholesale buyer missing a GSTIN or a
  // district is something the counter needs to SEE, and a section that quietly
  // disappears when empty is exactly how those gaps went unnoticed.
  const addressLine = [customer.address, customer.area, customer.city, customer.district, customer.state, customer.pincode].filter(Boolean).join(', ');
  // GSTIN is mandatory for wholesale and offered to dealers; for retail it is
  // shown only when one was actually captured, so a retail profile is not
  // padded with a row that never applies to it.
  const gstinApplies =
    GSTIN_REQUIRED_TYPES.includes(customer.customerType) ||
    customer.customerType === 'dealer' ||
    Boolean(customer.gstin);
  const gstinMissing = GSTIN_REQUIRED_TYPES.includes(customer.customerType) && !customer.gstin;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-4 lg:-m-6 xl:-m-8 bg-surface-50 dark:bg-surface-950">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/admin/customers')} className="p-1.5 rounded-lg text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 flex-shrink-0">
            <ArrowLeft size={18} />
          </button>
          <Avatar name={customer.name} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50 truncate">{customer.name}</h1>
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400 capitalize flex-shrink-0">{isOnline ? 'Online' : customer.customerType}</span>
              <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0', segment.cls)}>{segment.label}</span>
            </div>
            <p className="text-caption text-surface-400 truncate">{[customer.phone, customer.city].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {outstanding > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-caption font-semibold">
              <AlertTriangle size={13} /> Due {inr(outstanding)}
            </span>
          )}
          {isOnline && (
            <button
              onClick={() => { setEditMode('create'); setShowEdit(true); }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 text-caption font-semibold hover:bg-surface-50 dark:hover:bg-surface-800"
            >
              <Pencil size={14} /> Add counter details
            </button>
          )}
          {!isOnline && (
            <>
              <button onClick={() => { setEditMode('edit'); setShowEdit(true); }} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 text-caption font-semibold hover:bg-surface-50 dark:hover:bg-surface-800">
                <Pencil size={14} /> Edit
              </button>
              <button onClick={() => setShowPay(true)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 text-caption font-semibold hover:bg-amber-50 dark:hover:bg-amber-500/10">
                <Wallet size={14} /> Record Payment
              </button>
            </>
          )}
          <button onClick={() => navigate('/admin/billing')} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-brand-500 text-white text-caption font-semibold hover:bg-brand-600">
            <Plus size={14} /> New Bill
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 px-4 py-3 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800">
        <Kpi icon={<IndianRupee size={15} />} label="Lifetime Value" value={inr(stats?.lifetimeValue ?? 0)} tone="brand" />
        <Kpi icon={<Receipt size={15} />} label={isOnline ? 'Orders' : 'Bills'} value={String(stats?.billCount ?? 0)} />
        <Kpi icon={<TrendingUp size={15} />} label={isOnline ? 'Avg Order' : 'Avg Bill'} value={inr(stats?.aov ?? 0)} />
        <Kpi icon={<Wallet size={15} />} label={isOnline ? 'COD Pending' : 'Credit Due'} value={inr(outstanding)} tone={outstanding > 0 ? 'amber' : undefined} />
        <Kpi icon={<Clock size={15} />} label={isOnline ? 'Last Order' : 'Last Purchase'} value={daysAgo(stats?.lastPurchase ?? null)} />
        <Kpi icon={<Repeat size={15} />} label="Total Qty" value={String(stats?.totalQuantity ?? 0)} />
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0 border-r border-surface-200 dark:border-surface-800">
          <div className="flex items-center gap-1 px-3 pt-2 border-b border-surface-200 dark:border-surface-800 overflow-x-auto no-scrollbar bg-white dark:bg-surface-900">
            {!isOnline && <TabBtn icon={<Receipt size={13} />} label="Bills" count={bills.length} active={tab === 'bills'} onClick={() => setTab('bills')} />}
            <TabBtn icon={<Tag size={13} />} label="Products bought" count={products.length} active={tab === 'products'} onClick={() => setTab('products')} />
            {!isOnline && <TabBtn icon={<Wallet size={13} />} label="Credit ledger" count={ledger?.entries.length} active={tab === 'credit'} onClick={() => setTab('credit')} />}
            <TabBtn icon={<ShoppingBag size={13} />} label={isOnline ? 'Orders' : 'Online orders'} count={orders.length} active={tab === 'orders'} onClick={() => setTab('orders')} />
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {tab === 'bills' && <BillsTab bills={bills} onReorder={reorder} creditSettled={outstanding <= 0} />}
            {tab === 'products' && <ProductsTab products={products} />}
            {tab === 'credit' && <CreditTab ledger={ledger} onRecord={() => setShowPay(true)} />}
            {tab === 'orders' && <OrdersTab orders={orders} />}
          </div>
        </div>

        <div className="w-[340px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-surface-900 min-h-0">
          <div className="flex-1 overflow-y-auto">
            <Section title="Contact">
              <InfoRow icon={<Phone size={13} />} label="Phone" value={customer.phone} />
              <InfoRow icon={<Smartphone size={13} />} label="WhatsApp" value={customer.whatsapp} />
              <InfoRow icon={<User size={13} />} label="Contact person" value={customer.contactPerson} />
              <InfoRow icon={<Mail size={13} />} label="Email" value={customer.email} />
            </Section>

            <Section title="Address">
              <InfoRow icon={<MapPin size={13} />} label="Street" value={customer.address} />
              <InfoRow label="Area" value={customer.area} />
              <InfoRow label="City" value={customer.city} />
              <InfoRow label="District" value={customer.district} />
              <InfoRow label="State" value={customer.state} />
              <InfoRow label="Pincode" value={customer.pincode} />
              {addressLine && (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(addressLine).catch(() => {})}
                  className="mt-1 text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Copy full address
                </button>
              )}
            </Section>

            {gstinApplies && (
              <Section title="Tax &amp; business">
                <InfoRow icon={<FileText size={13} />} label="GSTIN" value={customer.gstin} mono />
                {customer.gstin && (
                  <InfoRow
                    icon={<Building2 size={13} />}
                    label="Registered state"
                    value={gstinStateName(customer.gstin)}
                  />
                )}
                {customer.gstin && !isValidGstin(customer.gstin) && (
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                    This GSTIN fails its checksum — a tax invoice carrying it may be rejected.
                  </p>
                )}
                {gstinMissing && (
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                    Wholesale billing needs a GSTIN. A full-case invoice cannot be raised until one is added.
                  </p>
                )}
              </Section>
            )}

            <Section title="Record">
              <InfoRow
                icon={isOnline ? <Globe size={13} /> : <Store size={13} />}
                label="Source"
                value={isOnline ? 'Online account — signed up on the website' : 'Counter — added in Admin'}
              />
              <InfoRow label="Customer type" value={isOnline ? 'Online' : customer.customerType} capitalize />
              <InfoRow label="Added on" value={fullDate(customer.createdAt)} />
              <InfoRow label="Last updated" value={fullDate(customer.updatedAt)} />
              {isOnline && (
                <p className="mt-1 text-[11px] text-surface-400">
                  Fields marked “Not provided” were never asked for at signup. Raise a counter bill for this
                  customer to capture them.
                </p>
              )}
            </Section>

            <Section title="Segmentation">
              <div className="flex flex-wrap gap-1.5">
                <span className={cn('text-caption font-semibold px-2 py-0.5 rounded', segment.cls)}>{segment.label}</span>
                <span className="text-caption font-medium px-2 py-0.5 rounded bg-surface-100 dark:bg-surface-800 text-surface-500 capitalize">{customer.customerType}</span>
                <span className="text-caption font-medium px-2 py-0.5 rounded bg-surface-100 dark:bg-surface-800 text-surface-500">{stats?.billCount ? 'Returning' : 'New'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2.5 text-caption">
                <MiniStat label="First purchase" value={stats?.firstPurchase ? new Date(stats.firstPurchase).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'} />
                <MiniStat label="Member since" value={customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'} />
              </div>
            </Section>

            {!isOnline && stats && stats.billCount > 0 && (
              <Section title="Payment mix">
                <PaymentMix mix={stats.paymentMix} />
              </Section>
            )}

            {isOnline && customer.notes && (
              <Section title="Notes">
                <p className="text-caption text-surface-700 dark:text-surface-300 whitespace-pre-wrap">{customer.notes}</p>
              </Section>
            )}

            {!isOnline && (
              <Section title="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                  rows={3}
                  placeholder="Add a private note about this customer…"
                  className="w-full px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-caption text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 resize-none"
                />
                {notesDirty && (
                  <button onClick={saveNotes} disabled={notesSaving} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-caption font-semibold hover:bg-brand-600 disabled:opacity-50">
                    <Save size={13} /> {notesSaving ? 'Saving…' : 'Save note'}
                  </button>
                )}
                {notesError && <p className="mt-1.5 text-caption text-red-600 dark:text-red-400">{notesError}</p>}
              </Section>
            )}
          </div>
        </div>
      </div>

      <EditCustomerDrawer
        isOpen={showEdit}
        customer={customer}
        mode={editMode}
        onClose={() => setShowEdit(false)}
        onSaved={(c) => {
          setShowEdit(false);
          // A created record has its own id and its own endpoints (bills, credit
          // ledger, notes), none of which this page is currently pointed at — so
          // it navigates rather than swapping the object underneath itself.
          if (editMode === 'create') navigate(`/admin/customers/${c.id}`, { replace: true });
          else setCustomer(c);
        }}
      />
      {showPay && (
        <RecordPaymentModal
          id={id}
          outstanding={outstanding}
          onClose={() => setShowPay(false)}
          onSaved={() => { setShowPay(false); setLoading(true); void load(); }}
        />
      )}
    </div>
  );
}

// ── Shell + primitives ──

function DetailShell({ children }: { children: ReactNode }) {
  return <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-4 lg:-m-6 xl:-m-8 bg-surface-50 dark:bg-surface-950">{children}</div>;
}

function CenterSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: 'brand' | 'amber' }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-800/40 min-w-0">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', tone === 'brand' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : tone === 'amber' ? 'bg-amber-500/10 text-amber-600' : 'bg-surface-200/60 dark:bg-surface-700/60 text-surface-500')}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-surface-400 font-semibold">{label}</p>
        <p className={cn('text-body-sm font-bold tabular-nums truncate', tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-surface-900 dark:text-surface-100')}>{value}</p>
      </div>
    </div>
  );
}

function TabBtn({ icon, label, count, active, onClick }: { icon: ReactNode; label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-caption font-medium whitespace-nowrap border-b-2 -mb-px transition-colors', active ? 'text-brand-600 dark:text-brand-400 border-brand-500' : 'text-surface-500 border-transparent hover:text-surface-700 dark:hover:text-surface-300')}>
      {icon}{label}
      {count !== undefined && count > 0 && <span className={cn('inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-bold', active ? 'bg-brand-500 text-white' : 'bg-surface-100 dark:bg-surface-800 text-surface-500')}>{count}</span>}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
      <h3 className="text-label uppercase tracking-wider text-surface-400 font-semibold mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/**
 * One captured field.
 *
 * A blank renders as a greyed “Not provided” rather than vanishing, so the
 * sidebar reads as a checklist of what the shop holds on this customer and what
 * it still has to ask for — the previous version hid empty rows, which is why
 * nobody noticed a wholesale buyer had no GSTIN until an invoice was due.
 * `icon` is optional; rows without one line up under the row that has it.
 */
function InfoRow({
  icon,
  label,
  value,
  mono,
  capitalize,
}: {
  icon?: ReactNode;
  label: string;
  value?: string | null;
  mono?: boolean;
  capitalize?: boolean;
}) {
  const has = Boolean(value && String(value).trim());
  return (
    <div className="flex items-start gap-2 text-caption">
      <span className="text-surface-400 mt-0.5 flex-shrink-0 w-[13px]">{icon}</span>
      <span className="w-[92px] flex-shrink-0 text-surface-400">{label}</span>
      <span
        className={cn(
          'flex-1 min-w-0 break-words',
          has ? 'text-surface-700 dark:text-surface-300' : 'text-surface-300 dark:text-surface-600 italic',
          has && mono && 'font-mono tracking-wide',
          has && capitalize && 'capitalize',
        )}
      >
        {has ? value : 'Not provided'}
      </span>
    </div>
  );
}

/** Date as the shop reads it, or an em dash when the field was never set. */
function fullDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-50 dark:bg-surface-800/50 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-surface-400">{label}</p>
      <p className="text-caption font-semibold text-surface-800 dark:text-surface-200">{value}</p>
    </div>
  );
}

function PaymentMix({ mix }: { mix: Record<string, { count: number; amount: number }> }) {
  const entries = Object.entries(mix);
  const total = entries.reduce((s, [, v]) => s + v.amount, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-100 dark:bg-surface-800">
        {entries.map(([m, v]) => (
          <div key={m} className={cn('h-full', payColors[m] ?? 'bg-surface-400')} style={{ width: `${(v.amount / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {entries.map(([m, v]) => (
          <span key={m} className="inline-flex items-center gap-1 text-[11px] text-surface-500">
            <span className={cn('w-2 h-2 rounded-full', payColors[m] ?? 'bg-surface-400')} />
            <span className="capitalize">{m}</span> <span className="tabular-nums text-surface-400">{Math.round((v.amount / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function EmptyRegion({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-2.5">{icon}</div>
      <p className="text-caption text-surface-400 max-w-xs">{text}</p>
    </div>
  );
}

// ── Tabs ──

function BillsTab({ bills, onReorder, creditSettled }: { bills: Bill[]; onReorder: (b: Bill) => void; creditSettled: boolean }) {
  if (bills.length === 0) return <EmptyRegion icon={<Receipt size={22} className="text-surface-300" />} text="No bills yet. Bills raised for this customer, or with their phone number, will appear here." />;
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
          <tr key={b.id} className="border-b border-surface-50 dark:border-surface-800/50 hover:bg-surface-50/60 dark:hover:bg-surface-800/30 group">
            <td className="py-2 pl-4 text-caption font-semibold font-mono text-surface-900 dark:text-surface-100">{b.billNumber}</td>
            <td className="py-2 text-caption text-surface-500">{new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
            <td className="py-2 text-caption text-surface-500">{new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
            <td className="py-2 text-center text-caption text-surface-500 tabular-nums">{b.itemCount}</td>
            <td className="py-2 text-center"><StatusBadge status={b.payment.method === 'credit' && !creditSettled ? 'pending' : 'paid'} type="payment" /></td>
            <td className="py-2 text-right text-body-sm font-semibold text-surface-900 dark:text-surface-100 tabular-nums">{inr(b.grandTotal)}</td>
            <td className="py-2 pr-4 text-right">
              <button
                onClick={() => onReorder(b)}
                title="Start a new bill with these items"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[11px] font-semibold hover:bg-brand-500/20 transition-colors"
              >
                <RotateCcw size={12} /> Reorder
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProductsTab({ products }: { products: CustomerStats['topProducts'] }) {
  if (products.length === 0) return <EmptyRegion icon={<Tag size={22} className="text-surface-300" />} text="No products bought yet." />;
  return (
    <table className="w-full">
      <thead>
        <tr className="text-label uppercase tracking-wider text-surface-400 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-100 dark:border-surface-800">
          <th className="text-left font-semibold py-2 pl-4">Product</th>
          <th className="text-center font-semibold py-2 w-20">Qty</th>
          <th className="text-right font-semibold py-2 w-28">Spend</th>
          <th className="text-right font-semibold py-2 pr-4 w-28">Last bought</th>
        </tr>
      </thead>
      <tbody>
        {products.map((p, i) => (
          <tr key={p.productId + i} className="border-b border-surface-50 dark:border-surface-800/50 hover:bg-surface-50/60 dark:hover:bg-surface-800/30">
            <td className="py-2 pl-4 text-caption font-medium text-surface-900 dark:text-surface-100">{p.name}</td>
            <td className="py-2 text-center text-caption text-surface-600 dark:text-surface-300 tabular-nums font-semibold">{p.quantity}</td>
            <td className="py-2 text-right text-caption text-surface-700 dark:text-surface-300 tabular-nums">{inr(p.spend)}</td>
            <td className="py-2 pr-4 text-right text-caption text-surface-400">{daysAgo(p.lastBought)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CreditTab({ ledger, onRecord }: { ledger: CreditLedger | null; onRecord: () => void }) {
  if (!ledger || ledger.entries.length === 0) {
    return <EmptyRegion icon={<Wallet size={22} className="text-surface-300" />} text="No credit activity. Credit-payment bills and repayments show here as a running balance." />;
  }
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50/60 dark:bg-amber-500/5 border-b border-surface-100 dark:border-surface-800">
        <span className="text-caption font-semibold text-surface-600 dark:text-surface-300">Outstanding balance</span>
        <div className="flex items-center gap-3">
          <span className={cn('text-body-md font-bold tabular-nums', ledger.outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600')}>{inr(ledger.outstanding)}</span>
          {ledger.outstanding > 0 && (
            <button onClick={onRecord} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[11px] font-semibold hover:bg-amber-600">
              <Wallet size={12} /> Record Payment
            </button>
          )}
        </div>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-label uppercase tracking-wider text-surface-400 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-100 dark:border-surface-800">
            <th className="text-left font-semibold py-2 pl-4">Entry</th>
            <th className="text-left font-semibold py-2">Date</th>
            <th className="text-right font-semibold py-2 w-28">Amount</th>
            <th className="text-right font-semibold py-2 pr-4 w-28">Balance</th>
          </tr>
        </thead>
        <tbody>
          {ledger.entries.map((e) => (
            <tr key={e.id} className="border-b border-surface-50 dark:border-surface-800/50">
              <td className="py-2 pl-4">
                <div className="flex items-center gap-2">
                  <span className={cn('w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0', e.type === 'bill' ? 'bg-amber-500/10 text-amber-600' : 'bg-green-500/10 text-green-600')}>
                    {e.type === 'bill' ? <Receipt size={12} /> : <CheckCircle2 size={12} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-caption font-medium text-surface-900 dark:text-surface-100">{e.type === 'bill' ? `Credit bill ${e.ref}` : `Payment (${e.ref})`}</p>
                    {e.note && <p className="text-[10px] text-surface-400 truncate">{e.note}</p>}
                  </div>
                </div>
              </td>
              <td className="py-2 text-caption text-surface-500">{new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
              <td className={cn('py-2 text-right text-caption font-semibold tabular-nums', e.amount >= 0 ? 'text-amber-600' : 'text-green-600')}>{e.amount >= 0 ? '+' : '−'}{inr(Math.abs(e.amount))}</td>
              <td className="py-2 pr-4 text-right text-caption font-bold text-surface-900 dark:text-surface-100 tabular-nums">{inr(e.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersTab({ orders }: { orders: Order[] }) {
  if (orders.length === 0) return <EmptyRegion icon={<ShoppingBag size={22} className="text-surface-300" />} text="No online orders. These appear only if this customer also has a registered site account with the same phone number." />;
  return (
    <table className="w-full">
      <thead>
        <tr className="text-label uppercase tracking-wider text-surface-400 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-100 dark:border-surface-800">
          <th className="text-left font-semibold py-2 pl-4">Order</th>
          <th className="text-left font-semibold py-2">Date</th>
          <th className="text-center font-semibold py-2 w-24">Status</th>
          <th className="text-right font-semibold py-2 pr-4 w-28">Total</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} className="border-b border-surface-50 dark:border-surface-800/50 hover:bg-surface-50/60 dark:hover:bg-surface-800/30">
            <td className="py-2 pl-4 text-caption font-semibold font-mono text-surface-900 dark:text-surface-100">#{String(o.id).slice(-6)}</td>
            <td className="py-2 text-caption text-surface-500">{new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
            <td className="py-2 text-center"><StatusBadge status={o.status} type="order" /></td>
            <td className="py-2 pr-4 text-right text-body-sm font-semibold text-surface-900 dark:text-surface-100 tabular-nums">{inr(o.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Modals ──

function RecordPaymentModal({ id, outstanding, onClose, onSaved }: { id: string; outstanding: number; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setErr('Enter a valid amount.'); return; }
    setSaving(true);
    setErr('');
    try {
      const { recordCustomerPayment } = await import('@/services/admin.ts');
      await recordCustomerPayment(id, { amount: amt, method, note: note || undefined });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to record payment.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-100 dark:border-surface-800">
          <h2 className="font-display font-semibold text-body-sm text-surface-900 dark:text-surface-50 flex items-center gap-2"><Wallet size={16} className="text-amber-500" /> Record Payment</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-surface-400 hover:text-surface-600"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {outstanding > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-caption">
              <span className="text-amber-700 dark:text-amber-400 font-medium">Current due</span>
              <span className="font-bold text-amber-700 dark:text-amber-400 tabular-nums">{inr(outstanding)}</span>
            </div>
          )}
          {err && <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium"><AlertTriangle size={14} /> {err}</div>}
          <div>
            <label className="block mb-1 text-caption font-medium text-surface-600 dark:text-surface-400">Amount received</label>
            <div className="relative">
              <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus placeholder={outstanding > 0 ? String(outstanding) : '0'} className="w-full pl-9 pr-3 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-body-sm font-semibold text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/20 tabular-nums" />
            </div>
          </div>
          <div>
            <label className="block mb-1 text-caption font-medium text-surface-600 dark:text-surface-400">Method</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([{ m: 'cash', i: Banknote }, { m: 'upi', i: Smartphone }, { m: 'card', i: CreditCard }] as const).map(({ m, i: Icon }) => (
                <button key={m} onClick={() => setMethod(m)} className={cn('flex items-center justify-center gap-1.5 py-2 rounded-lg text-caption font-medium capitalize transition-colors', method === m ? 'bg-brand-500 text-white' : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700')}>
                  <Icon size={14} /> {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block mb-1 text-caption font-medium text-surface-600 dark:text-surface-400">Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reference / remark" className="w-full px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-caption text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-surface-100 dark:border-surface-800 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 font-medium text-body-sm hover:bg-surface-50 dark:hover:bg-surface-800">Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-body-sm hover:bg-brand-600 disabled:opacity-50"><Wallet size={15} /> {saving ? 'Saving…' : 'Record'}</button>
        </div>
      </div>
    </div>
  );
}

const customerTypes = ['retail', 'wholesale', 'dealer', 'other'] as const;

/**
 * Edits a counter customer, or opens the same form to give an online account
 * one for the first time.
 *
 * 'create' exists because an online signup collects only an email, a name and
 * whatever address the last order shipped to — there is no row to PATCH. The
 * new counter record is matched back to the account BY PHONE (see the merge in
 * AdminCustomersPage), so the two show as one customer rather than two. That
 * matching is the whole reason phone stays required on 'create'. On 'edit' it
 * follows Settings → Billing, like the counter's own form.
 */
function EditCustomerDrawer({ isOpen, customer, mode = 'edit', onClose, onSaved }: { isOpen: boolean; customer: Customer; mode?: 'edit' | 'create'; onClose: () => void; onSaved: (c: Customer) => void }) {
  const [form, setForm] = useState<CustomerInput>({
    name: customer.name,
    contactPerson: customer.contactPerson ?? '',
    phone: customer.phone,
    whatsapp: customer.whatsapp ?? '',
    email: customer.email ?? '',
    address: customer.address ?? '',
    area: customer.area ?? '',
    city: customer.city ?? '',
    district: customer.district ?? '',
    state: customer.state ?? '',
    pincode: customer.pincode ?? '',
    customerType: customer.customerType,
    gstin: customer.gstin ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof CustomerInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Settings → Billing → "Phone Number Required for Customers". Assumed on
  // until it loads (the server applies it either way).
  const [requirePhoneSetting, setRequirePhoneSetting] = useState(true);
  useEffect(() => {
    if (!isOpen || mode === 'create') return;
    let cancelled = false;
    (async () => {
      try {
        const { getSiteSettings } = await import('@/services/admin.ts');
        const settings = await getSiteSettings();
        if (!cancelled && settings) setRequirePhoneSetting(settings.counterSettings.requireCustomerPhone);
      } catch {
        /* keep the stricter rule */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode]);
  // Only a customer who already has a number must keep one — the server's rule.
  const phoneRequired = mode === 'create' || (requirePhoneSetting && Boolean(customer.phone));

  const gstinRequired = GSTIN_REQUIRED_TYPES.includes(form.customerType);
  const showGstin = gstinRequired || form.customerType === 'dealer' || Boolean(form.gstin);

  // Refresh the form from the customer each time the drawer opens.
  useEffect(() => {
    if (isOpen) {
      setForm({
        name: customer.name,
        contactPerson: customer.contactPerson ?? '',
        phone: customer.phone,
        whatsapp: customer.whatsapp ?? '',
        email: customer.email ?? '',
        address: customer.address ?? '',
        area: customer.area ?? '',
        city: customer.city ?? '',
        district: customer.district ?? '',
        state: customer.state ?? '',
        pincode: customer.pincode ?? '',
        customerType: customer.customerType,
        gstin: customer.gstin ?? '',
      });
      setErr('');
    }
  }, [isOpen, customer]);

  const submit = async () => {
    if (!form.name.trim() || !form.address.trim() || (phoneRequired && !form.phone.trim())) {
      setErr(phoneRequired ? 'Name, phone and address are required.' : 'Name and address are required.');
      return;
    }
    if (form.phone.trim() && form.phone.replace(/\D/g, '').length !== 10) { setErr('Enter a valid 10-digit phone number.'); return; }
    // Only blocks when this edit is the one making the customer wholesale — a
    // customer already on file from before GSTIN existed must stay editable, or
    // the shop cannot fix a phone number without first producing a GSTIN. A
    // brand-new record has nothing to grandfather, so it is held to the rule.
    if (gstinRequired && (mode === 'create' || customer.customerType !== form.customerType) && !form.gstin?.trim()) {
      setErr('A GSTIN is required for wholesale customers.'); return;
    }
    if (form.gstin?.trim() && !isValidGstin(form.gstin)) {
      setErr('Enter a valid 15-character GSTIN (e.g. 33ABIFP1692E1ZA).'); return;
    }
    setSaving(true);
    setErr('');
    try {
      const { updateCustomer, createCustomer } = await import('@/services/admin.ts');
      const payload = { ...form, name: form.name.trim(), phone: form.phone.trim() };
      const saved = mode === 'create' ? await createCustomer(payload) : await updateCustomer(customer.id, payload);
      onSaved(saved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save.');
    } finally { setSaving(false); }
  };

  const fields: { k: keyof CustomerInput; label: string; ph?: string; num?: boolean; req?: boolean }[] = [
    { k: 'name', label: 'Customer Name', req: true, ph: 'e.g. Rajesh Kumar' },
    { k: 'contactPerson', label: 'Contact Person', ph: 'Person to contact' },
    { k: 'phone', label: 'Phone', req: phoneRequired, num: true, ph: phoneRequired ? '10-digit mobile' : '10-digit mobile (optional)' },
    { k: 'whatsapp', label: 'WhatsApp', num: true, ph: 'WhatsApp number' },
    { k: 'email', label: 'Email', ph: 'name@example.com' },
    { k: 'area', label: 'Area', ph: 'e.g. Anna Nagar' },
    { k: 'city', label: 'City', ph: 'e.g. Sivakasi' },
    { k: 'district', label: 'District', ph: 'e.g. Virudhunagar' },
    { k: 'state', label: 'State', ph: 'e.g. Tamil Nadu' },
    { k: 'pincode', label: 'Pincode', num: true, ph: '6-digit PIN' },
  ];

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/60"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 z-[101] w-full max-w-xl bg-white dark:bg-surface-900 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-100 dark:border-surface-800">
              <h2 className="font-display font-semibold text-body-sm text-surface-900 dark:text-surface-50 flex items-center gap-2">
                {mode === 'create' ? <Plus size={15} className="text-brand-500" /> : <Pencil size={15} className="text-brand-500" />}
                {mode === 'create' ? 'Add counter details' : 'Edit Customer'}
              </h2>
              <button onClick={onClose} className="p-1 rounded-lg text-surface-400 hover:text-surface-600"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {err && <div className="mb-3 flex items-center gap-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium"><AlertTriangle size={14} /> {err}</div>}
              {mode === 'create' && (
                <div className="mb-3 flex items-start gap-2 p-2.5 rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300 text-caption">
                  <Globe size={14} className="mt-0.5 flex-shrink-0" />
                  <span>
                    Pre-filled from this online account and its last delivery address. Saving creates the
                    counter record for the same person — the phone number is what ties the two together, so
                    keep it as the one they order with.
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fields.map((f) => (
                  <div key={f.k}>
                    <label className="block mb-1 text-caption font-medium text-surface-600 dark:text-surface-400">{f.label} {f.req && <span className="text-red-500">*</span>}</label>
                    <input
                      value={String(form[f.k] ?? '')}
                      inputMode={f.num ? 'numeric' : undefined}
                      placeholder={f.ph}
                      onChange={(e) => set(f.k, f.num ? e.target.value.replace(/\D/g, '').slice(0, f.k === 'pincode' ? 6 : 10) : e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                ))}
                <div>
                  <label className="block mb-1 text-caption font-medium text-surface-600 dark:text-surface-400">Customer Type</label>
                  <Select
                    value={form.customerType}
                    onChange={(v) => { set('customerType', v); setErr(''); }}
                    options={customerTypes.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
                    size="md"
                  />
                </div>
                {showGstin && (
                  <div>
                    <label className="block mb-1 text-caption font-medium text-surface-600 dark:text-surface-400">
                      GSTIN {gstinRequired && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      value={form.gstin ?? ''}
                      onChange={(e) => set('gstin', normalizeGstin(e.target.value).slice(0, 15))}
                      placeholder="33ABIFP1692E1ZA"
                      maxLength={15}
                      className={cn(
                        'w-full px-3 py-2 rounded-xl border bg-surface-50 dark:bg-surface-800 text-body-sm font-mono tracking-wide text-surface-900 dark:text-surface-100 placeholder:text-surface-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-brand-500/20',
                        form.gstin && !isValidGstin(form.gstin)
                          ? 'border-amber-400 dark:border-amber-500/50'
                          : 'border-surface-200 dark:border-surface-700',
                      )}
                    />
                    <p className="mt-1 text-[11px] text-surface-400">
                      {form.gstin && isValidGstin(form.gstin)
                        ? `Valid — ${gstinStateName(form.gstin)}`
                        : form.gstin
                          ? `${form.gstin.length}/15 characters`
                          : 'Required to raise a wholesale tax invoice'}
                    </p>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block mb-1 text-caption font-medium text-surface-600 dark:text-surface-400">Address <span className="text-red-500">*</span></label>
                  <textarea value={form.address} onChange={(e) => set('address', e.target.value)} rows={2} placeholder="Door no, street, area, landmark…" className="w-full px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 resize-none" />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-surface-100 dark:border-surface-800 flex gap-2 justify-end">
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 font-medium text-body-sm hover:bg-surface-50 dark:hover:bg-surface-800">Cancel</button>
              <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-body-sm hover:bg-brand-600 disabled:opacity-50"><Save size={15} /> {saving ? 'Saving…' : mode === 'create' ? 'Create counter record' : 'Save Changes'}</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
