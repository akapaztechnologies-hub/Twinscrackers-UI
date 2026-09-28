import { ArrowUpDown, GripVertical } from 'lucide-react';

/**
 * The two bits of chrome that turn an admin list into a storefront arranger:
 * the toolbar toggle and the banner that explains what dragging does.
 *
 * Shared by Products and Combos so the two screens cannot drift into
 * explaining the same interaction differently.
 */

export function ReorderToggleButton({
  active,
  onClick,
  label = 'Reorder',
}: {
  active: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      title="Drag rows into the order customers see them in on the storefront"
      className={`flex items-center gap-2 px-3.5 h-9 rounded-lg border text-[13px] font-medium transition-colors ${
        active
          ? 'border-brand-500/40 bg-brand-500/10 text-brand-600 dark:text-brand-400'
          : 'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850'
      }`}
    >
      <ArrowUpDown size={16} />
      {active ? 'Done Reordering' : label}
    </button>
  );
}

export function ReorderBanner({
  shown,
  total,
  noun,
  isSaving,
  note,
}: {
  /** Rows currently on screen — reorder mode loads them all, unpaginated. */
  shown: number;
  /** Rows the filter actually matches, which can exceed the server's row cap. */
  total: number;
  /** Plural noun for the rows, e.g. "products". */
  noun: string;
  isSaving: boolean;
  note: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-2xl border border-brand-500/30 bg-brand-500/5 text-body-sm text-surface-700 dark:text-surface-300">
      <GripVertical size={16} className="text-brand-500 shrink-0" />
      <span>
        Drag a row to set the order customers see on the storefront — the top row shows first.
        All {shown} {noun} are listed here, no pages. Every drop saves on its own.
        {total > shown && (
          <strong className="text-amber-600 dark:text-amber-400">
            {' '}Only the first {shown} of {total} fit in one list — narrow the filters to arrange the rest.
          </strong>
        )}
      </span>
      <span className="ml-auto text-caption font-medium whitespace-nowrap">
        {isSaving ? (
          <span className="text-surface-500">Saving…</span>
        ) : note ? (
          <span className="text-green-600 dark:text-green-400">{note}</span>
        ) : null}
      </span>
    </div>
  );
}

/** The grip cell that leads every row while reorder mode is on. */
export function ReorderHandleCell() {
  return (
    <td className="pl-4 pr-0 py-3.5 text-surface-400">
      <GripVertical size={16} />
    </td>
  );
}

