import { useState, useRef, useEffect } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import { DatePicker } from '@/components/atoms/DatePicker.tsx';

export type DateRange = 'today' | '7d' | '30d' | '90d' | 'all' | 'custom';

export interface CustomRange {
  start: string; // YYYY-MM-DD
  end: string;
}

const presetRanges: { label: string; value: DateRange }[] = [
  { label: 'Today', value: 'today' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
  { label: 'All Time', value: 'all' },
];

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  customRange?: CustomRange;
  onCustomRangeChange?: (range: CustomRange) => void;
  className?: string;
}

export function DateRangeFilter({ value, onChange, customRange, onCustomRangeChange, className }: DateRangeFilterProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [tempStart, setTempStart] = useState(customRange?.start || '');
  const [tempEnd, setTempEnd] = useState(customRange?.end || '');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    if (popoverOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [popoverOpen]);

  // Sync temp values when customRange changes externally
  useEffect(() => {
    if (customRange) {
      /* eslint-disable react-hooks/set-state-in-effect -- mirror externally-controlled customRange into local draft state */
      setTempStart(customRange.start);
      setTempEnd(customRange.end);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [customRange]);

  const handleApplyCustom = () => {
    if (tempStart && tempEnd && onCustomRangeChange) {
      onCustomRangeChange({ start: tempStart, end: tempEnd });
      onChange('custom');
      setPopoverOpen(false);
    }
  };

  // Format custom range label
  const customLabel = customRange?.start && customRange?.end
    ? `${new Date(customRange.start + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(customRange.end + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
    : 'Custom';

  const todayStr = todayKey();

  return (
    <div className={cn('flex items-center gap-1 bg-surface-100 dark:bg-surface-800 rounded-xl p-1', className)}>
      {presetRanges.map(({ label, value: rangeValue }) => (
        <button
          key={rangeValue}
          onClick={() => { onChange(rangeValue); setPopoverOpen(false); }}
          className={cn(
            'px-3 py-1.5 rounded-lg text-caption font-medium transition-colors',
            value === rangeValue
              ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 shadow-sm'
              : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300',
          )}
        >
          {label}
        </button>
      ))}

      {/* Custom Range Button + Popover */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setPopoverOpen(!popoverOpen)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-medium transition-colors',
            value === 'custom'
              ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 shadow-sm'
              : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300',
          )}
        >
          <CalendarDays size={13} />
          {value === 'custom' ? customLabel : 'Custom'}
        </button>

        {popoverOpen && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 shadow-lg z-50 p-4 space-y-3">
            <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">Custom Date Range</p>
            <div className="space-y-2">
              <div>
                <label className="text-caption text-surface-500 mb-1 block">From</label>
                <DatePicker
                  value={tempStart}
                  onChange={setTempStart}
                  max={tempEnd || todayStr}
                  size="sm"
                />
              </div>
              <div>
                <label className="text-caption text-surface-500 mb-1 block">To</label>
                <DatePicker
                  value={tempEnd}
                  onChange={setTempEnd}
                  min={tempStart || undefined}
                  max={todayStr}
                  size="sm"
                />
              </div>
            </div>
            <button
              onClick={handleApplyCustom}
              disabled={!tempStart || !tempEnd}
              className="w-full h-9 rounded-lg bg-brand-500 text-white text-body-sm font-semibold hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- date helpers colocated with the filter they belong to
export function getDateRangeStart(range: DateRange, customRange?: CustomRange): Date | null {
  if (range === 'all') return null;
  if (range === 'custom' && customRange?.start) {
    return new Date(customRange.start + 'T00:00:00');
  }
  const now = new Date();
  switch (range) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

/**
 * Today as the YYYY-MM-DD a date picker uses, on the admin's own calendar.
 * `toISOString()` gives the UTC date, which until 05:30 IST is still yesterday —
 * so "today" could not be picked as the end of a custom range before then.
 */
// eslint-disable-next-line react-refresh/only-export-components -- date helpers colocated with the filter they belong to
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// eslint-disable-next-line react-refresh/only-export-components -- date helpers colocated with the filter they belong to
export function getDateRangeEnd(range: DateRange, customRange?: CustomRange): Date | null {
  if (range === 'custom' && customRange?.end) {
    const d = new Date(customRange.end + 'T23:59:59');
    return d;
  }
  return null; // no end cap for presets (they go up to now)
}
