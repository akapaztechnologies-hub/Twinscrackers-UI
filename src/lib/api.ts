import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth.ts';

const TOKENS_KEY = 'akash-crackers-tokens';

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Resolve with the whole AxiosResponse instead of the unwrapped `data.data`.
     * File downloads need it — a blob body and the Content-Disposition header —
     * and going through this client rather than bare axios keeps them on the
     * same expired-token refresh as every other call.
     */
    rawResponse?: boolean;
    /**
     * Leave a 401 alone: no refresh, no retry. For a call that must not rotate
     * the session on its way through — sign-out names the refresh token to end,
     * and refreshing first would end the old token and keep the new one alive.
     */
    skipAuthRefresh?: boolean;
    /** Send without the stored access token, which may have expired. */
    omitAuthHeader?: boolean;
  }
}

/** Per-request bookkeeping for the 401 handling below. Never set by callers. */
interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _anonymous?: boolean;
}

interface StoredTokens {
  accessToken?: string;
  refreshToken?: string;
}

/**
 * What every rejected request throws. Extends Error, so existing `err.message`
 * handling is untouched; `status`/`code` are additive for callers that care —
 * `code === 'SCREEN_FORBIDDEN'` means the role lacks the screen, not that
 * something went wrong.
 */
export class ApiRequestError extends Error {
  status?: number;
  code?: string;
}

