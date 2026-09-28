import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  /** Extra classes for the trigger button. */
  className?: string;
  /** Extra classes for the popover menu. */
  menuClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'ghost';
  /** Stretch the trigger to fill its container. Defaults to true. */
  fullWidth?: boolean;
  /** Highlight the trigger to signal an active/applied filter. */
  active?: boolean;
  id?: string;
  /** Renders a hidden input so the value participates in native form submits. */
  name?: string;
  'aria-label'?: string;
  /** Enable search filtering within the dropdown */
  searchable?: boolean;
  /** Placeholder for the search input */
  searchPlaceholder?: string;
}

type PopoverPos = {
  left: number;
  minWidth: number;
  maxWidth: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
};

const GAP = 6;
const DESIRED_MENU_HEIGHT = 288;

const sizeStyles: Record<NonNullable<SelectProps['size']>, string> = {
  sm: 'h-9 pl-3 pr-8 text-[13px] rounded-lg',
  md: 'h-10 pl-3.5 pr-9 text-body-sm rounded-xl',
  lg: 'h-12 pl-4 pr-10 text-body-md rounded-xl',
};

const chevronPos: Record<NonNullable<SelectProps['size']>, string> = {
  sm: 'right-2.5',
  md: 'right-3',
  lg: 'right-3.5',
};

