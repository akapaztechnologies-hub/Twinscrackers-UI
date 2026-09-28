/**
 * Roles and screen access — backed by the admin API (/admin/roles, /admin/rbac).
 * Same shape as every other admin service: `api.*` returns the unwrapped payload
 * and errors arrive as ApiRequestError.
 */
import api from '@/lib/api.ts';
import type { RolePermission, ScreenKey } from '@/config/admin-screens.ts';
import type { AdminRole, AdminRoleInput, ScreenCatalogue } from '@/types/admin.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

/** The list endpoint returns `{ role, employeeCount }`; flatten it for the UI. */
function mapRole(raw: Raw): AdminRole {
  const role: Raw = raw.role ?? raw;
  return {
    id: (role._id || role.id) as string,
    name: (role.name as string) || '',
    description: (role.description as string) || '',
    permissions: (role.permissions as RolePermission[]) || [],
    isSystem: Boolean(role.isSystem),
    isSuperAdmin: Boolean(role.isSuperAdmin),
    isActive: role.isActive !== false,
    employeeCount: Number(raw.employeeCount) || 0,
    createdAt: (role.createdAt as string) || '',
    updatedAt: (role.updatedAt as string) || '',
  };
}

export async function getScreenCatalogue(): Promise<ScreenCatalogue> {
  return api.get('/admin/rbac/screens');
}

export async function getRoles(params: { search?: string; status?: string } = {}): Promise<AdminRole[]> {
  const res: Raw[] = await api.get('/admin/roles', { params });
  return (Array.isArray(res) ? res : []).map(mapRole);
}

export async function getRoleById(id: string): Promise<AdminRole> {
  return mapRole(await api.get(`/admin/roles/${id}`));
}

export async function createRole(input: AdminRoleInput): Promise<AdminRole> {
  return mapRole(await api.post('/admin/roles', input));
}

export async function updateRole(id: string, input: Partial<AdminRoleInput>): Promise<AdminRole> {
  return mapRole(await api.put(`/admin/roles/${id}`, input));
}

/**
 * Save the screen-access matrix. `permissions` is the complete desired state —
 * a screen left out of the array is a screen being revoked.
 */
export async function updateRolePermissions(
  id: string,
  permissions: RolePermission[],
): Promise<AdminRole> {
  return mapRole(await api.put(`/admin/roles/${id}/permissions`, { permissions }));
}

export async function toggleRoleStatus(id: string, isActive: boolean): Promise<AdminRole> {
  return mapRole(await api.patch(`/admin/roles/${id}/status`, { isActive }));
}

export async function deleteRole(id: string): Promise<void> {
  await api.delete(`/admin/roles/${id}`);
}

/** Every action, which is what one screen toggle currently grants. */
export const ALL_ACTIONS: RolePermission['actions'] = ['view', 'create', 'edit', 'delete'];

/** Turn a set of enabled screen keys into the wire shape the API expects. */
export function toPermissions(enabled: Iterable<string>): RolePermission[] {
  return [...enabled].map((screen) => ({ screen: screen as ScreenKey, actions: [...ALL_ACTIONS] }));
}
