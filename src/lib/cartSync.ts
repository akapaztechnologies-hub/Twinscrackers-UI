import api from '@/lib/api.ts';
import { getProductBySlug, mapProduct } from '@/services/products.ts';
import { normalizeCartItems, useCartStore } from '@/store/cart.ts';
import { useAuthStore } from '@/store/auth.ts';
import type { CartItem } from '@/types/index.ts';

/**
 * Keep the browser's cart and the signed-in account's cart the same cart.
 *
 * The cart lives in `localStorage`, which means it dies with the browser and
 * never follows anyone from their phone to their laptop. The server keeps a
 * copy per account, emptied by the server itself when an order is placed.
 *
 * Every time a session starts on this page — a sign-in, or a session restored
 * on page load — the two are reconciled once, and only then are local changes
 * pushed up (debounced). Reconciling first matters: a laptop opened a week
 * later must pick up what was added on the phone, not push its stale copy
 * over it.
 *
 * The cart last known to be on the server is kept per device
 * (`SYNC_STATE_KEY`), and a reconcile uses it as the common base:
 *
 *  - same account: line by line, whatever changed on this device since that
 *    base wins (an add, a removal, a new quantity) and every other line comes
 *    from the server — so removals on either side stick, and a stale device
 *    simply takes the server's cart;
 *  - another account signing in on this device: if the local cart is exactly
 *    the previous account's synced cart it stays with that account and this
 *    account's cart is taken as is; a basket with unsynced changes is merged in;
 *  - no base (first sync here, or after signing out): the two are merged, this
 *    device's quantity winning a line both have.
 *
 * Every failure here is swallowed. A customer who cannot reach the cart API
 * still has the basket in front of them, and losing a sign-in over a cart sync
 * would be a far worse trade than a cart that is briefly only local. A failed
 * reconcile leaves pushes off — a device that never read the server's cart must
 * not overwrite it — and is retried when the cart changes or the connection
 * comes back, at most every 30 seconds, backing off to five minutes.
 */

interface ServerCartRow {
  product?: Record<string, unknown> | null;
  quantity: number;
}

interface SyncState {
  uid: string;
  key: string;
}

const TOKENS_KEY = 'akash-crackers-tokens';
const SYNC_STATE_KEY = 'akash-crackers-cart-sync';
const PUSH_DELAY_MS = 800;

let unsubscribe: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** The cart key last known to be on the server, so an unchanged cart is not re-sent. */
let lastPushed = '';
/** Pushes run one after another, so an older cart can never land after a newer one. */
let pushChain: Promise<void> = Promise.resolve();
/** Set while the reconciled cart is written locally, so that write is not echoed back. */
let applyingServerCart = false;
/** The account this page has reconciled with. Pushes go to it and to no other. */
let reconciledUid: string | null = null;
/** Off until a reconcile completes, and while one is in flight. */
let pushesEnabled = false;
let reconciling: Promise<void> | null = null;

const RETRY_MIN_MS = 30_000;
const RETRY_MAX_MS = 5 * 60_000;
let lastRetryAt = 0;
let retryDelayMs = RETRY_MIN_MS;

function currentUid(): string | null {
  const { user } = useAuthStore.getState();
  return user && user.role !== 'admin' && !user.isGuest && user.uid ? user.uid : null;
}

function payloadOf(items: CartItem[]) {
  return items.map((item) => ({ productId: item.product.id, quantity: item.quantity }));
}

/** Order-independent identity of a cart's contents. */
function cartKey(items: CartItem[]): string {
  return JSON.stringify(payloadOf(items).sort((a, b) => a.productId.localeCompare(b.productId)));
}

function readSyncState(): SyncState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || 'null') as SyncState | null;
    return parsed && typeof parsed.key === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeSyncState(uid: string, key: string): void {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({ uid, key }));
  } catch {
    /* private mode — the next reconcile merges instead, which loses nothing */
  }
}

