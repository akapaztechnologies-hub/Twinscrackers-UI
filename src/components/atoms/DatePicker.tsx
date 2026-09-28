import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

export interface DatePickerProps {
  /** Value as an ISO date string `YYYY-MM-DD` (or empty). */
  value: string;
  onChange: (value: string) => void;
  /** Inclusive bounds as `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
  /** Renders a hidden input so the value participates in native form submits. */
  name?: string;
  'aria-label'?: string;
}

type PopoverPos = {
  left: number;
  top?: number;
  bottom?: number;
  placement: 'top' | 'bottom';
};

const GAP = 6;
const CALENDAR_HEIGHT = 340;
const CALENDAR_WIDTH = 288;
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const sizeStyles: Record<NonNullable<DatePickerProps['size']>, string> = {
  sm: 'h-9 px-3 text-[13px] rounded-lg',
  md: 'h-10 px-3.5 text-body-sm rounded-xl',
  lg: 'h-12 px-4 text-body-md rounded-xl',
};

/** Parse `YYYY-MM-DD` into numeric parts without timezone drift. */
function parseISO(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Compare two `YYYY-MM-DD` strings lexicographically (valid for ISO dates). */
function isBefore(a: string, b: string): boolean {
  return a < b;
}

function formatDisplay(iso: string): string {
  const p = parseISO(iso);
  if (!p) return '';
  return `${p.d} ${MONTHS[p.m].slice(0, 3)} ${p.y}`;
}

function computePosition(el: HTMLElement): PopoverPos {
  const r = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - r.bottom - GAP;
  const openUp = spaceBelow < CALENDAR_HEIGHT && r.top - GAP > spaceBelow;

  let left = r.left;
  const maxRight = window.innerWidth - 8;
  if (left + CALENDAR_WIDTH > maxRight) left = maxRight - CALENDAR_WIDTH;
  if (left < 8) left = 8;

  return openUp
    ? { left, bottom: window.innerHeight - r.top + GAP, placement: 'top' }
    : { left, top: r.bottom + GAP, placement: 'bottom' };
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Select date',
  disabled,
  className,
  size = 'md',
  id,
  name,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = parseISO(value);
  const today = new Date();
  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());

  // Month currently shown in the calendar grid.
  const [view, setView] = useState(() => ({
    y: selected?.y ?? today.getFullYear(),
    m: selected?.m ?? today.getMonth(),
  }));

  const reposition = () => {
    if (triggerRef.current) setPos(computePosition(triggerRef.current));
  };

  const openMenu = () => {
    if (disabled) return;
    setView({
      y: selected?.y ?? today.getFullYear(),
      m: selected?.m ?? today.getMonth(),
    });
    reposition();
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isDisabledDay = (iso: string) =>
    (min && isBefore(iso, min)) || (max && isBefore(max, iso)) || false;

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const next = new Date(v.y, v.m + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  };

  const pick = (iso: string) => {
    if (isDisabledDay(iso)) return;
    onChange(iso);
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Build the 6-row day grid for the visible month.
  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevDisabled = !!min && isBefore(toISO(view.y, view.m, daysInMonth), min);
  const nextDisabled = !!max && isBefore(max, toISO(view.y, view.m, 1));

  const menu =
    open && pos ? (
      createPortal(
        <AnimatePresence>
          <motion.div
            ref={menuRef}
            data-portal-popover
            onMouseDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: pos.placement === 'top' ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: CALENDAR_WIDTH }}
            className="z-[200] rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl shadow-black/10 dark:shadow-black/40 p-3"
          >
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                disabled={prevDisabled}
                aria-label="Previous month"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-body-sm font-semibold text-surface-900 dark:text-surface-50">
                {MONTHS[view.m]} {view.y}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                disabled={nextDisabled}
                aria-label="Next month"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-[11px] font-semibold uppercase text-surface-400 py-1">
                  {w}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((d, i) => {
                if (d === null) return <div key={i} />;
                const iso = toISO(view.y, view.m, d);
                const isSelected = iso === value;
                const isToday = iso === todayISO;
                const dayDisabled = isDisabledDay(iso);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pick(iso)}
                    disabled={dayDisabled}
                    aria-label={iso}
                    aria-pressed={isSelected}
                    className={cn(
                      'h-9 w-full rounded-lg text-body-sm font-medium transition-colors',
                      dayDisabled && 'text-surface-300 dark:text-surface-700 cursor-not-allowed',
                      !dayDisabled && !isSelected && 'text-surface-700 dark:text-surface-200 hover:bg-brand-500/10',
                      isSelected && 'bg-brand-500 text-white shadow-sm shadow-brand-500/30',
                      !isSelected && isToday && !dayDisabled && 'ring-1 ring-inset ring-brand-500/40',
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>

            {/* Quick actions */}
            <div className="mt-3 flex items-center justify-between border-t border-surface-100 dark:border-surface-800 pt-2.5">
              <button
                type="button"
                onClick={() => pick(todayISO)}
                disabled={isDisabledDay(todayISO)}
                className="px-2.5 py-1.5 rounded-lg text-caption font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Today
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-caption font-medium text-surface-500 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body,
      )
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 font-medium transition-all',
          'bg-white dark:bg-surface-800 border text-surface-700 dark:text-surface-200',
          'hover:border-surface-300 dark:hover:border-surface-600',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30',
          sizeStyles[size],
          open ? 'border-brand-500/40 ring-2 ring-brand-500/30' : 'border-surface-200 dark:border-surface-700',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      >
        <span className={cn('truncate', !selected && 'text-surface-400 dark:text-surface-500 font-normal')}>
          {selected ? formatDisplay(value) : placeholder}
        </span>
        <CalendarDays size={size === 'sm' ? 15 : 17} className="flex-shrink-0 text-surface-400" />
      </button>
      {name && <input type="hidden" name={name} value={value} />}
      {menu}
    </>
  );
}
