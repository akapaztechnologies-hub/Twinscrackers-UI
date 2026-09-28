import { useState, useEffect, useCallback } from 'react';
import { Search, MapPin, Building2, Pencil, Trash2, Plus, Globe2, Check, X, Upload, Download } from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import { cn } from '@/lib/utils.ts';
import {
  getDropPoints,
  getDropPointStats,
  getParcelServices,
  createDropPoint,
  updateDropPoint,
  deleteDropPoint,
  createParcelService,
  updateParcelService,
  deleteParcelService,
  addStandardParcelServices,
  type AdminDropPoint,
  type DropPointStats,
  type ParcelServiceSummary,
} from '@/services/delivery.ts';
import { ImportDialog } from '@/components/admin/ImportDialog.tsx';
import {
  exportDropPoints,
  downloadDropPointTemplate,
  importDropPoints as importDropPointsFile,
} from '@/services/transfer.ts';

/**
 * The offices customers collect their parcels from.
 *
 * Fireworks cannot be couriered to a door, so every online order ends at one of
 * these. Most arrive through the importer — the transport lines publish their
 * branch lists, and A1 alone has 540 — so this screen is mainly for correcting
 * them and adding the ones nobody publishes.
 *
 * An edit here is permanent against re-import: `editedByAdmin` pins a row, so
 * taking an updated list from a line never undoes the shop's own knowledge that
 * an office has moved or that the published number rings nobody.
 */

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const emptyDraft = {
  parcelService: '',
  name: '',
  address: '',
  area: '',
  city: '',
  district: '',
  state: '',
  pincode: '',
  phone: '',
  contactPerson: '',
  landmark: '',
  isActive: true,
};

type Draft = typeof emptyDraft;

