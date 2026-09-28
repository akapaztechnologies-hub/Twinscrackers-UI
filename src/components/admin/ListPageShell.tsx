import type { ReactNode } from 'react';

/**
 * Full-height layout shell for admin list pages.
 *
 * It breaks out of the padded <main> (AdminLayout) with negative margins and
 * fills the area under the topbar (h-14 = 3.5rem), then splits into two rows:
 *   • a STATIC header (KPI cards + search/filter toolbar) that never scrolls
 *   • a single scrolling region that holds the data table
 *
 * The header stays put because it simply isn't inside the scroll container —
 * no `position: sticky` involved, so there is no padding/scrollport gap.
 *
 * `children` (the table, plus any fixed-overlay dialogs) render inside the
 * scroll region; fixed overlays are unaffected by the overflow container.
 */
export function ListPageShell({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-4 lg:-m-6 xl:-m-8 bg-surface-50 dark:bg-surface-950">
      <div className="shrink-0 px-4 pt-4 lg:px-6 lg:pt-6 xl:px-8 xl:pt-8 space-y-4">
        {header}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-4 lg:px-6 lg:pb-6 xl:px-8 xl:pb-8">
        {children}
      </div>
    </div>
  );
}
