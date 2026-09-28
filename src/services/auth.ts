import api from '@/lib/api.ts';
import { useAuthStore } from '@/store/auth.ts';
import { mapOrder } from '@/services/firestore.ts';
import type { Order, UserProfile } from '@/types/index.ts';

const TOKENS_KEY = 'akash-crackers-tokens';

interface AuthResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}

function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify({ accessToken, refreshToken }));
}

/**
 * Give every user the fields the UI reads, whoever it is.
 *
 * A guest-order token's `/auth/me` answers `{ id, isGuest, guestOrderIds }` and
 * nothing else — the guest record's name and email may belong to whoever first
 * ordered on that phone, so they are not handed out. The account pages key on
 * `uid` and render `displayName` and `email`, so those are filled in (as empty
 * strings, never `undefined`) rather than left for each screen to trip on.
 */
function toUserProfile(raw: UserProfile | Record<string, unknown>): UserProfile {
  const user = raw as Partial<UserProfile> & { id?: string; _id?: string };
  return {
    ...user,
    uid: String(user.uid || user.id || user._id || ''),
    email: user.email ?? '',
    displayName: user.displayName ?? '',
    phone: user.phone ?? '',
    photoURL: user.photoURL ?? null,
  } as UserProfile;
}

export async function signInWithEmail(email: string, password: string): Promise<UserProfile> {
  const result: AuthResponse = await api.post('/auth/login', { email, password });
  storeTokens(result.accessToken, result.refreshToken);
  return toUserProfile(result.user);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
  phone?: string,
): Promise<UserProfile> {
  const result: AuthResponse = await api.post('/auth/register', {
    email,
    password,
    displayName,
    phone,
  });
  storeTokens(result.accessToken, result.refreshToken);
  return toUserProfile(result.user);
}

/**
 * Google sign-in via Firebase: open the Google popup, get the Firebase ID token,
 * and exchange it at our backend for our own app JWTs. Firebase is loaded lazily
 * (it's heavy) so it only ships to users who actually click "Continue with Google".
 */
export async function signInWithGoogle(): Promise<UserProfile> {
  const [{ signInWithPopup }, { firebaseAuth, googleProvider }] = await Promise.all([
    import('firebase/auth'),
    import('@/config/firebase.ts'),
  ]);

  const cred = await signInWithPopup(firebaseAuth, googleProvider);
  const idToken = await cred.user.getIdToken();

  const result: AuthResponse = await api.post('/auth/firebase', { idToken });
  storeTokens(result.accessToken, result.refreshToken);
  return toUserProfile(result.user);
}

export async function resetPassword(email: string): Promise<void> {
  await api.post('/auth/forgot-password', { email });
}

export async function confirmReset(token: string, newPassword: string): Promise<void> {
  await api.post('/auth/reset-password', { token, password: newPassword });
}

/**
 * Changing the password signs out every other device. This one gets a fresh
 * session back — keep it, or its old refresh token (now ended) signs this
 * device out too at the next refresh.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const result = (await api.post('/auth/change-password', { currentPassword, newPassword })) as Partial<AuthResponse> | null;
  if (result?.accessToken && result.refreshToken) storeTokens(result.accessToken, result.refreshToken);
}

function storedRefreshToken(): string | undefined {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}').refreshToken;
  } catch {
    return undefined;
  }
}

export async function signOutUser(): Promise<void> {
  // A cart change still waiting to be sent goes up while the session can
  // still send it; otherwise the last edit before signing out is lost.
  await import('@/lib/cartSync.ts').then((m) => m.flushCartSync()).catch(() => undefined);

  const refreshToken = storedRefreshToken();
  // A guest-order token has no session behind it to end: dropping it is all.
  if (refreshToken) {
    try {
      // Ends exactly this device's session, named by its refresh token. Sent
      // without the access token (it may have expired) and past the client's
      // 401 handling: refreshing on the way would rotate the token first, end
      // the old one, and leave the new one signed in for a week.
      await api.post('/auth/logout', { refreshToken }, { omitAuthHeader: true, skipAuthRefresh: true });
    } catch {
      // Ignore errors — clear local state regardless.
    }
  }
  // Clear the auth store: this removes the stored token AND resets the persisted
  // user/isAuthenticated state, so route guards immediately redirect to /login.
  // (Removing only the token here would leave the persisted user in place and the
  // UI would still consider the session active.)
  useAuthStore.getState().logout();
}

export async function getMe(): Promise<UserProfile> {
  return toUserProfile(await api.get('/auth/me'));
}

/**
 * Turn guest orders into a new account, and sign in.
 *
 * Creates a NEW account from the email and password, and moves into it only
 * what the caller can prove: the order named here (by its number and amount,
 * both printed on the order confirmation) plus the orders this browser's
 * guest-order token already holds — sent as the ordinary Authorization header.
 * Other guest orders on the same phone stay where they are; a phone number is
 * not proof of who placed them.
 *
 * An email that already has an account is refused (409) with a message the
 * form shows as it is; that customer signs in and uses `claimPastOrder`. The
 * server allows a handful of wrong tries per hour and does not say which part
 * was wrong.
 */
export async function claimGuestAccount(params: {
  phone: string;
  orderNumber: string;
  amount: number;
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ user: UserProfile }> {
  const result: AuthResponse = await api.post('/auth/claim-guest', params);
  storeTokens(result.accessToken, result.refreshToken);
  return { user: toUserProfile(result.user) };
}

/**
 * Bring one earlier guest order into the signed-in account.
 *
 * For a customer who already has an account and finds an order they placed as
 * a guest: the same proof as a claim — the phone, the order number and the
 * amount on its confirmation — moves that order in. Signed-in customers only.
 */
export async function claimPastOrder(params: {
  phone: string;
  orderNumber: string;
  amount: number;
}): Promise<Order> {
  const result = (await api.post('/auth/claim-order', params)) as Record<string, unknown>;
  return mapOrder(result);
}