export function AdminDeliveryPointsPage() {
  const [points, setPoints] = useState<AdminDropPoint[]>([]);
  const [services, setServices] = useState<ParcelServiceSummary[]>([]);
  const [stats, setStats] = useState<DropPointStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalItems, setTotalItems] = useState(0);

  /** The row being edited, or `emptyDraft` when adding. Null means the form is shut. */
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminDropPoint | null>(null);
  const [importing, setImporting] = useState(false);
  /** The line an uploaded list belongs to, when the file does not say itself. */
  const [importService, setImportService] = useState('');
  const [linesOpen, setLinesOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, summary] = await Promise.all([
        getDropPoints({
          page: currentPage,
          limit: itemsPerPage,
          search: debounced || undefined,
          parcelService: serviceFilter === 'all' ? undefined : serviceFilter,
        }),
        getDropPointStats().catch(() => null),
      ]);
      setPoints(list.data);
      setTotalItems(list.total);
      if (summary) setStats(summary);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load collection points.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, itemsPerPage, debounced, serviceFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadServices = useCallback(async () => {
    setServices(await getParcelServices(true));
  }, []);

  useEffect(() => {
    reloadServices().catch(() => {});
  }, [reloadServices]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const openAdd = () => {
    setEditingId(null);
    setImporting(false);
    setLinesOpen(false);
    setDraft({ ...emptyDraft, parcelService: services[0]?.id ?? '' });
  };

  const openEdit = (p: AdminDropPoint) => {
    setEditingId(p.id);
    setDraft({
      parcelService: typeof p.parcelService === 'string' ? p.parcelService : p.parcelService?._id ?? '',
      name: p.name ?? '',
      address: p.address ?? '',
      area: p.area ?? '',
      city: p.city ?? '',
      district: p.district ?? '',
      state: p.state ?? '',
      pincode: p.pincode ?? '',
      phone: p.phone ?? '',
      contactPerson: p.contactPerson ?? '',
      landmark: p.landmark ?? '',
      isActive: p.isActive !== false,
    });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.city.trim() || !draft.parcelService) {
      setError('A collection point needs a transport line, a name and a city.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) await updateDropPoint(editingId, draft);
      else await createDropPoint(draft);
      setNotice(editingId ? 'Collection point updated.' : 'Collection point added.');
      setDraft(null);
      setEditingId(null);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that collection point.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDropPoint(deleteTarget.id);
      setNotice(`${deleteTarget.name} removed.`);
      setDeleteTarget(null);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that collection point.');
    }
  };

  const serviceName = (p: AdminDropPoint) =>
    typeof p.parcelService === 'string'
      ? services.find((s) => s.id === p.parcelService)?.name ?? '—'
      : p.parcelService?.name ?? '—';

  return (
    <ListPageShell
      header={
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard label="Collection Points" value={String(stats?.total ?? 0)} icon={MapPin} color="text-blue-600 bg-blue-500/10" />
            <KPICard label="Active" value={String(stats?.active ?? 0)} icon={Check} color="text-emerald-600 bg-emerald-500/10" />
            <KPICard label="Transport Lines" value={String(stats?.services ?? 0)} icon={Building2} color="text-brand-600 bg-brand-500/10" />
            <KPICard label="States Covered" value={String(stats?.states ?? 0)} icon={Globe2} color="text-amber-600 bg-amber-500/10" />
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium">
              {error}
            </div>
          )}
          {notice && !error && (
            <div className="p-2.5 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 text-caption font-medium">
              {notice}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search by office, city, pincode…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <FilterButton activeCount={serviceFilter !== 'all' ? 1 : 0} open={showFilters} onClick={() => setShowFilters(!showFilters)} />
              {/* Most of these arrive as a spreadsheet from the transport line —
                  Mettur's was 682 offices — so the round trip is the normal way
                  in and adding one by hand is the exception. Export gives back
                  the same shape that uploads, which is how a published list
                  gets corrected in bulk. */}
              <button
                onClick={() => { setDraft(null); setLinesOpen((o) => !o); }}
                className={cn(
                  'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-caption font-semibold transition-colors',
                  linesOpen
                    ? 'border-brand-500/40 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                    : 'border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800',
                )}
              >
                <Building2 size={15} /> Transport lines
              </button>
              <button
                onClick={() => void exportDropPoints(serviceFilter === 'all' ? undefined : serviceFilter)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 text-caption font-semibold hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
              >
                <Download size={15} /> Export
              </button>
              <button
                onClick={() => { setDraft(null); setImporting(true); }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 text-caption font-semibold hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
              >
                <Upload size={15} /> Import
              </button>
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-brand-500 text-white text-caption font-semibold hover:bg-brand-600 transition-colors"
              >
                <Plus size={15} /> Add point
              </button>
            </div>
          </div>

          <FilterPanel
            open={showFilters}
            onClearAll={() => { setServiceFilter('all'); setCurrentPage(1); }}
            filters={[
              {
                id: 'service',
                label: 'Transport line',
                value: serviceFilter,
                options: [{ label: 'All lines', value: 'all' }, ...services.map((s) => ({ label: s.name, value: s.id }))],
                onChange: (v) => { setServiceFilter(v); setCurrentPage(1); },
              },
            ]}
          />

          {linesOpen && (
            <TransportLinesPanel
              services={services}
              onChanged={async () => {
                await reloadServices();
                void load();
              }}
              onNotice={setNotice}
              onClose={() => setLinesOpen(false)}
            />
          )}

          {draft && (
            <DropPointForm
              draft={draft}
              services={services}
              editing={Boolean(editingId)}
              saving={saving}
              onChange={setDraft}
              onSave={() => void save()}
              onCancel={() => { setDraft(null); setEditingId(null); setError(''); }}
            />
          )}
        </>
      }
    >
      <DataTable
        columns={[
          { key: 'office', label: 'Office' },
          { key: 'line', label: 'Transport line' },
          { key: 'where', label: 'City / Pincode' },
          { key: 'contact', label: 'Contact' },
          { key: 'status', label: 'Status' },
          { key: 'actions', label: '', className: 'w-24' },
        ]}
        isLoading={isLoading}
        isEmpty={!isLoading && points.length === 0}
        emptyIcon={<MapPin size={24} className="text-surface-400" />}
        emptyTitle="No collection points yet"
        emptyDescription="Run the importer to load a transport line's published branches, or add one by hand."
        pagination={{
          currentPage,
          totalItems,
          itemsPerPage,
          onPageChange: setCurrentPage,
          onItemsPerPageChange: (size) => { setItemsPerPage(size); setCurrentPage(1); },
        }}
      >
        {points.map((p) => (
          <tr key={p.id} className="border-b border-surface-50 dark:border-surface-850 last:border-0 hover:bg-surface-50/50 dark:hover:bg-surface-850/50 transition-colors">
            <td className="px-5 py-3">
              <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100">{p.name}</p>
              {p.address && <p className="text-caption text-surface-400 truncate max-w-xs">{p.address}</p>}
            </td>
            <td className="px-5 py-3 text-caption text-surface-600 dark:text-surface-300">{serviceName(p)}</td>
            <td className="px-5 py-3">
              <p className="text-body-sm text-surface-700 dark:text-surface-300">{p.city}</p>
              <p className="text-caption text-surface-400 tabular-nums">{p.pincode || '—'}</p>
            </td>
            <td className="px-5 py-3">
              <p className="text-caption text-surface-600 dark:text-surface-300 tabular-nums">{p.phone || '—'}</p>
              {p.contactPerson && <p className="text-caption text-surface-400">{p.contactPerson}</p>}
            </td>
            <td className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-1">
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                    p.isActive !== false
                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                      : 'text-surface-400 bg-surface-500/10',
                  )}
                >
                  {p.isActive !== false ? 'Active' : 'Off'}
                </span>
                {/* Worth surfacing: an edited row is protected from re-import. */}
                {p.editedByAdmin && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10">
                    edited
                  </span>
                )}
              </div>
            </td>
            <td className="px-5 py-3">
              <div className="flex items-center justify-end gap-1">
                <button onClick={() => openEdit(p)} title="Edit" className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10">
                  <Pencil size={15} />
                </button>
                <button onClick={() => setDeleteTarget(p)} title="Remove" className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10">
                  <Trash2 size={15} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        title="Import collection points"
        entityLabel="offices"
        templates={[{ label: 'Blank template', download: downloadDropPointTemplate }]}
        matchHint="Matched on transport line, office name and pincode — offices already listed are updated, new ones added. Offices you have edited here are left as they are."
        controlsKey={importService}
        controls={
          <label className="block">
            <span className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">
              Transport line
            </span>
            <Select
              value={importService}
              onChange={setImportService}
              options={services.map((s) => ({ value: s.slug, label: s.name }))}
              placeholder="Take it from the file…"
              size="md"
            />
            {/* A fallback, not an override. A sheet with its own Transport Line
                column still wins per row, so one file can carry several lines;
                this covers the ordinary case of a list from one company with no
                column saying whose it is. */}
            <span className="block mt-1.5 text-caption text-surface-400">
              Used for rows that do not name a line themselves. A line the file names that this shop does not have
              yet is added for you.
            </span>
          </label>
        }
        onImport={async (file, dryRun) => {
          const result = await importDropPointsFile(file, dryRun, importService || undefined);
          const names = (result.newLines ?? []).map((l) => l.name);
          if (!names.length) return result;
          // Said up front on the preview: a line created by mistake — a town in
          // the Transport Line column — should be caught before it is written.
          const notice = `${dryRun ? 'New transport lines that will be added' : 'New transport lines added'}: ${names.join(', ')}`;
          return { ...result, notices: [notice] };
        }}
        onImported={() => {
          setNotice('Collection points imported.');
          void load();
          // The import may have added lines the filter and form need to list.
          void reloadServices().catch(() => {});
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        variant="danger"
        title={`Remove ${deleteTarget?.name ?? ''}?`}
        description="Orders already sent to this office keep their own copy of the address, so removing it changes nothing about them — it only stops being offered at checkout."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </ListPageShell>
  );
}

function DropPointForm({
  draft,
  services,
  editing,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  services: ParcelServiceSummary[];
  editing: boolean;
  saving: boolean;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });

  return (
    <div className="rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-body-lg text-surface-900 dark:text-surface-50">
          {editing ? 'Edit collection point' : 'Add a collection point'}
        </h3>
        <button onClick={onCancel} className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 dark:hover:text-surface-200">
          <X size={16} />
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <label className="block">
          <span className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">Transport line *</span>
          <Select
            value={draft.parcelService}
            onChange={(v) => set('parcelService', v)}
            options={services.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Choose a line…"
            size="md"
          />
          {services.length === 0 && (
            <span className="block mt-1.5 text-caption text-amber-600 dark:text-amber-400">
              No transport lines yet — add one under Transport lines first.
            </span>
          )}
        </label>
        <Field label="Office name *" value={draft.name} onChange={(v) => set('name', v)} placeholder="Madurai Mattuthavani" />
        <Field label="Phone" value={draft.phone} onChange={(v) => set('phone', v)} placeholder="Branch number" />
        <Field
          label="Address"
          value={draft.address}
          onChange={(v) => set('address', v)}
          placeholder="Shop no, street"
          className="sm:col-span-2"
        />
        <Field label="Area" value={draft.area} onChange={(v) => set('area', v)} placeholder="Bypass Road" />
        <Field label="City *" value={draft.city} onChange={(v) => set('city', v)} placeholder="Madurai" />
        <Field label="District" value={draft.district} onChange={(v) => set('district', v)} placeholder="Madurai" />
        <Field label="State" value={draft.state} onChange={(v) => set('state', v)} placeholder="Tamil Nadu" />
        <Field label="Pincode" value={draft.pincode} onChange={(v) => set('pincode', v)} placeholder="625007" />
        {/* The name the customer asks for at the counter. These offices run on
            people, not ticket numbers. */}
        <Field label="Ask for" value={draft.contactPerson} onChange={(v) => set('contactPerson', v)} placeholder="Ramesh" />
        <Field label="Landmark" value={draft.landmark} onChange={(v) => set('landmark', v)} placeholder="Opposite bus stand" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
            className="h-4 w-4 rounded accent-brand-500"
          />
          <span className="text-body-sm text-surface-700 dark:text-surface-300">Offer this office at checkout</span>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-body-sm font-medium text-surface-500 hover:text-surface-800 dark:hover:text-surface-200">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-brand-500 text-white font-semibold text-body-sm hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add point'}
          </button>
        </div>
      </div>

      {editing && (
        <p className="mt-3 text-[11px] text-surface-400">
          Saving marks this point as edited, so a later import of the line's published list will leave your
          changes alone.
        </p>
      )}
    </div>
  );
}

const TRACKING_LABEL: Record<ParcelServiceSummary['trackingMode'], string> = {
  auto: 'Live tracking',
  deeplink: 'Tracking page',
  manual: 'Updates typed by shop',
};

const emptyLine = { name: '', phone: '', trackUrl: '' };

/**
 * The transport lines the shop ships on.
 *
 * Until this panel a line could only be added by a developer running a script,
 * so a new shop had none — and every collection point it tried to import was
 * refused for naming a line that did not exist. The key a line is matched on
 * (its slug) is made from the name once and never changes, so renaming a line
 * never breaks a sheet or the tracking that depends on it.
 */
function TransportLinesPanel({
  services,
  onChanged,
  onNotice,
  onClose,
}: {
  services: ParcelServiceSummary[];
  onChanged: () => Promise<void>;
  onNotice: (text: string) => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(emptyLine);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState(emptyLine);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ParcelServiceSummary | null>(null);

  /** One change at a time; the list behind is re-read after each. */
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setErr('');
    // The last success message must not sit beside this action's error.
    onNotice('');
    try {
      const done = await action();
      await onChanged();
      onNotice(done);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That could not be saved. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addLine = async () => {
    if (!adding.name.trim()) {
      setErr('Give the transport line a name.');
      return;
    }
    const ok = await run(async () => {
      await createParcelService(adding);
      return `${adding.name.trim()} added.`;
    });
    if (ok) setAdding(emptyLine);
  };

  const saveEdit = async (line: ParcelServiceSummary) => {
    const ok = await run(async () => {
      await updateParcelService(line.id, edit);
      return `${edit.name.trim() || line.name} updated.`;
    });
    if (ok) setEditingId(null);
  };

  const addStandard = () =>
    void run(async () => {
      const added = await addStandardParcelServices();
      return added ? `${added} standard transport line${added === 1 ? '' : 's'} added.` : 'All the standard lines are already here.';
    });

  const smallInput =
    'w-full px-2.5 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-caption text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

  return (
    <div className="rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-display font-semibold text-body-lg text-surface-900 dark:text-surface-50">Transport lines</h3>
          <p className="text-caption text-surface-400 mt-0.5">
            The parcel services you ship on. Every collection point belongs to one, and an import matches its Transport
            Line column to these.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {services.length > 0 && (
            <button
              onClick={addStandard}
              disabled={busy}
              className="h-8 px-3 rounded-lg border border-surface-200 dark:border-surface-700 text-caption font-semibold text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50"
            >
              Add missing standard lines
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 dark:hover:text-surface-200">
            <X size={16} />
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium">
          {err}
        </div>
      )}

      {services.length === 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 p-4 rounded-xl bg-brand-500/5 border border-brand-500/20">
          <div className="flex-1 min-w-[220px]">
            <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">No transport lines yet</p>
            <p className="text-caption text-surface-500 mt-0.5">
              Add the common Sivakasi lines — A1, Mettur, ABT, KPN, ARC and more — in one click. You can rename or
              switch off any of them afterwards.
            </p>
          </div>
          <button
            onClick={addStandard}
            disabled={busy}
            className="h-9 px-4 rounded-xl bg-brand-500 text-white text-caption font-semibold hover:bg-brand-600 disabled:opacity-50"
          >
            Add the standard lines
          </button>
        </div>
      ) : (
        <div className="mb-4 overflow-x-auto rounded-xl border border-surface-100 dark:border-surface-800">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="text-label uppercase tracking-wider text-surface-400 bg-surface-50 dark:bg-surface-800/50">
                <th className="text-left font-semibold px-4 py-2">Line</th>
                <th className="text-left font-semibold px-3 py-2">Phone</th>
                <th className="text-left font-semibold px-3 py-2">Tracking</th>
                <th className="text-left font-semibold px-3 py-2">At checkout</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {services.map((line) =>
                editingId === line.id ? (
                  <tr key={line.id} className="border-t border-surface-100 dark:border-surface-800 bg-surface-50/60 dark:bg-surface-800/30">
                    <td className="px-4 py-2">
                      <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={smallInput} placeholder="Line name" />
                      <p className="mt-1 text-[10px] font-mono text-surface-400">{line.slug}</p>
                    </td>
                    <td className="px-3 py-2">
                      <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className={smallInput} placeholder="Phone" />
                    </td>
                    <td className="px-3 py-2" colSpan={2}>
                      <input value={edit.trackUrl} onChange={(e) => setEdit({ ...edit, trackUrl: e.target.value })} className={smallInput} placeholder="https://… tracking page (optional)" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => void saveEdit(line)} disabled={busy} title="Save" className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50">
                          <Check size={15} />
                        </button>
                        <button onClick={() => setEditingId(null)} title="Cancel" className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-500/10">
                          <X size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={line.id} className="border-t border-surface-100 dark:border-surface-800">
                    <td className="px-4 py-2.5">
                      <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100">{line.name}</p>
                      <p className="text-[10px] font-mono text-surface-400">{line.slug}</p>
                    </td>
                    <td className="px-3 py-2.5 text-caption text-surface-600 dark:text-surface-300 tabular-nums">{line.phone || '—'}</td>
                    <td className="px-3 py-2.5 text-caption text-surface-500">{TRACKING_LABEL[line.trackingMode] ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="w-fit">
                        <Toggle
                          checked={line.isActive !== false}
                          disabled={busy}
                          onChange={(v) =>
                            void run(async () => {
                              await updateParcelService(line.id, { isActive: v });
                              return v ? `${line.name} is offered at checkout again.` : `${line.name} is switched off.`;
                            })
                          }
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingId(line.id);
                            setEdit({ name: line.name, phone: line.phone ?? '', trackUrl: line.trackUrl ?? '' });
                            setErr('');
                          }}
                          title="Edit"
                          className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-500/10"
                        >
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => setDeleteTarget(line)} title="Remove" className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid sm:grid-cols-[1.2fr_1fr_1.4fr_auto] gap-3 items-end">
        <Field label="New line name *" value={adding.name} onChange={(v) => setAdding({ ...adding, name: v })} placeholder="e.g. Sri Murugan Transport" />
        <Field label="Phone" value={adding.phone} onChange={(v) => setAdding({ ...adding, phone: v })} placeholder="Booking office number" />
        <Field label="Tracking page" value={adding.trackUrl} onChange={(v) => setAdding({ ...adding, trackUrl: v })} placeholder="https://… (optional)" />
        <button
          onClick={() => void addLine()}
          disabled={busy}
          className="h-[42px] px-4 rounded-xl bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Plus size={15} /> Add line
        </button>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        variant="danger"
        title={`Remove ${deleteTarget?.name ?? ''}?`}
        description="Only a line with no collection points can be removed. To stop offering a line that has points, switch it off instead. Past orders keep the line's name either way."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) {
            void run(async () => {
              await deleteParcelService(target.id);
              return `${target.name} removed.`;
            });
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass} />
    </label>
  );
}
