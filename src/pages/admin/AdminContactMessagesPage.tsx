import { useState } from 'react';
import { Search, Mail, Inbox, MailOpen, CheckCircle2, CalendarDays, RefreshCw } from 'lucide-react';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { StatusBadge } from '@/components/admin/StatusBadge.tsx';
import { EnquiryDetailDrawer } from '@/components/admin/EnquiryDetailDrawer.tsx';
import { useEnquiries } from '@/hooks/useEnquiries.ts';
import { enquiryLabel } from '@/services/enquiries.ts';
import {
  CONTACT_STATUSES,
  ENQUIRY_STATUS_LABEL,
  ENQUIRY_SUBJECT_LABEL,
} from '@/types/admin.ts';
import type { Enquiry } from '@/types/admin.ts';

const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  ...CONTACT_STATUSES.map((s) => ({ label: ENQUIRY_STATUS_LABEL[s], value: s })),
];

const sortOptions = [
  { label: 'Newest First', value: 'newest' },
  { label: 'Oldest First', value: 'oldest' },
  { label: 'Name (A-Z)', value: 'name-asc' },
  { label: 'Name (Z-A)', value: 'name-desc' },
];

/** Short, scannable timestamp — the table has a column, not a paragraph. */
function formatWhen(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * Admin → Contact Messages.
 *
 * Everything sent through the contact form on the storefront. Before this the
 * form only pretended to send: it flipped to a "Message Sent!" panel and threw
 * the message away, so every enquiry since the site went live was lost.
 */
export function AdminContactMessagesPage() {
  const q = useEnquiries('contact');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Enquiry | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const open = (enquiry: Enquiry) => {
    setSelected(enquiry);
    setIsDrawerOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await q.remove(deleteTarget);
      setIsDrawerOpen(false);
    } catch {
      /* the row stays; the list is still correct */
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const byStatus = q.stats?.byStatus ?? {};
  const activeFilterCount = (q.statusFilter !== 'all' ? 1 : 0) + (q.sort !== 'newest' ? 1 : 0);

  return (
    <ListPageShell
      header={
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Unread"
              value={String(byStatus.new ?? 0)}
              icon={Inbox}
              color="text-blue-600 bg-blue-500/10"
              isLoading={!q.stats}
            />
            <KPICard
              label="In Progress"
              value={String(byStatus.in_progress ?? 0)}
              icon={MailOpen}
              color="text-cyan-600 bg-cyan-500/10"
              isLoading={!q.stats}
            />
            <KPICard
              label="Resolved"
              value={String(byStatus.resolved ?? 0)}
              icon={CheckCircle2}
              color="text-green-600 bg-green-500/10"
              isLoading={!q.stats}
            />
            <KPICard
              label="This Week"
              value={String(q.stats?.thisWeek ?? 0)}
              icon={CalendarDays}
              color="text-violet-600 bg-violet-500/10"
              isLoading={!q.stats}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search name, email, phone, message..."
                value={q.search}
                onChange={(e) => q.setSearch(e.target.value)}
                className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <FilterButton
                activeCount={activeFilterCount}
                open={showFilters}
                onClick={() => setShowFilters((v) => !v)}
              />
              <button
                onClick={q.refresh}
                className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] font-medium text-surface-600 dark:text-surface-300 hover:border-surface-300 dark:hover:border-surface-600 transition-colors"
              >
                <RefreshCw size={14} className={q.isLoading ? 'animate-spin' : undefined} />
                Refresh
              </button>
            </div>
          </div>

          <FilterPanel
            open={showFilters}
            onClearAll={() => {
              q.setStatusFilter('all');
              q.setSort('newest');
            }}
            filters={[
              { id: 'status', label: 'Status', value: q.statusFilter, options: statusOptions, onChange: q.setStatusFilter },
              { id: 'sort', label: 'Sort By', value: q.sort, options: sortOptions, onChange: q.setSort },
            ]}
          />

          {q.error && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-body-sm text-red-700 dark:text-red-300">
              {q.error}
            </div>
          )}
        </>
      }
    >
      <DataTable
        columns={[
          { key: 'from', label: 'From' },
          { key: 'subject', label: 'Subject' },
          { key: 'message', label: 'Message' },
          { key: 'status', label: 'Status' },
          { key: 'received', label: 'Received', className: 'text-right' },
        ]}
        isLoading={q.isLoading}
        isEmpty={q.rows.length === 0}
        emptyIcon={<Mail size={24} className="text-surface-400" />}
        emptyTitle="No messages found"
        emptyDescription={
          q.hasActiveNarrowing
            ? 'Try adjusting your search or filters'
            : 'Messages sent through the contact form on your website will appear here'
        }
        pagination={{
          currentPage: q.page,
          totalItems: q.total,
          itemsPerPage: q.limit,
          onPageChange: q.setPage,
          onItemsPerPageChange: (size) => {
            q.setLimit(size);
            q.setPage(1);
          },
        }}
      >
        {q.rows.map((row) => (
          <tr
            key={row.id}
            onClick={() => open(row)}
            className="border-b border-surface-50 dark:border-surface-850 last:border-0 hover:bg-surface-50/50 dark:hover:bg-surface-850/50 cursor-pointer transition-colors"
          >
            <td className="px-5 py-3.5">
              <p
                className={
                  row.status === 'new'
                    ? 'text-body-sm font-bold text-surface-900 dark:text-surface-50'
                    : 'text-body-sm font-medium text-surface-700 dark:text-surface-200'
                }
              >
                {row.name || '—'}
              </p>
              <p className="text-caption text-surface-400 truncate max-w-[220px]">
                {row.email}
                {row.phone ? ` · ${row.phone}` : ''}
              </p>
            </td>
            <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400 whitespace-nowrap">
              {enquiryLabel(ENQUIRY_SUBJECT_LABEL, row.subject) || '—'}
            </td>
            <td className="px-5 py-3.5">
              <p className="text-body-sm text-surface-600 dark:text-surface-400 truncate max-w-xs">
                {row.message || '—'}
              </p>
            </td>
            <td className="px-5 py-3.5">
              <StatusBadge status={row.status} type="enquiry" />
            </td>
            <td className="px-5 py-3.5 text-right text-body-sm text-surface-500 tabular-nums whitespace-nowrap">
              {formatWhen(row.createdAt)}
            </td>
          </tr>
        ))}
      </DataTable>

      <EnquiryDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        enquiry={selected}
        onSaved={q.applySaved}
        onRequestDelete={setDeleteTarget}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Message"
        description="This permanently removes the message and everything the visitor wrote. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </ListPageShell>
  );
}
