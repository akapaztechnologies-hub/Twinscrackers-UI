interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  columns?: 1 | 2;
}

export function FormSection({ title, description, children, columns = 2 }: FormSectionProps) {
  return (
    <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-5">
      <div className="mb-4">
        <h2 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
          {title}
        </h2>
        {description && (
          <p className="text-caption text-surface-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className={`grid gap-4 ${columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        {children}
      </div>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  hint?: string;
  required?: boolean;
}

export function FormField({ label, children, full, hint, required }: FormFieldProps) {
  return (
    <div className={full ? 'col-span-full' : ''}>
      <label className="block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-caption text-surface-400 mt-1">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

// eslint-disable-next-line react-refresh/only-export-components -- shared field styling colocated with the form primitives
export const selectClass = inputClass;
