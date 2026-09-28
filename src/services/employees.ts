/**
 * Employee service — backed by the admin API (/admin/employees). An employee is
 * a staff User account; this never touches customer accounts, which the backend
 * enforces as well as this module.
 */
import api from '@/lib/api.ts';
import type { Employee, EmployeeInput } from '@/types/admin.ts';
import type { PaginatedResult } from '@/types/admin.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function mapEmployee(e: Raw): Employee {
  // `staffRole` comes back populated on every employee endpoint, but degrade to
  // a bare id rather than rendering "undefined" if a projection ever changes.
  const role = e.staffRole && typeof e.staffRole === 'object' ? e.staffRole : null;
  return {
    id: (e._id || e.id) as string,
    displayName: (e.displayName as string) || '',
    email: (e.email as string) || '',
    phone: (e.phone as string) || '',
    employeeCode: (e.employeeCode as string) || '',
    designation: (e.designation as string) || '',
    joinedAt: (e.joinedAt as string) || '',
    isActive: e.isActive !== false,
    roleId: role ? String(role._id || role.id) : String(e.staffRole || ''),
    roleName: role ? String(role.name || '') : '',
    isSuperAdmin: Boolean(role?.isSuperAdmin),
    createdAt: (e.createdAt as string) || '',
    updatedAt: (e.updatedAt as string) || '',
  };
}

export interface EmployeeListParams {
  search?: string;
  roleId?: string;
  status?: 'all' | 'active' | 'inactive';
  sort?: string;
  page?: number;
  limit?: number;
}

export interface EmployeeStats {
  total: number;
  active: number;
  inactive: number;
  roles: number;
}

export async function getEmployees(
  params: EmployeeListParams = {},
): Promise<PaginatedResult<Employee>> {
  const res: Raw = await api.get('/admin/employees', { params });
  return {
    data: (res.data || []).map(mapEmployee),
    total: Number(res.total) || 0,
    page: Number(res.page) || 1,
    totalPages: Number(res.totalPages) || 1,
    hasMore: Boolean(res.hasMore),
  };
}

export async function getEmployeeStats(): Promise<EmployeeStats> {
  return api.get('/admin/employees/summary');
}

export async function getEmployeeById(id: string): Promise<Employee> {
  return mapEmployee(await api.get(`/admin/employees/${id}`));
}

export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  return mapEmployee(await api.post('/admin/employees', input));
}

export async function updateEmployee(
  id: string,
  input: Partial<EmployeeInput>,
): Promise<Employee> {
  return mapEmployee(await api.put(`/admin/employees/${id}`, input));
}

export async function toggleEmployeeStatus(id: string, isActive: boolean): Promise<Employee> {
  return mapEmployee(await api.patch(`/admin/employees/${id}/status`, { isActive }));
}

export async function resetEmployeePassword(id: string, password: string): Promise<void> {
  await api.post(`/admin/employees/${id}/reset-password`, { password });
}

export async function deleteEmployee(id: string): Promise<void> {
  await api.delete(`/admin/employees/${id}`);
}
