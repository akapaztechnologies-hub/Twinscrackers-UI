import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, Printer, Share2, Loader2, Tags, Images, AlertTriangle, Check, Save } from 'lucide-react';
import { ListPageShell } from '@/components/admin/ListPageShell.tsx';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { ColorField } from '@/components/admin/ColorField.tsx';
import { SuccessToast } from '@/components/admin/AdminShared.tsx';
import { useSiteStore } from '@/store/site.ts';
import type { AdminProduct, Category } from '@/types/admin.ts';
import type { PriceListMode, PriceListPhotos, PriceListShop } from '@/components/admin/PriceListPDF.tsx';

/**
 * Admin → Price List.
 *
 * Builds the sheet a Sivakasi shop sends out on WhatsApp each season — the
 * thing that was previously a Word document somebody retyped every year, and
 * which drifted out of step with the catalogue the moment a rate changed.
 * Here it is generated from live products, so it cannot be stale.
 */

/**
 * The saved look and wording, kept as a content section so the shop sets it
 * once and every later list matches — and so it can be changed without a
 * developer. Same store the invoice template uses.
 */
const SECTION = 'price-list';

interface PriceListTemplate {
  accentColor: string;
  heading: string;
  note: string;
  terms: string;
}

const DEFAULT_TERMS = [
  'Rates are valid for the current season and may change without notice.',
  'Goods once sold will not be taken back.',
  'Transport and packing charges extra.',
].join('\n');

const DEFAULT_TEMPLATE: PriceListTemplate = {
  accentColor: '#B91C1C',
  heading: '',
  note: '',
  terms: DEFAULT_TERMS,
};

/** Colours that print well and read as "fireworks shop" rather than "software". */
const PRESETS: { label: string; hex: string }[] = [
  { label: 'Crimson', hex: '#B91C1C' },
  { label: 'Marigold', hex: '#C2620A' },
  { label: 'Deep Green', hex: '#15803D' },
  { label: 'Royal Blue', hex: '#1D4ED8' },
  { label: 'Purple', hex: '#6D28D9' },
  { label: 'Charcoal', hex: '#1F2937' },
];

const MODES: { value: PriceListMode; label: string; hint: string }[] = [
  { value: 'retail', label: 'Retail', hint: 'MRP, your rate and the discount — for customers.' },
  { value: 'wholesale', label: 'Wholesale', hint: 'Case quantity with per-piece and per-case rates — for dealers.' },
];

const PHOTO_MODES: { value: PriceListPhotos; label: string; hint: string }[] = [
  { value: 'none', label: 'No photos', hint: 'Smallest file, sends instantly. A few hundred KB.' },
  { value: 'thumbs', label: 'Photo in each row', hint: 'A small picture beside every product. Slower and much larger.' },
  { value: 'gallery', label: 'Photo pages at the end', hint: 'Text list first, then a picture grid. Largest file.' },
];

/** Products with no rate for the chosen mode cannot appear on that sheet. */
function isPriceable(product: AdminProduct, mode: PriceListMode): boolean {
  return mode === 'wholesale'
    ? Boolean(product.wholesalePricePerCase || product.wholesalePrice)
    : Boolean(product.price);
}