/** True when a rejection is the permission middleware turning the caller away. */
export function isPermissionError(err: unknown): boolean {
  return (
    err instanceof ApiRequestError &&
    (err.status === 403 || err.code === 'SCREEN_FORBIDDEN' || err.code === 'ACTION_FORBIDDEN')
  );
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

function readTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

function bearerOf(config: InternalAxiosRequestConfig): string | undefined {
  const header = config.headers?.Authorization;
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
}

// Attach JWT access token to every request — except the one anonymous retry
// below, which exists precisely to go without it.
api.interceptors.request.use((config) => {
  if ((config as RetryConfig)._anonymous || config.omitAuthHeader) {
    delete config.headers.Authorization;
    return config;
  }
  const accessToken = readTokens()?.accessToken;
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/**
 * Credential endpoints answer 401 for a wrong password, not for an expired
 * session. Refreshing on those would sign the visitor into whatever account the
 * device last held and retry their login attempt under it.
 */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/firebase', '/auth/claim-guest'];

/** Pages that are useless signed out, so a dead session goes to the login screen. */
function routeNeedsSignIn(): boolean {
  const path = window.location.pathname;
  return ['/admin', '/account'].some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Serialise refreshes across every tab of this browser.
 *
 * The backend keeps one refresh token per account and rotates it on use, so two
 * tabs refreshing at once means one of them presents a token the other has just
 * spent — and used to answer that by deleting the tokens both tabs share. Under
 * the lock, a tab first re-reads storage: if the pair has changed since its
 * request went out, another tab already refreshed and there is nothing to do.
 */
async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks?.request) return task();
  return locks.request('akash-crackers-token-refresh', task) as Promise<T>;
}

/** One refresh per tab at a time; concurrent 401s share it. */
let refreshPromise: Promise<string> | null = null;

class RefreshRejected extends Error {}

function refreshAccessToken(staleAccessToken: string | undefined): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = withRefreshLock(async () => {
      const current = readTokens();
      if (current?.accessToken && current.accessToken !== staleAccessToken) {
        return current.accessToken;
      }
      if (!current?.refreshToken) throw new RefreshRejected('No refresh token');

      try {
        const res = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {
          refreshToken: current.refreshToken,
        });
        const tokens = res.data?.data as StoredTokens | undefined;
        if (!tokens?.accessToken) throw new RefreshRejected('Malformed refresh response');
        localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
        return tokens.accessToken;
      } catch (err) {
        // A blip is not a dead session: no response at all, the server failing
        // (5xx — a deploy or a cold start), or a rate limit. Keep the tokens and
        // fail only this request; the next one tries the refresh again. Only
        // the server turning the token down signs anyone out.
        const status = (err as AxiosError).response?.status;
        const transient = !status || status >= 500 || status === 408 || status === 429;
        if (!(err instanceof RefreshRejected) && transient) throw err;
        // Refused — but a browser without Web Locks may have had another tab
        // rotate the pair meanwhile. Use theirs rather than signing out.
        const latest = readTokens();
        if (latest?.accessToken && latest.refreshToken && latest.refreshToken !== current.refreshToken) {
          return latest.accessToken;
        }
        throw new RefreshRejected('Refresh refused');
      }
    }).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Drop a session the server no longer honours, in storage and in memory. */
function endSession(): void {
  const { user, endSession: clear } = useAuthStore.getState();
  if (user) clear();
  else localStorage.removeItem(TOKENS_KEY);
}

function toApiError(error: AxiosError<{ message?: string; errors?: { code?: string }[] }>): ApiRequestError {
  // Extract backend error message for user-facing display. The status and the
  // backend's error code ride along, because callers cannot see the original
  // AxiosError once it is replaced — and a 403 from the permission middleware
  // has to be distinguishable from a network failure.
  const message = error.response?.data?.message || error.message || 'Something went wrong';
  const wrapped = new ApiRequestError(message);
  wrapped.status = error.response?.status;
  wrapped.code = error.response?.data?.errors?.[0]?.code;
  return wrapped;
}

api.interceptors.response.use(
  // Unwrap ApiResponse wrapper: { statusCode, data, message, success } → data
  (response) => ((response.config as RetryConfig).rawResponse ? response : response.data?.data),

  async (error: AxiosError<{ message?: string; errors?: { code?: string }[] }>) => {
    const originalRequest = error.config as RetryConfig | undefined;
    const url = originalRequest?.url ?? '';

    // A download (`responseType: 'blob'`) gets its error body as a Blob too.
    // Read it, so the server's own message reaches the caller.
    if (error.response?.data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await error.response.data.text());
      } catch {
        /* not JSON — the generic message stands */
      }
    }

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest._anonymous &&
      !originalRequest.skipAuthRefresh &&
      !NO_REFRESH_PATHS.some((p) => url.startsWith(p))
    ) {
      const sentToken = bearerOf(originalRequest);
      const stored = readTokens();

      // A 401 on a request that carried no token and with nothing stored is a
      // plain "sign in first" — nothing to refresh, nothing to clear.
      if (sentToken || stored?.refreshToken) {
        originalRequest._retry = true;

        try {
          const accessToken = await refreshAccessToken(sentToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          if (!(refreshError instanceof RefreshRejected)) {
            // The refresh hit a blip (no response, 5xx, 408, 429): the session
            // stands. Say so — the original 401 "Invalid or expired token" reads
            // as being signed out — and carry the refresh's own status (5xx, or
            // none for no response), so nothing treats this as a 401 and drops
            // the session after all.
            const blip = toApiError(refreshError as AxiosError<{ message?: string; errors?: { code?: string }[] }>);
            blip.message = "Couldn't reach the server — please try again in a moment. You're still signed in.";
            return Promise.reject(blip);
          }

          endSession();

          if (routeNeedsSignIn()) {
            window.location.href = '/login';
            return Promise.reject(toApiError(error));
          }

          // The storefront works signed out. A read that failed only because
          // the old token was dead gets one more try as a visitor, rather than
          // throwing somebody off the product page they were reading. A write
          // does not: replaying an order as a visitor would place it as a guest
          // order instead of on the customer's account.
          if ((originalRequest.method ?? 'get').toLowerCase() === 'get') {
            originalRequest._anonymous = true;
            return api(originalRequest);
          }
          const expired = new ApiRequestError('Your sign-in has expired. Please sign in again.');
          expired.status = 401;
          return Promise.reject(expired);
        }
      }
    }

    return Promise.reject(toApiError(error));
  },
);

export default api;
