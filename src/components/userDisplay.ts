import type { UserProfile } from '@/types/index.ts';

type Named = Pick<UserProfile, 'displayName' | 'isGuest'> | null | undefined;

/**
 * What to call the signed-in visitor on screen.
 *
 * A guest checkout signs the browser in with a token that opens only the
 * orders placed on it, and `/auth/me` returns no name, email or phone for that
 * token. Every greeting and menu reads "Guest" for one — never "undefined" or a
 * blank. A real account with no name saved still reads "User", as before.
 */
export function userDisplayName(user: Named): string {
  if (!user) return '';
  if (user.isGuest) return 'Guest';
  return user.displayName?.trim() || 'User';
}

/** A first name to greet by, or '' when there is none to use (a guest, or no name saved). */
export function userFirstName(user: Named): string {
  if (!user || user.isGuest) return '';
  return user.displayName?.trim().split(/\s+/)[0] ?? '';
}
