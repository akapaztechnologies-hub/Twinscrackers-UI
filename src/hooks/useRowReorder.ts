import { useCallback, useState } from 'react';

/**
 * Drag-and-drop reordering for an admin table.
 *
 * Uses the browser's own HTML5 drag events rather than a drag library — the
 * rows are plain `<tr>`s and the whole interaction is "pick one row up, drop it
 * between two others", which needs no pointer-tracking layer.
 *
 * The list is rearranged locally the moment the row is dropped and only then
 * saved, so the table never sits still waiting for the network. If the save
 * fails the previous order is put back, because a reorder that silently did not
 * persist is worse than one that visibly refused.
 */

/**
 * Rows to load when a list drops into reorder mode.
 *
 * Reorder mode is unpaginated — dragging a row is only useful if every other
 * row it could go above or below is on screen. 500 is the product list's
 * server-side ceiling (clampLimit in the backend's utils/pagination).
 */
export const REORDER_LIMIT = 500;

export interface RowReorder {
  /** True while a row is being dragged. */
  isDragging: boolean;
  /** Index the dragged row would land on, for the drop indicator. */
  overIndex: number | null;
  /** True while the new order is being saved. */
  isSaving: boolean;
  /** Spread onto each `<tr>` to make it draggable and droppable. */
  rowProps: (index: number) => {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: () => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  /** `'above' | 'below' | null` — where to draw the drop line for this row. */
  dropEdge: (index: number) => 'above' | 'below' | null;
}

export function useRowReorder<T>(
  items: T[],
  setItems: (next: T[]) => void,
  onReorder: (next: T[]) => Promise<void>,
  enabled: boolean,
): RowReorder {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const commit = useCallback(
    async (from: number, to: number) => {
      if (from === to || from < 0 || to < 0) return;

      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);

      const previous = items;
      setItems(next);
      setIsSaving(true);
      try {
        await onReorder(next);
      } catch (e) {
        setItems(previous);
        throw e;
      } finally {
        setIsSaving(false);
      }
    },
    [items, setItems, onReorder],
  );

  const rowProps = useCallback(
    (index: number) => ({
      draggable: enabled,
      onDragStart: (e: React.DragEvent) => {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        // Firefox refuses to start a drag unless something is on the transfer.
        e.dataTransfer.setData('text/plain', String(index));
      },
      onDragOver: (e: React.DragEvent) => {
        // Without preventDefault the browser treats the row as a non-drop zone.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      },
      onDragEnter: () => setOverIndex(index),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const from = dragIndex;
        setDragIndex(null);
        setOverIndex(null);
        if (from !== null) void commit(from, index);
      },
      onDragEnd: () => {
        setDragIndex(null);
        setOverIndex(null);
      },
    }),
    [enabled, dragIndex, commit],
  );

  const dropEdge = useCallback(
    (index: number): 'above' | 'below' | null => {
      if (dragIndex === null || overIndex !== index || dragIndex === index) return null;
      return dragIndex > index ? 'above' : 'below';
    },
    [dragIndex, overIndex],
  );

  return { isDragging: dragIndex !== null, overIndex, isSaving, rowProps, dropEdge };
}

/**
 * Classes for a row that can be dragged. `edge` comes from
 * {@link RowReorder.dropEdge} and draws the
 * line showing where the row would land.
 */
export function reorderRowClass(active: boolean, edge: 'above' | 'below' | null): string {
  return [
    'border-b border-surface-50 dark:border-surface-850 last:border-0 transition-colors',
    active
      ? 'cursor-grab active:cursor-grabbing hover:bg-brand-500/5'
      : 'cursor-pointer hover:bg-surface-50/50 dark:hover:bg-surface-850/50',
    edge === 'above' ? 'shadow-[inset_0_2px_0_0_rgb(var(--brand-500))]' : '',
    edge === 'below' ? 'shadow-[inset_0_-2px_0_0_rgb(var(--brand-500))]' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** The leading column header that pairs with the grip cell. */
export const REORDER_COLUMN = { key: 'drag', label: '', className: 'w-10' };
