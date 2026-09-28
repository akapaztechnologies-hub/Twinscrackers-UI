import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { SaveButton, SuccessToast, SectionLabel, ErrorNotice, errorText, loadErrorText } from '@/components/admin/AdminShared.tsx';
import { ColorField } from '@/components/admin/ColorField.tsx';
import { getContentSection, updateContentSection } from '@/services/admin.ts';
import { useSiteStore } from '@/store/site.ts';
import { applyPalette } from '@/lib/branding.ts';
import {
  derivePalette,
  DEFAULT_PALETTE_SEEDS,
  BRAND_STOPS,
  SURFACE_STOPS,
  type PaletteSeeds,
} from '@/lib/palette.ts';
import { contrastHex } from '@/lib/color.ts';

/** `<input type="color">` fires continuously while the cursor is dragged. */
const PREVIEW_DEBOUNCE_MS = 60;

export function ThemeTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [seeds, setSeeds] = useState<PaletteSeeds>(DEFAULT_PALETTE_SEEDS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // A failed load leaves the defaults on screen; saving them would overwrite
  // the real section, so Save stays off until a reload succeeds.
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  // The rest of site-settings, held so Save cannot clobber the SEO and
  // currency fields that share this content section.
  const otherSettings = useRef<Record<string, unknown>>({});

  useEffect(() => {
    (async () => {
      try {
        const fetched = await getContentSection<Record<string, unknown>>('site-settings');
        if (fetched) {
          const { palette, ...rest } = fetched;
          otherSettings.current = rest;
          if (palette) setSeeds({ ...DEFAULT_PALETTE_SEEDS, ...(palette as Partial<PaletteSeeds>) });
        }
      } catch (err) {
        // A section that does not exist yet comes back as null, not an error —
        // so this is a real failure, not a first run.
        setLoadError(loadErrorText(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const palette = useMemo(() => derivePalette(seeds), [seeds]);

  /**
   * Live preview: repaint the whole admin shell as the client drags.
   *
   * Far more useful than a row of swatches — they see the real buttons, cards
   * and tables in the new colours. On unmount we put the saved palette back,
   * so navigating away without saving does not leave the preview stuck.
   */
  useEffect(() => {
    const id = setTimeout(() => applyPalette(palette), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [palette]);

  useEffect(() => {
    return () => {
      applyPalette(derivePalette(useSiteStore.getState().config.paletteSeeds));
    };
  }, []);

  const handleSave = async () => {
    if (loadError) return;
    setIsSaving(true);
    setSaveError('');
    try {
      await updateContentSection('site-settings', { ...otherSettings.current, palette: seeds });
      // Re-read so the store's own copy matches what was just written; without
      // this the unmount cleanup above would repaint the OLD palette back.
      await useSiteStore.getState().fetchCompanyInfo();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const set = (field: keyof PaletteSeeds) => (value: string) =>
    setSeeds((p) => ({ ...p, [field]: value }));

  const isDefault =
    seeds.accent === DEFAULT_PALETTE_SEEDS.accent &&
    seeds.secondary === DEFAULT_PALETTE_SEEDS.secondary &&
    seeds.neutral === DEFAULT_PALETTE_SEEDS.neutral;

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} label="Save Theme" />, saveSlot)}

      <AdminCard title="Palette">
        <SectionLabel
          label="Three colours drive the entire site"
          hint="Visible on: Every page, emails and invoices"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ColorField
            label="Accent"
            value={seeds.accent}
            onChange={set('accent')}
            fallback={DEFAULT_PALETTE_SEEDS.accent}
            hint="Buttons, links, prices, highlights"
          />
          <ColorField
            label="Secondary"
            value={seeds.secondary}
            onChange={set('secondary')}
            fallback={DEFAULT_PALETTE_SEEDS.secondary}
            hint="Sale badges, offers, urgency"
          />
          <ColorField
            label="Neutral tint"
            value={seeds.neutral}
            onChange={set('neutral')}
            fallback={DEFAULT_PALETTE_SEEDS.neutral}
            hint="Backgrounds, text and borders"
          />
        </div>

        <p className="mt-3 text-caption text-surface-500 dark:text-surface-400">
          Every shade is worked out from these three, so the site stays consistent. Changes preview
          live on this page &mdash; nothing is public until you hit Save. The neutral tint only shifts
          the greys warmer or cooler; it never changes how light or dark they are, so text stays as
          readable as it is now.
        </p>

        {(palette.clamped.accent || palette.clamped.secondary) && (
          <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-caption text-amber-800 dark:text-amber-200">
              The{' '}
              {palette.clamped.accent && palette.clamped.secondary
                ? 'accent and secondary colours are'
                : palette.clamped.accent
                  ? 'accent colour is'
                  : 'secondary colour is'}{' '}
              too close to black or white to build a full range of shades from, so{' '}
              {palette.clamped.accent && palette.clamped.secondary ? 'they have' : 'it has'} been
              pulled back slightly. The main shade in the preview below is what the site will
              actually use &mdash; pick something less extreme if you need an exact match.
            </p>
          </div>
        )}

        {!isDefault && (
          <button
            type="button"
            onClick={() => setSeeds(DEFAULT_PALETTE_SEEDS)}
            className="mt-4 inline-flex items-center gap-1.5 text-caption font-medium text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100 transition-colors"
          >
            <RotateCcw size={13} />
            Reset to the original colours
          </button>
        )}
      </AdminCard>

      <AdminCard title="Preview">
        <SectionLabel label="Every shade the site will use" hint="Hover a swatch for its code" />
        <div className="space-y-4">
          <Ramp name="Accent" hexes={BRAND_STOPS.map((s) => palette.brand[s])} stops={BRAND_STOPS} />
          <Ramp name="Secondary" hexes={BRAND_STOPS.map((s) => palette.fire[s])} stops={BRAND_STOPS} />
          <Ramp
            name="Neutrals"
            hexes={SURFACE_STOPS.map((s) => palette.surface[s])}
            stops={SURFACE_STOPS}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-surface-200 dark:border-surface-700 p-4">
          <button type="button" className="px-4 py-2 rounded-xl bg-brand-500 text-brand-on text-body-sm font-semibold">
            Add to Cart
          </button>
          <span className="px-2.5 py-1 rounded-lg bg-fire-500 text-fire-on text-caption font-bold uppercase">
            Sale
          </span>
          <span className="text-heading-sm font-bold text-brand-600 dark:text-brand-400">&#8377;1,499</span>
          <span className="text-body-sm text-surface-500">In stock</span>
        </div>
      </AdminCard>

      <AdminCard title="Readability">
        <SectionLabel label="Checked against the accessibility standard" hint="AA is the usual target" />
        <div className="space-y-1.5">
          <ContrastRow
            label="Button text on the accent"
            ratio={contrastHex(palette.onBrand, palette.brand[500])}
          />
          <ContrastRow
            label="Link text on a white background"
            ratio={contrastHex(palette.brand[600], palette.surface[0])}
          />
          <ContrastRow
            label="Link text on a dark card"
            ratio={contrastHex(palette.brand[400], palette.surface[900])}
          />
          <ContrastRow
            label="Body text on the page background"
            ratio={contrastHex(palette.surface[900], palette.surface[50])}
            note="locked"
          />
        </div>
        <p className="mt-3 text-caption text-surface-500 dark:text-surface-400">
          The last row cannot fail: the neutral tint never changes how light or dark a grey is, only
          its warmth, so body text keeps exactly the contrast it has today whatever you pick.
        </p>
      </AdminCard>
    </div>
  );
}

function Ramp({ name, hexes, stops }: { name: string; hexes: string[]; stops: readonly number[] }) {
  return (
    <div>
      <div className="mb-1.5 text-caption font-semibold uppercase tracking-wider text-surface-500">
        {name}
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {hexes.map((hex, i) => (
          <div key={stops[i]} className="min-w-0 flex-1" title={`${stops[i]} — ${hex}`}>
            <div
              className="h-10 rounded-md border border-surface-200/70 dark:border-surface-700/70"
              style={{ backgroundColor: hex }}
            />
            <div className="mt-1 text-center text-[10px] tabular-nums text-surface-400">{stops[i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContrastRow({ label, ratio, note }: { label: string; ratio: number; note?: string }) {
  const { text, tone } =
    ratio >= 7
      ? { text: 'AAA', tone: 'text-green-600 dark:text-green-400' }
      : ratio >= 4.5
        ? { text: 'AA', tone: 'text-green-600 dark:text-green-400' }
        : ratio >= 3
          ? { text: 'Large text only', tone: 'text-amber-600 dark:text-amber-400' }
          : { text: 'Too low', tone: 'text-red-600 dark:text-red-400' };

  return (
    <div className="flex items-center gap-3 text-body-sm">
      <span className="flex-1 text-surface-700 dark:text-surface-300">{label}</span>
      <span className="tabular-nums text-surface-500">{ratio.toFixed(1)}:1</span>
      <span className={`w-28 text-right font-medium ${tone}`}>{note ? `${text} (${note})` : text}</span>
    </div>
  );
}
