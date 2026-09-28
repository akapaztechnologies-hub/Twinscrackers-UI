import { useMemo, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'framer-motion';
import { X, ShoppingBag, AlertCircle } from 'lucide-react';
import { Button } from '@/components/atoms/Button.tsx';
import { CartItemCard } from '@/components/molecules/CartItemCard.tsx';
import { useCartStore } from '@/store/cart.ts';
import { useSiteStore } from '@/store/site.ts';
import { orderMinimum } from '@/lib/orderMinimum.ts';
import { isOfferLive } from '@/lib/comboWindow.ts';
import { formatPrice } from '@/lib/utils.ts';

interface CartContent {
  title: string;
  itemSingular: string;
  itemPlural: string;
  closeLabel: string;
  empty: { title: string; subtext: string; browseLabel: string };
  saveLabel: string;
  totalLabel: string;
  checkoutLabel: string;
  continueLabel: string;
}

interface StoreFlowData {
  cart: CartContent;
  [key: string]: unknown;
}

const cartDefaults: CartContent = {
  title: 'Your Cart',
  itemSingular: 'item',
  itemPlural: 'items',
  closeLabel: 'Close cart',
  empty: {
    title: 'Your cart is empty',
    subtext: 'Add some premium fireworks to get started!',
    browseLabel: 'Browse Products',
  },
  saveLabel: 'You save',
  totalLabel: 'Total',
  checkoutLabel: 'Proceed to Checkout',
  continueLabel: 'Continue Shopping',
};

const storeFlowDefaults: StoreFlowData = { cart: cartDefaults };

/** Tailwind's `sm`. Below it the cart is a bottom sheet, above it a side drawer. */
const SIDE_DRAWER_MIN_WIDTH = 640;

/**
 * Which way the cart comes in.
 *
 * On a phone the cart rises from the bottom, where the thumb already is and
 * where every native app puts a sheet. On a wider screen there is room beside
 * the page, so it stays a right-hand drawer and the page stays visible.
 *
 * Tracked in state rather than done with CSS classes because the two need
 * different framer-motion transforms, not just different styling.
 */
function useIsBottomSheet(): boolean {
  const query = useMemo(
    () =>
      typeof window === 'undefined'
        ? null
        : window.matchMedia(`(max-width: ${SIDE_DRAWER_MIN_WIDTH - 1}px)`),
    [],
  );

  // A media query is state that lives outside React, which is exactly what
  // useSyncExternalStore is for. Mirroring it into useState meant setting state
  // inside an effect on every mount, and React flags that as a cascading render.
  return useSyncExternalStore(
    (onChange) => {
      query?.addEventListener('change', onChange);
      return () => query?.removeEventListener('change', onChange);
    },
    () => query?.matches ?? false,
    // Server render has no viewport; the side drawer is the safer assumption
    // because it needs no drag handling to be usable.
    () => false,
  );
}

export function CartDrawer() {
  const { items, isOpen, closeCart, totalPrice, totalSavings, removeItem } = useCartStore();
  const siteConfig = useSiteStore((s) => s.config);
  const store = storeFlowDefaults;
  const c = { ...cartDefaults, ...store.cart };

  // Checkout is gated here rather than only at the checkout screen: sending a
  // customer forward just to stop them a page later is the worse failure.
  const minimum = orderMinimum(siteConfig, totalPrice());

  // Carts live in the browser, so one filled while a combo was running is still
  // here after the offer closes. The order API refuses it either way; catching
  // it in the cart is what turns a failed checkout into a line to remove.
  const endedOffers = items.filter((item) => !isOfferLive(item.product));
  const isSheet = useIsBottomSheet();
  const dragControls = useDragControls();

  /**
   * Close on a deliberate downward flick or a drag past a third of the way.
   * Velocity matters as much as distance — a quick flick is a clear intent to
   * dismiss even if the finger barely travelled.
   */
  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) closeCart();
  };

  /**
   * Begin a sheet drag, unless the gesture started on a control.
   *
   * The header holds the close button; without this check, pressing it would
   * start dragging the sheet and swallow the tap.
   */
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    dragControls.start(e);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />

          {/* Drawer — a bottom sheet on a phone, a side drawer on a wider screen */}
          <motion.div
            key={isSheet ? 'sheet' : 'drawer'}
            initial={isSheet ? { y: '100%' } : { x: '100%' }}
            animate={isSheet ? { y: 0 } : { x: 0 }}
            exit={isSheet ? { y: '100%' } : { x: '100%' }}
            // Softer and a touch slower than the old spring, which settled so
            // fast the panel read as having simply appeared.
            transition={{ type: 'spring', damping: 32, stiffness: 260, mass: 0.9 }}
            {...(isSheet
              ? {
                  drag: 'y' as const,
                  // Started only from the handle and header. Letting the whole
                  // sheet accept a drag would swallow the scroll on the item
                  // list, so a cart of six items could not be scrolled at all.
                  dragListener: false,
                  dragControls,
                  // Only downward travel follows the finger; dragging up must not
                  // lift the sheet off the bottom of the screen.
                  dragConstraints: { top: 0, bottom: 0 },
                  dragElastic: { top: 0, bottom: 0.4 },
                  onDragEnd: handleDragEnd,
                }
              : {})}
            className={
              isSheet
                ? 'fixed inset-x-0 bottom-0 z-50 max-h-[88vh] rounded-t-3xl bg-white dark:bg-surface-900 shadow-2xl flex flex-col'
                : 'fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-surface-900 shadow-2xl flex flex-col'
            }
          >
            {/* Grab handle — the affordance that says this can be dragged away. */}
            {isSheet && (
              <div
                onPointerDown={startDrag}
                // touch-none stops the browser claiming the gesture as a page
                // scroll before framer-motion sees it.
                className="flex justify-center pt-3 pb-1 shrink-0 touch-none cursor-grab active:cursor-grabbing"
              >
                <span className="h-1.5 w-11 rounded-full bg-surface-300 dark:bg-surface-700" />
              </div>
            )}
            {/* Header */}
            <div
              onPointerDown={isSheet ? startDrag : undefined}
              className={`flex items-center justify-between px-6 border-b border-surface-200 dark:border-surface-800 ${isSheet ? 'pt-1 pb-3 touch-none' : 'py-4'}`}
            >
              <div className="flex items-center gap-3">
                <ShoppingBag size={22} className="text-brand-500" />
                <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
                  {c.title}
                </h2>
                <span className="text-body-sm text-surface-500">
                  ({items.length} {items.length === 1 ? c.itemSingular : c.itemPlural})
                </span>
              </div>
              <button
                onClick={closeCart}
                className="flex items-center justify-center w-10 h-10 rounded-xl text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                aria-label={c.closeLabel}
              >
                <X size={22} />
              </button>
            </div>

            {/* Cart Items */}
            {items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
                  <ShoppingBag size={32} className="text-surface-400" />
                </div>
                <p className="font-display font-semibold text-heading-sm text-surface-900 dark:text-surface-100">
                  {c.empty.title}
                </p>
                <p className="mt-2 text-body-sm text-surface-500">
                  {c.empty.subtext}
                </p>
                <Link to="/shop" onClick={closeCart} className="mt-6">
                  <Button>{c.empty.browseLabel}</Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-6">
                  {items.map((item, i) => (
                    <motion.div
                      key={item.product.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      // Staggered behind the panel so the contents arrive as it
                      // settles. Capped, or a large cart would still be fading
                      // in long after the sheet has stopped moving.
                      transition={{ delay: Math.min(i * 0.05, 0.3) + 0.1, duration: 0.25 }}
                    >
                      <CartItemCard item={item} />
                    </motion.div>
                  ))}
                </div>

                {/* Footer */}
                <div className="border-t border-surface-200 dark:border-surface-800 p-6 space-y-4">
                  {totalSavings() > 0 && (
                    <div className="flex items-center justify-between text-body-sm">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {c.saveLabel}
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        {formatPrice(totalSavings())}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="font-display font-semibold text-heading-sm text-surface-900 dark:text-surface-50">
                      {c.totalLabel}
                    </span>
                    <span className="font-display font-bold text-heading-md text-brand-600 dark:text-brand-400">
                      {formatPrice(totalPrice())}
                    </span>
                  </div>
                  {endedOffers.length > 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-300/60 bg-red-50 px-3 py-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                      <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                      <div className="text-body-sm text-red-800 dark:text-red-200">
                        <p>
                          {endedOffers.length === 1
                            ? `The offer on ${endedOffers[0].product.name} has ended.`
                            : `${endedOffers.length} offers in your cart have ended.`}
                        </p>
                        <button
                          onClick={() => endedOffers.forEach((item) => removeItem(item.product.id))}
                          className="mt-1 font-semibold underline hover:no-underline"
                        >
                          {endedOffers.length === 1 ? 'Remove it' : 'Remove them'} to continue
                        </button>
                      </div>
                    </div>
                  )}
                  {endedOffers.length > 0 ? (
                    <Button fullWidth size="lg" disabled>
                      {c.checkoutLabel}
                    </Button>
                  ) : minimum.meetsMinimum ? (
                    <Link to="/checkout" onClick={closeCart} className="block">
                      <Button fullWidth size="lg">
                        {c.checkoutLabel}
                      </Button>
                    </Link>
                  ) : (
                    <>
                      <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                        <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <p className="text-body-sm text-amber-800 dark:text-amber-200">{minimum.message}</p>
                      </div>
                      <Button fullWidth size="lg" disabled>
                        {c.checkoutLabel}
                      </Button>
                    </>
                  )}
                  <button
                    onClick={closeCart}
                    className="w-full text-center text-body-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
                  >
                    {c.continueLabel}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
