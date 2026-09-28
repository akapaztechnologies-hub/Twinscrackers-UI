import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Plus, X, Save, ChevronLeft, Upload, Link as LinkIcon, Eye, Play, Loader2, Sparkles, ExternalLink } from 'lucide-react';
import { slugify, getYouTubeId } from '@/lib/utils.ts';
import { useAuthStore } from '@/store/auth.ts';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import { Select } from '@/components/atoms/Select.tsx';
import { getCategories, type CategoryItem } from '@/services/products.ts';
import { uploadAdminImage } from '@/services/admin.ts';
import { OCCASIONS } from '@/config/occasions.ts';
import type { ProductCategory, ProductOccasion, ProductBadge } from '@/types/index.ts';
import type { AdminProduct } from '@/types/admin.ts';

const badgeOptions: (ProductBadge | '')[] = ['', 'new', 'bestseller', 'limited', 'premium', 'low-noise'];
const safetyOptions = ['family', 'standard', 'professional'] as const;
const noiseOptions = ['low', 'medium', 'high'] as const;

type Spec = { key: string; value: string };

type FormData = {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  price: string;
  originalPrice: string;
  wholesalePrice: string;
  wholesalePricePerCase: string;
  quantityPerCase: string;
  images: string[];
  category: ProductCategory;
  occasion: ProductOccasion[];
  badge: ProductBadge | '';
  rating: string;
  reviewCount: string;
  inStock: boolean;
  stockCount: string;
  features: string[];
  safetyRating: 'family' | 'standard' | 'professional';
  noiseLevel: 'low' | 'medium' | 'high';
  effects: string[];
  duration: string;
  isNew: boolean;
  isFeatured: boolean;
  isActive: boolean;
  tags: string[];
  specifications: Spec[];
  videoUrl: string;
};

const emptyForm: FormData = {
  name: '',
  slug: '',
  description: '',
  shortDescription: '',
  price: '',
  originalPrice: '',
  wholesalePrice: '',
  wholesalePricePerCase: '',
  quantityPerCase: '',
  images: [''],
  // Picked from the shop's own list once it loads — this admin serves more than
  // one shop, and a hard-coded slug may not exist in either.
  category: '' as ProductCategory,
  occasion: [],
  badge: '',
  rating: '4.5',
  reviewCount: '0',
  inStock: true,
  stockCount: '100',
  features: [''],
  safetyRating: 'family',
  noiseLevel: 'medium',
  effects: [''],
  duration: '',
  isNew: false,
  isFeatured: false,
  isActive: true,
  tags: [],
  specifications: [],
  videoUrl: '',
};

