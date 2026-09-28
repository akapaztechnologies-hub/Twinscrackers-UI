import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth.ts';
import { useWishlistStore } from '@/store/wishlist.ts';

const TOKENS_KEY = 'akash-crackers-tokens';

export function useAuthListener() {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const fetchWishlist = useWishlistStore((s) => s.fetchWishlist);
  const clearWishlist = useWishlistStore((s) => s.clear);

  useEffect(() => {
    const tokensRaw = localStorage.getItem(TOKENS_KEY);

    if (!tokensRaw) {
      setUser(null);
      setLoading(false);
      return;
    }

    // Validate session by calling GET /api/auth/me
    (async () => {
      try {
        const { getMe } = await import('@/services/auth.ts');
        const user = await getMe();
        setUser(user);
        // A guest's token opens their orders only — there is no wishlist to load.
        if (!user.isGuest) fetchWishlist();
      } catch (err) {
        const status = (err as { status?: number })?.status;
        let realSession = false;
        try {
          realSession = Boolean(JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}').refreshToken);
        } catch {
          /* unreadable — treat as no session */
        }
        if (status === 401 || (status === 403 && realSession)) {
          // The server turned the session down (the client has already tried a
          // refresh), or the account is deactivated: sign out here too.
          setUser(null);
          clearWishlist();
          localStorage.removeItem(TOKENS_KEY);
        } else if (status === 403) {
          // A guest-order token refused for now (guest checkout switched off).
          // Keep it — it cannot be issued again, and it opens their orders once
          // the shop allows guests again — but show the visitor view meanwhile.
          setUser(null);
        } else {
          // Offline, or the API is down. That says nothing about the session,
          // so keep it: signing everyone out during an outage would only send
          // them all to the login screen once it is back.
          setLoading(false);
          // The restored session still needs its cart sync. The first attempt
          // may fail too; the sync then retries on the next cart change or
          // when the connection comes back.
          const restored = useAuthStore.getState().user;
          if (restored && restored.role !== 'admin' && !restored.isGuest) {
            void import('@/lib/cartSync.ts').then((m) => m.startCartSync());
          }
        }
      }
    })();
  }, [setUser, setLoading, fetchWishlist, clearWishlist]);
}
