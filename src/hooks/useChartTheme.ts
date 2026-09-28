import { useMemo } from 'react';
import { useThemeStore } from '@/store/theme.ts';
import { useSiteStore } from '@/store/site.ts';

/**
 * Chart colours, read from the live CSS variables.
 *
 * Recharts draws SVG, and an SVG `stroke`/`fill` cannot take a Tailwind class,
 * so charts are the one place in the app that does not follow the palette on
 * its own. This reads what is actually painted on <html> rather than what the
 * store believes, which makes it correct on the very first frame — when only
 * the compiled :root defaults exist — as well as after an admin save.
 *
 * Recomputes on a dark-mode toggle and on `paletteVersion`, which the site
 * store bumps every time it repaints the palette.
 *
 * Returns hex rather than `rgb(a b c)`: Recharts does string work on colours
 * for gradient stops and active dots, and the same values feed the PDF
 * renderer elsewhere.
 */
export interface ChartTheme {
  brand: string;
  fire: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  dotFill: string;
}

export function useChartTheme(): ChartTheme {
  const theme = useThemeStore((s) => s.theme);
  const paletteVersion = useSiteStore((s) => s.paletteVersion);

  return useMemo(() => {
    // getComputedStyle forces a style recalc, so it stays inside the memo and
    // never runs in a render body.
    const css = getComputedStyle(document.documentElement);

    const hex = (name: string, fallback: string): string => {
      const parts = css.getPropertyValue(name).trim().split(/\s+/).map(Number);
      if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return fallback;
      return '#' + parts.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
    };

    const isDark = theme === 'dark';
    return {
      brand: hex('--brand-500', '#D4AF37'),
      fire: hex('--fire-500', '#FF6B35'),
      grid: isDark ? hex('--surface-800', '#262626') : hex('--surface-200', '#E5E5E5'),
      axis: hex('--surface-500', '#737373'),
      tooltipBg: isDark ? hex('--surface-850', '#1A1A1A') : hex('--surface-0', '#FFFFFF'),
      tooltipBorder: isDark ? hex('--surface-700', '#404040') : hex('--surface-200', '#E5E5E5'),
      dotFill: isDark ? hex('--surface-900', '#111111') : hex('--surface-0', '#FFFFFF'),
    };
    // paletteVersion is not read in the body on purpose — it is the signal that
    // the CSS variables under getComputedStyle have changed. Without it the
    // memo would never re-run on a palette save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, paletteVersion]);
}
