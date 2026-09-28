import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { screenForPath, type PermissionAction, type ScreenKey } from '@/config/admin-screens.ts';
import type { UserProfile } from '@/types/index.ts';
import { useCartStore } from '@/store/cart.ts';
import { useWishlistStore } from '@/store/wishlist.ts';

const TOKENS_KEY = 'akash-crackers-tokens';
/** lib/cartSync's record of the cart last known to be on the server. */
const CART_SYNC_KEY = 'akash-crackers-cart-sync';

/** Screen key -> granted actions. Built once per user so `can()` is a map hit. */
type PermissionMap = Record<string, PermissionAction[]>;

interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** "Is this account staff?" — the flag the admin entry points have always read. */
  isAdmin: boolean;
  isSuperAdmin: boolean;
  permissions: PermissionMap;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  /** The customer chose to sign out: forget the account and this device's copy of its cart. */
  logout: () => void;
  /** The server stopped honouring the session: forget the account, keep the basket. */
  endSession: () => void;
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  clearTokens: () => void;
}

function buildPermissions(user: UserProfile | null): PermissionMap {
  const map: PermissionMap = {};
  for (const entry of user?.permissions ?? []) {
    map[entry.screen] = entry.actions;
  }
  return map;
}

/**
 * Staff, for UI purposes.
 *
 * `permissions` being non-empty is the RBAC answer; `role === 'admin'` is the
 * fallback that keeps a pre-RBAC admin — and a frontend talking to a backend
 * that has not been deployed yet — working exactly as before.
 */
function deriveIsAdmin(user: UserProfile | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.isSuperAdmin) return true;
  return (user.permissions?.length ?? 0) > 0;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      isAuthenticated: false,
      isAdmin: false,
      isSuperAdmin: false,
      permissions: {},

      setUser: (user) => {
        // The same account carrying on (a restored session, a profile refresh).
        // A guest's order token is not a sign-in, so claiming an account from
        // one is a new session; so is signing into a different account.
        const prev = get().user;
        const wasSignedIn =
          get().isAuthenticated && !!prev && !prev.isGuest && !!user && prev.uid === user.uid;
        set({
          user,
          isAuthenticated: !!user,
          isAdmin: deriveIsAdmin(user),
          isSuperAdmin: !!user?.isSuperAdmin || user?.role === 'admin',
          permissions: buildPermissions(user),
          isLoading: false,
        });

        /*
         * Keep the browser's cart and the account's in step: reconciled once per
         * session on this page (a sign-in, or a session restored on page load —
         * this setter runs then too), and pushed up after that. Loaded lazily
         * and never awaited: a sign-in must not wait on, or fail because of, a
         * cart. A guest's token opens only their orders, never a cart.
         */
        if (user && user.role !== 'admin' && !user.isGuest) {
          void import('@/lib/cartSync.ts').then((m) =>
            wasSignedIn ? m.startCartSync() : m.syncCartOnLogin(),
          );
        }
      },

      setLoading: (isLoading) => set({ isLoading }),

      logout: () => {
        const wasGuest = !!get().user?.isGuest;
        get().endSession();
        // A guest has no server cart: their basket exists only here, so it stays.
        if (wasGuest) return;
        // After the sign-out above, so the cart sync sees nobody signed in and
        // does not push this empty cart over the account's. The basket is the
        // account's now — it is on the server and comes back at the next
        // sign-in — and must not be handed to whoever uses this device next.
        useCartStore.getState().clearCart();
        // The emptied cart is not a change to merge at the next sign-in: drop
        // the sync base, so that sign-in takes the server's cart back whole.
        try {
          localStorage.removeItem(CART_SYNC_KEY);
        } catch {
          /* private mode */
        }
      },

      endSession: () => {
        localStorage.removeItem(TOKENS_KEY);
        set({
          user: null,
          isAuthenticated: false,
          isAdmin: false,
          isSuperAdmin: false,
          permissions: {},
          isLoading: false,
        });
        useWishlistStore.getState().clear();
      },

      setTokens: (tokens) => {
        localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
      },

      clearTokens: () => {
        localStorage.removeItem(TOKENS_KEY);
      },
    }),
    {
      name: 'akash-crackers-auth',
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.user) {
          state.isAuthenticated = true;
          state.isAdmin = deriveIsAdmin(state.user);
          state.isSuperAdmin = !!state.user.isSuperAdmin || state.user.role === 'admin';
          state.permissions = buildPermissions(state.user);
        }
      },
    },
  ),
);

/**
 * Where to send someone straight after they sign in.
 *
 * Staff belong in the Admin Portal, not the customer account page — an employee
 * created for counter billing has no use for a wishlist. `/admin` is deliberate
 * rather than a specific screen: `ScreenGuard` forwards from there to the first
 * screen their role actually grants, so a role without Dashboard still lands
 * somewhere useful.
 */
export function landingPathFor(user: UserProfile | null): string {
  return deriveIsAdmin(user) ? '/admin' : '/account';
}

/**
 * Where to go after sign-in when a guard remembered the page it bounced from.
 *
 * That page belongs to whoever was signed in *before*: an owner who signs out on
 * `/admin/roles` leaves `from: '/admin/roles'` on the login screen, and the
 * employee who signs in next on the same device must not inherit it — their role
 * lacks Roles, so they would open straight onto "Screen not available". Honour
 * `requested` only when this user can actually open it.
 */
export function postLoginPath(user: UserProfile | null, requested?: string | null): string {
  if (requested && canUserOpenPath(user, requested)) return requested;
  return landingPathFor(user);
}

function canUserOpenPath(user: UserProfile | null, path: string): boolean {
  const pathname = path.split(/[?#]/)[0];
  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) return true;
  if (!deriveIsAdmin(user)) return false;
  if (user?.isSuperAdmin || user?.role === 'admin') return true;
  const screen = screenForPath(pathname);
  if (!screen) return true;
  return buildPermissions(user)[screen]?.includes('view') ?? false;
}

/**
 * May the signed-in user open `screen` (and optionally perform `action` on it)?
 *
 * This drives what the sidebar renders and which routes open. It is a
 * convenience, never the enforcement: the backend re-checks every request, so a
 * stale answer here costs a clean 403 page and nothing more.
 *
 * `action` defaults to 'view'. The permission matrix currently grants all four
 * actions together, so passing one is forward-compatible rather than useful yet.
 */
export function useCan(): (screen: ScreenKey, action?: PermissionAction) => boolean {
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin);
  const permissions = useAuthStore((s) => s.permissions);

  return (screen, action = 'view') => {
    if (isSuperAdmin) return true;
    return permissions[screen]?.includes(action) ?? false;
  };
}

/** Non-hook form, for use outside a component. */
export function canAccess(screen: ScreenKey, action: PermissionAction = 'view'): boolean {
  const { isSuperAdmin, permissions } = useAuthStore.getState();
  if (isSuperAdmin) return true;
  return permissions[screen]?.includes(action) ?? false;
}
