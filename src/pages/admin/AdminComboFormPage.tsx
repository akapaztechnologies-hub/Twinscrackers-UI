import { useState, useEffect, useCallback, useRef, useMemo, type RefObject } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Plus, Minus, Trash2, X, Save, ChevronLeft, Search, ShoppingBag, Pause, Play, ExternalLink } from 'lucide-react';
import { slugify, cn, formatPrice } from '@/lib/utils.ts';
import {
  istDayStart,
  istDayEnd,
  istToday,
  addIstDays,
  toIstDay,
  offerStatus,
} from '@/lib/comboWindow.ts';
import { useAuthStore } from '@/store/auth.ts';
import { Toggle } from '@/components/atoms/Toggle.tsx';
import { DatePicker } from '@/components/atoms/DatePicker.tsx';
import { ImageUploader } from '@/pages/admin/AdminProductFormPage.tsx';
import type { AdminProduct } from '@/types/admin.ts';

type ComboSelection = { id: string; name: string; image?: string; mrp: number; rate: number; stock: number | null; quantity: number };

// ── Draft autosave + Hold, same pattern as Billing's held-bills feature ──
const LS_DRAFT = 'ak_combo_draft';
const LS_HELD = 'ak_held_combos';
const LS_CAP = 20;

interface HeldCombo {
  id: string;
  heldAt: string;
  name: string;
  itemCount: number;
  price: number;
  form: FormData;
  selection: ComboSelection[];
}

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — ignore */
  }
}

type FormData = {
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  price: string;
  originalPrice: string;
  images: string[];
  stockCount: string;
  rating: string;
  reviewCount: string;
  isActive: boolean;
  /** IST dates ('YYYY-MM-DD') as typed; widened to whole days on save. */
  offerStartsOn: string;
  offerEndsOn: string;
};

const emptyForm: FormData = {
  name: '',
  slug: '',
  shortDescription: '',
  description: '',
  price: '',
  originalPrice: '',
  images: [''],
  stockCount: '100',
  rating: '',
  reviewCount: '',
  isActive: true,
  offerStartsOn: '',
  offerEndsOn: '',
};

/** The lengths a seasonal pack actually runs for, so the admin picks instead of
 *  counting days on a calendar. Each one sets the end date from the start. */
const OFFER_PRESETS = [
  { label: '1 week', days: 7 },
  { label: '15 days', days: 15 },
  { label: '1 month', days: 30 },
];

function generateComboDescriptions(selection: ComboSelection[]): { short: string; long: string } {
  const names = selection.map((c) => c.name);
  const n = names.length;
  const preview = names.slice(0, 3).join(', ') + (n > 3 ? ` +${n - 3} more` : '');
  return {
    short: `Combo of ${n} item${n === 1 ? '' : 's'}: ${preview}`,
    long: `This combo pack includes ${n} item${n === 1 ? '' : 's'}: ${names.join(', ')}. A hand-picked bundle at one combo price.`,
  };
}

function toSelection(p: { id: string; name: string; images: string[]; originalPrice?: number; price?: number; stockCount?: number }, quantity: number): ComboSelection {
  return {
    id: p.id,
    name: p.name,
    image: p.images[0],
    mrp: p.originalPrice ?? p.price ?? 0,
    rate: p.price ?? 0,
    stock: typeof p.stockCount === 'number' ? p.stockCount : null,
    quantity,
  };
}

/** Dedicated combo builder — a fixed-viewport, two-pane layout matching the
 *  Billing screen: a search-driven "add item" table on the left (search,
 *  pick, cursor jumps to Qty), combo details + publish on the right. Saved
 *  as a normal Product (isCombo: true) — combos sit outside the browsing
 *  category taxonomy entirely, no category is required. */
