import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, FileText, CheckCircle2, AlertTriangle, Loader2, Download } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import type { ImportResult } from '@/services/transfer.ts';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** What a row represents, lowercase plural — "products", "categories". */
  entityLabel: string;
  onImport: (file: File, dryRun: boolean) => Promise<ImportResult>;
  /**
   * Blank sheets to offer. Products ship two (Quick and Full); categories one.
   * More than one renders as a row of links rather than a single button.
   */
  templates: { label: string; download: () => Promise<void> }[];
  /** Called after a real (non-preview) import so the list behind can refresh. */
  onImported: () => void;
  /**
   * Rendered above the drop zone, for anything a file cannot say about itself.
   * Collection points use it to name the transport line, because a branch list
   * handed over by one company rarely has a column saying whose it is.
   */
  controls?: React.ReactNode;
  /**
   * Re-runs the preview when it changes, so a control above can alter what the
   * file means without the admin having to pick it again.
   */
  controlsKey?: string;
  /**
   * How rows in the file are matched to existing records, in a sentence.
   * Defaults to the catalogue's rule; collection points have no Code column and
   * telling the admin to check one is worse than saying nothing.
   */
  matchHint?: React.ReactNode;
}

/**
 * Two-step spreadsheet import: preview, then commit.
 *
 * Accepts .xlsx (what the admin now exports) and .csv (what it used to, and
 * what Google Sheets gives you). The server sniffs which it got.
 *
 * The preview runs the identical server-side validation with nothing written,
 * so an admin sees "12 to add, 40 to update, 3 problems on rows 7, 19, 88"
 * before anything touches the catalogue. Importing a few hundred rows blind is
 * how a shop loses its product data on a Friday afternoon.
 */
export function ImportDialog({
  open,
  onClose,
  title,
  entityLabel,
  onImport,
  templates,
  onImported,
  controls,
  controlsKey,
  matchHint,
}: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setDone(null);
    setError(null);
    setBusy(null);
    setDragging(false);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const chooseFile = useCallback(
    async (picked: File | null) => {
      if (!picked) return;
      if (!/\.(xlsx|xlsm|csv)$/i.test(picked.name)) {
        setError('Choose an Excel (.xlsx) or .csv file.');
        return;
      }
      setFile(picked);
      setPreview(null);
      setDone(null);
      setError(null);
      setBusy('preview');
      try {
        setPreview(await onImport(picked, true));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [onImport],
  );

  /*
   * A control above the drop zone changed, so the preview is stale — the same
   * file can mean something different now. Re-checked rather than cleared,
   * because clearing would make the admin choose the file a second time.
   */
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setBusy('preview');
    onImport(file, true)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
    // `onImport` is a fresh closure every render from most callers; depending on
    // it here would re-check the file on each keystroke elsewhere in the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlsKey]);

  const commit = async () => {
    if (!file) return;
    setBusy('import');
    setError(null);
    try {
      const result = await onImport(file, false);
      setDone(result);
      onImported();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  const summary = done ?? preview;
  const hasErrors = Boolean(summary?.errors.length);
  const nothingToDo = summary ? summary.created === 0 && summary.updated === 0 : false;

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />

      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-800">
          <h2 className="text-body-md font-semibold text-surface-900 dark:text-surface-50">{title}</h2>
          <button
            onClick={close}
            className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!done && (
            <>
              {controls}

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void chooseFile(e.dataTransfer.files?.[0] ?? null);
                }}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors text-center',
                  dragging
                    ? 'border-brand-500 bg-brand-500/5'
                    : 'border-surface-200 dark:border-surface-700 hover:border-brand-500/50',
                )}
              >
                {file ? <FileText size={22} className="text-brand-500" /> : <Upload size={22} className="text-surface-400" />}
                <p className="text-body-sm font-medium text-surface-700 dark:text-surface-200">
                  {file ? file.name : 'Drop an Excel or CSV file here, or click to browse'}
                </p>
                <p className="text-caption text-surface-400">
                  {matchHint ?? (
                    <>
                      Matched on the <code className="font-mono">Code</code> column — existing {entityLabel} are
                      updated, new ones added. Columns the file leaves out are not touched.
                    </>
                  )}
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-caption text-surface-400">Start from a blank sheet:</span>
                {templates.map((template) => (
                  <button
                    key={template.label}
                    onClick={() => void template.download()}
                    className="flex items-center gap-1.5 text-caption text-brand-600 dark:text-brand-400 font-medium hover:underline"
                  >
                    <Download size={13} />
                    {template.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {busy === 'preview' && (
            <div className="flex items-center gap-2 text-body-sm text-surface-500">
              <Loader2 size={15} className="animate-spin" />
              Checking the file…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-body-sm bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {summary && (
            <div className="space-y-3">
              <div
                className={cn(
                  'rounded-xl px-4 py-3 text-body-sm',
                  done
                    ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                    : 'bg-surface-50 dark:bg-surface-850 text-surface-700 dark:text-surface-300',
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  {done ? <CheckCircle2 size={16} /> : <FileText size={16} />}
                  {done ? 'Import complete' : 'Preview — nothing saved yet'}
                </div>
                <p className="mt-1.5">
                  <strong>{summary.created}</strong> to add · <strong>{summary.updated}</strong> to update
                  {hasErrors && (
                    <>
                      {' '}
                      · <strong>{summary.errors.length}</strong> skipped
                    </>
                  )}
                </p>
                {summary.notices?.map((n) => (
                  <p key={n} className="mt-1 text-caption">
                    {n}
                  </p>
                ))}
                {nothingToDo && !hasErrors && (
                  <p className="mt-1 text-caption">No rows to apply — check the file has a header row.</p>
                )}
              </div>

              {hasErrors && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 overflow-hidden">
                  <p className="px-4 py-2.5 text-caption font-semibold text-amber-800 dark:text-amber-400 border-b border-amber-200 dark:border-amber-900/50">
                    Rows that will be skipped
                  </p>
                  <ul className="max-h-40 overflow-y-auto divide-y divide-amber-200/60 dark:divide-amber-900/40">
                    {summary.errors.slice(0, 50).map((e, i) => (
                      <li key={`${e.row}-${i}`} className="px-4 py-2 text-caption text-amber-900 dark:text-amber-300">
                        <span className="font-mono font-semibold">Row {e.row}</span>
                        {e.slug ? <span className="text-amber-700 dark:text-amber-400"> · {e.slug}</span> : null}
                        <span className="block text-amber-800/90 dark:text-amber-400/90">{e.message}</span>
                      </li>
                    ))}
                    {summary.errors.length > 50 && (
                      <li className="px-4 py-2 text-caption text-amber-700 dark:text-amber-400">
                        …and {summary.errors.length - 50} more.
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-200 dark:border-surface-800">
          <button
            onClick={close}
            className="px-4 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
          >
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button
              onClick={commit}
              disabled={!preview || busy !== null || nothingToDo}
              className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy === 'import' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {busy === 'import'
                ? 'Importing…'
                : preview
                  ? `Import ${preview.created + preview.updated} ${entityLabel}`
                  : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
