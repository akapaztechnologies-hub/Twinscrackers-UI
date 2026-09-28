import { useMemo } from 'react';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import type { AdminScreen, ScreenCatalogue } from '@/types/admin.ts';

interface ScreenAccessMatrixProps {
  catalogue: ScreenCatalogue;
  /** Screen keys currently switched on. */
  enabled: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Super Admin and other built-in roles are shown but not editable. */
  readOnly?: boolean;
}

/**
 * The screen-access editor: every Admin Portal screen, grouped the way the
 * sidebar groups them, with one switch each.
 *
 * The rendered list comes from the backend's own registry rather than a local
 * copy, so a screen added in a future release appears here without a frontend
 * change. Each switch currently grants all four actions on that screen — the
 * stored shape already carries view/create/edit/delete per screen, so a
 * finer-grained matrix later is a change to this component alone.
 */
export function ScreenAccessMatrix({
  catalogue,
  enabled,
  onChange,
  readOnly,
}: ScreenAccessMatrixProps) {
  const grouped = useMemo(() => {
    const groups: { key: string; label: string; screens: AdminScreen[] }[] = [];
    for (const screen of catalogue.screens) {
      let group = groups.find((g) => g.key === screen.group);
      if (!group) {
        group = { key: screen.group, label: catalogue.groups[screen.group] ?? screen.group, screens: [] };
        groups.push(group);
      }
      group.screens.push(screen);
    }
    return groups;
  }, [catalogue]);

  const toggle = (key: string, on: boolean) => {
    const next = new Set(enabled);
    if (on) next.add(key);
    else next.delete(key);
    onChange(next);
  };

  const toggleGroup = (screens: AdminScreen[], on: boolean) => {
    const next = new Set(enabled);
    for (const s of screens) {
      if (on) next.add(s.key);
      else next.delete(s.key);
    }
    onChange(next);
  };

  return (
    <div className="space-y-6">
      {grouped.map((group) => {
        const allOn = group.screens.every((s) => enabled.has(s.key));

        return (
          <div
            key={group.key}
            className="rounded-2xl border border-surface-200 dark:border-surface-800 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 px-4 py-3 bg-surface-50 dark:bg-surface-850 border-b border-surface-200 dark:border-surface-800">
              <h3 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
                {group.label}
              </h3>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.screens, !allOn)}
                  className="text-caption font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  {allOn ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>

            <div className="divide-y divide-surface-100 dark:divide-surface-800">
              {group.screens.map((screen) => (
                <div key={screen.key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100">
                      {screen.label}
                    </p>
                    <p className="text-caption text-surface-500 dark:text-surface-400">
                      {screen.description}
                    </p>
                  </div>
                  {/* No `label` prop, so Toggle renders as a bare switch cell. */}
                  <Toggle
                    checked={enabled.has(screen.key)}
                    onChange={(v) => toggle(screen.key, v)}
                    disabled={readOnly}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
