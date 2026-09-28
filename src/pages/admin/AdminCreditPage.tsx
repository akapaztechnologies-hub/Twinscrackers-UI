import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, HandCoins, Users, Clock, IndianRupee, X, Loader2, Check } from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable.tsx';
import { KPICard } from '@/components/admin/KPICard.tsx';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { cn } from '@/lib/utils.ts';
import {
  getCreditOutstanding,
  recordCustomerPayment,
  type CreditCustomerRow,
} from '@/services/admin.ts';

/**
 * Who owes the shop money, and taking it off them.
 *
 * Credit is given at the counter all day and paid back in pieces, and until now
 * the only way to reduce it was to open each bill and settle it one at a time.
 * A customer with four bills meant four screens and four sums. This is the one
 * place that answers "who owes me, how much, and since when" — and takes the
 * money without leaving the page.
 *
 * A payment here is applied to that customer's oldest unpaid bill first, then
 * the next, so the counter never has to decide which bill the money is for. The
 * bills update with it; this screen and the bill screen read the same figure.
 */

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Whole days since a date — how long the shop has been waiting. */
function daysSince(date: string | null): number | null {
  if (!date) return null;
  const then = new Date(date).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

function ageTone(days: number | null): string {
  if (days === null) return 'text-surface-400';
  if (days >= 90) return 'text-red-600 dark:text-red-400 font-semibold';
  if (days >= 30) return 'text-amber-600 dark:text-amber-400 font-medium';
  return 'text-surface-500';
}

export function AdminCreditPage() {
  const [rows, setRows] = useState<CreditCustomerRow[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [payTarget, setPayTarget] = useState<CreditCustomerRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getCreditOutstanding(debounced || undefined);
      setRows(result.rows ?? []);
      setTotalOutstanding(result.totalOutstanding ?? 0);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load outstanding credit.');
    } finally {
      setIsLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // The longest anyone has been owing. A total says how much is out; this says
  // how badly, and it is the number that decides who gets a phone call.
  const oldestDays = rows.reduce<number | null>((worst, row) => {
    const days = daysSince(row.oldestDate);
    if (days === null) return worst;
    return worst === null || days > worst ? days : worst;
  }, null);

  return (
    <ListPageShell
      header={
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPICard
              label="Total Outstanding"
              value={inr(totalOutstanding)}
              icon={HandCoins}
              color="text-amber-600 bg-amber-500/10"
            />
            <KPICard
              label="Customers Owing"
              value={String(rows.length)}
              icon={Users}
              color="text-blue-600 bg-blue-500/10"
            />
            <KPICard
              label="Oldest Unpaid"
              value={oldestDays === null ? '—' : `${oldestDays} days`}
              icon={Clock}
              color={
                oldestDays !== null && oldestDays >= 90
                  ? 'text-red-600 bg-red-500/10'
                  : 'text-surface-600 bg-surface-500/10'
              }
            />
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
                placeholder="Search by name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 h-9 w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>
        </>
      }
    >
      <DataTable
        isLoading={isLoading}
        isEmpty={!isLoading && rows.length === 0}
        emptyIcon={<HandCoins size={22} />}
        emptyTitle={debounced ? 'Nobody matches that' : 'Nothing outstanding'}
        emptyDescription={
          debounced
            ? 'No customer owing money matches that name or number.'
            : 'Every credit bill has been paid. Credit given at the counter shows up here until it is settled.'
        }
        columns={[
          { key: 'customer', label: 'Customer' },
          { key: 'bills', label: 'Bills' },
          { key: 'oldest', label: 'Oldest' },
          { key: 'lastPaid', label: 'Last paid' },
          { key: 'outstanding', label: 'Outstanding' },
          { key: 'actions', label: '', className: 'text-right' },
        ]}
      >
        {rows.map((row) => {
          const days = daysSince(row.oldestDate);
          return (
            <tr
              key={row.id || row.phone}
              className="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
            >
              <td className="px-4 py-3">
                {row.id ? (
                  <Link
                    to={`/admin/customers/${row.id}`}
                    className="text-body-sm font-semibold text-surface-900 dark:text-surface-100 hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    {row.name}
                  </Link>
                ) : (
                  <span className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">
                    {row.name}
                  </span>
                )}
                {row.phone && <div className="text-caption text-surface-500 tabular-nums">{row.phone}</div>}
              </td>

              <td className="px-4 py-3 text-body-sm text-surface-600 dark:text-surface-300 tabular-nums">
                {row.billCount}
              </td>

              <td className={cn('px-4 py-3 text-body-sm tabular-nums', ageTone(days))}>
                {days === null ? '—' : `${days} days`}
              </td>

              <td className="px-4 py-3 text-caption text-surface-500 tabular-nums">
                {row.lastPaymentDate
                  ? new Date(row.lastPaymentDate).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Never'}
              </td>

              <td className="px-4 py-3 text-body-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {inr(row.outstanding)}
              </td>

              <td className="px-4 py-3 text-right">
                {/* Without a customer record there is nothing to record the
                    payment against — the bill carries only a phone number. */}
                {row.id ? (
                  <button
                    onClick={() => setPayTarget(row)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-500 text-white text-caption font-semibold hover:bg-brand-600 transition-colors"
                  >
                    <IndianRupee size={13} /> Record payment
                  </button>
                ) : (
                  <span className="text-caption text-surface-400">No customer record</span>
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>

      {payTarget && (
        <RecordPaymentDialog
          row={payTarget}
          onClose={() => setPayTarget(null)}
          onDone={(message) => {
            setPayTarget(null);
            setNotice(message);
            void load();
          }}
        />
      )}
    </ListPageShell>
  );
}

/**
 * Take money off a customer's balance.
 *
 * Shows what they owe and pre-fills it, because settling in full is the common
 * case and the counter should not have to type a figure it already knows.
 */
function RecordPaymentDialog({
  row,
  onClose,
  onDone,
}: {
  row: CreditCustomerRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [amount, setAmount] = useState(String(Math.round(row.outstanding)));
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0;
  const excess = valid ? Math.max(0, value - row.outstanding) : 0;

  const submit = async () => {
    if (!valid) {
      setError('Enter an amount.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await recordCustomerPayment(row.id, { amount: value, method, note: note.trim() || undefined });
      const cleared = Math.min(value, row.outstanding);
      onDone(
        excess > 0
          ? `${inr(cleared)} settled for ${row.name}. ${inr(excess)} kept as advance.`
          : `${inr(cleared)} settled for ${row.name}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record that payment.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={saving ? undefined : onClose} />

      <div className="relative w-full max-w-md rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-800">
          <div className="min-w-0">
            <h2 className="text-body-md font-semibold text-surface-900 dark:text-surface-50 truncate">
              {row.name}
            </h2>
            <p className="text-caption text-surface-500 tabular-nums">
              {row.phone ? `${row.phone} · ` : ''}{inr(row.outstanding)} across {row.billCount} bill{row.billCount === 1 ? '' : 's'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-3">
            <label className="flex-1">
              <span className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">
                Amount received
              </span>
              <div className="relative">
                <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="number"
                  min="0"
                  value={amount}
                  autoFocus
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm font-semibold tabular-nums text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </label>

            <label className="w-32">
              <span className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">
                Paid by
              </span>
              <Select
                value={method}
                onChange={setMethod}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'upi', label: 'UPI' },
                  { value: 'card', label: 'Card' },
                ]}
                size="md"
              />
            </label>
          </div>

          <label className="block">
            <span className="block mb-1.5 text-caption font-medium text-surface-600 dark:text-surface-400">
              Note (optional)
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Paid at the shop"
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </label>

          {/* Says what the money will do before they commit it. Oldest first is
              the rule, and the counter should not have to know that to trust
              the number it leaves behind. */}
          <p className="text-caption text-surface-500 dark:text-surface-400">
            {valid
              ? excess > 0
                ? `Clears all ${row.billCount} bill${row.billCount === 1 ? '' : 's'}. ${inr(excess)} is kept as an advance against their next credit bill.`
                : `Goes against their oldest unpaid bill first. ${inr(row.outstanding - value)} will still be owed.`
              : 'Applied to their oldest unpaid bill first.'}
          </p>

          {error && (
            <p className="text-caption text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-200 dark:border-surface-800">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={saving || !valid}
            className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Recording…' : `Record ${valid ? inr(value) : 'payment'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
