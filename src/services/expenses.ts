/**
 * Expense service — backed by the admin API (/admin/expenses). Same public shape
 * as before (getExpenses/createExpense/…), so the Expenses page, the form drawer
 * and the Monthly Report keep working unchanged; only the storage moved from
 * localStorage to the server, so expenses are now shared + persisted.
 */
import api from '@/lib/api.ts';
import type { Expense, ExpenseInput } from '@/types/admin.ts';

function mapExpense(e: Record<string, unknown>): Expense {
  return {
    id: (e._id || e.id) as string,
    date: (e.date as string) || '',
    category: (e.category as string) || '',
    description: (e.description as string) || '',
    amount: Number(e.amount) || 0,
    gst: Number(e.gst) || 0,
    paidTo: (e.paidTo as string) || '',
    createdAt: (e.createdAt as string) || '',
    updatedAt: (e.updatedAt as string) || '',
  };
}

/** "Total (Auto ₹)" = Amount + GST. */
export function expenseTotal(e: { amount: number; gst: number }): number {
  return Math.round(((e.amount || 0) + (e.gst || 0)) * 100) / 100;
}

export async function getExpenses(): Promise<Expense[]> {
  const data: Record<string, unknown>[] = await api.get('/admin/expenses');
  const list = (Array.isArray(data) ? data : []).map(mapExpense);
  // Newest first by expense date, then by creation time as a tiebreaker.
  return list.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export async function getExpenseById(id: string): Promise<Expense | null> {
  const e: Record<string, unknown> | null = await api.get(`/admin/expenses/${id}`);
  return e ? mapExpense(e) : null;
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const e: Record<string, unknown> = await api.post('/admin/expenses', input);
  return mapExpense(e);
}

export async function updateExpense(id: string, patch: Partial<ExpenseInput>): Promise<Expense> {
  const e: Record<string, unknown> = await api.put(`/admin/expenses/${id}`, patch);
  return mapExpense(e);
}

export async function deleteExpense(id: string): Promise<void> {
  await api.delete(`/admin/expenses/${id}`);
}
