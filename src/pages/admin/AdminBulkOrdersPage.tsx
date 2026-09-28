import { useState } from 'react';
import { Search, Package, Inbox, PhoneCall, Trophy, IndianRupee, RefreshCw } from 'lucide-react';
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
  BULK_STATUSES,
  ENQUIRY_STATUS_LABEL,
  ENQUIRY_EVENT_LABEL,
  ENQUIRY_BUDGET_LABEL,
} from '@/types/admin.ts';
import type { Enquiry } from '@/types/admin.ts';

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;

const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  ...BULK_STATUSES.map((s) => ({ label: ENQUIRY_STATUS_LABEL[s], value: s })),
];

const sortOptions = [
  { label: 'Newest First', value: 'newest' },
  { label: 'Oldest First', value: 'oldest' },
  { label: 'Name (A-Z)', value: 'name-asc' },
  { label: 'Name (Z-A)', value: 'name-desc' },
];

function formatWhen(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * Admin → Bulk Orders.
 *
 * Quote requests from the bulk-order page, run as a pipeline rather than an
 * inbox: these are the shop's largest orders, and the difference between a lead
 * that was quoted and one that was won is worth keeping. Like the contact form,
 * this page previously did not exist because the form silently discarded every
 * enquiry it received.
 */
export function AdminBulkOrdersPage() {
  const q = useEnquiries('bulk');
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
  // Everything the shop has picked up but not yet closed out.
  const inPipeline = (byStatus.contacted ?? 0) + (byStatus.quoted ?? 0);
  const activeFilterCount = (q.statusFilter !== 'all' ? 1 : 0) + (q.sort !== 'newest' ? 1 : 0);

  return (
    <ListPageShell
      header={
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="New Enquiries"
              value={String(byStatus.new ?? 0)}
              icon={Inbox}
              color="text-blue-600 bg-blue-500/10"
              isLoading={!q.stats}
            />
            <KPICard
              label="In Pipeline"
              value={String(inPipeline)}
              icon={PhoneCall}
              color="text-cyan-600 bg-cyan-500/10"
              isLoading={!q.stats}
            />
            <KPICard
              label="Won"
              value={String(byStatus.won ?? 0)}
              icon={Trophy}
              color="text-green-600 bg-green-500/10"
              isLoading={!q.stats}
            />
            <KPICard
              label="Value Won"
              value={inr(q.stats?.wonValue ?? 0)}
              icon={IndianRupee}
              color="text-brand-600 bg-brand-500/10"
              isLoading={!q.stats}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search name, company, email, phone..."
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
          { key: 'customer', label: 'Customer' },
          { key: 'company', label: 'Company / Event' },
          { key: 'event', label: 'Event Type' },
          { key: 'budget', label: 'Budget', className: 'text-right' },
          { key: 'quoted', label: 'Quoted', className: 'text-right' },
          { key: 'status', label: 'Status' },
          { key: 'received', label: 'Received', className: 'text-right' },
        ]}
        isLoading={q.isLoading}
        isEmpty={q.rows.length === 0}
        emptyIcon={<Package size={24} className="text-surface-400" />}
        emptyTitle="No bulk enquiries found"
        emptyDescription={
          q.hasActiveNarrowing
            ? 'Try adjusting your search or filters'
            : 'Quote requests from your bulk orders page will appear here'
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
                {row.phone || row.email}
              </p>
            </td>
            <td className="px-5 py-3.5">
              <p className="text-body-sm text-surface-600 dark:text-surface-400 truncate max-w-[180px]">
                {row.company || '—'}
              </p>
            </td>
            <td className="px-5 py-3.5 text-body-sm text-surface-600 dark:text-surface-400 whitespace-nowrap">
              {enquiryLabel(ENQUIRY_EVENT_LABEL, row.eventType) || '—'}
            </td>
            <td className="px-5 py-3.5 text-right text-body-sm text-surface-500 whitespace-nowrap">
              {enquiryLabel(ENQUIRY_BUDGET_LABEL, row.budget) || '—'}
            </td>
            <td className="px-5 py-3.5 text-right text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums whitespace-nowrap">
              {row.quotedAmount > 0 ? inr(row.quotedAmount) : '—'}
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
        title="Delete Enquiry"
        description="This permanently removes the enquiry, including the quote and any notes on it. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </ListPageShell>
  );
}
