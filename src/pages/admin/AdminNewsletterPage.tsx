import { useState, useEffect, useCallback } from 'react';
import { Mail, Search, Trash2, Download, Loader2 } from 'lucide-react';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { ErrorNotice, errorText } from '@/components/admin/AdminShared.tsx';
import { cn } from '@/lib/utils.ts';
import api from '@/lib/api.ts';
import type { AxiosResponse } from 'axios';

interface Subscriber {
  _id: string;
  email: string;
  status: 'active' | 'unsubscribed';
  source: string;
  createdAt: string;
  unsubscribedAt?: string;
}

const TABS = [
  { key: 'active', label: 'Subscribed' },
  { key: 'unsubscribed', label: 'Left' },
  { key: 'all', label: 'All' },
] as const;

/**
 * Who has asked to hear about offers.
 *
 * The shop does not send the mail from here — it exports the list into whatever
 * it already uses. Building a campaign sender would be a second product; what
 * was actually missing was the addresses, which the footer form used to throw
 * away.
 */
export function AdminNewsletterPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('active');
  const [rows, setRows] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(0);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [debounced, tab]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result: Record<string, unknown> = await api.get('/admin/newsletter', {
        params: { status: tab, search: debounced, page, limit: perPage },
      });
      setRows((result.data as Subscriber[]) ?? []);
      setTotal((result.total as number) ?? 0);
      setActive((result.active as number) ?? 0);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [tab, debounced, page, perPage]);

  useEffect(() => { void load(); }, [load]);

  const handleExport = async () => {
    setIsExporting(true);
    setActionError('');
    try {
      // `rawResponse`: the client otherwise unwraps `{ data: … }` JSON, and a
      // file has no such wrapper — the export came back as `undefined` and
      // nothing ever downloaded.
      const res: AxiosResponse<Blob> = await api.get('/admin/newsletter/export', {
        responseType: 'blob',
        rawResponse: true,
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setActionError(errorText(err, 'The list could not be exported. Please try again.'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setActionError('');
    try {
      await api.delete(`/admin/newsletter/${deleteTarget}`);
      await load();
    } catch (err) {
      setActionError(errorText(err, 'That address could not be removed. Please try again.'));
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <ListPageShell
      header={
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
          <div className="flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-3 h-9 rounded-lg text-[13px] font-medium transition-colors',
                  tab === t.key
                    ? 'bg-brand-500 text-white'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <span className="text-caption text-surface-500">
            {active.toLocaleString('en-IN')} subscribed
          </span>

          <div className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              placeholder="Search email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
            />
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 disabled:opacity-60 transition-colors"
          >
            {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Export
          </button>
          {actionError && (
            <div className="w-full">
              <ErrorNotice message={actionError} onDismiss={() => setActionError('')} />
            </div>
          )}
        </div>
      }
    >
      <DataTable
        columns={[
          { key: 'email', label: 'Email' },
          { key: 'source', label: 'Signed Up From' },
          { key: 'date', label: 'Date' },
          { key: 'actions', label: '', className: 'w-16' },
        ]}
        isLoading={isLoading}
        isEmpty={rows.length === 0}
        emptyIcon={<Mail size={24} className="text-surface-400" />}
        emptyTitle="Nobody on the list yet"
        emptyDescription="Addresses from the newsletter form on the storefront appear here."
        pagination={{
          currentPage: page,
          totalItems: total,
          itemsPerPage: perPage,
          onPageChange: setPage,
          onItemsPerPageChange: (size) => { setPerPage(size); setPage(1); },
        }}
      >
        {rows.map((row) => (
          <tr key={row._id}>
            <td className="px-5 py-3.5">
              <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100">{row.email}</p>
              {row.status === 'unsubscribed' && (
                <span className="text-caption text-red-600 dark:text-red-400">
                  Left{row.unsubscribedAt ? ` on ${new Date(row.unsubscribedAt).toLocaleDateString('en-IN')}` : ''}
                </span>
              )}
            </td>
            <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400 capitalize">
              {row.source}
            </td>
            <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400">
              {new Date(row.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </td>
            <td className="px-5 py-3.5">
              <button
                onClick={() => setDeleteTarget(row._id)}
                className="p-1.5 rounded-lg text-surface-400 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                title="Remove from the list"
              >
                <Trash2 size={16} />
              </button>
            </td>
          </tr>
        ))}
      </DataTable>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove subscriber"
        description="This erases the record entirely, including the proof that they asked to be mailed. Prefer this only when someone asks to be forgotten."
        confirmLabel="Remove"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </ListPageShell>
  );
}
