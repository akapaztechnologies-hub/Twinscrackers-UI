/**
 * A colour swatch paired with a hex box.
 *
 * There were three hand-rolled copies of this in the admin and only one of
 * them guarded the value. That matters: `<input type="color">` silently
 * coerces anything it cannot parse to #000000, so a half-typed hex made the
 * swatch show black and quietly lie about what was stored.
 */
interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Shown under the field — say what the colour actually affects. */
  hint?: string;
  /** What the swatch shows while `value` is not yet a valid hex. */
  fallback?: string;
}

const HEX = /^#([0-9a-f]{6})$/i;

export function ColorField({ label, value, onChange, hint, fallback = '#000000' }: ColorFieldProps) {
  const safe = HEX.test(value.trim()) ? value.trim() : fallback;
  const invalid = value.trim().length > 0 && !HEX.test(value.trim());

  return (
    <div>
      <label className="block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={`${label} colour picker`}
          className="h-11 w-14 shrink-0 rounded-lg border border-surface-200 dark:border-surface-700 cursor-pointer bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          spellCheck={false}
          aria-label={`${label} hex value`}
          className={`w-full px-3.5 py-2.5 rounded-xl border bg-white dark:bg-surface-800 text-body-sm font-mono uppercase text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 transition-shadow ${
            invalid
              ? 'border-red-400 focus:ring-red-500/20'
              : 'border-surface-200 dark:border-surface-700 focus:ring-brand-500/20 focus:border-brand-500/40'
          }`}
          placeholder={fallback}
        />
      </div>
      {invalid ? (
        <p className="mt-1.5 text-caption text-red-500">Needs six hex digits, like {fallback}.</p>
      ) : (
        hint && <p className="mt-1.5 text-caption text-surface-500 dark:text-surface-400">{hint}</p>
      )}
    </div>
  );
}