export function AdminProductFormPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isEdit = !!productId;

  const [form, setForm] = useState<FormData>(emptyForm);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [autoFilling, setAutoFilling] = useState<'short' | 'long' | null>(null);
  // An edit that never loaded must not be saveable: the form would be blank,
  // and saving it would overwrite the real product with that.
  const [loadFailed, setLoadFailed] = useState(false);
  // The count the product had when the form opened. Stock is only sent when the
  // admin changes it — otherwise saving a new description would put back a
  // figure that sales have moved on from since.
  const [loadedStock, setLoadedStock] = useState<string | null>(null);
  // Same for the In Stock switch: sent only when flipped, so an untouched
  // switch can never override what the stock count says.
  const [loadedInStock, setLoadedInStock] = useState<boolean | null>(null);
  // And the rating: approving or removing a review recomputes it on the
  // product, so an untouched box must not put back the figure from when the
  // form opened. (The review count has no box here at all — it is only ever
  // the reviews' to set, so an edit never sends it.)
  const [loadedRating, setLoadedRating] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await getCategories();
        setCategories(list);
        // A new product starts in the first category rather than none.
        if (!isEdit && list[0]) {
          setForm((f) => (f.category ? f : { ...f, category: list[0].slug as ProductCategory }));
        }
      } catch {
        setCategories([]);
      }
    })();
  }, [isEdit]);

  useEffect(() => {
    if (!productId) return;
    (async () => {
      try {
        const { getProductById } = await import('@/services/admin.ts');
        const product = await getProductById(productId);
        if (!product) {
          setLoadFailed(true);
          setError('This product could not be loaded, so it cannot be edited right now. Go back and try again.');
          return;
        }
        setLoadedStock(String(product.stockCount ?? 0));
        const ratingText = product.rating != null ? String(product.rating) : '';
        setLoadedRating(ratingText);
        setLoadedInStock(product.inStock);
        setForm({
          name: product.name,
          slug: product.slug,
          description: product.description ?? '',
          shortDescription: product.shortDescription ?? '',
          price: String(product.price),
          originalPrice: product.originalPrice ? String(product.originalPrice) : '',
          wholesalePrice: product.wholesalePrice ? String(product.wholesalePrice) : '',
          wholesalePricePerCase: product.wholesalePricePerCase ? String(product.wholesalePricePerCase) : '',
          quantityPerCase: product.quantityPerCase ? String(product.quantityPerCase) : '',
          images: product.images.length > 0 ? product.images : [''],
          category: product.category,
          occasion: product.occasion,
          badge: product.badge ?? '',
          rating: ratingText,
          reviewCount: product.reviewCount != null ? String(product.reviewCount) : '',
          inStock: product.inStock,
          stockCount: String(product.stockCount ?? 0),
          features: product.features.length > 0 ? product.features : [''],
          safetyRating: product.safetyRating,
          noiseLevel: product.noiseLevel,
          effects: product.effects.length > 0 ? product.effects : [''],
          duration: product.duration ?? '',
          isNew: product.isNew ?? false,
          isFeatured: product.isFeatured ?? false,
          isActive: product.isActive !== false,
          tags: product.tags ?? [],
          specifications: product.specifications ?? [],
          videoUrl: product.videoUrl ?? '',
        });
      } catch {
        setLoadFailed(true);
        setError('This product could not be loaded, so it cannot be edited right now. Go back and try again.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [productId]);

  /**
   * Draft a description from the fields already filled in.
   *
   * Composed on the server (`/admin/products/describe`) so the wording rules
   * live in one place, and it fills only the field that was asked for — the
   * shop may have written one of the two by hand and want the other drafted.
   */
  const autoFill = async (which: 'short' | 'long') => {
    if (!form.name.trim()) return;
    setAutoFilling(which);
    setError('');
    try {
      const { describeProduct } = await import('@/services/admin.ts');
      const text = await describeProduct({
        name: form.name,
        categorySlug: form.category,
        // How the shop quotes it, if the spec is present — it changes "sold by
        // the box" to "sold by the packet".
        soldPer: form.specifications.find((sp) => sp.key.toLowerCase() === 'sold per')?.value,
        quantityPerCase: form.quantityPerCase ? Number(form.quantityPerCase) : undefined,
      });
      setForm((f) =>
        which === 'short'
          ? { ...f, shortDescription: text.shortDescription }
          : { ...f, description: text.description },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write a description.');
    } finally {
      setAutoFilling(null);
    }
  };

  const handleNameChange = (name: string) => {
    setForm((f) => ({ ...f, name, slug: isEdit ? f.slug : slugify(name) }));
  };

  const handleListChange = (field: 'images' | 'features' | 'effects', index: number, value: string) => {
    setForm((f) => {
      const arr = [...f[field]];
      arr[index] = value;
      return { ...f, [field]: arr };
    });
  };

  const addListItem = (field: 'images' | 'features' | 'effects') => {
    setForm((f) => ({ ...f, [field]: [...f[field], ''] }));
  };

  const removeListItem = (field: 'images' | 'features' | 'effects', index: number) => {
    setForm((f) => {
      const arr = f[field].filter((_, i) => i !== index);
      return { ...f, [field]: arr.length === 0 ? [''] : arr };
    });
  };

  const toggleOccasion = (occ: ProductOccasion) => {
    setForm((f) => ({
      ...f,
      occasion: f.occasion.includes(occ)
        ? f.occasion.filter((o) => o !== occ)
        : [...f.occasion, occ],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loadFailed) return;
    if (isUploading) {
      setError('Wait for the images to finish uploading, then save.');
      return;
    }
    if (!form.name || !form.price) {
      setError('Name and price are required');
      return;
    }
    if (!form.category) {
      setError('Pick a category for this product.');
      return;
    }
    // The server insists on both; saying which one is short beats its bare
    // "Validation failed".
    if (form.shortDescription.trim().length < 5) {
      setError('The short description needs at least 5 characters — or use Auto-fill.');
      return;
    }
    if (form.description.trim().length < 10) {
      setError('The description needs at least 10 characters — or use Auto-fill.');
      return;
    }
    const stockChanged = !isEdit || form.stockCount !== loadedStock;
    const stock = Number(form.stockCount);
    if (stockChanged && (!Number.isInteger(stock) || stock < 0)) {
      setError('Stock count must be a whole number, zero or more.');
      return;
    }
    // Parsed as typed: `Number(x) || 4.5` turned a real 0 into 4.5.
    const ratingChanged = !isEdit || form.rating !== loadedRating;
    const ratingText = form.rating.trim();
    const rating = Number(ratingText);
    if (ratingChanged && ratingText !== '' && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
      setError('Rating must be between 0 and 5 — or leave it blank.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const { createProduct, updateProduct } = await import('@/services/admin.ts');
      // On an edit, an emptied optional field is sent as null — the server reads
      // that as "remove it". Left out, it would keep the old value, so a badge,
      // video or wholesale rate could never be taken off again.
      const cleared = isEdit ? null : undefined;
      const productData = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        description: form.description,
        shortDescription: form.shortDescription,
        price: Number(form.price),
        originalPrice: form.originalPrice ? Number(form.originalPrice) : cleared,
        wholesalePrice: form.wholesalePrice ? Number(form.wholesalePrice) : cleared,
        wholesalePricePerCase: form.wholesalePricePerCase ? Number(form.wholesalePricePerCase) : cleared,
        quantityPerCase: form.quantityPerCase ? Number(form.quantityPerCase) : cleared,
        images: form.images.filter(Boolean),
        category: form.category,
        occasion: form.occasion,
        badge: form.badge || cleared,
        // Each only when the admin changed it; see `loadedStock`.
        ...(ratingChanged ? { rating: ratingText === '' ? cleared : rating } : {}),
        ...(!isEdit || form.inStock !== loadedInStock ? { inStock: form.inStock } : {}),
        ...(stockChanged ? { stockCount: stock } : {}),
        features: form.features.filter(Boolean),
        safetyRating: form.safetyRating,
        noiseLevel: form.noiseLevel,
        effects: form.effects.filter(Boolean),
        duration: form.duration || cleared,
        isNew: form.isNew,
        isFeatured: form.isFeatured,
        isActive: form.isActive,
        tags: form.tags.filter(Boolean),
        specifications: form.specifications.filter((s) => s.key && s.value),
        videoUrl: form.videoUrl.trim() || cleared,
      };

      if (isEdit && productId) {
        await updateProduct(productId, productData as unknown as Partial<AdminProduct>);
      } else {
        await createProduct(productData as unknown as Parameters<typeof createProduct>[0], user?.uid ?? '');
      }
      navigate('/admin/products');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to save product');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-[calc(100vh-3.5rem)] -m-4 lg:-m-6 xl:-m-8 bg-surface-50 dark:bg-surface-950">
      {/* Top Header — Back + Actions (static, flush under topbar) */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 lg:px-6 xl:px-8 py-3 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800">
        <Link to="/admin/products" className="inline-flex items-center gap-1.5 text-body-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors">
          <ChevronLeft size={16} />
          Back to Products
        </Link>
        <div className="flex items-center gap-3">
          {/* Straight to the customer's view of this product, in its own tab —
              so checking how a photo actually landed does not mean leaving the
              form and hunting for it in the shop. */}
          {isEdit && form.slug && (
            <a
              href={`/product/${form.slug}`}
              target="_blank"
              rel="noreferrer"
              className="px-4 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors inline-flex items-center gap-1.5"
            >
              <ExternalLink size={14} />
              View on site
            </a>
          )}
          <Link
            to="/admin/products"
            className="px-4 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors inline-flex items-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSaving || isUploading || loadFailed}
            className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
          >
            <Save size={15} />
            {isSaving ? 'Saving...' : isUploading ? 'Uploading…' : isEdit ? 'Update Product' : 'Create Product'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 lg:px-6 xl:px-8 py-4 lg:py-6 space-y-6">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-body-sm font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ──────────── Primary Column (2/3) ──────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Basic Information */}
          <Card title="Basic Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Product Name">
                <input type="text" value={form.name} onChange={(e) => handleNameChange(e.target.value)} className="input-field" required />
              </Field>
              <Field label="Slug">
                <input type="text" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} className="input-field" />
              </Field>
              <Field
                label="Short Description"
                full
                action={<AutoFillButton onClick={() => void autoFill('short')} busy={autoFilling === 'short'} disabled={!form.name.trim()} />}
              >
                <input type="text" value={form.shortDescription} onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))} className="input-field" />
              </Field>
              <Field
                label="Description"
                full
                action={<AutoFillButton onClick={() => void autoFill('long')} busy={autoFilling === 'long'} disabled={!form.name.trim()} />}
              >
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="input-field resize-none" />
              </Field>
            </div>
          </Card>

          {/* Pricing + Inventory (combined) */}
          <Card title="Pricing">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Selling Price (INR)">
                <input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="input-field" required min="0" />
              </Field>
              <Field label="MRP / Original Price">
                <input type="number" value={form.originalPrice} onChange={(e) => setForm((f) => ({ ...f, originalPrice: e.target.value }))} className="input-field" min="0" />
              </Field>
              <Field label="Wholesale Rate (per piece)">
                <input type="number" value={form.wholesalePrice} onChange={(e) => setForm((f) => ({ ...f, wholesalePrice: e.target.value }))} className="input-field" min="0" placeholder="Shown in POS billing → Wholesale" />
              </Field>
              <Field label="Stock Count">
                <input type="number" value={form.stockCount} onChange={(e) => setForm((f) => ({ ...f, stockCount: e.target.value }))} className="input-field" min="0" />
              </Field>
              <Field label="Wholesale Rate (per case)">
                <input type="number" value={form.wholesalePricePerCase} onChange={(e) => setForm((f) => ({ ...f, wholesalePricePerCase: e.target.value }))} className="input-field" min="0" placeholder="Rate for one full case" />
              </Field>
              <Field label="Quantity per Case">
                <input type="number" value={form.quantityPerCase} onChange={(e) => setForm((f) => ({ ...f, quantityPerCase: e.target.value }))} className="input-field" min="1" step="1" placeholder="Pieces in one case" />
              </Field>
              {/* Both are needed before this product can be billed by the case, and
                  the derived per-piece rate is the figure that catches a typo in
                  either one — a case rate entered as a piece rate is obvious here. */}
              {Number(form.wholesalePricePerCase) > 0 && Number(form.quantityPerCase) > 0 && (
                <div className="col-span-full p-2.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                  <p className="text-body-sm font-medium text-blue-700 dark:text-blue-400">
                    ₹{Number(form.wholesalePricePerCase).toLocaleString('en-IN')} per case ÷ {form.quantityPerCase} pcs
                    {' = '}₹{(Number(form.wholesalePricePerCase) / Number(form.quantityPerCase)).toFixed(2)} per piece
                  </p>
                </div>
              )}
              {(Number(form.wholesalePricePerCase) > 0) !== (Number(form.quantityPerCase) > 0) && (
                <div className="col-span-full p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                  <p className="text-body-sm font-medium text-amber-700 dark:text-amber-400">
                    Both “Wholesale Rate (per case)” and “Quantity per Case” are needed before this product can be billed by the case.
                  </p>
                </div>
              )}
              {form.price && form.originalPrice && Number(form.originalPrice) > Number(form.price) && (
                <div className="col-span-full p-2.5 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
                  <p className="text-body-sm font-medium text-green-700 dark:text-green-400">
                    Discount: {Math.round(((Number(form.originalPrice) - Number(form.price)) / Number(form.originalPrice)) * 100)}% off
                    <span className="text-surface-500 font-normal ml-2">(Save ₹{Number(form.originalPrice) - Number(form.price)})</span>
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Images */}
          <Card title="Images">
            <ImageUploader
              images={form.images}
              onChange={(images) => setForm((f) => ({ ...f, images }))}
              onUploadingChange={setIsUploading}
            />
          </Card>

          {/* Attributes */}
          <Card title="Attributes">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Safety Rating">
                <Select
                  value={form.safetyRating}
                  onChange={(v) => setForm((f) => ({ ...f, safetyRating: v as typeof f.safetyRating }))}
                  options={safetyOptions.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
                  size="md"
                />
              </Field>
              <Field label="Noise Level">
                <Select
                  value={form.noiseLevel}
                  onChange={(v) => setForm((f) => ({ ...f, noiseLevel: v as typeof f.noiseLevel }))}
                  options={noiseOptions.map((n) => ({ value: n, label: n.charAt(0).toUpperCase() + n.slice(1) }))}
                  size="md"
                />
              </Field>
              <Field label="Duration">
                <input type="text" value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} placeholder="e.g., 45s" className="input-field" />
              </Field>
              <Field label="Rating">
                <input type="number" value={form.rating} onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))} className="input-field" min="0" max="5" step="0.1" />
              </Field>
            </div>
          </Card>

          {/* Features + Effects side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card title="Features">
              <div className="space-y-2">
                {form.features.map((feat, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={feat} onChange={(e) => handleListChange('features', i, e.target.value)} placeholder="Feature" className="input-field flex-1" />
                    <button type="button" onClick={() => removeListItem('features', i)} className="p-2 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"><X size={16} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => addListItem('features')} className="flex items-center gap-1.5 text-body-sm text-brand-600 font-medium hover:underline"><Plus size={14} /> Add Feature</button>
              </div>
            </Card>

            <Card title="Effects">
              <div className="space-y-2">
                {form.effects.map((eff, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={eff} onChange={(e) => handleListChange('effects', i, e.target.value)} placeholder="Effect" className="input-field flex-1" />
                    <button type="button" onClick={() => removeListItem('effects', i)} className="p-2 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"><X size={16} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => addListItem('effects')} className="flex items-center gap-1.5 text-body-sm text-brand-600 font-medium hover:underline"><Plus size={14} /> Add Effect</button>
              </div>
            </Card>
          </div>

          {/* Specifications */}
          <Card title="Specifications">
            <div className="space-y-2">
              {form.specifications.map((spec, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={spec.key}
                    onChange={(e) => setForm((f) => ({ ...f, specifications: f.specifications.map((s, idx) => idx === i ? { ...s, key: e.target.value } : s) }))}
                    placeholder="Key (e.g., Weight)"
                    className="input-field flex-1"
                  />
                  <input
                    type="text"
                    value={spec.value}
                    onChange={(e) => setForm((f) => ({ ...f, specifications: f.specifications.map((s, idx) => idx === i ? { ...s, value: e.target.value } : s) }))}
                    placeholder="Value (e.g., 500g)"
                    className="input-field flex-1"
                  />
                  <button type="button" onClick={() => setForm((f) => ({ ...f, specifications: f.specifications.filter((_, idx) => idx !== i) }))} className="p-2 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, specifications: [...f.specifications, { key: '', value: '' }] }))}
                className="flex items-center gap-1.5 text-body-sm text-brand-600 font-medium hover:underline"
              >
                <Plus size={14} /> Add Specification
              </button>
            </div>
          </Card>
        </div>

        {/* ──────────── Sidebar (1/3) ──────────── */}
        <div className="self-start space-y-4">

          {/* Status & Visibility */}
          <Card title="Status">
            <div className="space-y-3">
              <Toggle label="Active" description="Visible on storefront" checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              <Toggle label="In Stock" description="Available for purchase" checked={form.inStock} onChange={(v) => setForm((f) => ({ ...f, inStock: v }))} />
              <div className="border-t border-surface-100 dark:border-surface-800 pt-3">
                <Toggle label="New Badge" description="Show 'New' label" checked={form.isNew} onChange={(v) => setForm((f) => ({ ...f, isNew: v }))} />
              </div>
              <Toggle label="Featured" description="Show on homepage" checked={form.isFeatured} onChange={(v) => setForm((f) => ({ ...f, isFeatured: v }))} />
            </div>
          </Card>

          {/* Organization */}
          <Card title="Organization">
            <div className="space-y-3">
              <Field label="Category" full>
                <Select
                  value={form.category}
                  onChange={(v) => setForm((f) => ({ ...f, category: v as ProductCategory }))}
                  options={[
                    ...(form.category ? [] : [{ value: '', label: 'Choose a category' }]),
                    ...categories.map((c) => ({ value: c.slug, label: c.name })),
                  ]}
                  size="md"
                />
              </Field>
              <Field label="Badge" full>
                <Select
                  value={form.badge}
                  onChange={(v) => setForm((f) => ({ ...f, badge: v as ProductBadge | '' }))}
                  options={badgeOptions.map((b) => ({ value: b, label: b ? b.charAt(0).toUpperCase() + b.slice(1) : 'None' }))}
                  size="md"
                />
              </Field>
              <div>
                <label className="block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">Occasions</label>
                <div className="flex flex-wrap gap-1.5">
                  {OCCASIONS.map((occ) => (
                    <button key={occ.slug} type="button" onClick={() => toggleOccasion(occ.slug)} className={`px-2.5 py-1 rounded-lg text-caption font-medium border transition-colors ${form.occasion.includes(occ.slug) ? 'bg-brand-500/10 text-brand-600 border-brand-500/20' : 'text-surface-500 border-surface-200 dark:border-surface-700 hover:border-surface-300'}`}>
                      {occ.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Tags */}
          <Card title="Tags">
            <div className="space-y-2">
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.tags.map((tag, i) => (
                    <span key={i} className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 text-caption font-medium">
                      {tag}
                      <button type="button" onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((_, idx) => idx !== i) }))} className="hover:text-red-500 transition-colors">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                type="text"
                placeholder="Type a tag and press Enter"
                className="input-field"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val && !form.tags.includes(val)) {
                      setForm((f) => ({ ...f, tags: [...f.tags, val] }));
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />
              <p className="text-caption text-surface-400">Press Enter to add</p>
            </div>
          </Card>

          {/* Product Video */}
          <Card title="Product Video">
            <div className="space-y-2">
              <input
                type="url"
                value={form.videoUrl}
                onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                placeholder="Paste YouTube URL"
                className="input-field"
              />
              {(() => {
                const vid = getYouTubeId(form.videoUrl);
                if (!vid) return null;
                return (
                  <div className="relative rounded-lg overflow-hidden border border-surface-200 dark:border-surface-700">
                    <img src={`https://img.youtube.com/vi/${vid}/hqdefault.jpg`} alt="Video thumbnail" className="w-full aspect-video object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
                        <Play size={18} className="text-white ml-0.5" fill="white" />
                      </div>
                    </div>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, videoUrl: '' }))} className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                );
              })()}
              <p className="text-caption text-surface-400">Add a YouTube video showing how this cracker works</p>
            </div>
          </Card>
        </div>
      </div>
      </div>
    </form>
  );
}

// ─── Image Uploader with URL + File support ───

export function ImageUploader({
  images,
  onChange,
  onUploadingChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  /** Lets the form hold Save while files are still on their way up. */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The list as it is NOW. An upload takes seconds; merging its URLs into the
  // list captured when it started would undo a removal made in the meantime.
  const latestImages = useRef(images);
  useEffect(() => {
    latestImages.current = images;
  }, [images]);
  const [showUrl, setShowUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const addImage = (src: string) => {
    if (!src) return;
    const emptyIdx = images.findIndex((img) => !img);
    if (emptyIdx >= 0) {
      const updated = [...images];
      updated[emptyIdx] = src;
      onChange(updated);
    } else {
      onChange([...images, src]);
    }
  };

  const removeImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    onChange(updated.length === 0 ? [''] : updated);
  };

  const setAsPrimary = (index: number) => {
    if (index === 0) return;
    const valid = images.filter(Boolean);
    const moved = valid[index];
    const rest = valid.filter((_, i) => i !== index);
    onChange([moved, ...rest]);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setUploadError('');
    setIsUploading(true);
    onUploadingChange?.(true);
    try {
      const urls = await Promise.all(imageFiles.map((file) => uploadAdminImage(file, 'products')));
      // Batched into one onChange (rather than calling addImage per file as each
      // upload resolves) so concurrent uploads can't race on the same stale
      // "images" snapshot and overwrite each other down to a single surviving file.
      const next = [...latestImages.current];
      for (const url of urls) {
        const emptyIdx = next.findIndex((img) => !img);
        if (emptyIdx >= 0) next[emptyIdx] = url;
        else next.push(url);
      }
      onChange(next);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Some images failed to upload. Please try again.');
    } finally {
      setIsUploading(false);
      onUploadingChange?.(false);
    }
  };

  const handleAddUrl = () => {
    const url = urlInput.trim();
    if (url) { addImage(url); setUrlInput(''); setShowUrl(false); }
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); };

  const validImages = images.filter(Boolean);

  // Empty state
  if (validImages.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl border-2 border-dashed transition-colors ${isUploading ? 'cursor-wait' : 'cursor-pointer'} ${isDragging ? 'border-brand-500 bg-brand-500/5' : 'border-surface-300 dark:border-surface-600 hover:border-brand-400'}`}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {isUploading ? (
          <>
            <Loader2 size={20} className="text-brand-500 animate-spin" />
            <p className="text-body-sm text-surface-500">Uploading...</p>
          </>
        ) : (
          <>
            <Upload size={20} className="text-surface-400" />
            <p className="text-body-sm text-surface-500">Drop images here or <span className="text-brand-500 font-medium">browse</span></p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-caption text-surface-400">PNG, JPG, WEBP</span>
              <span className="text-surface-300">|</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); setShowUrl(true); }} className="text-caption text-brand-500 font-medium hover:underline">
                Paste URL
              </button>
            </div>
          </>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
        {showUrl && (
          <div className="flex gap-2 mt-2 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); } }} placeholder="https://..." className="input-field flex-1" autoFocus />
            <button type="button" onClick={handleAddUrl} disabled={!urlInput.trim()} className="px-3 h-9 rounded-lg bg-brand-500 text-white text-caption font-medium disabled:opacity-40">Add</button>
          </div>
        )}
        {uploadError && <p className="text-caption text-red-500 mt-1">{uploadError}</p>}
      </div>
    );
  }

  // Horizontal scroll strip — all same size
  return (
    <div
      className={`space-y-2 ${isDragging ? 'ring-2 ring-brand-500/30 rounded-xl' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {validImages.map((img, i) => (
          // Was an inline style reading --color-brand-500, a variable that has
          // never existed, so this rendered its red fallback instead of gold.
          <div key={i} className={`relative group w-20 h-20 rounded-lg overflow-hidden border-2 bg-surface-50 dark:bg-surface-800 flex-shrink-0 ${i === 0 ? 'border-brand-500' : 'border-surface-200 dark:border-surface-700'}`}>
            <img src={img} alt="" className="w-full h-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            {i === 0 && (
              <span className="absolute top-1 left-1 px-1 py-px rounded text-[8px] font-bold uppercase bg-brand-500 text-white">Main</span>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
            <button type="button" onClick={() => setPreviewImg(img)} className="absolute inset-0 m-auto w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
              <Eye size={14} />
            </button>
            <button type="button" onClick={() => removeImage(images.indexOf(img))} className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
              <X size={10} />
            </button>
            {i > 0 && (
              <button type="button" onClick={() => setAsPrimary(i)} className="absolute bottom-0.5 inset-x-0.5 rounded bg-black/60 text-white text-[8px] font-medium text-center py-px opacity-0 group-hover:opacity-100 transition-opacity hover:bg-brand-500">
                Set main
              </button>
            )}
          </div>
        ))}
        {/* Add tile */}
        <button
          type="button"
          onClick={() => !isUploading && fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-20 h-20 rounded-lg border-2 border-dashed border-surface-300 dark:border-surface-600 flex flex-col items-center justify-center gap-0.5 text-surface-400 hover:border-brand-400 hover:text-brand-500 transition-colors flex-shrink-0 disabled:opacity-60 disabled:cursor-wait"
        >
          {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          <span className="text-[9px] font-medium">{isUploading ? 'Uploading' : 'Add'}</span>
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />

      {/* Bottom actions row */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-caption font-medium text-surface-500 hover:text-brand-500 hover:bg-brand-500/5 transition-colors disabled:opacity-50">
          <Upload size={12} /> Upload
        </button>
        <button type="button" onClick={() => setShowUrl(!showUrl)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-caption font-medium text-surface-500 hover:text-brand-500 hover:bg-brand-500/5 transition-colors">
          <LinkIcon size={12} /> URL
        </button>
        <span className="ml-auto text-caption text-surface-400">{validImages.length} image{validImages.length !== 1 ? 's' : ''}</span>
      </div>

      {uploadError && <p className="text-caption text-red-500">{uploadError}</p>}

      {showUrl && (
        <div className="flex gap-2">
          <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); } }} placeholder="Paste image URL and press Enter" className="input-field flex-1" autoFocus />
          <button type="button" onClick={handleAddUrl} disabled={!urlInput.trim()} className="px-3 h-9 rounded-lg bg-brand-500 text-white text-body-sm font-medium disabled:opacity-40 transition-colors">Add</button>
        </div>
      )}

      {/* Image preview modal */}
      {previewImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={previewImg} alt="Preview" className="max-w-full max-h-[85vh] rounded-xl object-contain" />
            <button type="button" onClick={() => setPreviewImg(null)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 shadow-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-4">
      <h2 className="font-display font-semibold text-body-sm text-surface-900 dark:text-surface-50 mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  full,
  action,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  /** Optional control shown on the right of the label row, e.g. "Auto-fill". */
  action?: React.ReactNode;
}) {
  return (
    <div className={full ? 'col-span-full' : ''}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="block text-body-sm font-medium text-surface-700 dark:text-surface-300">
          {label}
        </label>
        {action}
      </div>
      {children}
    </div>
  );
}


/** The small "Auto-fill" control that sits on a description field's label row. */
function AutoFillButton({
  onClick,
  busy,
  disabled,
}: {
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      // Without a name there is nothing to write about, so the button says so
      // rather than failing when pressed.
      title={disabled ? 'Enter a product name first' : 'Write this from the name and category'}
      className="inline-flex items-center gap-1 text-caption font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Sparkles size={13} />
      {busy ? 'Writing…' : 'Auto-fill'}
    </button>
  );
}
