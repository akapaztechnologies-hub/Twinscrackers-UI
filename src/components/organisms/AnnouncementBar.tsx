import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Gift } from 'lucide-react';
import { useSiteStore } from '@/store/site.ts';
import { useNewCombos } from '@/hooks/useNewCombos.ts';
import { offerBadge } from '@/lib/comboWindow.ts';
import { safeLink } from '@/components/safeLink.ts';

export function AnnouncementBar() {
  const announcement = useSiteStore((s) => s.config.announcementBar);
  // Typed into Settings by staff; filtered before it becomes an href.
  const announcementLink = safeLink(announcement?.link);
  const { combos } = useNewCombos();
  // One new pack gets named; several are counted, because a bar that names only
  // the last one saved hides the rest of a festive set published the same day.
  const combo = combos.length === 1 ? combos[0] : null;
  const comboOffer = combo ? offerBadge(combo) : null;
  const hasCombos = combos.length > 0;
  const manualShow = !!(announcement?.isActive && announcement?.text);
  // A freshly published combo takes priority over the admin's manual text —
  // it reverts to the manual announcement once the combo ages out of the window.
  const show = hasCombos || manualShow;
  const ref = useRef<HTMLDivElement>(null);

  // Publish the bar's live height as a CSS variable so the page layout can offset
  // its content by exactly this much (see MainLayout). Keeps the top of every page
  // clear of the fixed header whether the bar is on, off, or wrapping to two lines.
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!show || !el) {
      root.style.setProperty('--announcement-h', '0px');
      return;
    }
    const update = () => root.style.setProperty('--announcement-h', `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--announcement-h', '0px');
    };
  }, [show, announcement?.text, combos.length, combo?.id]);

  if (!show) return null;

  const content = hasCombos ? (
    <div className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-fire-500 to-brand-500 text-white text-center py-2 px-4 text-sm font-medium relative z-50 shadow-sm">
      <Gift size={15} className="flex-shrink-0" />
      {combo ? (
        <>
          New: {combo.name} — Shop Now
          {/* The dates travel with the announcement: this bar is often the only
              place a returning customer sees the pack at all. */}
          {comboOffer && <span className="hidden sm:inline opacity-90">· {comboOffer.text}</span>}
        </>
      ) : (
        <>{combos.length} new combo packs — Shop Now</>
      )}
    </div>
  ) : (
    <div className="bg-brand-500 text-white text-center py-2 px-4 text-sm font-medium relative z-50 shadow-sm">
      {announcement.text}
    </div>
  );

  return (
    <motion.div ref={ref} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}>
      {hasCombos ? (
        // One pack links straight to it; several go to the page listing them.
        <Link to={combo ? `/combo-packs/${combo.slug}` : '/combo-packs'} className="block hover:opacity-90 transition-opacity">
          {content}
        </Link>
      ) : announcementLink ? (
        <a href={announcementLink} className="block hover:opacity-90 transition-opacity">
          {content}
        </a>
      ) : (
        content
      )}
    </motion.div>
  );
}
