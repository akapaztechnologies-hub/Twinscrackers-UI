import { useState } from 'react';

/**
 * Typeable quantity box — someone ordering 40 boxes of one item should not have
 * to press "+" forty times.
 *
 * It holds its own draft while being edited instead of writing every keystroke
 * straight to the cart: clearing the box to type a new number would otherwise
 * read as 0, drop the line, and swap the stepper back for an "Add" button
 * mid-keystroke. A number that parses commits immediately, so the totals keep
 * up as you type; an emptied box commits nothing and simply snaps back to the
 * live quantity on blur. Removal stays the job of the trash or remove button.
 *
 * `type="text"` with a numeric inputMode rather than `type="number"`: it still
 * brings up the digit keypad on a phone, but drops the spinner arrows and the
 * scroll-wheel-changes-the-value trap that comes with a number field.
 */
interface QuantityInputProps {
  value: number;
  onCommit: (qty: number) => void;
  /** Screen-reader name, e.g. `Quantity for Jolly Ranger`. */
  label: string;
  className: string;
  /** 0 where typing a zero is a valid way to drop the line; 1 elsewhere. */
  min?: number;
  max?: number;
}

export function QuantityInput({ value, onCommit, label, className, min = 0, max = 99 }: QuantityInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft ?? String(value)}
      aria-label={label}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
        if (digits === '') {
          setDraft('');
          return;
        }
        const qty = Math.min(max, Math.max(min, parseInt(digits, 10)));
        setDraft(String(qty));
        onCommit(qty);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={className}
    />
  );
}