export function AdminComboFormPage() {
  const { comboId } = useParams<{ comboId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isEdit = !!comboId;

  const [form, setForm] = useState<FormData>(emptyForm);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  // An edit that never loaded must not be saveable — the blank form would
  // overwrite the real combo.
  const [loadFailed, setLoadFailed] = useState(false);
  // Stock as it was when the form opened; only sent back when the admin
  // changes it, so saving never undoes sales made while the form was open.
  const [loadedStock, setLoadedStock] = useState<string | null>(null);
  // Likewise the rating and review count: approving a review recomputes both,
  // so boxes left alone must not put back the figures from when the form opened.
  const [loadedRating, setLoadedRating] = useState<string | null>(null);
  const [loadedReviewCount, setLoadedReviewCount] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [comboSelection, setComboSelection] = useState<ComboSelection[]>([]);
  const [catalog, setCatalog] = useState<AdminProduct[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const tableSearchRef = useRef<HTMLInputElement>(null);

  // Draft autosave + Hold — only meaningful while creating (an edit is already
  // saved in the DB). Restores an unsaved draft on mount, then keeps saving as
  // you type, so a refresh or accidental navigation never loses in-progress work.
  const [heldCombos, setHeldCombos] = useState<HeldCombo[]>([]);
  const [heldPanelOpen, setHeldPanelOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const draftRestored = useRef(false);

  useEffect(() => {
    if (isEdit) return;
    setHeldCombos(loadLS<HeldCombo[]>(LS_HELD, []));
    const draft = loadLS<{ form: FormData; selection: ComboSelection[] } | null>(LS_DRAFT, null);
    if (draft && (draft.form.name || draft.selection.length > 0)) {
      setForm(draft.form);
      setComboSelection(draft.selection);
      setNotice('Restored your unsaved draft.');
    }
    draftRestored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave (debounced) — skipped until the restore-on-mount check above has run,
  // so it can't immediately overwrite a draft with the pre-restore empty form.
  useEffect(() => {
    if (isEdit || !draftRestored.current) return;
    const t = setTimeout(() => {
      if (form.name || comboSelection.length > 0) {
        saveLS(LS_DRAFT, { form, selection: comboSelection });
      } else {
        localStorage.removeItem(LS_DRAFT);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [isEdit, form, comboSelection]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const holdCombo = () => {
    if (!form.name && comboSelection.length === 0) {
      setError('Nothing to hold — add a name or some products first.');
      return;
    }
    const held: HeldCombo = {
      id: `held_${Date.now()}`,
      heldAt: new Date().toISOString(),
      name: form.name || 'Untitled combo',
      itemCount: comboSelection.length,
      price: Number(form.price) || 0,
      form,
      selection: comboSelection,
    };
    setHeldCombos((prev) => {
      const next = [held, ...prev].slice(0, LS_CAP);
      saveLS(LS_HELD, next);
      return next;
    });
    setForm(emptyForm);
    setComboSelection([]);
    localStorage.removeItem(LS_DRAFT);
    setNotice('Combo held. Resume it any time from "Held".');
  };

  const resumeHeld = (id: string) => {
    const held = heldCombos.find((h) => h.id === id);
    if (!held) return;
    setForm(held.form);
    setComboSelection(held.selection);
    setHeldCombos((prev) => {
      const next = prev.filter((h) => h.id !== id);
      saveLS(LS_HELD, next);
      return next;
    });
    setHeldPanelOpen(false);
  };

  const discardHeld = (id: string) => {
    setHeldCombos((prev) => {
      const next = prev.filter((h) => h.id !== id);
      saveLS(LS_HELD, next);
      return next;
    });
  };

  // Preload the (active, non-combo) catalog once — small enough (few hundred
  // products) that local search is instant, same approach as Billing.
  useEffect(() => {
    (async () => {
      try {
        const { getAllProducts } = await import('@/services/admin.ts');
        const { data } = await getAllProducts({ status: 'active', sort: 'name', isCombo: false, limit: 500 });
        setCatalog(data);
      } catch {
        setCatalog([]);
      } finally {
        setIsLoadingCatalog(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!comboId) return;
    (async () => {
      try {
        const { getProductById } = await import('@/services/admin.ts');
        const combo = await getProductById(comboId);
        if (!combo) {
          setLoadFailed(true);
          setError('This combo could not be loaded, so it cannot be edited right now. Go back and try again.');
          return;
        }
        setLoadedStock(String(combo.stockCount ?? 0));
        // `!= null`, not truthiness: a real 0 is a value, not a blank.
        const ratingText = combo.rating != null ? String(combo.rating) : '';
        const reviewCountText = combo.reviewCount != null ? String(combo.reviewCount) : '';
        setLoadedRating(ratingText);
        setLoadedReviewCount(reviewCountText);
        setForm({
          name: combo.name,
          slug: combo.slug,
          shortDescription: combo.shortDescription ?? '',
          description: combo.description ?? '',
          price: String(combo.price),
          originalPrice: combo.originalPrice ? String(combo.originalPrice) : '',
          images: combo.images.length > 0 ? combo.images : [''],
          stockCount: String(combo.stockCount ?? 0),
          rating: ratingText,
          reviewCount: reviewCountText,
          isActive: combo.isActive !== false,
          offerStartsOn: toIstDay(combo.offerStartsAt),
          offerEndsOn: toIstDay(combo.offerEndsAt),
        });
        const items = combo.comboItems ?? [];
        setComboSelection(
          items.flatMap((item) => {
            if (!item.product || typeof item.product === 'string') return [];
            return [toSelection({ id: item.product.id, name: item.product.name, images: item.product.images, originalPrice: item.product.originalPrice, price: item.product.price, stockCount: item.product.stockCount }, item.quantity)];
          }),
        );
        // A product that no longer exists cannot be shown as a row, and saving
        // writes the rows back — so say so rather than drop it without a word.
        const missing = items.filter((item) => !item.product || typeof item.product === 'string').length;
        if (missing > 0) {
          setError(
            `${missing} item${missing === 1 ? '' : 's'} in this combo no longer exist${missing === 1 ? 's' : ''} in the catalogue and will be taken out when you save.`,
          );
        }
      } catch {
        setLoadFailed(true);
        setError('This combo could not be loaded, so it cannot be edited right now. Go back and try again.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [comboId]);

  const addComboItem = useCallback((product: AdminProduct) => {
    setComboSelection((prev) => {
      const existing = prev.find((c) => c.id === product.id);
      if (existing) return prev.map((c) => (c.id === product.id ? { ...c, quantity: c.quantity + 1 } : c));
      return [...prev, toSelection(product, 1)];
    });
  }, []);

  const changeComboItem = useCallback((id: string, product: AdminProduct) => {
    setComboSelection((prev) => {
      const target = prev.find((c) => c.id === id);
      if (!target) return prev;
      const dupe = prev.find((c) => c.id === product.id && c.id !== id);
      if (dupe) {
        return prev.filter((c) => c.id !== id).map((c) => (c.id === dupe.id ? { ...c, quantity: c.quantity + target.quantity } : c));
      }
      return prev.map((c) => (c.id === id ? toSelection(product, c.quantity) : c));
    });
  }, []);

  const updateComboQuantity = useCallback((id: string, quantity: number) => {
    setComboSelection((prev) => (quantity <= 0 ? prev.filter((c) => c.id !== id) : prev.map((c) => (c.id === id ? { ...c, quantity } : c))));
  }, []);

  /**
   * What typing into the Qty box does. Unlike the −/bin buttons it never
   * removes the row: clearing the box to type a new number passes through
   * "empty", and that used to delete the product from the combo mid-edit.
   * An empty or zero quantity is caught on save instead.
   */
  const typeComboQuantity = useCallback((id: string, quantity: number) => {
    setComboSelection((prev) => prev.map((c) => (c.id === id ? { ...c, quantity: Math.max(0, quantity) } : c)));
  }, []);

  const itemsTotal = comboSelection.reduce((sum, c) => sum + c.rate * c.quantity, 0);

  // What the dates currently in the form would mean once saved — shown under
  // them, so the admin reads "Live until 5 Nov" rather than checking the
  // storefront afterwards to find out.
  const offerPreview = offerStatus({
    offerStartsAt: form.offerStartsOn ? istDayStart(form.offerStartsOn) : null,
    offerEndsAt: form.offerEndsOn ? istDayEnd(form.offerEndsOn) : null,
  });

  /**
   * Presets run from the start date when one is set, otherwise from today. The
   * end date is inclusive, so "1 week" ends six days after the first day —
   * start + 7 would have run for eight.
   */
  const applyOfferPreset = (days: number) =>
    setForm((f) => ({ ...f, offerEndsOn: addIstDays(f.offerStartsOn || istToday(), days - 1) }));

  const handleNameChange = (name: string) => {
    setForm((f) => ({ ...f, name, slug: isEdit ? f.slug : slugify(name) }));
  };

  const handleSubmit = async () => {
    if (loadFailed) return;
    if (isUploading) {
      setError('Wait for the images to finish uploading, then save.');
      return;
    }
    if (!form.name || !form.price) {
      setError('Name and price are required');
      return;
    }
    if (comboSelection.length === 0) {
      setError('Add at least one product to the combo');
      return;
    }
    if (comboSelection.some((c) => !Number.isInteger(c.quantity) || c.quantity < 1)) {
      setError('Every item needs a whole-number quantity of 1 or more — or remove it.');
      return;
    }
    // The server insists on both; naming the short one beats "Validation failed".
    if (form.shortDescription.trim().length < 5) {
      setError('The short description needs at least 5 characters — "Auto-fill from items" writes one.');
      return;
    }
    if (form.description.trim().length < 10) {
      setError('The description needs at least 10 characters — "Auto-fill from items" writes one.');
      return;
    }
    const stockChanged = !isEdit || form.stockCount !== loadedStock;
    const stock = Number(form.stockCount);
    if (stockChanged && (!Number.isInteger(stock) || stock < 0)) {
      setError('Stock count must be a whole number, zero or more.');
      return;
    }
    const ratingChanged = !isEdit || form.rating !== loadedRating;
    const ratingText = form.rating.trim();
    const rating = Number(ratingText);
    if (ratingChanged && ratingText !== '' && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
      setError('Rating must be between 0 and 5 — or leave it blank.');
      return;
    }
    const reviewCountChanged = !isEdit || form.reviewCount !== loadedReviewCount;
    const reviewCountText = form.reviewCount.trim();
    const reviewCount = Number(reviewCountText);
    if (reviewCountChanged && reviewCountText !== '' && (!Number.isInteger(reviewCount) || reviewCount < 0)) {
      setError('Review count must be a whole number, zero or more — or leave it blank.');
      return;
    }
    // Both of these publish a combo nobody can ever buy, and the only sign of it
    // would be the combo never appearing on the storefront.
    if (form.offerStartsOn && form.offerEndsOn && form.offerEndsOn < form.offerStartsOn) {
      setError('The offer must end after it starts');
      return;
    }
    if (form.offerEndsOn && form.offerEndsOn < istToday()) {
      setError('That end date has already passed — pick a later one, or clear it');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const { createProduct, updateProduct } = await import('@/services/admin.ts');
      // An emptied optional field goes as null on an edit — "remove it". Left
      // out, the server would keep the old MRP or rating.
      const cleared = isEdit ? null : undefined;
      const payload = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        description: form.description,
        shortDescription: form.shortDescription,
        price: Number(form.price),
        originalPrice: form.originalPrice ? Number(form.originalPrice) : cleared,
        images: form.images.filter(Boolean),
        isCombo: true,
        ...(stockChanged ? { stockCount: stock } : {}),
        // Only when changed; see `loadedRating`. Blank clears.
        ...(ratingChanged ? { rating: ratingText === '' ? cleared : rating } : {}),
        ...(reviewCountChanged ? { reviewCount: reviewCountText === '' ? cleared : reviewCount } : {}),
        isActive: form.isActive,
        // A date the admin cleared has to be sent as null, not left out — on an
        // edit an absent key keeps whatever is stored, which would make "remove
        // the end date" do nothing.
        offerStartsAt: form.offerStartsOn ? istDayStart(form.offerStartsOn) : null,
        offerEndsAt: form.offerEndsOn ? istDayEnd(form.offerEndsOn) : null,
        comboItems: comboSelection.map((c) => ({ product: c.id, quantity: c.quantity })),
      };

      if (isEdit && comboId) {
        await updateProduct(comboId, payload as unknown as Partial<AdminProduct>);
      } else {
        await createProduct(payload as never, user?.uid ?? '');
      }
      localStorage.removeItem(LS_DRAFT);
      navigate('/admin/combos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save combo');
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

  const canSave = !isSaving && !isUploading && !loadFailed && !!form.name && !!form.price && comboSelection.length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-4 lg:-m-6 xl:-m-8 bg-surface-50 dark:bg-surface-950">
      {/* Header — fixed, non-scrolling */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800">
        <Link to="/admin/combos" className="inline-flex items-center gap-1.5 text-body-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors">
          <ChevronLeft size={16} />
          Back to Combos
        </Link>
        <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-50 truncate">
          {isEdit ? form.name || 'Edit Combo' : 'New Combo'}
        </p>
        <div className="flex items-center gap-2">
          {/* The customer's view of this pack, in its own tab — same reason as
              the product form: checking a photo should not mean leaving here. */}
          {isEdit && form.slug && (
            <a
              href={`/combo-packs/${form.slug}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors inline-flex items-center gap-1.5"
            >
              <ExternalLink size={14} /> View on site
            </a>
          )}
          {!isEdit && heldCombos.length > 0 && (
            <button
              type="button"
              onClick={() => setHeldPanelOpen(true)}
              className="relative px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors inline-flex items-center gap-1.5"
            >
              <Pause size={14} /> Held
              <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold">{heldCombos.length}</span>
            </button>
          )}
          <Link
            to="/admin/combos"
            className="px-4 h-9 rounded-lg border border-surface-200 dark:border-surface-700 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors inline-flex items-center"
          >
            Cancel
          </Link>
        </div>
      </div>

      {(error || notice) && (
        <div className="shrink-0 px-4 pt-2">
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-caption font-medium">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError('')}><X size={14} /></button>
            </div>
          )}
          {notice && !error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 text-caption font-medium">
              <span className="flex-1">{notice}</span>
              <button onClick={() => setNotice('')}><X size={14} /></button>
            </div>
          )}
        </div>
      )}

      {/* Main split */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT — search-to-add products table */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-surface-200 dark:border-surface-800 overflow-y-auto">
          <ComboItemsTable
            selection={comboSelection}
            catalog={catalog}
            isLoadingCatalog={isLoadingCatalog}
            onAdd={addComboItem}
            onChange={changeComboItem}
            onQtyDelta={(id, d) => {
              const item = comboSelection.find((c) => c.id === id);
              if (item) updateComboQuantity(id, Math.max(0, item.quantity + d));
            }}
            onQty={typeComboQuantity}
            onRemove={(id) => updateComboQuantity(id, 0)}
            tableSearchRef={tableSearchRef}
          />
        </div>

        {/* RIGHT — combo details sidebar */}
        <div className="w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col bg-white dark:bg-surface-900 min-h-0 overflow-y-auto">
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-label uppercase tracking-wider text-surface-400 font-semibold">Combo Details</h2>
              {itemsTotal > 0 && (
                <span className="text-caption text-surface-500">
                  Items total ({comboSelection.reduce((n, c) => n + c.quantity, 0)} qty): <span className="font-bold text-surface-900 dark:text-surface-100 tabular-nums">{formatPrice(itemsTotal)}</span>
                </span>
              )}
            </div>

            <FormField label="Combo Name">
              <input type="text" value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g., Diwali Combo Pack" className="input-field" required />
            </FormField>
            <FormField label="Slug">
              <input type="text" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="e.g., diwali-combo-pack" className="input-field" />
            </FormField>
            <FormField
              label="Short Description"
              action={comboSelection.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const { short, long } = generateComboDescriptions(comboSelection);
                    setForm((f) => ({ ...f, shortDescription: short, description: f.description || long }));
                  }}
                  className="text-caption font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Auto-fill from items
                </button>
              ) : undefined}
            >
              <input type="text" value={form.shortDescription} onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))} placeholder="e.g., Perfect combo for Diwali celebrations" className="input-field" />
            </FormField>
            <FormField label="Description">
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="e.g., A hand-picked bundle of aerial shells, sparklers and rockets for a complete Diwali celebration." className="input-field resize-none" />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Combo Price (INR)">
                <input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="e.g., 999" className="input-field" min="0" required />
              </FormField>
              <FormField label="MRP / Original">
                <input type="number" value={form.originalPrice} onChange={(e) => setForm((f) => ({ ...f, originalPrice: e.target.value }))} placeholder="e.g., 1499" className="input-field" min="0" />
              </FormField>
            </div>
            {itemsTotal > 0 && (
              <p className="text-caption text-surface-400">
                Items are worth {formatPrice(itemsTotal)} at their own rates
                {form.price && Number(form.price) < itemsTotal && (
                  <> — combo price is {Math.round(((itemsTotal - Number(form.price)) / itemsTotal) * 100)}% cheaper</>
                )}
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Stock Count">
                <input type="number" value={form.stockCount} onChange={(e) => setForm((f) => ({ ...f, stockCount: e.target.value }))} className="input-field" min="0" />
              </FormField>
              <FormField label="Rating">
                <input type="number" value={form.rating} onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))} placeholder="e.g., 4.5" className="input-field" min="0" max="5" step="0.1" />
              </FormField>
              <FormField label="Review Count">
                <input type="number" value={form.reviewCount} onChange={(e) => setForm((f) => ({ ...f, reviewCount: e.target.value }))} placeholder="e.g., 12" className="input-field" min="0" />
              </FormField>
            </div>
            {form.price && form.originalPrice && Number(form.originalPrice) > Number(form.price) && (
              <div className="p-2.5 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
                <p className="text-caption font-medium text-green-700 dark:text-green-400">
                  {Math.round(((Number(form.originalPrice) - Number(form.price)) / Number(form.originalPrice)) * 100)}% off · Save ₹{Number(form.originalPrice) - Number(form.price)}
                </p>
              </div>
            )}

            <div className="p-3 rounded-xl border border-surface-200 dark:border-surface-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-label uppercase tracking-wider text-surface-400 font-semibold">Offer Period</h3>
                {(form.offerStartsOn || form.offerEndsOn) && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, offerStartsOn: '', offerEndsOn: '' }))}
                    className="text-caption font-medium text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:underline"
                  >
                    Clear dates
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Available From">
                  <DatePicker
                    value={form.offerStartsOn}
                    onChange={(v) => setForm((f) => ({ ...f, offerStartsOn: v }))}
                    max={form.offerEndsOn || undefined}
                    size="md"
                    aria-label="Offer available from"
                  />
                </FormField>
                <FormField label="Available Until">
                  <DatePicker
                    value={form.offerEndsOn}
                    onChange={(v) => setForm((f) => ({ ...f, offerEndsOn: v }))}
                    min={form.offerStartsOn || istToday()}
                    size="md"
                    aria-label="Offer available until"
                  />
                </FormField>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-caption text-surface-400">Runs for</span>
                {OFFER_PRESETS.map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => applyOfferPreset(preset.days)}
                    className="px-2.5 h-7 rounded-lg border border-surface-200 dark:border-surface-700 text-caption font-medium text-surface-600 dark:text-surface-400 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p
                className={cn(
                  'text-caption',
                  offerPreview.state === 'ended'
                    ? 'text-red-600 dark:text-red-400 font-medium'
                    : offerPreview.state === 'always'
                      ? 'text-surface-400'
                      : 'text-surface-500 dark:text-surface-400',
                )}
              >
                {offerPreview.state === 'always'
                  ? 'No dates set — this combo sells until you deactivate it.'
                  : `${offerPreview.label}. Customers stop seeing it the moment the offer closes.`}
              </p>
            </div>

            <FormField label="Images">
              <ImageUploader
                images={form.images}
                onChange={(images) => setForm((f) => ({ ...f, images }))}
                onUploadingChange={setIsUploading}
              />
            </FormField>

            <div className="pt-1">
              <Toggle label="Active" description="Visible on storefront" checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer — fixed, non-scrolling */}
      <footer className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-surface-900 border-t border-surface-200 dark:border-surface-800">
        <span className="text-caption text-surface-400 flex-shrink-0 hidden sm:inline">
          {comboSelection.length} item{comboSelection.length !== 1 ? 's' : ''} in combo
        </span>
        {!isEdit && (
          <button
            type="button"
            onClick={holdCombo}
            className="flex items-center gap-1.5 px-4 h-10 rounded-xl border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-850 transition-colors flex-shrink-0"
          >
            <Pause size={15} /> Hold
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!canSave}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-body-sm hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shadow-brand-500/20"
        >
          <Save size={16} />
          {isSaving ? 'Saving…' : isUploading ? 'Uploading…' : isEdit ? `Update Combo${form.price ? `  ·  ₹${form.price}` : ''}` : `Publish Combo${form.price ? `  ·  ₹${form.price}` : ''}`}
        </button>
      </footer>

      {heldPanelOpen && (
        <HeldCombosPanel held={heldCombos} onResume={resumeHeld} onDiscard={discardHeld} onClose={() => setHeldPanelOpen(false)} />
      )}
    </div>
  );
}

function HeldCombosPanel({ held, onResume, onDiscard, onClose }: { held: HeldCombo[]; onResume: (id: string) => void; onDiscard: (id: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white dark:bg-surface-900 rounded-t-2xl sm:rounded-2xl border border-surface-200 dark:border-surface-800 shadow-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-800">
          <h2 className="font-display font-semibold text-body-sm text-surface-900 dark:text-surface-50 flex items-center gap-2">
            <Pause size={15} className="text-brand-500" /> Held Combos ({held.length})
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {held.length === 0 ? (
            <p className="text-center text-caption text-surface-400 py-10">No held combos.</p>
          ) : (
            <div className="divide-y divide-surface-50 dark:divide-surface-800/50">
              {held.map((h) => (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-caption font-semibold text-surface-900 dark:text-surface-100 truncate">{h.name}</p>
                    <p className="text-[11px] text-surface-400">
                      {h.itemCount} item{h.itemCount === 1 ? '' : 's'}{h.price ? ` · ${formatPrice(h.price)}` : ''} · {new Date(h.heldAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button onClick={() => onResume(h.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-[11px] font-semibold hover:bg-brand-600">
                    <Play size={12} /> Resume
                  </button>
                  <button onClick={() => onDiscard(h.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-body-sm font-medium text-surface-700 dark:text-surface-300">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Combo items table — same shape as Billing's ProductsTab: rows for
// items already in the combo, a trailing search row to add the next one.
// ══════════════════════════════════════════════════════════════════

function ComboItemsTable({
  selection,
  catalog,
  isLoadingCatalog,
  onAdd,
  onChange,
  onQtyDelta,
  onQty,
  onRemove,
  tableSearchRef,
}: {
  selection: ComboSelection[];
  catalog: AdminProduct[];
  isLoadingCatalog: boolean;
  onAdd: (p: AdminProduct) => void;
  onChange: (id: string, p: AdminProduct) => void;
  onQtyDelta: (id: string, d: number) => void;
  onQty: (id: string, q: number) => void;
  onRemove: (id: string) => void;
  tableSearchRef: RefObject<HTMLInputElement | null>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingQtyRef = useRef<string | null>(null);

  // After a product is added via the trailing search, jump focus to its qty field.
  useEffect(() => {
    const pid = pendingQtyRef.current;
    if (!pid) return;
    pendingQtyRef.current = null;
    const el = qtyRefs.current[pid];
    if (el) {
      el.focus();
      el.select();
    }
  }, [selection]);

  const addAndFocusQty = (p: AdminProduct) => {
    pendingQtyRef.current = p.id;
    onAdd(p);
  };

  const backToSearch = () => tableSearchRef.current?.focus();

  return (
    <div className="p-3">
      <div className="rounded-xl border border-surface-200 dark:border-surface-800 overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="text-label uppercase tracking-wider text-surface-400 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-100 dark:border-surface-800 whitespace-nowrap">
              <th className="text-left font-semibold py-2 pl-3 w-12">S.No</th>
              <th className="text-center font-semibold py-2">Item</th>
              <th className="text-center font-semibold py-2 w-32">Qty</th>
              <th className="text-center font-semibold py-2 w-16">Stock</th>
              <th className="text-right font-semibold py-2 w-20">MRP</th>
              <th className="text-center font-semibold py-2 w-24">Rate</th>
              <th className="text-right font-semibold py-2 w-24 pr-3">Amount</th>
              <th className="py-2 w-10 pr-2" />
            </tr>
          </thead>
          <tbody>
            {selection.map((item, idx) => {
              const overStock = item.stock !== null && item.quantity > item.stock;
              const editing = editingId === item.id;
              const amount = item.rate * item.quantity;
              return (
                <tr key={item.id} className="border-b border-surface-50 dark:border-surface-800/50 hover:bg-surface-50/60 dark:hover:bg-surface-800/30 whitespace-nowrap">
                  <td className="py-1.5 pl-3 text-caption text-surface-400 tabular-nums align-middle">{idx + 1}</td>
                  <td className="py-1.5 px-2 align-middle">
                    {editing ? (
                      <ComboSearchBox
                        catalog={catalog}
                        selection={selection}
                        variant="row"
                        autoFocus
                        onSelect={(p) => { onChange(item.id, p); setEditingId(null); }}
                        onCancel={() => setEditingId(null)}
                        placeholder="Search to replace this product…"
                      />
                    ) : (
                      <button type="button" onClick={() => setEditingId(item.id)} className="w-full text-center group">
                        <p className="text-body-sm font-medium text-surface-900 dark:text-surface-100 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400">{item.name}</p>
                        <span className="text-[10px] text-surface-300 group-hover:text-surface-400">tap to change</span>
                      </button>
                    )}
                  </td>
                  <td className="py-1.5 align-middle">
                    <div className="flex items-center justify-center gap-1 flex-nowrap">
                      <button onClick={() => onQtyDelta(item.id, -1)} className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700"><Minus size={12} /></button>
                      <input
                        ref={(el) => { qtyRefs.current[item.id] = el; }}
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity || ''}
                        onChange={(e) => onQty(item.id, Number(e.target.value))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); backToSearch(); } }}
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-12 flex-shrink-0 text-center py-1 rounded-md border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-caption font-bold text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-brand-500/30 tabular-nums"
                      />
                      <button onClick={() => onQtyDelta(item.id, 1)} className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700"><Plus size={12} /></button>
                    </div>
                  </td>
                  <td className="py-1.5 text-center align-middle">
                    <span className={cn('text-caption tabular-nums font-medium', overStock ? 'text-amber-600' : item.stock === null ? 'text-surface-300' : 'text-surface-500')}>
                      {item.stock ?? '—'}
                    </span>
                  </td>
                  <td className="py-1.5 text-right align-middle">
                    <span className="text-caption text-surface-400 tabular-nums">{formatPrice(item.mrp)}</span>
                  </td>
                  {/* The product's own selling price. Shown, not edited: a combo stores
                      only which products and how many, so a rate typed here was
                      thrown away on save and the table lied on the next open. */}
                  <td className="py-1.5 text-center align-middle">
                    <span className="text-caption font-semibold text-surface-700 dark:text-surface-300 tabular-nums">{formatPrice(item.rate)}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right align-middle">
                    <span className="text-body-sm font-semibold text-surface-900 dark:text-surface-100 tabular-nums">{formatPrice(amount)}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-right align-middle">
                    <button onClick={() => onRemove(item.id)} className="p-1 rounded text-surface-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}

            {/* Trailing add row — the search jumps here after each product is chosen */}
            <tr className="bg-brand-500/[0.04]">
              <td className="py-2 pl-3 text-caption text-brand-500 tabular-nums align-middle">{selection.length + 1}</td>
              <td className="py-2 pr-2" colSpan={7}>
                <ComboSearchBox
                  catalog={catalog}
                  selection={selection}
                  variant="row"
                  inputRef={tableSearchRef}
                  onSelect={addAndFocusQty}
                  placeholder={isLoadingCatalog ? 'Loading products…' : 'Search a product to add to this combo…'}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {selection.length === 0 && (
        <p className="text-center text-caption text-surface-400 mt-3">Search a product in the row above and pick it — the cursor jumps straight to Qty. Type the quantity, press Enter, and you're back on the search for the next item.</p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Search box — same interaction as Billing's ProductSearchBox: type,
// arrow/enter to pick, dropdown escapes overflow via a portal.
// ══════════════════════════════════════════════════════════════════

function ComboSearchBox({
  catalog,
  selection,
  onSelect,
  inputRef,
  placeholder,
  variant = 'box',
  autoFocus = false,
  onCancel,
}: {
  catalog: AdminProduct[];
  selection: ComboSelection[];
  onSelect: (p: AdminProduct) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder: string;
  variant?: 'box' | 'row';
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const isRow = variant === 'row';

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return catalog.filter((p) => p.name.toLowerCase().includes(s) || p.category.toLowerCase().includes(s)).slice(0, 8);
  }, [catalog, q]);

  const updatePos = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = isRow ? Math.min(Math.max(r.width, 320), 480) : r.width;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const NEEDED = 300;
    const spaceBelow = window.innerHeight - r.bottom;
    const dropAbove = spaceBelow < NEEDED && r.top > spaceBelow;
    setPos(dropAbove ? { left, bottom: window.innerHeight - r.top + 4, width } : { left, top: r.bottom + 4, width });
  };

  useEffect(() => {
    if (!open) return;
    const onWin = () => updatePos();
    window.addEventListener('scroll', onWin, true);
    window.addEventListener('resize', onWin);
    return () => {
      window.removeEventListener('scroll', onWin, true);
      window.removeEventListener('resize', onWin);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (p: AdminProduct) => {
    onSelect(p);
    setQ('');
    setIdx(0);
    ref.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) {
      if (e.key === 'Escape') {
        setQ('');
        onCancel?.();
        ref.current?.blur();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[idx]) pick(results[idx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQ('');
      onCancel?.();
    }
  };

  return (
    <div className="relative">
      <Search
        size={isRow ? 14 : 16}
        className={cn('absolute top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none', isRow ? 'left-2.5' : 'left-3')}
      />
      <input
        ref={ref}
        type="text"
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setIdx(0);
          updatePos();
        }}
        onFocus={() => { setOpen(true); updatePos(); }}
        onBlur={() => setTimeout(() => { setOpen(false); onCancel?.(); }, 150)}
        onKeyDown={onKey}
        className={cn(
          'w-full text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none transition-shadow',
          isRow
            ? 'pl-8 pr-7 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-caption focus:ring-1 focus:ring-brand-500/30 focus:border-brand-500/40'
            : 'pl-9 pr-8 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-body-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40',
        )}
      />
      {q && (
        <button
          onMouseDown={(e) => { e.preventDefault(); setQ(''); ref.current?.focus(); }}
          className={cn('absolute top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600', isRow ? 'right-2' : 'right-3')}
        >
          <X size={isRow ? 12 : 14} />
        </button>
      )}
      {open && results.length > 0 && pos && createPortal(
        <div
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 60 }}
          className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl max-h-72 overflow-y-auto"
        >
          {results.map((p, i) => {
            const inCombo = selection.find((c) => c.id === p.id);
            return (
              <button
                key={p.id}
                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                onMouseEnter={() => setIdx(i)}
                className={cn('w-full flex items-center gap-3 px-3 py-2 text-left transition-colors', i === idx ? 'bg-brand-500/10' : 'hover:bg-surface-50 dark:hover:bg-surface-800')}
              >
                {p.images[0] ? (
                  <img src={p.images[0] || undefined} alt="" className="w-9 h-9 rounded-lg object-contain p-0.5 flex-shrink-0 bg-surface-100" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center flex-shrink-0">
                    <ShoppingBag size={14} className="text-surface-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-caption font-medium text-surface-900 dark:text-surface-100 truncate">{p.name}</p>
                  <p className="text-caption text-surface-400 capitalize">{p.category.replace('-', ' ')}</p>
                </div>
                <span className="text-body-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">{formatPrice(p.price)}</span>
                {inCombo ? (
                  <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400 flex-shrink-0">×{inCombo.quantity}</span>
                ) : (
                  <Plus size={15} className="text-brand-500 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
