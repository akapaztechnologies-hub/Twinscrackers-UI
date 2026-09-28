import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  ShieldHalf,
  ShieldCheck,
  Lock,
  Users,
} from 'lucide-react';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog.tsx';
import { RoleFormDrawer } from '@/components/admin/RoleFormDrawer.tsx';
import { ScreenAccessMatrix } from '@/components/admin/ScreenAccessMatrix.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState.tsx';
import {
  getRoles,
  getScreenCatalogue,
  updateRolePermissions,
  deleteRole,
  toPermissions,
} from '@/services/rbac.ts';
import { useAuthStore } from '@/store/auth.ts';
import type { AdminRole, ScreenCatalogue } from '@/types/admin.ts';

/**
 * Roles & Access.
 *
 * Two panes: the roles the owner has created on the left, and the selected
 * role's screen access on the right. Picking a role and flipping switches is the
 * whole interaction — the switches are the same Admin Portal screens that appear
 * in the sidebar, so what is granted here is what that role's employees see.
 */
export function AdminRolesPage() {
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin);
  const refreshCurrentUser = useAuthStore((s) => s.setUser);

  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [catalogue, setCatalogue] = useState<ScreenCatalogue | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Draft state for the matrix, so Save is an explicit act and Cancel is free.
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editRoleId, setEditRoleId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRole | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  );

  const loadRoles = useCallback(
    async (selectId?: string) => {
      try {
        const list = await getRoles();
        setRoles(list);
        setError('');
        // Keep the current selection if it still exists, else fall back.
        setSelectedId((prev) => {
          const wanted = selectId ?? prev;
          if (wanted && list.some((r) => r.id === wanted)) return wanted;
          return list[0]?.id ?? null;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load roles');
        setRoles([]);
      }
    },
    [],
  );

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const [cat] = await Promise.all([getScreenCatalogue(), loadRoles()]);
        setCatalogue(cat);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load screens');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadRoles]);

  // Reset the draft whenever the selected role changes, so switching roles never
  // carries unsaved switches across to another role.
  useEffect(() => {
    setDraft(new Set(selected?.permissions.map((p) => p.screen) ?? []));
    setSavedAt(0);
  }, [selected]);

  const savedKeys = useMemo(
    () => new Set(selected?.permissions.map((p) => p.screen) ?? []),
    [selected],
  );

  const isDirty = useMemo(() => {
    if (draft.size !== savedKeys.size) return true;
    for (const key of draft) if (!savedKeys.has(key)) return true;
    return false;
  }, [draft, savedKeys]);

  const readOnly = !!selected?.isSystem;

  const handleSavePermissions = async () => {
    if (!selected) return;
    setIsSaving(true);
    setError('');
    try {
      await updateRolePermissions(selected.id, toPermissions(draft));
      await loadRoles(selected.id);
      setSavedAt(Date.now());

      /*
       * The signed-in user may hold the role they just edited, so their own
       * sidebar is now stale. Re-reading /auth/me is cheaper and more honest
       * than guessing which screens changed for them.
       */
      const { getMe } = await import('@/services/auth.ts');
      refreshCurrentUser(await getMe());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save screen access');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteRole(deleteTarget.id);
      setDeleteTarget(null);
      await loadRoles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete role');
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <ListPageShell
      header={
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <h1 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
                Roles &amp; Access
              </h1>
              <p className="text-body-sm text-surface-500 dark:text-surface-400">
                Create a role, then choose which Admin Portal screens it can open
              </p>
            </div>
            <div className="ml-auto">
              <button
                onClick={() => {
                  setEditRoleId(null);
                  setIsDrawerOpen(true);
                }}
                disabled={!isSuperAdmin && roles.length === 0}
                className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Plus size={15} />
                New Role
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
              {error}
            </div>
          )}
        </>
      }
    >
      {roles.length === 0 ? (
        <AdminEmptyState
          icon={<ShieldHalf size={24} className="text-surface-400" />}
          title="No roles yet"
          description="Create a role such as Cashier or Stock Manager, then pick the screens it can open."
          actionLabel="New Role"
          onAction={() => {
            setEditRoleId(null);
            setIsDrawerOpen(true);
          }}
        />
      ) : (
        <div className="flex flex-col md:flex-row gap-6 p-1">
          {/* Role rail */}
          <div className="md:w-64 shrink-0 space-y-1.5">
            {roles.map((role) => {
              const isActiveRole = role.id === selectedId;
              return (
                <button
                  key={role.id}
                  onClick={() => setSelectedId(role.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                    isActiveRole
                      ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      : 'hover:bg-surface-100 dark:hover:bg-surface-850 text-surface-700 dark:text-surface-300'
                  } ${role.isActive ? '' : 'opacity-60'}`}
                >
                  <div className="flex items-center gap-2">
                    {role.isSuperAdmin ? <ShieldCheck size={15} /> : <ShieldHalf size={15} />}
                    <span className="text-body-sm font-medium truncate">{role.name}</span>
                    {role.isSystem && <Lock size={12} className="text-surface-400 shrink-0" />}
                  </div>
                  <p className="text-caption text-surface-500 dark:text-surface-400 mt-0.5">
                    {role.isSuperAdmin
                      ? 'Every screen'
                      : `${role.permissions.length} screen${role.permissions.length === 1 ? '' : 's'}`}
                    {' · '}
                    {role.employeeCount} employee{role.employeeCount === 1 ? '' : 's'}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Screen access for the selected role */}
          <div className="flex-1 min-w-0">
            {selected && catalogue && (
              <>
                <div className="flex flex-wrap items-start gap-3 mb-5">
                  <div className="min-w-0">
                    <h2 className="font-display font-semibold text-heading-sm text-surface-900 dark:text-surface-50 flex items-center gap-2">
                      {selected.name}
                      {!selected.isActive && (
                        <span className="px-2 py-0.5 rounded-lg bg-surface-200 dark:bg-surface-800 text-surface-500 text-caption font-medium">
                          Inactive
                        </span>
                      )}
                    </h2>
                    <p className="text-body-sm text-surface-500 dark:text-surface-400">
                      {selected.description || 'No description'}
                    </p>
                    {selected.employeeCount > 0 && (
                      <p className="text-caption text-surface-400 mt-1 flex items-center gap-1.5">
                        <Users size={12} />
                        Changes apply immediately to {selected.employeeCount} employee
                        {selected.employeeCount === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    {savedAt > 0 && !isDirty && (
                      <span className="text-caption text-green-600 dark:text-green-400 font-medium">
                        Saved
                      </span>
                    )}
                    {!selected.isSystem && (
                      <>
                        <button
                          onClick={() => {
                            setEditRoleId(selected.id);
                            setIsDrawerOpen(true);
                          }}
                          className="flex items-center justify-center w-9 h-9 rounded-lg text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                          aria-label={`Edit ${selected.name}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(selected)}
                          className="flex items-center justify-center w-9 h-9 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                          aria-label={`Delete ${selected.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={handleSavePermissions}
                      disabled={!isDirty || isSaving || readOnly}
                      className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
                    >
                      <Save size={15} />
                      {isSaving ? 'Saving...' : 'Save Access'}
                    </button>
                  </div>
                </div>

                {readOnly && (
                  <div className="mb-5 p-3 rounded-xl bg-surface-100 dark:bg-surface-850 text-surface-600 dark:text-surface-400 text-body-sm flex items-center gap-2">
                    <Lock size={15} className="shrink-0" />
                    {selected.isSuperAdmin
                      ? 'Super Admin always has every screen. It is built in so there is always a full-access role to assign.'
                      : 'This is a built-in role and cannot be changed.'}
                  </div>
                )}

                <ScreenAccessMatrix
                  catalogue={catalogue}
                  enabled={selected.isSuperAdmin ? new Set(catalogue.screens.map((s) => s.key)) : draft}
                  onChange={setDraft}
                  readOnly={readOnly}
                />
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete role?"
        description={
          deleteTarget?.employeeCount
            ? `${deleteTarget.name} is assigned to ${deleteTarget.employeeCount} employee(s). Reassign them first — this will be refused otherwise.`
            : `${deleteTarget?.name ?? 'This role'} will be removed permanently.`
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <RoleFormDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        roleId={editRoleId}
        onSuccess={(id) => loadRoles(id)}
      />
    </ListPageShell>
  );
}
