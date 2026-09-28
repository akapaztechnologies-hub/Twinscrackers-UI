import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Gift, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

/**
 * The combo pack's showreel.
 *
 * A combo is the one thing in this catalogue that cannot be photographed — it
 * is five separate packs sold together, and the poster for it shows none of
 * them. So the slideshow is built from what the combo already knows: its own
 * images first, then every item inside it, each captioned with its name and
 * how many are in the pack. The customer watches the box being unpacked
 * instead of reading a list of names under a single still.
 *
 * That is also why it auto-plays. It is not decoration — it is the only place
 * the contents are actually shown, and a customer who never touches the arrows
 * still sees all of it.
 */

export interface ComboGallerySlide {
  src: string;
  /** Item name plus quantity; absent on the combo's own photos. */
  caption?: string;
  quantity?: number;
}

/** How long each slide holds before moving on. */
const SLIDE_MS = 3200;

export function ComboGallery({
  images,
  items,
  discount,
  className,
}: {
  images: string[];
  items: { name: string; image?: string; quantity: number }[];
  discount?: number | null;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  const slides = useMemo<ComboGallerySlide[]>(() => {
    const own = images.filter(Boolean).map((src) => ({ src }));
    const inside = items
      .filter((item) => item.image)
      .map((item) => ({ src: item.image as string, caption: item.name, quantity: item.quantity }));
    return [...own, ...inside];
  }, [images, items]);

  const [index, setIndex] = useState(0);
  // Which way the last move went, so the outgoing slide leaves the side the new
  // one came from rather than always sliding the same way.
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);

  const count = slides.length;

  const goTo = useCallback(
    (next: number, dir: number) => {
      if (count === 0) return;
      setDirection(dir);
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  const next = useCallback(() => goTo(index + 1, 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1, -1), [goTo, index]);

  /**
   * Auto-advance.
   *
   * Held while the pointer is over the gallery or the customer has paused it —
   * a slide moving on while someone is reading the item name under it is the
   * fastest way to make a showreel annoying. Stopped outright when the system
   * asks for reduced motion, where the arrows and dots are the whole control.
   */
  useEffect(() => {
    if (reduceMotion || paused || count < 2) return;
    const timer = setTimeout(() => goTo(index + 1, 1), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, paused, count, goTo, reduceMotion]);

  if (count === 0) {
    return (
      <div
        className={cn(
          'relative aspect-square rounded-3xl overflow-hidden bg-white dark:bg-surface-900 flex items-center justify-center',
          className,
        )}
      >
        <Gift size={40} className="text-surface-300 dark:text-surface-700" />
      </div>
    );
  }

  const slide = slides[index];
  // Slides travel a fraction of the frame rather than its full width — a long
  // throw across a square box reads as a jolt at this size.
  const travel = 48;

  return (
    <div
      className={cn(
        'group relative aspect-square rounded-3xl overflow-hidden bg-white dark:bg-surface-900 select-none',
        className,
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStart.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (start === null) return;
        const delta = e.changedTouches[0].clientX - start;
        if (Math.abs(delta) < 40) return;
        if (delta < 0) next();
        else prev();
      }}
    >
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.img
          key={`${slide.src}-${index}`}
          src={slide.src}
          alt={slide.caption || 'Combo pack'}
          custom={direction}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * travel }}
          animate={
            reduceMotion
              ? { opacity: 1 }
              : // The slow drift while a slide holds is what stops a still photo
                // from looking like the page has frozen between changes.
                { opacity: 1, x: 0, scale: [1, 1.05] }
          }
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -travel }}
          transition={
            reduceMotion
              ? { duration: 0.2 }
              : {
                  opacity: { duration: 0.45 },
                  x: { duration: 0.45, ease: 'easeOut' },
                  scale: { duration: SLIDE_MS / 1000 + 0.5, ease: 'linear' },
                }
          }
          className="absolute inset-0 h-full w-full object-contain p-5"
        />
      </AnimatePresence>

      {/* A bottom scrim, only where the caption sits, so a name printed over a
          pale pack stays readable without greying the photo itself. */}
      {slide.caption && (
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
      )}

      {discount ? (
        <span className="absolute top-4 right-4 z-20 inline-flex items-center px-2.5 py-1 rounded-lg bg-red-600 text-white text-label font-bold">
          -{discount}%
        </span>
      ) : null}

      {/* Which item is on screen. "Inside this pack" names what the customer is
          looking at — without it an item photo reads as another combo. */}
      <AnimatePresence mode="wait">
        {slide.caption && (
          <motion.div
            key={slide.caption}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-14 left-5 right-5 z-20 text-white"
          >
            <p className="text-label font-bold uppercase tracking-widest text-brand-300 drop-shadow">
              Inside this pack
            </p>
            <p className="mt-0.5 font-display font-bold text-heading-sm leading-tight drop-shadow-lg">
              {slide.caption}
              {slide.quantity && slide.quantity > 1 && (
                <span className="ml-2 text-body-sm font-semibold text-white/80">× {slide.quantity}</span>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-sm transition-all hover:bg-black/60 active:scale-90 lg:opacity-0 lg:group-hover:opacity-100"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-sm transition-all hover:bg-black/60 active:scale-90 lg:opacity-0 lg:group-hover:opacity-100"
          >
            <ChevronRight size={18} />
          </button>

          {/* Dots double as the progress bar: the active one fills over exactly
              the time the slide holds, so the wait is visible instead of the
              picture changing out of nowhere. */}
          <div className="absolute bottom-5 inset-x-0 z-20 flex items-center justify-center gap-1.5 px-5">
            {slides.map((s, i) => (
              <button
                key={`${s.src}-dot-${i}`}
                type="button"
                onClick={() => goTo(i, i > index ? 1 : -1)}
                aria-label={`Slide ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  'h-1.5 rounded-full overflow-hidden transition-all',
                  i === index ? 'w-7 bg-white/35' : 'w-1.5 bg-white/35 hover:bg-white/60',
                )}
              >
                {i === index && (
                  <motion.span
                    key={`${index}-${paused}`}
                    className="block h-full bg-white"
                    initial={{ width: reduceMotion || paused ? '100%' : '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: reduceMotion || paused ? 0 : SLIDE_MS / 1000, ease: 'linear' }}
                  />
                )}
              </button>
            ))}
          </div>

          {!reduceMotion && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
              className="absolute bottom-4 right-4 z-20 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-sm transition-all hover:bg-black/60 lg:opacity-0 lg:group-hover:opacity-100"
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
          )}
        </>
      )}
    </div>
  );
}
