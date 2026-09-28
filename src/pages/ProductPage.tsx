import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart, Heart, Share2, Shield,
  ChevronRight, ChevronLeft, Star, Volume2, VolumeX, AlertTriangle, Play, Gift, Clock,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { getIcon } from '@/lib/content.ts';
import { Container } from '@/components/atoms/Container.tsx';
import { Button } from '@/components/atoms/Button.tsx';
import { Badge } from '@/components/atoms/Badge.tsx';
import { StarRating } from '@/components/atoms/StarRating.tsx';
import { QuantitySelector } from '@/components/atoms/QuantitySelector.tsx';
import { ProductCard } from '@/components/molecules/ProductCard.tsx';
import { ComboGallery } from '@/components/molecules/ComboGallery.tsx';
import { ProductReviews } from '@/components/product/ProductReviews.tsx';
import { BackInStockNotify } from '@/components/product/BackInStockNotify.tsx';
import { SEO } from '@/components/SEO.tsx';
import { productSchema, breadcrumbSchema } from '@/lib/seo.ts';
import { useCartStore } from '@/store/cart.ts';
import { useAuthStore } from '@/store/auth.ts';
import { useWishlistStore } from '@/store/wishlist.ts';
import { getProductBySlugWithStatus, getProducts } from '@/services/products.ts';
import { useCategories } from '@/hooks/useCategories.ts';
import { formatPrice, calculateDiscount, cn, getYouTubeId } from '@/lib/utils.ts';
import { offerBadge, formatOfferDate } from '@/lib/comboWindow.ts';
import type { Product } from '@/types/index.ts';
import LiteYouTubeEmbed from 'react-lite-youtube-embed';
import 'react-lite-youtube-embed/dist/LiteYouTubeEmbed.css';
import { useSiteStore } from '@/store/site.ts';
import { useContentSection } from '@/hooks/useContent.ts';

const noiseLevelConfig = {
  low: { icon: VolumeX, color: 'text-emerald-500' },
  medium: { icon: Volume2, color: 'text-amber-500' },
  high: { icon: Volume2, color: 'text-red-500' },
};

