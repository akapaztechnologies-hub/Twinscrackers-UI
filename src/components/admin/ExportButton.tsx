import { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

const TRIGGER_CLASS =
  'flex items-center gap-2 px-3.5 h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors disabled:opacity-50';

interface ExportButtonProps {
  onExport: () => void;
  label?: string;
  isExporting?: boolean;
  className?: string;
}

export function ExportButton({ onExport, label = 'Export', isExporting, className }: ExportButtonProps) {
  return (
    <button onClick={onExport} disabled={isExporting} className={cn(TRIGGER_CLASS, className)}>
      <Download size={16} className={isExporting ? 'animate-pulse' : ''} />
      {isExporting ? 'Exporting...' : label}
    </button>
  );
}

export interface ExportChoice {
  /** Menu line, e.g. "Quick sheet". */
  label: string;
  /** The line underneath, saying what is in the file. */
  hint: string;
  onSelect: () => void;
}

/**
 * Export with a choice of sheet.
 *
 * Products and combos ship two shapes: a Quick sheet holding the handful of
 * columns a shop edits week to week, and a Full one with every field. Both are
 * offered from one button rather than two, because the toolbar is already
 * crowded and only one of them is wanted at a time.
 */
export function ExportMenuButton({
  choices,
  label = 'Export',
  isExporting,
  className,
}: {
  choices: ExportChoice[];
  label?: string;
  isExporting?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isExporting}
        className={cn(TRIGGER_CLASS, className)}
      >
        <Download size={16} className={isExporting ? 'animate-pulse' : ''} />
        {isExporting ? 'Exporting...' : label}
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-64 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg overflow-hidden">
          {choices.map((choice) => (
            <button
              key={choice.label}
              onClick={() => {
                setOpen(false);
                choice.onSelect();
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors border-b border-surface-50 dark:border-surface-850 last:border-0"
            >
              <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100">{choice.label}</p>
              <p className="text-caption text-surface-500 mt-0.5">{choice.hint}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
