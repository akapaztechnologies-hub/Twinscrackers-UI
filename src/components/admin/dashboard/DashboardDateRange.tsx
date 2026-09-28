/**
 * Compact date-range control for the admin dashboard.
 *
 * Renders as a single bordered pill showing the *resolved* window
 * ("Aug 26 - Sep 2, 2025") rather than a row of preset buttons, and opens a
 * dropdown holding the presets plus a custom from/to range.
 *
 * Emits the same `DateRange` / `CustomRange` values as `DateRangeFilter`, so it
 * is a drop-in swap wherever that component is already wired up.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import { DatePicker } from '@/components/atoms/DatePicker.tsx';
import { getDateRangeStart, getDateRangeEnd, todayKey } from '@/components/admin/DateRangeFilter.tsx';
import type { CustomRange, DateRange } from '@/components/admin/DateRangeFilter.tsx';

const PRESETS: { label: string; value: DateRange }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'All time', value: 'all' },
];

/** "Aug 26" — day + short month, no year. */
function shortDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "Aug 26, 2025" — day + short month + year. */
function fullDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * Label for the pill. Presets resolve through the same helpers the data hook
 * uses, so the pill always shows the window that was actually queried.
 */
function rangeLabel(value: DateRange, customRange?: CustomRange): string {
  if (value === 'all') return 'All time';

  const start = getDateRangeStart(value, customRange);
  if (!start) return 'All time';
  const end = getDateRangeEnd(value, customRange) ?? new Date();

  if (sameDay(start, end)) return fullDate(start);
  // Within one year the year is stated once, at the end: "Aug 26 - Sep 2, 2025".
  if (start.getFullYear() === end.getFullYear()) return `${shortDate(start)} - ${fullDate(end)}`;
  return `${fullDate(start)} - ${fullDate(end)}`;
}

interface DashboardDateRangeProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  customRange?: CustomRange;
  onCustomRangeChange?: (range: CustomRange) => void;
  className?: string;
}

export function DashboardDateRange({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
  className,
}: DashboardDateRangeProps) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(customRange?.start ?? '');
  const [draftEnd, setDraftEnd] = useState(customRange?.end ?? '');
  const rootRef = useRef<HTMLDivElement>(null);

  const label = useMemo(() => rangeLabel(value, customRange), [value, customRange]);
  const todayStr = useMemo(() => todayKey(), []);

  // Close on outside click / Escape. The DatePicker renders into a portal, so an
  // outside click is only "outside" when it also missed that popover.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (target.closest('[data-portal-popover]')) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleOpen = () => {
    // Seed the custom drafts from the current selection each time it opens.
    setDraftStart(customRange?.start ?? '');
    setDraftEnd(customRange?.end ?? '');
    setOpen((prev) => !prev);
  };

  const handlePreset = (preset: DateRange) => {
    onChange(preset);
    setOpen(false);
  };

  const handleApplyCustom = () => {
    if (!draftStart || !draftEnd || !onCustomRangeChange) return;
    onCustomRangeChange({ start: draftStart, end: draftEnd });
    onChange('custom');
    setOpen(false);
  };

  return (
    <div className={cn('relative', className)} ref={rootRef}>
      <button
        type="button"
        onClick={handleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Change the dashboard date range"
        className={cn(
          'w-full flex items-center gap-2 h-10 px-3 rounded-xl border bg-white dark:bg-surface-900 text-body-sm font-medium text-surface-700 dark:text-surface-200 transition-colors',
          open
            ? 'border-red-500/50 ring-2 ring-red-500/15'
            : 'border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-850',
        )}
      >
        <CalendarDays size={16} className="text-surface-400 flex-shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0 truncate text-left tabular-nums">{label}</span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={cn('text-surface-400 flex-shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select date range"
          className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-lg z-50 p-2"
        >
          <div className="space-y-0.5">
            {PRESETS.map((preset) => {
              const active = value === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handlePreset(preset.value)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg text-body-sm transition-colors text-left',
                    active
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 font-medium'
                      : 'text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850',
                  )}
                >
                  {preset.label}
                  {active && <Check size={15} aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <div className="mt-2 pt-3 border-t border-surface-100 dark:border-surface-800 px-1 space-y-2.5">
            <p
              className={cn(
                'text-caption font-semibold',
                value === 'custom' ? 'text-red-600 dark:text-red-400' : 'text-surface-500',
              )}
            >
              Custom range
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-caption text-surface-500 mb-1 block">From</label>
                <DatePicker
                  value={draftStart}
                  onChange={setDraftStart}
                  max={draftEnd || todayStr}
                  size="sm"
                  aria-label="Range start date"
                />
              </div>
              <div>
                <label className="text-caption text-surface-500 mb-1 block">To</label>
                <DatePicker
                  value={draftEnd}
                  onChange={setDraftEnd}
                  min={draftStart || undefined}
                  max={todayStr}
                  size="sm"
                  aria-label="Range end date"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleApplyCustom}
              disabled={!draftStart || !draftEnd}
              className="w-full h-9 rounded-lg bg-red-600 text-white text-body-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-600"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