const safetyConfig = {
  family: { color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  standard: { color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  professional: { color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
};

interface TrustSignal { id: string; icon: string; label: string; desc: string; }

interface ProductContent {
  // `useContentSection` merges an arbitrary saved object over these, so the
  // shape has to admit keys it does not name.
  [key: string]: unknown;
  trustSignals: TrustSignal[];
  safetyNotice: string;
  relatedHeading: string;
  safetyFamily: string;
  safetyStandard: string;
  safetyProfessional: string;
  noiseLow: string;
  noiseMedium: string;
  noiseHigh: string;
  inStockLabel: string;
  stockLeftSuffix: string;
  outOfStockLabel: string;
  addToCartLabel: string;
  notFoundHeading: string;
  notFoundBody: string;
  notFoundButton: string;
}

interface ProductSectionData {
  product: ProductContent;
  [key: string]: unknown;
}

const productDefaults: ProductSectionData = {
  product: {
    trustSignals: [
      // `desc` is filled in below from the shop's own free-delivery threshold.
      // Left blank here so a stale figure cannot be shown if that lookup fails.
      { id: 't1', icon: 'Truck', label: 'Free Shipping', desc: '' },
      { id: 't2', icon: 'Shield', label: 'Safety First', desc: 'Safety guidance with every order' },
      { id: 't3', icon: 'RotateCcw', label: 'Damaged or Wrong Items', desc: 'Replaced or refunded — see our Return Policy' },
    ],
    safetyNotice: 'Professional-grade product. Adult supervision required. Please follow all safety guidelines.',
    relatedHeading: 'You May Also Like',
    safetyFamily: 'Family Safe',
    safetyStandard: 'Standard',
    safetyProfessional: 'Professional',
    noiseLow: 'Low Noise',
    noiseMedium: 'Medium',
    noiseHigh: 'High',
    inStockLabel: 'In Stock',
    stockLeftSuffix: 'left',
    outOfStockLabel: 'Out of Stock',
    addToCartLabel: 'Add to Cart',
    notFoundHeading: 'Product Not Found',
    notFoundBody: "The product you're looking for doesn't exist.",
    notFoundButton: 'Back to Shop',
  },
};

export function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);
  const user = useAuthStore((s) => s.user);
  const toggleWishlist = useWishlistStore((s) => s.toggle);
  const wishlistItems = useWishlistStore((s) => s.items);
  const navigate = useNavigate();
  /**
   * Where this page was opened from. Pages that are not a category listing —
   * Quick Order, most of all — hand over their own path in router state, so the
   * back arrow and the breadcrumb return there instead of dumping the visitor
   * in a shop category they never went through. It survives a reload (router
   * state rides in the history entry) and falls back to the category trail for
   * a link pasted or opened cold.
   */
  const { state: navState } = useLocation();
  const origin = (navState ?? null) as { from?: string; fromLabel?: string } | null;
  const [shareNote, setShareNote] = useState('');
  const stickyBarRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  /**
   * Publish the sticky Add to Cart bar's height as `--bottom-bar-h`.
   *
   * The floating WhatsApp button is `z-[1000]` and already reads this variable
   * to lift clear of a page's bottom bar — but this page never set it, so the
   * button sat on top of the Add to Cart button and covered it.
   *
   * Measured rather than hard-coded: the bar is `lg:hidden`, so above that
   * breakpoint it has no box, `offsetHeight` is 0, and the button drops back to
   * its usual corner without any breakpoint logic here.
   */
  useEffect(() => {
    const root = document.documentElement;
    const el = stickyBarRef.current;
    const clear = () => root.style.setProperty('--bottom-bar-h', '0px');
    if (!el) {
      clear();
      return;
    }
    const update = () => root.style.setProperty('--bottom-bar-h', `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      clear();
    };
  }, [showStickyBar]);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const [product, setProduct] = useState<Product | null>(null);
  /** The slug resolved, but its combo offer has closed — see the empty state below. */
  const [comboOfferEnded, setComboOfferEnded] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [videoActive, setVideoActive] = useState(false);
  const categories = useCategories();
  /*
   * Editable from Admin -> Content -> Product Page.
   *
   * The trust badges under the buy button were three sentences hardcoded here,
   * so a shop that does not certify to BIS, or does not take returns, had no
   * way to stop the page saying it did. The defaults are still what shows until
   * the section is saved, and if the request fails.
   */
  const pc = useContentSection<ProductContent>('product-page', productDefaults.product);

  /*
   * The free-delivery line reads the shop's own threshold.
   *
   * It used to say "On orders above ₹999" no matter what, while Checkout read
   * the real figure from Settings -> Shipping. Raise the threshold to ₹1,500
   * and the product page promised free delivery the cart then refused to give.
   * Same source as Checkout now, so the two cannot disagree.
   *
   * When no threshold is set there is no free delivery to advertise, so the
   * badge is dropped rather than shown with a blank or a nought.
   */
  const freeThreshold = useSiteStore((st) => st.config.shipping?.freeThreshold) ?? 0;

  const trustSignals = useMemo(
    () =>
      pc.trustSignals
        .map((sig) =>
          sig.id === 't1'
            ? { ...sig, desc: `On orders above ₹${freeThreshold.toLocaleString('en-IN')}` }
            : sig,
        )
        .filter((sig) => sig.id !== 't1' || freeThreshold > 0),
    [pc.trustSignals, freeThreshold],
  );
  const categoryName = product
    ? categories.find((c) => c.slug === product.category)?.name || product.category.replace(/-/g, ' ')
    : '';
  const backTo = origin?.from ?? (product ? `/shop?category=${product.category}` : '/shop');
  const backLabel = origin?.fromLabel ?? categoryName;

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    // Reset the view and show the loader when navigating to a new product slug,
    // before refetching — this synchronises UI to an external key change.
    /* eslint-disable react-hooks/set-state-in-effect */
    setIsLoading(true);
    setProduct(null);
    setSelectedImage(0);
    setQuantity(1);
    /* eslint-enable react-hooks/set-state-in-effect */
    getProductBySlugWithStatus(slug)
      .then(({ product: p, offerEnded }) => {
        if (cancelled) return;
        setProduct(p);
        setComboOfferEnded(offerEnded);
        if (p) {
          getProducts({ category: p.category, limit: 5 })
            .then((res) => {
              if (cancelled) return;
              setRelatedProducts(res.data.filter((rp) => rp.id !== p.id).slice(0, 4));
            })
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [product]);

  const videoId = product?.videoUrl ? getYouTubeId(product.videoUrl) : null;
  const offer = product ? offerBadge(product) : null;

  /**
   * A combo opened here rather than on the combo page — the product cards link
   * to /product/:slug, so this is the route most customers actually take to a
   * pack. It plays the contents as a reel; see ComboGallery.
   */
  const comboReelItems = (product?.comboItems ?? []).flatMap((item) =>
    typeof item.product === 'string'
      ? []
      : [{ name: item.product.name, image: item.product.images[0], quantity: item.quantity }],
  );
  const isComboReel = !!product?.isCombo && comboReelItems.length > 0;
  const mediaCount = product ? product.images.length + (videoId ? 1 : 0) : 0;
  const videoIndex = videoId ? (product?.images.length ?? 0) : -1;
  const isVideoSelected = selectedImage === videoIndex;

  // Reset video active state when navigating away from video slide
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset video playback when leaving the video slide
    if (!isVideoSelected) setVideoActive(false);
  }, [isVideoSelected]);

  const jsonLd = useMemo(() => product ? [
    productSchema(product),
    breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Shop', url: '/shop' },
      { name: categoryName, url: `/shop?category=${product.category}` },
      { name: product.name, url: `/product/${product.slug}` },
    ]),
  ] : [], [product, categoryName]);

  if (isLoading) {
    return (
      <div className="pt-24 min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    // A combo whose offer has closed is a different message to a dead link, and
    // it has somewhere better to send the customer than the whole shop.
    return (
      <div className="pt-24 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">
            {comboOfferEnded ? 'This combo offer has ended' : pc.notFoundHeading}
          </h1>
          <p className="mt-4 text-body-lg text-surface-500">
            {comboOfferEnded
              ? 'The pack you followed a link to is no longer on offer.'
              : pc.notFoundBody}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            {comboOfferEnded && (
              <Link to="/combo-packs">
                <Button>See current Combo Packs</Button>
              </Link>
            )}
            <Link to="/shop">
              {/* Second of two once the combo message is showing, so it steps back. */}
              <Button variant={comboOfferEnded ? 'outline' : 'primary'}>{pc.notFoundButton}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleAddToCart = () => {
    addItem(product, quantity);
    openCart();
  };

  const isWishlisted = wishlistItems.has(product.id);


  /**
   * Share the product.
   *
   * The button had no handler at all, so it did nothing on every platform.
   * `navigator.share` is the real thing on a phone (it opens WhatsApp, and this
   * shop's customers share on WhatsApp), and it is missing on most desktop
   * browsers — so the fallback copies the link instead of silently failing.
   */
  const handleShare = async () => {
    const url = window.location.href;
    const note = (text: string) => {
      setShareNote(text);
      setTimeout(() => setShareNote(''), 2000);
    };

    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, text: product.shortDescription, url });
        return;
      } catch (e) {
        // The user dismissing the sheet is not a failure and must not fall
        // through to copying a link they did not ask for.
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      note('Link copied');
    } catch {
      note('Could not share');
    }
  };

  const handleToggleWishlist = () => {
    // A guest token opens only its own orders; the wishlist needs an account
    // (the server refuses the call). Same sign-in prompt as any visitor.
    if (!user || user.isGuest) {
      navigate('/login');
      return;
    }
    toggleWishlist(product.id);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (Math.abs(distance) < 50) return;
    if (distance > 0 && selectedImage < mediaCount - 1) {
      setSelectedImage(selectedImage + 1);
    } else if (distance < 0 && selectedImage > 0) {
      setSelectedImage(selectedImage - 1);
    }
  };

  const discount = product.originalPrice
    ? calculateDiscount(product.price, product.originalPrice)
    : null;

  const noise = noiseLevelConfig[product.noiseLevel];
  const safety = safetyConfig[product.safetyRating];
  const NoiseIcon = noise.icon;
  const safetyLabel = { family: pc.safetyFamily, standard: pc.safetyStandard, professional: pc.safetyProfessional }[product.safetyRating];
  const noiseLabel = { low: pc.noiseLow, medium: pc.noiseMedium, high: pc.noiseHigh }[product.noiseLevel];

  return (
    <div className="pt-16 lg:pt-18">
      <SEO
        title={`${product.name} — Buy ${categoryName} Fireworks Online`}
        description={product.shortDescription ?? product.description.slice(0, 160)}
        canonical={`/product/${product.slug}`}
        ogImage={product.images[0]}
        ogType="product"
        jsonLd={jsonLd}
      />
      <Container size="wide">
        {/* Breadcrumbs — mobile: compact back link */}
        <Link
          to={backTo}
          className="lg:hidden flex items-center gap-1 pt-4 pb-2 -ml-1 text-body-sm text-surface-500 dark:text-surface-400 active:text-brand-500 transition-colors"
        >
          <ChevronLeft size={18} />
          <span className="capitalize">{backLabel}</span>
        </Link>
        {/* Breadcrumbs — desktop: full trail */}
        <nav className="hidden lg:flex items-center gap-2 pt-6 pb-2 text-body-sm text-surface-400">
          <Link to="/" className="hover:text-brand-500 transition-colors">Home</Link>
          <ChevronRight size={12} />
          {origin?.from ? (
            <Link to={origin.from} className="hover:text-brand-500 transition-colors">{backLabel}</Link>
          ) : (
            <>
              <Link to="/shop" className="hover:text-brand-500 transition-colors">Shop</Link>
              <ChevronRight size={12} />
              <Link to={`/shop?category=${product.category}`} className="hover:text-brand-500 transition-colors capitalize">
                {categoryName}
              </Link>
            </>
          )}
          <ChevronRight size={12} />
          <span className="text-surface-600 dark:text-surface-300">{product.name}</span>
        </nav>

        <div className="py-6 lg:py-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
            {/* Image Gallery */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              {/* A combo reached through /product/:slug — which is where the
                  cards link — gets the same showreel as the combo page, or the
                  pack that sells five things would show a photo of none of
                  them. Everything below is for an ordinary product: a combo has
                  no video and its extra images are already in the reel. */}
              {isComboReel ? (
                <ComboGallery images={product.images} items={comboReelItems} discount={discount} />
              ) : (
              <div
                className="relative aspect-square overflow-hidden bg-white dark:bg-surface-850 -mx-4 sm:-mx-6 lg:mx-0 lg:rounded-2xl"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {isVideoSelected && videoId ? (
                  <div className="absolute inset-0 bg-black">
                    {videoActive ? (
                      <>
                        <div className="h-full w-full [&_.yt-lite]:!aspect-auto [&_.yt-lite]:!h-full [&_.yt-lite]:!w-full">
                          <LiteYouTubeEmbed id={videoId} title={product.name} />
                        </div>
                        {/* Left arrow — navigate back to images when iframe blocks swipe */}
                        <button
                          type="button"
                          onClick={() => setSelectedImage(selectedImage - 1)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm active:scale-90 transition-transform lg:hidden"
                        >
                          <ChevronLeft size={22} />
                        </button>
                      </>
                    ) : (
                      <>
                        <img
                          src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                          alt="Video thumbnail"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setVideoActive(true)}
                          className="absolute inset-0 z-10 flex items-center justify-center bg-black/20"
                        >
                          <div className="w-16 h-16 rounded-full bg-red-600/90 flex items-center justify-center shadow-lg">
                            <Play size={28} className="text-white ml-1" fill="white" />
                          </div>
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <img
                    src={product.images[selectedImage]}
                    alt={product.name}
                    // The whole pack, uncropped — this is the image the customer
                    // came here to look at. See ProductCard for the reasoning.
                    className="h-full w-full object-contain p-4"
                  />
                )}
                {product.badge && (
                  <div className="absolute top-4 left-4">
                    <Badge type={product.badge} />
                  </div>
                )}
                {/* Dot indicators — mobile */}
                {mediaCount > 1 && (
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 lg:hidden">
                    {Array.from({ length: mediaCount }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedImage(i)}
                        className={cn(
                          'h-2 rounded-full transition-all duration-300',
                          selectedImage === i
                            ? 'w-6 bg-white'
                            : 'w-2 bg-white/50',
                        )}
                        aria-label={i === videoIndex ? 'View video' : `View image ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              )}
              {/* Thumbnails — desktop only. Not for a combo: the reel advances
                  on its own and carries its own dots. */}
              {!isComboReel && mediaCount > 1 && (
                <div className="mt-4 hidden lg:flex gap-3">
                  {product.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImage(i)}
                      className={cn(
                        'w-20 h-20 rounded-xl overflow-hidden border-2 transition-all',
                        selectedImage === i
                          ? 'border-brand-500 shadow-glow'
                          : 'border-surface-200 dark:border-surface-700 opacity-60 hover:opacity-100',
                      )}
                    >
                      <img src={img} alt="" className="h-full w-full object-contain p-1" />
                    </button>
                  ))}
                  {videoId && (
                    <button
                      onClick={() => setSelectedImage(videoIndex)}
                      className={cn(
                        'relative w-20 h-20 rounded-xl overflow-hidden border-2 transition-all',
                        selectedImage === videoIndex
                          ? 'border-brand-500 shadow-glow'
                          : 'border-surface-200 dark:border-surface-700 opacity-60 hover:opacity-100',
                      )}
                    >
                      <img src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="Video" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center">
                          <Play size={12} className="text-white ml-0.5" fill="white" />
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </motion.div>

            {/* Product Info */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <p className="text-label font-bold uppercase tracking-widest text-brand-500 mb-2">
                {categoryName}
              </p>

              <h1 className="font-display font-bold text-display-sm lg:text-display-md text-surface-900 dark:text-surface-50">
                {product.name}
              </h1>

              {/* Only for a combo carrying dates. States the end date through
                  the run and turns into a countdown in the last week — see
                  lib/comboWindow.ts. */}
              {offer && (
                <p
                  className={cn(
                    'mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-body-sm font-semibold',
                    offer.urgent
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300',
                  )}
                >
                  <Clock size={15} />
                  {offer.text}
                  {offer.urgent && product.offerEndsAt && (
                    <span className="font-normal text-amber-600/80 dark:text-amber-400/70">
                      · until {formatOfferDate(product.offerEndsAt)}
                    </span>
                  )}
                </p>
              )}

              <div className="mt-3 flex items-center gap-4">
                <StarRating rating={product.rating} reviewCount={product.reviewCount} size="md" />
              </div>

              {/* Price */}
              <div className="mt-6 flex items-baseline gap-3">
                <span className="font-display font-bold text-display-sm text-brand-600 dark:text-brand-400">
                  {formatPrice(product.price)}
                </span>
                {product.originalPrice && (
                  <>
                    <span className="text-heading-sm text-surface-400 line-through">
                      {formatPrice(product.originalPrice)}
                    </span>
                    <span className="text-body-sm font-bold text-emerald-600 dark:text-emerald-400">
                      Save {discount}%
                    </span>
                  </>
                )}
              </div>

              <p className="mt-6 text-body-lg text-surface-600 dark:text-surface-400 leading-relaxed">
                {product.description}
              </p>

              {/* What's Inside — combo packs only */}
              {product.comboItems && product.comboItems.length > 0 && (
                <div className="mt-6 p-4 rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900">
                  <p className="flex items-center gap-2 text-body-sm font-bold text-surface-900 dark:text-surface-50 mb-3">
                    <Gift size={16} className="text-brand-500" />
                    What's Inside
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {product.comboItems.map((item, i) => {
                      const comp = typeof item.product === 'string' ? null : item.product;
                      if (!comp) return null;
                      return (
                        <Link
                          key={i}
                          to={`/product/${comp.slug}`}
                          className="flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-surface-850 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                        >
                          <img src={comp.images[0] || undefined} alt={comp.name} className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-body-sm font-medium text-surface-800 dark:text-surface-200 truncate">{comp.name}</p>
                            <p className="text-caption text-surface-500">Qty: {item.quantity}</p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tags — a combo bundles different products, so a single safety/noise rating doesn't apply */}
              {!product.isCombo && (
                <div className="mt-6 flex flex-wrap gap-3">
                  <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-body-sm font-medium', safety.color)}>
                    <Shield size={14} />
                    {safetyLabel}
                  </span>
                  <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 text-body-sm font-medium', noise.color)}>
                    <NoiseIcon size={14} />
                    {noiseLabel} Noise
                  </span>
                  {product.duration && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 text-body-sm font-medium text-surface-600 dark:text-surface-400">
                      <Star size={14} />
                      {product.duration}
                    </span>
                  )}
                </div>
              )}

              {/* Features */}
              <div className="mt-6 grid grid-cols-2 gap-2">
                {product.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-body-sm text-surface-600 dark:text-surface-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div ref={ctaRef} className="mt-8 space-y-4">
                <div className="flex items-center gap-4">
                  <QuantitySelector quantity={quantity} onChange={setQuantity} />
                  {/* The API omits `stockCount` when the store hides stock levels,
                      so no availability text is rendered at all. */}
                  {product.stockCount !== undefined && (
                    <span className="text-body-sm text-surface-500">
                      {product.inStock ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {pc.inStockLabel} ({product.stockCount} {pc.stockLeftSuffix})
                        </span>
                      ) : (
                        <span className="text-red-500 font-medium">{pc.outOfStockLabel}</span>
                      )}
                    </span>
                  )}
                </div>

                {/* Out of stock is the one state where a disabled button is not
                    the end of it — the customer wants this, and the shop can
                    have their address instead of nothing. */}
                {!product.inStock && (
                  <div className="mb-3">
                    <BackInStockNotify slug={product.slug} productName={product.name} />
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={handleAddToCart}
                    size="lg"
                    fullWidth
                    disabled={!product.inStock}
                    className="flex-1"
                  >
                    <ShoppingCart size={20} />
                    {pc.addToCartLabel}
                  </Button>
                  <button
                    onClick={handleToggleWishlist}
                    className={cn(
                      'flex items-center justify-center w-12 h-12 rounded-xl border transition-colors',
                      isWishlisted
                        ? 'bg-red-500/10 border-red-500/30 text-red-500'
                        : 'border-surface-200 dark:border-surface-700 text-surface-500 hover:text-red-500 hover:border-red-500/30',
                    )}
                    aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                  >
                    <Heart size={20} className={isWishlisted ? 'fill-current' : ''} />
                  </button>
                  <button
                    onClick={handleShare}
                    aria-label="Share this product"
                    title={shareNote || 'Share this product'}
                    className="relative flex items-center justify-center w-12 h-12 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-500 hover:text-brand-500 hover:border-brand-500/30 transition-colors"
                  >
                    <Share2 size={20} />
                    {shareNote && (
                      <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-surface-900 px-2.5 py-1 text-caption font-medium text-white dark:bg-surface-100 dark:text-surface-900">
                        {shareNote}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Trust Signals */}
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-surface-100 dark:bg-surface-850">
                {trustSignals.map((sig) => {
                  const Icon = getIcon(sig.icon, LucideIcons.Star);
                  return (
                    <div key={sig.id} className="flex items-start gap-3">
                      <Icon size={20} className="text-brand-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100">{sig.label}</p>
                        <p className="text-caption text-surface-500">{sig.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Safety Warning */}
              {product.safetyRating === 'professional' && (
                <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-body-sm text-amber-700 dark:text-amber-400">
                    {pc.safetyNotice}
                  </p>
                </div>
              )}
            </motion.div>
          </div>

          {/* What customers said. Below the buy panel, above the upsell — a
              shopper still deciding reads this, and one who has decided has
              already scrolled past it. */}
          <ProductReviews slug={product.slug} />
        </div>
      </Container>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <section className="section-padding bg-surface-50 dark:bg-surface-950 border-t border-surface-200 dark:border-surface-800">
          <Container size="wide">
            <h2 className="font-display font-bold text-heading-lg text-surface-900 dark:text-surface-50 mb-8">
              {pc.relatedHeading}
            </h2>
            {/* Mobile: horizontal scroll */}
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory -mx-4 px-4 sm:-mx-6 sm:px-6 lg:hidden no-scrollbar">
              {relatedProducts.map((p, i) => (
                <div key={p.id} className="min-w-[260px] max-w-[280px] flex-shrink-0 snap-start">
                  <ProductCard product={p} index={i} />
                </div>
              ))}
            </div>
            {/* Desktop: grid */}
            <div className="hidden lg:grid grid-cols-4 gap-6">
              {relatedProducts.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Sticky Add-to-Cart — mobile only */}
      <AnimatePresence>
        {showStickyBar && product.inStock && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
          >
            <div
              ref={stickyBarRef}
              className="bg-white/95 dark:bg-surface-900/95 backdrop-blur-lg border-t border-surface-200 dark:border-surface-800 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-center gap-3">
                <img
                  src={product.images[0] || undefined}
                  alt=""
                  className="w-11 h-11 rounded-lg object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-semibold text-surface-900 dark:text-surface-100 truncate">
                    {product.name}{quantity > 1 && ` × ${quantity}`}
                  </p>
                  <p className="text-body-sm font-bold text-brand-600 dark:text-brand-400">
                    {formatPrice(product.price * quantity)}
                  </p>
                </div>
                <Button onClick={handleAddToCart} size="md" className="flex-shrink-0">
                  <ShoppingCart size={18} />
                  {pc.addToCartLabel}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
