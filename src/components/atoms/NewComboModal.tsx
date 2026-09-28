import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, ArrowRight, Clock } from 'lucide-react';
import { useNewCombos, newCombosKey } from '@/hooks/useNewCombos.ts';
import { formatPrice, calculateDiscount } from '@/lib/utils.ts';
import { offerBadge } from '@/lib/comboWindow.ts';

const DISMISS_KEY = 'ak_dismissed_combo_modal';
const AUTO_CLOSE_MS = 5000;
/** Shorter hold per pack once the poster is a reel — five packs at five
 *  seconds each is twenty-five seconds of pop-up, which nobody sits through. */
const REEL_SLIDE_MS = 3200;
/** Packs the reel plays before deferring the rest to the "see all" link. */
const REEL_MAX = 4;
// Skip pages where this would collide with more important UI (sticky add-to-cart
// bar on product pages, checkout flow, auth) or would just be redundant (already
// looking at combos).
const HIDDEN_PATHS = ['/product/', '/combo-packs', '/checkout', '/order-confirmation', '/login', '/signup'];

export function NewComboModal() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { combos } = useNewCombos();
  const [dismissed, setDismissed] = useState(true);
  const [visible, setVisible] = useState(false);
  /**
   * Which pack is on the poster.
   *
   * A shop that builds its festive packs in one sitting publishes five at once,
   * and showing only the newest announces one of them. So the poster turns
   * over: each pack gets its own hold, and a customer who watches the whole
   * thing has seen all of them.
   */
  const [slide, setSlide] = useState(0);
  /** Held while the pointer is on the card — see the timers below. */
  const [paused, setPaused] = useState(false);
  const reel = combos.slice(0, REEL_MAX);
  const combo = reel[slide] ?? reel[0] ?? null;
  const others = Math.max(0, combos.length - 1);
  const holdMs = reel.length > 1 ? REEL_SLIDE_MS : AUTO_CLOSE_MS;

  // A set of combos is only ever announced once per browser — dismissing it (or
  // clicking through) remembers which packs they were, so it won't pop up again
  // until the shop publishes another one. Keyed on all of them rather than the
  // newest, or a second pack added later would be silently covered by the first.
  const seenKey = newCombosKey(combos);

  useEffect(() => {
    if (!seenKey) return;
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === seenKey);
    } catch {
      setDismissed(false);
    }
  }, [seenKey]);

  useEffect(() => {
    if (!combo || dismissed) return;
    const showTimer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(showTimer);
  }, [combo, dismissed]);

  /**
   * The poster's own clock, restarted for each pack, so what the progress bar
   * shows is always the pack currently on screen. It moves to the next pack
   * and closes after the last one — a customer who sits through the whole reel
   * has seen everything the shop just published.
   *
   * Held while the pointer is over the card: a poster that closes itself under
   * someone who stopped to read it is the whole reason pop-ups get a bad name.
   */
  useEffect(() => {
    if (!visible || paused) return;
    const timer = setTimeout(() => {
      if (slide < reel.length - 1) setSlide((s) => s + 1);
      else dismiss();
    }, holdMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, paused, slide, reel.length, holdMs]);

  const dismiss = () => {
    setVisible(false);
    if (!seenKey) return;
    try {
      localStorage.setItem(DISMISS_KEY, seenKey);
    } catch {
      /* storage unavailable — modal just reappears next visit, harmless */
    }
  };

  const viewCombo = () => {
    dismiss();
    if (combo) navigate(`/combo-packs/${combo.slug}`);
  };

  const hidden = HIDDEN_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith('/admin');

  if (!combo || dismissed || hidden) return null;

  const discount = combo.originalPrice ? calculateDiscount(combo.price, combo.originalPrice) : null;
  const offer = offerBadge(combo);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={dismiss}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative w-full max-w-sm aspect-[3/4] rounded-3xl overflow-hidden shadow-2xl bg-surface-950"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            {/* Full-bleed poster background, crossfaded as the reel turns over */}
            <AnimatePresence mode="popLayout">
              <motion.img
                key={combo.id}
                src={combo.images[0] || undefined}
                alt={combo.name}
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 w-full h-full object-contain p-3"
              />
            </AnimatePresence>
            {/* Scrims for text legibility — heavy at the bottom (copy), light vignette up top */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />

            {/* One countdown bar per pack, so how many are coming is visible
                from the first second rather than a surprise at the end. */}
            <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-1">
              {reel.map((c, i) => (
                <div key={c.id} className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden">
                  {i < slide && <div className="h-full w-full bg-white/70" />}
                  {i === slide && (
                    <motion.div
                      key={`${c.id}-${paused}`}
                      className="h-full bg-gradient-to-r from-fire-500 to-brand-400"
                      initial={{ width: paused ? '100%' : '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: paused ? 0 : holdMs / 1000, ease: 'linear' }}
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={dismiss}
              aria-label="Close"
              className="absolute top-4 right-4 z-20 flex items-center justify-center w-8 h-8 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            >
              <X size={16} />
            </button>

            {/* Discount starburst sticker */}
            {discount && (
              <div className="absolute top-5 left-5 z-20 flex flex-col items-center justify-center w-16 h-16 rounded-full bg-red-600 text-white shadow-lg rotate-[-12deg] ring-4 ring-white/20">
                <span className="text-heading-sm font-black leading-none">-{discount}%</span>
                <span className="text-[9px] font-bold uppercase tracking-wide leading-none mt-0.5">off</span>
              </div>
            )}

            {/* Poster copy, overlaid at the bottom */}
            <div className="absolute inset-x-0 bottom-0 z-20 p-6 text-center text-white">
              <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-400 mb-2 drop-shadow">
                <Gift size={13} /> New Combo Pack
              </p>
              <h2 className="font-display font-black text-heading-lg leading-tight drop-shadow-lg">
                {combo.name}
              </h2>
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="font-display font-black text-heading-md text-brand-400 drop-shadow">
                  {formatPrice(combo.price)}
                </span>
                {combo.originalPrice && (
                  <span className="text-body-sm text-white/60 line-through">{formatPrice(combo.originalPrice)}</span>
                )}
              </div>

              {/* How long the pack is on for. The poster is what most customers
                  see of a combo first, so leaving the dates off it sends them to
                  the detail page to find out — or, worse, back later when it is
                  over. */}
              {offer && (
                <p
                  className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-body-sm font-semibold ${
                    offer.urgent ? 'bg-amber-500 text-surface-950' : 'bg-white/15 text-white'
                  }`}
                >
                  <Clock size={13} />
                  {offer.text}
                </p>
              )}

              <button
                onClick={viewCombo}
                className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fire-500 to-brand-500 text-white font-bold shadow-lg shadow-fire-500/40 hover:shadow-xl active:scale-[0.98] transition-all"
              >
                View Combo
                <ArrowRight size={18} />
              </button>
              {/* The other packs published alongside this one. Without this the
                  poster is the only announcement they get, and it names one. */}
              {others > 0 && (
                <button
                  onClick={() => {
                    dismiss();
                    navigate('/combo-packs');
                  }}
                  className="mt-3 w-full text-body-sm font-semibold text-white/90 underline underline-offset-4 hover:text-white transition-colors"
                >
                  {others} more new pack{others === 1 ? '' : 's'} — see all
                </button>
              )}
              <button onClick={dismiss} className="mt-3 text-body-sm text-white/60 hover:text-white transition-colors">
                Maybe later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
