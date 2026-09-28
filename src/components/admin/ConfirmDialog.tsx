import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  /**
   * Why the action was refused. Shown in place of nothing happening — a server
   * that declines a delete has a reason, and the dialog is where it belongs.
   */
  error?: string;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
  isLoading,
  error,
}: ConfirmDialogProps) {
  if (!open) return null;

  const confirmColors = {
    danger: 'bg-red-500 hover:bg-red-600 text-white shadow-sm shadow-red-500/20',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-500/20',
    default: 'bg-brand-500 hover:bg-brand-600 text-brand-on shadow-sm shadow-brand-500/20',
  };

  const iconColors = {
    danger: 'text-red-600 bg-red-500/10',
    warning: 'text-amber-600 bg-amber-500/10',
    default: 'text-brand-600 bg-brand-500/10',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColors[variant]}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
              {title}
            </h3>
            <p className="text-body-sm text-surface-500 mt-1">{description}</p>
            {error && (
              <p className="text-body-sm text-red-600 dark:text-red-400 mt-2">{error}</p>
            )}
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2.5 rounded-xl text-body-sm font-semibold transition-colors disabled:opacity-50 ${confirmColors[variant]}`}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
