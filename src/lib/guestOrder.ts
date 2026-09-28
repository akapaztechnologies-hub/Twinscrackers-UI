import { useAuthStore } from '@/store/auth.ts';
import type { UserProfile } from '@/types/index.ts';

/**
 * Adopt the order-scoped token a guest checkout handed back.
 *
 * A guest never holds an account session. The server returns a token that opens
 * only the orders placed in this browser — their confirmation page, detail,
 * tracking and payment proof — and nothing else; every other signed-in route
 * turns it away. It has no refresh token and lasts 30 days, after which the
 * visitor simply carries on as a visitor.
 *
 * `claimGuestAccount` is what turns the guest record into a real account, and
 * it asks for the order number and amount to prove the claim.
 */

const TOKENS_KEY = 'akash-crackers-tokens';

export interface GuestSession {
  accessToken: string;
  scope: 'guest-order';
  /** Every order this token opens — a second order in the same browser adds to it. */
  orderIds: string[];
}

/**
 * Store the guest-order token as the access token, with no refresh token.
 *
 * Returns true when a token was actually adopted, so callers can tell a guest
 * order from one placed by a customer who was already signed in. A real session
 * is never replaced: a signed-in customer's order does not come back with a
 * guest session, and if one ever did, trading their account for a token that
 * opens one order would sign them out.
 */
export function adoptGuestSession(session: GuestSession | undefined | null): boolean {
  if (!session?.accessToken) return false;
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    const current = raw ? (JSON.parse(raw) as { refreshToken?: string }) : null;
    if (current?.refreshToken) return false;
    localStorage.setItem(TOKENS_KEY, JSON.stringify({ accessToken: session.accessToken }));
  } catch {
    // Private browsing. The order is placed either way; what is lost is the
    // confirmation page and proof upload, which the receipt email covers.
    return false;
  }
  return true;
}

/**
 * Load the guest into the auth store.
 *
 * Called after `adoptGuestSession`, so the page that renders next already knows
 * it is showing a guest (`isGuest`, `guestOrderIds`) rather than waiting for a
 * reload.
 */
export async function refreshCurrentUser(): Promise<UserProfile | null> {
  try {
    const { getMe } = await import('@/services/auth.ts');
    const user = await getMe();
    if (user) useAuthStore.getState().setUser(user);
    return user;
  } catch {
    return null;
  }
}

/**
 * The account pages a guest may open: their orders and each order's detail.
 * Everything else under `/account` belongs to a real account.
 */
export function guestMayOpen(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '');
  return path === '/account/orders' || path.startsWith('/account/orders/');
}

/** Where a guest goes instead: the page that turns their orders into an account. */
export const GUEST_CLAIM_PATH = '/claim-account';
