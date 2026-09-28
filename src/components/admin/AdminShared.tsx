import { AlertTriangle, CheckCircle2, Eye, Save, X } from 'lucide-react';

export function SaveButton({
  onClick,
  isSaving,
  label = 'Save Changes',
  disabled = false,
}: {
  onClick: () => void;
  isSaving: boolean;
  label?: string;
  /** Held off when the section never loaded — saving then would write defaults over real content. */
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isSaving || disabled}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-brand-on text-body-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
    >
      <Save size={16} />
      {isSaving ? 'Saving...' : label}
    </button>
  );
}

export function SuccessToast({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500 text-white text-body-sm font-medium shadow-lg animate-in slide-in-from-bottom-2">
      <CheckCircle2 size={16} />
      Saved successfully
    </div>
  );
}

export function SectionLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-surface-100 dark:border-surface-800">
      <Eye size={14} className="text-brand-500" />
      <span className="text-caption font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wider">{label}</span>
      {hint && <span className="text-caption text-surface-400 ml-auto">{hint}</span>}
    </div>
  );
}

/**
 * Shown in place of a working editor when its section failed to load.
 *
 * The editors start from built-in defaults, so an editor whose load failed looks
 * perfectly normal — and saving it would replace the shop's real content with
 * those defaults. Every editor therefore switches Save off and says why.
 */
export const LOAD_FAILED_MESSAGE =
  'This section could not be loaded, so saving is switched off to avoid overwriting it with blank defaults. Reload the page to try again.';

/** The server's own words when there are some, otherwise the fallback. */
// eslint-disable-next-line react-refresh/only-export-components -- tiny helper shared by the editors above
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** {@link LOAD_FAILED_MESSAGE}, plus whatever the failure said about itself. */
// eslint-disable-next-line react-refresh/only-export-components -- tiny helper shared by the editors above
export function loadErrorText(err: unknown): string {
  const detail = errorText(err, '');
  return detail ? `${LOAD_FAILED_MESSAGE} (${detail})` : LOAD_FAILED_MESSAGE;
}

/**
 * Give every row of a list editor a unique id.
 *
 * The editors find the row being typed into by its id. Rows saved before ids
 * existed — and the original seed data — have none, and then every row matches:
 * typing in one changed them all, and deleting one deleted the lot.
 */
// eslint-disable-next-line react-refresh/only-export-components -- tiny helper shared by the editors above
export function withIds<T extends { id?: string }>(rows: T[] | null | undefined): (T & { id: string })[] {
  const seen = new Set<string>();
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const id = row.id && !seen.has(row.id) ? row.id : crypto.randomUUID();
    seen.add(id);
    return { ...row, id };
  });
}

/** A load or save failure, in the page rather than swallowed. */
export function ErrorNotice({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 text-body-sm font-medium"
    >
      <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
      <span className="flex-1 break-words">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="p-0.5 rounded hover:bg-red-500/10">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
