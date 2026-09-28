import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play } from 'lucide-react';
import { getYouTubeId } from '@/lib/utils.ts';

/**
 * A product's video, played over whatever the customer was doing.
 *
 * Built for Quick Order, where the whole screen is a long list with a running
 * basket beside it: sending somebody to a product page to watch a ten-second
 * clip costs them their scroll position and their place in a twenty-item order,
 * and that is how a filled basket gets abandoned. So it opens in front, and
 * closes back to the exact same spot.
 *
 * Nothing is mounted until it is opened — an iframe per row would load a
 * YouTube player for every product on the page.
 */

export function VideoBadge({ onClick, size = 'md' }: { onClick: () => void; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';
  return (
    <button
      type="button"
      onClick={(e) => {
        // The badge sits inside the thumbnail's link to the product page.
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label="Watch this product's video"
      title="Watch the video"
      className={`absolute bottom-0.5 right-0.5 z-10 ${box} rounded-full bg-red-600 text-white flex items-center justify-center shadow-md ring-2 ring-white dark:ring-surface-900 active:scale-90 transition-transform`}
    >
      <Play size={size === 'sm' ? 10 : 12} className="fill-current ml-px" />
    </button>
  );
}

export function VideoLightbox({
  url,
  title,
  onClose,
}: {
  url: string | null;
  title?: string;
  onClose: () => void;
}) {
  // Escape closes it, and the page behind does not scroll under the video.
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [url, onClose]);

  const videoId = url ? getYouTubeId(url) : null;

  return createPortal(
    <AnimatePresence>
      {url && videoId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-3xl"
          >
            <button
              onClick={onClose}
              aria-label="Close video"
              className="absolute -top-11 right-0 flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/10 text-white text-body-sm font-medium hover:bg-white/20 transition-colors"
            >
              <X size={16} /> Close
            </button>

            {title && (
              <p className="absolute -top-10 left-0 max-w-[60%] truncate text-white/80 text-body-sm">
                {title}
              </p>
            )}

            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-2xl">
              <iframe
                // `autoplay` because the customer tapped a play button — the
                // tap is the consent, and making them tap twice is friction on
                // a phone.
                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                title={title || 'Product video'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