async function pushNow(): Promise<void> {
  const uid = currentUid();
  if (!pushesEnabled || !uid || uid !== reconciledUid) return;
  const items = useCartStore.getState().items;
  const key = cartKey(items);
  if (key === lastPushed) return;
  try {
    await api.put('/cart', { items: payloadOf(items) });
    lastPushed = key;
    writeSyncState(uid, key);
  } catch {
    /* the next change, or the next reconcile, tries again */
  }
}

function queuePush(): Promise<void> {
  pushChain = pushChain.then(pushNow);
  return pushChain;
}

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void queuePush();
  }, PUSH_DELAY_MS);
}

/**
 * The tab is going away with a change still waiting out its debounce. A normal
 * request may be cancelled mid-unload, so this one goes as a keepalive fetch.
 */
function flushOnLeave(): void {
  if (!pushTimer) return;
  clearTimeout(pushTimer);
  pushTimer = null;
  const uid = currentUid();
  if (!pushesEnabled || !uid || uid !== reconciledUid) return;

  const items = useCartStore.getState().items;
  if (cartKey(items) === lastPushed) return;
  let accessToken: string | undefined;
  try {
    accessToken = JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}').accessToken;
  } catch {
    return;
  }
  if (!accessToken) return;

  void fetch(`${api.defaults.baseURL}/cart`, {
    method: 'PUT',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ items: payloadOf(items) }),
  }).catch(() => {});
}

function ensureSubscribed(): void {
  if (unsubscribe) return;
  const offCart = useCartStore.subscribe((state, prev) => {
    if (applyingServerCart || state.items === prev.items) return;
    // While pushes are off the change is not lost: a reconcile reads the cart
    // as it is when the server answers, and pushes the result. If none is
    // running — the last one failed — this change is the cue to try again.
    if (!pushesEnabled) {
      retryReconcile();
      return;
    }
    schedulePush();
  });
  // Signing out, or into another account, ends pushing to this one — before
  // the sign-out empties the local cart, so that empty cart is never sent.
  const offAuth = useAuthStore.subscribe((state, prev) => {
    if (state.user?.uid === prev.user?.uid && state.user) return;
    pushesEnabled = false;
    reconciledUid = null;
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
  });
  const onOnline = () => retryReconcile(true);
  unsubscribe = () => {
    offCart();
    offAuth();
    window.removeEventListener('online', onOnline);
  };
  window.addEventListener('pagehide', flushOnLeave);
  window.addEventListener('online', onOnline);
}

/**
 * Try a failed reconcile again — only when nothing is reconciling, pushes are
 * off and a customer is signed in, and not more often than the backoff allows.
 * Coming back online starts the backoff over.
 */
function retryReconcile(backOnline = false): void {
  const uid = currentUid();
  if (!uid || pushesEnabled || reconciling) return;
  if (backOnline) retryDelayMs = RETRY_MIN_MS;
  const now = Date.now();
  if (now - lastRetryAt < retryDelayMs) return;
  lastRetryAt = now;
  void reconcileOnce(uid).then(() => {
    retryDelayMs = pushesEnabled ? RETRY_MIN_MS : Math.min(retryDelayMs * 2, RETRY_MAX_MS);
  });
}

/**
 * Server rows become cart lines. A server that returns only a handful of
 * product fields gets the missing product fetched, so the cart drawer has the
 * category and offer window it renders.
 */
async function toCartItems(rows: ServerCartRow[]): Promise<CartItem[]> {
  const lines = await Promise.all(
    rows.map(async (row) => {
      const raw = row.product;
      if (!raw || typeof raw !== 'object') return null;
      let product = mapProduct(raw);
      const thin = !('categorySlug' in raw) && !('isCombo' in raw);
      if (thin && product.slug) {
        product = (await getProductBySlug(product.slug).catch(() => null)) ?? product;
      }
      return { product, quantity: row.quantity };
    }),
  );
  return normalizeCartItems(lines.filter(Boolean));
}

/**
 * One cart out of two. A product in both takes this device's quantity — the
 * most recent thing the customer did here — not the larger of the two, which
 * is how a quantity lowered before signing out used to climb back up.
 */
