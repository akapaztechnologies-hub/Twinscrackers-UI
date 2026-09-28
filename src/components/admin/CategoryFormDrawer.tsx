import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X } from 'lucide-react';
import { slugify } from '@/lib/utils.ts';
import { useAuthStore } from '@/store/auth.ts';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import { ImageUploadField } from '@/components/admin/ImageUploadField.tsx';

type FormData = {
  name: string;
  slug: string;
  description: string;
  image: string;
  displayOrder: string;
  isActive: boolean;
};

const emptyForm: FormData = {
  name: '',
  slug: '',
  description: '',
  image: '',
  displayOrder: '0',
  isActive: true,
};

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

interface CategoryFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  categoryId: string | null;
  onSuccess: () => void;
}

export function CategoryFormDrawer({ isOpen, onClose, categoryId, onSuccess }: CategoryFormDrawerProps) {
  const user = useAuthStore((s) => s.user);
  const isEdit = !!categoryId;

  const [form, setForm] = useState<FormData>(emptyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset form or fetch data when drawer opens
  useEffect(() => {
    if (isOpen) {
      if (categoryId) {
        setIsLoading(true);
        (async () => {
          try {
            const { getCategoryById } = await import('@/services/admin.ts');
            const category = await getCategoryById(categoryId);
            if (category) {
              setForm({
                name: category.name,
                slug: category.slug,
                description: category.description,
                image: category.image ?? '',
                displayOrder: String(category.displayOrder),
                isActive: category.isActive,
              });
            }
          } catch {
            setError('Failed to load category');
          } finally {
            setIsLoading(false);
          }
        })();
      } else {
        setForm(emptyForm);
        setError('');
      }
    }
  }, [isOpen, categoryId]);

  const handleNameChange = (name: string) => {
    setForm((f) => ({ ...f, name, slug: isEdit ? f.slug : slugify(name) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      setError('Name is required');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const { createCategory, updateCategory } = await import('@/services/admin.ts');
      const categoryData = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        description: form.description,
        image: form.image || undefined,
        displayOrder: Number(form.displayOrder) || 0,
        isActive: form.isActive,
      };

      if (isEdit && categoryId) {
        await updateCategory(categoryId, categoryData);
      } else {
        await createCategory(categoryData, user?.uid ?? '');
      }
      onSuccess();
      onClose();
    } catch (err) {
      // The server's reason ("Slug already in use") is the useful part.
      setError(err instanceof Error && err.message ? err.message : 'Failed to save category');
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/60"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 z-[101] w-full max-w-lg bg-white dark:bg-surface-900 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-surface-200 dark:border-surface-800">
              <h2 className="font-display font-semibold text-heading-sm text-surface-900 dark:text-surface-50">
                {isEdit ? 'Edit Category' : 'Add Category'}
              </h2>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-10 h-10 rounded-xl text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
                </div>
              ) : (
                <form id="category-form" onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
                      {error}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className={labelClass}>Category Name</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className={inputClass}
                        placeholder="e.g., Aerial Fireworks"
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Slug</label>
                      <input
                        type="text"
                        value={form.slug}
                        onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                        className={inputClass}
                        placeholder="auto-generated"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Description</label>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        className={`${inputClass} resize-none`}
                        rows={3}
                        placeholder="Brief description of this category"
                      />
                    </div>
                    <ImageUploadField
                      label="Category Image"
                      value={form.image}
                      onChange={(url) => setForm((f) => ({ ...f, image: url }))}
                      folder="categories"
                      previewClassName="w-28 h-28 rounded-xl"
                    />
                  </div>

                  <div className="pt-6 mt-6 border-t border-surface-200 dark:border-surface-800 space-y-4">
                    <h3 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
                      Settings
                    </h3>
                    <Toggle
                      label="Active"
                      description="Show on the storefront"
                      checked={form.isActive}
                      onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                    />
                    <div>
                      <label className={labelClass}>Display Order</label>
                      <input
                        type="number"
                        value={form.displayOrder}
                        onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
                        className={inputClass}
                        min="0"
                      />
                      <p className="text-caption text-surface-400 mt-1">Lower numbers appear first</p>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-surface-200 dark:border-surface-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-10 rounded-xl border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors"
              >
                Cancel
              </button>
              <button
                form="category-form"
                type="submit"
                disabled={isSaving || isLoading}
                className="flex items-center gap-2 px-4 h-10 rounded-xl bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : isEdit ? 'Update Category' : 'Create Category'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
