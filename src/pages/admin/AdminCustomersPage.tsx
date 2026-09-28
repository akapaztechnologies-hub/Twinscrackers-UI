import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Search, Users, Store, Globe, Contact } from 'lucide-react';
import { Avatar } from '@/components/atoms/Avatar.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { ExportButton } from '@/components/admin/ExportButton.tsx';
import { WhatsAppBroadcastDialog } from '@/components/admin/WhatsAppBroadcastDialog.tsx';
import { WhatsAppIcon } from '@/components/atoms/BrandIcons.tsx';
import { exportToExcel } from '@/lib/exportExcel.ts';
import { cn } from '@/lib/utils.ts';
import type { Customer, CustomerType } from '@/types/admin.ts';
import type { UserProfile } from '@/types/index.ts';

type Source = 'walkin' | 'online' | 'both';

interface UnifiedCustomer {
  key: string;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  type?: CustomerType;
  source: Source;
  billingId?: string; // POS Customer._id
  userUid?: string; // registered user uid
  createdAt: string;
}

const norm = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);

const dateRangeOptions = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
];

function getDateRangeStart(range: string): Date | null {
  if (range === 'all') return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === 'today') return d;
  if (range === '7d') return new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (range === '30d') return new Date(d.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

const sourceOptions = [
  { label: 'All Sources', value: 'all' },
  { label: 'Walk-in', value: 'walkin' },
  { label: 'Online', value: 'online' },
  { label: 'Both', value: 'both' },
];

const sourceMeta: Record<Source, { label: string; cls: string; icon: typeof Store }> = {
  walkin: { label: 'Walk-in', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', icon: Store },
  online: { label: 'Online', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', icon: Globe },
  both: { label: 'Both', cls: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400', icon: Contact },
};

const typeOptions = [
  { label: 'All Types', value: 'all' },
  { label: 'Retail', value: 'retail' },
  { label: 'Wholesale', value: 'wholesale' },
  { label: 'Dealer', value: 'dealer' },
];

export function AdminCustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<UnifiedCustomer[]>([]);
  const [walkinTotal, setWalkinTotal] = useState(0);
  const [onlineTotal, setOnlineTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | Source>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | CustomerType>('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Debounce the search box so keystrokes don't hit the API on every character.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // The directory is a union of two collections (POS customers + registered users)
  // keyed by phone, so the merge/dedup happens client-side. Search is pushed to
  // BOTH endpoints server-side; without a search term we load a bounded recent
  // window of each. (A single-query unified list would need a dedicated backend
  // aggregation endpoint.)
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const svc = await import('@/services/admin.ts');
        const [billingRes, usersRes] = await Promise.all([
          svc.getCustomersPaged({ search: debouncedSearch || undefined, limit: 100 }).catch(() => ({ data: [] as Customer[], total: 0 })),
          svc.getAllCustomers({ search: debouncedSearch || undefined, role: 'user', limit: 100 }).catch(() => ({ data: [] as UserProfile[], total: 0 })),
        ]);
        const billing = billingRes.data as Customer[];
        setWalkinTotal(billingRes.total ?? billing.length);
        // Online signups = registered users (exclude admin/staff accounts).
        const users = (usersRes.data as UserProfile[]).filter((u) => (u.role ?? 'user') === 'user');
        setOnlineTotal(usersRes.total ?? users.length);

        const byPhone = new Map<string, UnifiedCustomer>();
        billing.forEach((c) => {
          // A number two counter customers share (Settings → Billing) keeps both
          // rows; keyed on the phone alone, the second overwrote the first.
          const phoneKey = norm(c.phone);
          const key = phoneKey && !byPhone.has(phoneKey) ? phoneKey : `c_${c.id}`;
          byPhone.set(key, {
            key,
            name: c.name,
            phone: c.phone,
            email: c.email,
            city: c.city,
            type: c.customerType,
            billingId: c.id,
            source: 'walkin',
            createdAt: c.createdAt || new Date().toISOString(),
          });
        });
        users.forEach((u) => {
          const phoneKey = norm(u.phone);
          const existing = phoneKey ? byPhone.get(phoneKey) : undefined;
          // Only fold this account into an existing row when that row is a genuine
          // POS walk-in (has a billingId) not yet claimed by another online account —
          // a phone match against another *online-only* row just means two different
          // people share a number (e.g. a family/shop phone), not the same person, so
          // each keeps its own row instead of one silently overwriting the other.
          if (existing && existing.billingId && !existing.userUid) {
            existing.source = 'both';
            existing.userUid = u.uid;
            existing.email = existing.email || u.email;
            existing.city = existing.city || u.city;
            if (u.createdAt && new Date(u.createdAt) < new Date(existing.createdAt)) {
              existing.createdAt = u.createdAt;
            }
          } else {
            const key = existing ? `u_${u.uid}` : (phoneKey || `u_${u.uid}`);
            byPhone.set(key, {
              key,
              name: u.displayName || 'Customer',
              phone: u.phone || '',
              email: u.email,
              city: u.city,
              userUid: u.uid,
              source: 'online',
              createdAt: u.createdAt || new Date().toISOString(),
            });
          }
        });
        setCustomers(Array.from(byPhone.values()));
      } catch {
        setCustomers([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [debouncedSearch]);

  const cityOptions = useMemo(() => {
    const cities = new Set(customers.map((c) => c.city?.trim()).filter(Boolean));
    return [
      { label: 'All Cities', value: 'all' },
      ...Array.from(cities).sort().map((c) => ({ label: c as string, value: c as string })),
    ];
  }, [customers]);

  const filtered = useMemo(() => {
    let list = customers;
    
    const rangeStart = getDateRangeStart(dateRange);
    if (rangeStart) {
      list = list.filter((c) => new Date(c.createdAt) >= rangeStart);
    }
    
    // Search is applied server-side (on both sources); these are secondary
    // client facets over the merged, bounded result set.
    if (sourceFilter !== 'all') list = list.filter((c) => c.source === sourceFilter);
    if (typeFilter !== 'all') list = list.filter((c) => c.type === typeFilter);
    if (cityFilter !== 'all') list = list.filter((c) => c.city === cityFilter);
    return list;
  }, [customers, sourceFilter, typeFilter, cityFilter, dateRange]);

  useEffect(() => setCurrentPage(1), [debouncedSearch, sourceFilter, typeFilter, cityFilter, dateRange]);

  const totalItems = filtered.length;
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // KPI headline counts come from the server totals of each source; "Both" (the
  // phone intersection) is only knowable from the loaded merge, so it is a
  // lower-bound over the current result window.
  const walkin = walkinTotal;
  const online = onlineTotal;
  const both = customers.filter((c) => c.billingId && c.userUid).length;

  // Everyone opens the unified Customer detail page — POS by billing id, online by user id.
  const detailHref = (c: UnifiedCustomer) => `/admin/customers/${c.billingId || c.userUid}`;

  const handleExport = () => {
    void exportToExcel(
      filtered.map((c) => ({
        Name: c.name,
        Phone: c.phone,
        Email: c.email || '',
        City: c.city || '',
        Type: c.type || '',
        Source: sourceMeta[c.source].label,
      })),
      'customers',
    );
  };

  return (
    <ListPageShell
      header={
        <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Customers" value={String(walkin + online)} icon={Users} color="text-blue-600 bg-blue-500/10" isLoading={isLoading} />
        <KPICard label="Walk-in (POS)" value={String(walkin)} icon={Store} color="text-amber-600 bg-amber-500/10" isLoading={isLoading} />
        <KPICard label="Online Signups" value={String(online)} icon={Globe} color="text-cyan-600 bg-cyan-500/10" isLoading={isLoading} />
        <KPICard label="Both" value={String(both)} icon={Contact} color="text-green-600 bg-green-500/10" isLoading={isLoading} />
      </div>

      <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            placeholder="Search by name, phone, email, city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <FilterButton activeCount={[sourceFilter, typeFilter, cityFilter, dateRange].filter((v) => v !== 'all').length} open={showFilters} onClick={() => setShowFilters(!showFilters)} />
          <ExportButton onExport={handleExport} />
          {/* The season announcement — one template to every customer on file. */}
          <button
            onClick={() => setShowBroadcast(true)}
            title="Send the season announcement on WhatsApp"
            className="flex items-center gap-2 px-3.5 h-9 rounded-lg border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] text-[13px] font-semibold hover:bg-[#25D366]/20 transition-colors"
          >
            <WhatsAppIcon size={15} />
            <span className="hidden sm:inline">WhatsApp</span>
          </button>
          <Link
            to="/admin/billing"
            className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
          >
            + New Bill
          </Link>
        </div>
      </div>

      <FilterPanel
        open={showFilters}
        onClearAll={() => { setSourceFilter('all'); setTypeFilter('all'); setCityFilter('all'); setDateRange('all'); }}
        filters={[
          { id: 'source', label: 'Source', value: sourceFilter, options: sourceOptions, onChange: (v) => setSourceFilter(v as 'all' | Source) },
          { id: 'type', label: 'Customer Type', value: typeFilter, options: typeOptions, onChange: (v) => setTypeFilter(v as 'all' | CustomerType) },
          { id: 'city', label: 'City', value: cityFilter, options: cityOptions, onChange: (v) => setCityFilter(v) },
          { id: 'date', label: 'Date Range', value: dateRange, options: dateRangeOptions, onChange: (v) => setDateRange(v) },
        ]}
      />
        </>
      }
    >
      <DataTable
        columns={[
          { key: 'customer', label: 'Customer' },
          { key: 'phone', label: 'Phone' },
          { key: 'source', label: 'Source' },
          { key: 'type', label: 'Type' },
          { key: 'city', label: 'City' },
          { key: 'actions', label: '', className: 'w-12' },
        ]}
        isLoading={isLoading}
        isEmpty={filtered.length === 0}
        emptyIcon={<Contact size={24} className="text-surface-400" />}
        emptyTitle="No customers found"
        emptyDescription={search ? 'Try adjusting your search' : 'Customers appear here as they sign up online or are billed at the counter'}
        pagination={{
          currentPage,
          totalItems,
          itemsPerPage,
          onPageChange: setCurrentPage,
          onItemsPerPageChange: (size) => { setItemsPerPage(size); setCurrentPage(1); },
        }}
      >
        {paginated.map((c) => {
          const meta = sourceMeta[c.source];
          const SIcon = meta.icon;
          return (
            <tr
              key={c.key}
              onClick={() => navigate(detailHref(c))}
              className="border-b border-surface-50 dark:border-surface-850 last:border-0 hover:bg-surface-50/50 dark:hover:bg-surface-850/50 cursor-pointer transition-colors"
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <Avatar name={c.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 truncate">{c.name}</p>
                    {c.email && <p className="text-caption text-surface-400 truncate">{c.email}</p>}
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400 tabular-nums">{c.phone || '—'}</td>
              <td className="px-5 py-3.5">
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-caption font-medium', meta.cls)}>
                  <SIcon size={11} /> {meta.label}
                </span>
              </td>
              <td className="px-5 py-3.5">
                {c.type ? (
                  <span className="text-caption font-medium capitalize text-surface-600 dark:text-surface-300">{c.type}</span>
                ) : (
                  <span className="text-surface-400">—</span>
                )}
              </td>
              <td className="px-5 py-3.5 text-body-sm text-surface-500">{c.city || '—'}</td>
              <td className="px-5 py-3.5">
                <Link
                  to={detailHref(c)}
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10 transition-colors inline-flex"
                >
                  <Eye size={16} />
                </Link>
              </td>
            </tr>
          );
        })}
      </DataTable>

      <WhatsAppBroadcastDialog open={showBroadcast} onClose={() => setShowBroadcast(false)} />
    </ListPageShell>
  );
}