function computePosition(el: HTMLElement): PopoverPos {
  const r = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - r.bottom - GAP;
  const spaceAbove = r.top - GAP;
  const openUp = spaceBelow < Math.min(DESIRED_MENU_HEIGHT, 220) && spaceAbove > spaceBelow;

  const minWidth = Math.max(r.width, 180);
  let left = r.left;
  const maxRight = window.innerWidth - 8;
  if (left + minWidth > maxRight) left = maxRight - minWidth;
  if (left < 8) left = 8;
  const maxWidth = window.innerWidth - left - 8;

  if (openUp) {
    return {
      left,
      minWidth,
      maxWidth,
      bottom: window.innerHeight - r.top + GAP,
      maxHeight: Math.max(160, spaceAbove),
      placement: 'top',
    };
  }
  return {
    left,
    minWidth,
    maxWidth,
    top: r.bottom + GAP,
    maxHeight: Math.max(160, spaceBelow),
    placement: 'bottom',
  };
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  className,
  menuClassName,
  size = 'md',
  variant = 'default',
  fullWidth = true,
  active,
  id,
  name,
  'aria-label': ariaLabel,
  searchable,
  searchPlaceholder,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const typeahead = useRef({ query: '', ts: 0 });

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const selectedIndex = useMemo(() => options.findIndex((o) => o.value === value), [options, value]);

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery) return options;
    const q = searchQuery.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, searchable, searchQuery]);

  const firstEnabled = () => filteredOptions.findIndex((o) => !o.disabled);

  const reposition = () => {
    if (triggerRef.current) setPos(computePosition(triggerRef.current));
  };

  const openMenu = () => {
    if (disabled) return;
    setSearchQuery('');
    reposition();
    setActiveIndex(selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : firstEnabled());
    setOpen(true);
    if (searchable) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  };

  const closeMenu = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const commit = (opt: SelectOption<T>) => {
    if (opt.disabled) return;
    onChange(opt.value);
    closeMenu();
  };

  // Keep the popover glued to the trigger while scrolling/resizing.
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

  // Close on outside pointer.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Scroll the active option into view.
  useEffect(() => {
    if (open && activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const moveActive = (dir: 1 | -1) => {
    setActiveIndex((cur) => {
      const n = filteredOptions.length;
      if (n === 0) return cur;
      let i = cur < 0 ? 0 : cur;
      for (let step = 0; step < n; step++) {
        i = (i + dir + n) % n;
        if (!filteredOptions[i]?.disabled) return i;
      }
      return cur;
    });
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(firstEnabled());
        break;
      case 'End': {
        e.preventDefault();
        for (let i = filteredOptions.length - 1; i >= 0; i--) {
          if (!filteredOptions[i]?.disabled) {
            setActiveIndex(i);
            break;
          }
        }
        break;
      }
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && filteredOptions[activeIndex]) commit(filteredOptions[activeIndex]);
        break;
      case ' ':
        if (searchable && document.activeElement === searchInputRef.current) {
          return;
        }
        e.preventDefault();
        if (activeIndex >= 0 && filteredOptions[activeIndex]) commit(filteredOptions[activeIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        closeMenu();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (!searchable && e.key.length === 1) {
          const now = Date.now();
          const ta = typeahead.current;
          ta.query = now - ta.ts > 600 ? e.key : ta.query + e.key;
          ta.ts = now;
          const q = ta.query.toLowerCase();
          const match = filteredOptions.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(q));
          if (match >= 0) setActiveIndex(match);
        }
    }
  };

  const menu =
    open && pos ? (
      createPortal(
        <AnimatePresence>
          <motion.div
            ref={menuRef}
            role="listbox"
            data-portal-popover
            onMouseDown={(e) => e.stopPropagation()}
            aria-activedescendant={activeIndex >= 0 ? `${id ?? 'select'}-opt-${activeIndex}` : undefined}
            initial={{ opacity: 0, y: pos.placement === 'top' ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              minWidth: pos.minWidth,
              maxWidth: pos.maxWidth,
              maxHeight: pos.maxHeight,
            }}
            className={cn(
              /*
               * Above every layer this menu can be opened from.
               *
               * It portals to the body, so its stacking is decided here rather
               * than by whatever contains the trigger — and the trigger can sit
               * in a modal. At z-[200] the menu opened inside the import dialog
               * (z-[1100]) rendered behind it: the field looked broken, because
               * clicking it appeared to do nothing. Modals top out at 1100 and
               * the inventory toast at 1200, so this clears both. A menu the
               * user just opened has to be the thing they can see.
               */
              'z-[1300] overflow-y-auto rounded-xl border border-surface-200 dark:border-surface-700',
              'bg-white dark:bg-surface-900 shadow-xl shadow-black/10 dark:shadow-black/40 p-1.5 flex flex-col',
              'origin-top',
              menuClassName,
            )}
          >
            {searchable && (
              <div className="px-1 pb-1.5 pt-0.5 sticky top-0 bg-white dark:bg-surface-900 z-10 flex-shrink-0">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setActiveIndex(firstEnabled());
                    }}
                    onKeyDown={onTriggerKeyDown}
                    placeholder={searchPlaceholder ?? 'Search...'}
                    className="w-full h-8 pl-8 pr-3 text-body-sm rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-500/30 transition-shadow"
                  />
                </div>
              </div>
            )}
            <ul className="space-y-0.5 flex-1">
              {filteredOptions.length === 0 ? (
                <li className="px-3 py-3 text-center text-body-sm text-surface-500">No results found</li>
              ) : (
                filteredOptions.map((opt, i) => {
                  const isSelected = opt.value === value;
                  const isActive = i === activeIndex;
                  return (
                    <li
                      key={opt.value}
                      id={`${id ?? 'select'}-opt-${i}`}
                    ref={(el) => {
                      optionRefs.current[i] = el;
                    }}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(opt)}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-body-sm cursor-pointer select-none transition-colors',
                      opt.disabled && 'opacity-40 cursor-not-allowed',
                      !opt.disabled && isActive && 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
                      !opt.disabled && !isActive && 'text-surface-700 dark:text-surface-200',
                      isSelected && !isActive && 'text-surface-900 dark:text-surface-50 font-medium',
                    )}
                  >
                    {opt.icon && <span className="flex-shrink-0 text-surface-400">{opt.icon}</span>}
                    <span className="flex-1 truncate">{opt.label}</span>
                    {isSelected && <Check size={15} className="flex-shrink-0 text-brand-500" />}
                  </li>
                );
              }))}
            </ul>
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
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'relative inline-flex items-center justify-between font-medium transition-all',
          fullWidth && 'w-full',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30',
          sizeStyles[size],
          variant === 'default' &&
            (active
              ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/40'
              : 'bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'),
          variant === 'ghost' &&
            'bg-transparent border-none text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800',
          open && 'ring-2 ring-brand-500/30',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.icon && <span className="flex-shrink-0 text-surface-400">{selected.icon}</span>}
          <span className={cn('truncate', !selected && 'text-surface-400 dark:text-surface-500 font-normal')}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown
          size={size === 'sm' ? 14 : 16}
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 transition-transform duration-200',
            chevronPos[size],
            open && 'rotate-180',
            active ? 'text-brand-500' : 'text-surface-400',
          )}
        />
      </button>
      {name && <input type="hidden" name={name} value={value} />}
      {menu}
    </>
  );
}
