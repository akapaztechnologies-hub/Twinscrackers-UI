import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, UserCog, UserCheck, UserX, ShieldHalf } from 'lucide-react';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { FilterPanel, FilterButton } from '@/components/admin/FilterPanel.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { EmployeeFormDrawer } from '@/components/admin/EmployeeFormDrawer.tsx';
import {
  getEmployees,
  getEmployeeStats,
  toggleEmployeeStatus,
  deleteEmployee,
  type EmployeeStats,
} from '@/services/employees.ts';
import { getRoles } from '@/services/rbac.ts';
import { useAuthStore, useCan } from '@/store/auth.ts';
import type { AdminRole, Employee } from '@/types/admin.ts';

const EMPTY_STATS: EmployeeStats = { total: 0, active: 0, inactive: 0, roles: 0 };

export function AdminEmployeesPage() {
  const currentUserId = useAuthStore((s) => s.user?.uid);
  const can = useCan();
  // Someone may manage employees without being allowed to edit roles, so the
  // shortcuts into Roles & Access only appear when they lead somewhere.
  const canManageRoles = can('roles');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [stats, setStats] = useState<EmployeeStats>(EMPTY_STATS);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);

  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editEmployeeId, setEditEmployeeId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Filtering and paging are server-side here — a staff list is small, but the
  // backend already scopes it to staff and the same endpoint enforces access.
  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    try {
      const [result, summary] = await Promise.all([
        getEmployees({
          search: debouncedSearch || undefined,
          roleId: roleFilter !== 'all' ? roleFilter : undefined,
          status: statusFilter !== 'all' ? (statusFilter as 'active' | 'inactive') : undefined,
          sort: sortBy,
          page: currentPage,
          limit: itemsPerPage,
        }),
        getEmployeeStats(),
      ]);
      setEmployees(result.data);
      setTotalItems(result.total);
      setStats(summary);
      setError('');
    } catch (err) {
      setEmployees([]);
      setTotalItems(0);
      setError(err instanceof Error ? err.message : 'Failed to load employees');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, roleFilter, statusFilter, sortBy, currentPage, itemsPerPage]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, roleFilter, statusFilter, sortBy]);

  // The role list feeds the filter dropdown; the drawer loads its own copy.
  useEffect(() => {
    getRoles()
      .then(setRoles)
      .catch(() => setRoles([]));
  }, []);

  const openCreate = () => {
    setEditEmployeeId(null);
    setIsDrawerOpen(true);
  };

  const openEdit = (id: string) => {
    setEditEmployeeId(id);
    setIsDrawerOpen(true);
  };

  const handleToggleStatus = async (employee: Employee) => {
    try {
      await toggleEmployeeStatus(employee.id, !employee.isActive);
      fetchEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteEmployee(deleteTarget.id);
      setDeleteTarget(null);
      fetchEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete employee');
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const hasActiveNarrowing = !!search || roleFilter !== 'all' || statusFilter !== 'all';
  const activeFilterCount =
    (roleFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);

  return (
    <ListPageShell
      header={
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard label="Employees" value={String(stats.total)} icon={UserCog} color="text-blue-600 bg-blue-500/10" isLoading={isLoading} />
            <KPICard label="Active" value={String(stats.active)} icon={UserCheck} color="text-green-600 bg-green-500/10" isLoading={isLoading} />
            <KPICard label="Inactive" value={String(stats.inactive)} icon={UserX} color="text-red-600 bg-red-500/10" isLoading={isLoading} />
            <KPICard label="Roles" value={String(stats.roles)} icon={ShieldHalf} color="text-violet-600 bg-violet-500/10" href={canManageRoles ? '/admin/roles' : undefined} isLoading={isLoading} />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
              {error}
            </div>
          )}

          {/* Toolbar: Search + Add */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40 transition-all"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <FilterButton activeCount={activeFilterCount} open={showFilters} onClick={() => setShowFilters((v) => !v)} />
              {canManageRoles && (
                <Link
                  to="/admin/roles"
                  className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors"
                >
                  <ShieldHalf size={15} />
                  Manage Roles
                </Link>
              )}
              <button
                onClick={openCreate}
                className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Plus size={15} />
                Add Employee
              </button>
            </div>
          </div>

          <FilterPanel
            open={showFilters}
            onClearAll={() => {
              setRoleFilter('all');
              setStatusFilter('all');
              setSortBy('newest');
            }}
            filters={[
              {
                id: 'role',
                label: 'Role',
                value: roleFilter,
                options: [
                  { label: 'All Roles', value: 'all' },
                  ...roles.map((r) => ({ label: r.name, value: r.id })),
                ],
                onChange: setRoleFilter,
              },
              {
                id: 'status',
                label: 'Status',
                value: statusFilter,
                options: [
                  { label: 'All Statuses', value: 'all' },
                  { label: 'Active', value: 'active' },
                  { label: 'Inactive', value: 'inactive' },
                ],
                onChange: setStatusFilter,
              },
              {
                id: 'sort',
                label: 'Sort By',
                value: sortBy,
                options: [
                  { label: 'Newest first', value: 'newest' },
                  { label: 'Oldest first', value: 'oldest' },
                  { label: 'Name A–Z', value: 'name-asc' },
                  { label: 'Name Z–A', value: 'name-desc' },
                ],
                onChange: setSortBy,
              },
            ]}
          />
        </>
      }
    >
      <DataTable
        columns={[
          { key: 'employee', label: 'Employee' },
          { key: 'code', label: 'Code' },
          { key: 'designation', label: 'Designation' },
          { key: 'role', label: 'Role' },
          { key: 'status', label: 'Status' },
          { key: 'actions', label: '', className: 'w-20' },
        ]}
        isLoading={isLoading}
        isEmpty={employees.length === 0}
        emptyIcon={<UserCog size={24} className="text-surface-400" />}
        emptyTitle="No employees found"
        emptyDescription={
          hasActiveNarrowing
            ? 'Try adjusting your search or filters'
            : 'Add your first employee and give them a role'
        }
        emptyActionLabel={!hasActiveNarrowing ? 'Add Employee' : undefined}
        onEmptyAction={openCreate}
        pagination={{
          currentPage,
          totalItems,
          itemsPerPage,
          onPageChange: setCurrentPage,
          onItemsPerPageChange: (size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          },
        }}
      >
        {employees.map((e) => {
          // The backend refuses self-deactivation and self-deletion; hiding the
          // buttons means nobody has to discover that from an error message.
          const isSelf = e.id === currentUserId;
          return (
            <tr
              key={e.id}
              onClick={() => openEdit(e.id)}
              className={`border-b border-surface-100 dark:border-surface-800 last:border-0 hover:bg-surface-50 dark:hover:bg-surface-850 cursor-pointer transition-colors ${e.isActive ? '' : 'opacity-60'}`}
            >
              <td className="px-4 py-3">
                <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100">
                  {e.displayName}
                  {isSelf && <span className="text-caption text-surface-400 font-normal"> (you)</span>}
                </p>
                <p className="text-caption text-surface-500">{e.email}</p>
              </td>
              <td className="px-4 py-3 text-body-sm text-surface-600 dark:text-surface-400">
                {e.employeeCode || '—'}
              </td>
              <td className="px-4 py-3 text-body-sm text-surface-600 dark:text-surface-400">
                {e.designation || '—'}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 text-caption font-medium">
                  <ShieldHalf size={12} />
                  {e.roleName || '—'}
                </span>
              </td>
              <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                <button
                  onClick={() => !isSelf && handleToggleStatus(e)}
                  disabled={isSelf}
                  className={`px-2 py-1 rounded-lg text-caption font-medium transition-colors disabled:cursor-not-allowed ${
                    e.isActive
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20'
                      : 'bg-surface-200 dark:bg-surface-800 text-surface-500 hover:bg-surface-300 dark:hover:bg-surface-700'
                  }`}
                  title={isSelf ? 'You cannot change your own status' : 'Click to toggle'}
                >
                  {e.isActive ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(e.id)}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                    aria-label={`Edit ${e.displayName}`}
                  >
                    <Pencil size={15} />
                  </button>
                  {!isSelf && (
                    <button
                      onClick={() => setDeleteTarget(e)}
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                      aria-label={`Delete ${e.displayName}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </DataTable>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete employee?"
        description={`${deleteTarget?.displayName ?? 'This employee'} will lose access immediately and their account will be removed. Deactivate instead if they might come back.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <EmployeeFormDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        employeeId={editEmployeeId}
        onSuccess={fetchEmployees}
      />
    </ListPageShell>
  );
}