export function AdminPriceListPage() {
  const siteName = useSiteStore((s) => s.config.name);

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [mode, setMode] = useState<PriceListMode>('retail');
  const [photos, setPhotos] = useState<PriceListPhotos>('none');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inStockOnly, setInStockOnly] = useState(true);
  const [title, setTitle] = useState(DEFAULT_TEMPLATE.heading);
  const [note, setNote] = useState(DEFAULT_TEMPLATE.note);
  const [terms, setTerms] = useState(DEFAULT_TEMPLATE.terms);
  const [accentColor, setAccentColor] = useState(DEFAULT_TEMPLATE.accentColor);

  const [busy, setBusy] = useState<'download' | 'print' | 'share' | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /** Where customers send the money, from Settings → Payment. */
  const [bank, setBank] = useState<PriceListShop['bank']>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const { getAllProducts, getAllCategories, getContentSection, getSiteSettings } =
          await import('@/services/admin.ts');
        // Every active product, a page at a time. The server caps a page at
        // 500, and a catalogue past that used to come out as a price list that
        // silently stopped at product 500.
        const allActiveProducts = async () => {
          const PAGE = 500;
          const rows: AdminProduct[] = [];
          for (let page = 1; ; page += 1) {
            // Storefront arrangement, active only — a price list should read the
            // way the shop reads, and never advertise a delisted product.
            const res = await getAllProducts({ isCombo: false, status: 'active', sort: 'manual', page, limit: PAGE });
            rows.push(...res.data);
            const pages = res.totalPages ?? Math.ceil(res.total / PAGE);
            if (res.data.length < PAGE || page >= pages) break;
          }
          return { data: rows };
        };

        const [productResult, categoryResult, template, settings] = await Promise.all([
          allActiveProducts(),
          getAllCategories(),
          // Saved look and wording. Absent on a shop that has never opened this
          // screen, which is why every field falls back rather than blanking.
          getContentSection<Partial<PriceListTemplate>>(SECTION).catch(() => null),
          // Bank details for the footer of the sheet.
          getSiteSettings().catch(() => null),
        ]);

        const pay = settings?.paymentSettings;
        if (pay) {
          setBank({
            bankName: pay.bankName,
            accountName: pay.bankAccountName,
            accountNumber: pay.bankAccountNumber,
            ifsc: pay.bankIfsc,
            branch: pay.bankBranch,
            // Only when the shop actually takes UPI — an id printed on a sheet
            // that nobody is watching collects payments nobody reconciles.
            upiId: pay.upiEnabled ? pay.upiId : undefined,
          });
        }
        setProducts(productResult.data);
        setCategories(categoryResult.data);
        setSelected(new Set(categoryResult.data.map((c) => c.slug)));

        if (template) {
          setAccentColor(template.accentColor || DEFAULT_TEMPLATE.accentColor);
          setTitle(template.heading ?? DEFAULT_TEMPLATE.heading);
          setNote(template.note ?? DEFAULT_TEMPLATE.note);
          setTerms(template.terms ?? DEFAULT_TEMPLATE.terms);
        }
      } catch {
        setProducts([]);
        setCategories([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Default headline follows the mode until the admin types over it.
  const defaultTitle = `${mode === 'wholesale' ? 'WHOLESALE' : 'RETAIL'} PRICE LIST ${new Date().getFullYear()}`;

  const chosen = useMemo(
    () =>
      products.filter(
        (p) =>
          selected.has(p.category) &&
          isPriceable(p, mode) &&
          (!inStockOnly || (p.stockCount ?? 0) > 0),
      ),
    [products, selected, mode, inStockOnly],
  );

  /** Products the mode silently excludes — worth naming rather than hiding. */
  const missingRates = useMemo(
    () => products.filter((p) => selected.has(p.category) && !isPriceable(p, mode)).length,
    [products, selected, mode],
  );

  const withPhotos = useMemo(() => chosen.filter((p) => p.images?.[0]).length, [chosen]);

  const toggleCategory = (slug: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const run = useCallback(
    async (action: 'download' | 'print' | 'share') => {
      if (chosen.length === 0) return;
      setBusy(action);
      setMessage('');
      setProgress(null);

      const input = {
        mode,
        photos,
        products: chosen,
        categories,
        accentColor,
        title: (title.trim() || defaultTitle).toUpperCase(),
        note: note.trim() || undefined,
        terms: terms.split('\n').map((t) => t.trim()).filter(Boolean),
        /*
         * Straight off Settings → Payment, not retyped here.
         *
         * A dealer reading a rate wants to know where to send the money, and
         * an account number kept in two places is one that goes stale in one
         * of them.
         */
        bank,
        onProgress: (done: number, total: number) => setProgress({ done, total }),
      };

      try {
        const pdf = await import('@/lib/pricelistPdf.ts');
        if (action === 'print') {
          await pdf.printPriceList(input);
        } else if (action === 'share') {
          const shared = await pdf.sharePriceList(input);
          if (!shared) {
            // Desktop browsers cannot hand a file to WhatsApp, so say so and
            // give them the file instead of a button that does nothing.
            await pdf.downloadPriceList(input);
            setMessage('This browser cannot share files directly — the PDF was downloaded instead.');
          }
        } else {
          await pdf.downloadPriceList(input);
        }
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Could not build the price list.');
      } finally {
        setBusy(null);
        setProgress(null);
      }
    },
    [chosen, categories, mode, photos, accentColor, title, defaultTitle, note, terms, bank],
  );

  /** Keep the colour and wording, so the next list matches this one. */
  const saveTemplate = async () => {
    setIsSaving(true);
    setMessage('');
    try {
      const { updateContentSection } = await import('@/services/admin.ts');
      await updateContentSection(SECTION, { accentColor, heading: title, note, terms });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save these settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const disabled = isLoading || busy !== null || chosen.length === 0;

  return (
    <ListPageShell
      header={
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-surface-200 dark:border-surface-800">
          <div className="text-body-sm text-surface-600 dark:text-surface-400">
            {isLoading ? (
              'Loading catalogue…'
            ) : (
              <>
                <strong className="text-surface-900 dark:text-surface-100">{chosen.length}</strong> products across{' '}
                <strong className="text-surface-900 dark:text-surface-100">{selected.size}</strong> categories
                {photos !== 'none' && <> · {withPhotos} with photos</>}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Saving the colour and wording is a different job from generating
                a file, so it sits apart from the three output buttons. */}
            <button
              onClick={() => void saveTemplate()}
              disabled={isSaving}
              title="Keep this colour and wording for every price list from now on"
              className="flex items-center gap-2 px-3.5 h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors disabled:opacity-50 mr-2"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isSaving ? 'Saving…' : 'Save as default'}
            </button>
            <button
              onClick={() => void run('print')}
              disabled={disabled}
              className="flex items-center gap-2 px-3.5 h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors disabled:opacity-50"
            >
              {busy === 'print' ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              Print
            </button>
            <button
              onClick={() => void run('share')}
              disabled={disabled}
              className="flex items-center gap-2 px-3.5 h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-[13px] font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-850 transition-colors disabled:opacity-50"
            >
              {busy === 'share' ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
              Share
            </button>
            <button
              onClick={() => void run('download')}
              disabled={disabled}
              className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/20 disabled:opacity-50"
            >
              {busy === 'download' ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
              Download PDF
            </button>
          </div>

          {progress && progress.total > 0 && (
            <p className="w-full text-caption text-surface-500">
              Preparing photos… {progress.done} of {progress.total}
            </p>
          )}
          {message && <p className="w-full text-caption text-amber-600 dark:text-amber-400">{message}</p>}
        </div>
      }
    >
      {/*
        Two columns of settings with the Wording card spanning the bottom.

        Left to itself the grid put Wording in a column of its own and left a
        page-height hole beside it; it is the widest card anyway, since the terms
        are a multi-line box.
      */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard title="Which list">
          <div className="grid sm:grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  mode === m.value
                    ? 'border-brand-500/50 bg-brand-500/5'
                    : 'border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-850'
                }`}
              >
                <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">{m.label}</p>
                <p className="text-caption text-surface-500 mt-0.5">{m.hint}</p>
              </button>
            ))}
          </div>

          {missingRates > 0 && (
            <p className="flex items-start gap-1.5 mt-3 text-caption text-amber-600 dark:text-amber-400">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {missingRates} product{missingRates === 1 ? ' has' : 's have'} no{' '}
              {mode === 'wholesale' ? 'wholesale rate' : 'price'} and will be left off this list.
            </p>
          )}

          <label className="flex items-center gap-2 mt-3 text-body-sm text-surface-600 dark:text-surface-400">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="rounded border-surface-300 text-brand-500 focus:ring-brand-500/30"
            />
            Leave out products that are out of stock
          </label>
        </AdminCard>

        <AdminCard title="Photos">
          <div className="space-y-2">
            {PHOTO_MODES.map((p) => (
              <button
                key={p.value}
                onClick={() => setPhotos(p.value)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  photos === p.value
                    ? 'border-brand-500/50 bg-brand-500/5'
                    : 'border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-850'
                }`}
              >
                <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2">
                  <Images size={14} className="text-surface-400" />
                  {p.label}
                </p>
                <p className="text-caption text-surface-500 mt-0.5">{p.hint}</p>
              </button>
            ))}
          </div>
        </AdminCard>

        <AdminCard title="Categories">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => setSelected(new Set(categories.map((c) => c.slug)))}
              className="text-caption font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              Select all
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-caption font-medium text-surface-500 hover:underline"
            >
              Clear
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((category) => {
              const on = selected.has(category.slug);
              return (
                <button
                  key={category.slug}
                  onClick={() => toggleCategory(category.slug)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-caption font-medium transition-colors ${
                    on
                      ? 'border-brand-500/40 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      : 'border-surface-200 dark:border-surface-700 text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-850'
                  }`}
                >
                  <Tags size={12} />
                  {category.name}
                </button>
              );
            })}
            {!isLoading && categories.length === 0 && (
              <p className="text-body-sm text-surface-500">No categories yet.</p>
            )}
          </div>
        </AdminCard>

        <AdminCard title="Colour">
          <ColorField
            label="Accent colour"
            value={accentColor}
            onChange={setAccentColor}
            fallback={DEFAULT_TEMPLATE.accentColor}
            hint="Colours the masthead, the category bands, the rates and the discount badge. Everything else is derived from it."
          />

          <div className="flex flex-wrap gap-2 mt-3">
            {PRESETS.map((preset) => {
              const on = accentColor.toUpperCase() === preset.hex;
              return (
                <button
                  key={preset.hex}
                  onClick={() => setAccentColor(preset.hex)}
                  title={preset.hex}
                  className={`flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full border text-caption font-medium transition-colors ${
                    on
                      ? 'border-brand-500/50 bg-brand-500/5 text-surface-900 dark:text-surface-100'
                      : 'border-surface-200 dark:border-surface-700 text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-850'
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full border border-black/10 flex items-center justify-center"
                    style={{ backgroundColor: preset.hex }}
                  >
                    {on && <Check size={10} className="text-white" />}
                  </span>
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div
            className="mt-4 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700"
            aria-label="Preview of the printed colours"
          >
            <div className="px-3 py-2.5 text-white" style={{ backgroundColor: accentColor }}>
              <p className="text-body-sm font-bold">{siteName}</p>
              <p className="text-caption opacity-80">{(title.trim() || defaultTitle).toUpperCase()}</p>
            </div>
            <div
              className="px-3 py-1.5 text-caption font-bold border-l-[3px]"
              style={{ borderLeftColor: accentColor, backgroundColor: `${accentColor}14`, color: accentColor }}
            >
              FANCY ITEMS
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-caption bg-white dark:bg-surface-900">
              <span className="text-surface-700 dark:text-surface-300">3-1/2 FANCY TWO PCS (ASTRA)</span>
              <span className="flex items-center gap-2">
                <span className="text-surface-400 line-through">₹1,800</span>
                <span className="font-bold" style={{ color: accentColor }}>
                  ₹520
                </span>
                <span className="font-bold text-green-600">71%</span>
              </span>
            </div>
          </div>
        </AdminCard>

        <AdminCard title="Wording" className="lg:col-span-2">
          <div className="space-y-3">
            <div>
              <label className="block text-caption font-medium text-surface-500 mb-1">Heading</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={defaultTitle}
                className="w-full px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <div>
              <label className="block text-caption font-medium text-surface-500 mb-1">
                Note under the heading (optional)
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Minimum order ₹3,000 · Free delivery within Sivakasi"
                className="w-full px-3 h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <div>
              <label className="block text-caption font-medium text-surface-500 mb-1">Terms — one per line</label>
              <textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <p className="text-caption text-surface-400">
              The shop name, logo, phone and address come from Settings — {siteName} prints at the top of every page. Bank details come from Settings → Payment, and print at the end of the list; leave those fields empty to keep them off it.
            </p>
          </div>
        </AdminCard>
      </div>

      <SuccessToast show={saved} />
    </ListPageShell>
  );
}
