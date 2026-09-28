import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, PackagePlus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import { adjustStock, MOVEMENT_META, type StockMovementType } from '@/services/inventory.ts';
import type { InventoryItem } from '@/services/inventory.ts';

/** The reasons stock actually moves by hand. Sales come from orders and bills. */
const REASONS: { type: StockMovementType; direction: 1 | -1; hint: string }[] = [
  { type: 'purchase', direction: 1, hint: 'Stock received from a supplier' },
  { type: 'return', direction: 1, hint: 'Customer returned goods, back on the shelf' },
  { type: 'damage', direction: -1, hint: 'Broken, expired or otherwise unsellable' },
  { type: 'adjustment', direction: 1, hint: 'Correction after a physical count' },
];

interface StockAdjustDrawerProps {
  item: InventoryItem | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/**
 * Move stock by a delta, with a reason attached.
 *
 * Deliberately separate from the inline count field on the stock sheet: typing
 * "40" over "55" records an unexplained correction, whereas "received 15 from
 * supplier" is what makes the ledger worth reading later.
 */
export function StockAdjustDrawer({ item, onClose, onSaved }: StockAdjustDrawerProps) {
  const [type, setType] = useState<StockMovementType>('purchase');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setType('purchase');
      setQuantity('');
      setReason('');
      setError(null);
    }
  }, [item]);

  if (!item) return null;

  const config = REASONS.find((r) => r.type === type) ?? REASONS[0];
  const magnitude = Number(quantity);
  const isValid = Number.isFinite(magnitude) && magnitude > 0;
  // 'adjustment' is the only one that can go either way — the others have a
  // fixed direction, so the sign is implied rather than typed.
  const signed = type === 'adjustment' ? magnitude : magnitude * config.direction;
  const projected = item.stockCount + (isValid ? signed : 0);
  const wouldGoNegative = isValid && projected < 0;

  const save = async () => {
    if (!isValid) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = await adjustStock({
        productId: item._id,
        quantity: signed,
        type,
        reason: reason.trim() || undefined,
      });
      onSaved(`${item.name} — now ${result.stockCount} in stock`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-800">
          <div className="min-w-0">
            <h2 className="text-body-md font-semibold text-surface-900 dark:text-surface-50 truncate">
              Adjust stock
            </h2>
            <p className="text-caption text-surface-400 truncate">{item.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {REASONS.map((r) => (
              <button
                key={r.type}
                onClick={() => setType(r.type)}
                className={cn(
                  'px-3 py-2.5 rounded-xl border text-left transition-colors',
                  type === r.type
                    ? 'border-brand-500 bg-brand-500/5'
                    : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600',
                )}
              >
                <span className="block text-[13px] font-medium text-surface-900 dark:text-surface-100">
                  {MOVEMENT_META[r.type].label}
                </span>
                <span className="block text-caption text-surface-400 mt-0.5">
                  {r.direction > 0 && r.type !== 'adjustment' ? 'Adds stock' : r.type === 'adjustment' ? 'Either way' : 'Removes stock'}
                </span>
              </button>
            ))}
          </div>

          <p className="text-caption text-surface-400">{config.hint}</p>

          <div>
            <label className="block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
              {type === 'adjustment' ? 'Change (use a minus sign to remove)' : 'Quantity'}
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
              Note <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Invoice number, supplier, what happened…"
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow"
            />
          </div>

          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-50 dark:bg-surface-850 text-body-sm">
            <span className="text-surface-500 dark:text-surface-400">On hand</span>
            <span className="font-medium text-surface-900 dark:text-surface-100">
              {item.stockCount}
              {isValid && (
                <>
                  <span className="mx-2 text-surface-400">→</span>
                  <span className={wouldGoNegative ? 'text-red-600' : 'text-brand-600'}>{projected}</span>
                </>
              )}
            </span>
          </div>

          {(error || wouldGoNegative) && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-body-sm bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <span className="break-words">
                {error ?? `That would take stock to ${projected}. Reduce the quantity.`}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-200 dark:border-surface-800">
          <button
            onClick={onClose}
            className="px-4 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!isValid || wouldGoNegative || isSaving}
            className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <PackagePlus size={14} />}
            Save movement
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