function mergeCarts(local: CartItem[], server: CartItem[]): CartItem[] {
  const localIds = new Set(local.map((item) => item.product.id));
  return [...local, ...server.filter((item) => !localIds.has(item.product.id))];
}

/** productId -> quantity of a stored cart key, or null when it is unreadable. */
function parseKey(key: string): Map<string, number> | null {
  try {
    const rows = JSON.parse(key) as { productId: string; quantity: number }[];
    return Array.isArray(rows) ? new Map(rows.map((row) => [row.productId, row.quantity])) : null;
  } catch {
    return null;
  }
}

/**
 * Three-way merge against the cart both sides last agreed on. A line this
 * device changed since then (added, removed, re-counted) keeps this device's
 * version; every other line is the server's, including a removal made on
 * another device. A plain union could not carry a removal, which is how an
 * item taken out came back.
 */
function mergeFromBase(local: CartItem[], server: CartItem[], base: Map<string, number>): CartItem[] {
  const localById = new Map(local.map((item) => [item.product.id, item]));
  const serverById = new Map(server.map((item) => [item.product.id, item]));
  const ids = [...new Set([...localById.keys(), ...serverById.keys()])];
  const merged: CartItem[] = [];
  for (const id of ids) {
    const mine = localById.get(id);
    const changedHere = (mine?.quantity ?? 0) !== (base.get(id) ?? 0);
    const pick = changedHere ? mine : serverById.get(id);
    if (pick) merged.push(pick);
  }
  return merged;
}

async function reconcile(uid: string): Promise<void> {
  pushesEnabled = false;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  ensureSubscribed();

  try {
    const result = (await api.get('/cart')) as { items?: ServerCartRow[] } | null;
    const server = await toCartItems(result?.items ?? []);
    // Signed out, or someone else signed in, while the request was out.
    if (currentUid() !== uid) return;

    // Read the local cart only now: anything the customer did while the
    // request was out — clearing it after an order, say — has to count.
    const local = useCartStore.getState().items;
    const synced = readSyncState();
    const base = synced ? parseKey(synced.key) : null;
    let next: CartItem[];
    if (synced && base && synced.uid === uid) {
      next = mergeFromBase(local, server, base);
    } else if (synced && cartKey(local) === synced.key) {
      // Another account's synced cart: it stays with that account.
      next = server;
    } else {
      next = mergeCarts(local, server);
    }

    if (cartKey(next) !== cartKey(local)) {
      applyingServerCart = true;
      try {
        useCartStore.setState({ items: next });
      } finally {
        applyingServerCart = false;
      }
    }

    lastPushed = cartKey(server);
    writeSyncState(uid, lastPushed);
    reconciledUid = uid;
    pushesEnabled = true;
    // Sends the merged cart when it differs from the server's, and any edit
    // made since — the push reads the cart as it is when it runs.
    await queuePush();
  } catch {
    /* pushes stay off; retryReconcile tries again on the next change or reconnect */
  }
}

/** One reconcile at a time; a caller arriving mid-flight runs after it. */
function reconcileOnce(uid: string): Promise<void> {
  if (reconciling) return reconciling.then(() => reconcileOnce(uid));
  if (reconciledUid === uid && pushesEnabled) return Promise.resolve();
  reconciling = reconcile(uid).finally(() => {
    reconciling = null;
  });
  return reconciling;
}

/**
 * A session restored on page load, or a profile refresh: reconcile once per
 * page for this account, then keep pushing. Idempotent.
 */
export function startCartSync(): Promise<void> {
  const uid = currentUid();
  return uid ? reconcileOnce(uid) : Promise.resolve();
}

/**
 * A sign-in. The same reconcile — a sign-out (or a switch of account) has
 * already reset this page's sync, so it always runs for the new session.
 */
export function syncCartOnLogin(): Promise<void> {
  return startCartSync();
}

/**
 * Send a change still waiting out its debounce, before signing out ends the
 * session it would be sent with. Waits at most `timeoutMs`: a slow network
 * must not hold up the sign-out.
 */
export async function flushCartSync(timeoutMs = 1500): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
    void queuePush();
  }
  await Promise.race([pushChain, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
}
