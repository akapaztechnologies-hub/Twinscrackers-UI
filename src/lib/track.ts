/**
 * First-party page-view tracking.
 *
 * Sends one anonymous beacon per storefront route change to your own backend.
 * There is no third-party tag, no cookie and nothing personal: the visitor is
 * identified only by a random id held in `sessionStorage`, which the browser
 * discards when the tab closes. That is enough to count unique visitors and
 * measure session length, and it keeps the storefront clear of consent-banner
 * obligations that a Google/Meta tag would bring.
 *
 * Failures are swallowed by design — analytics must never break a page.
 */

const SESSION_KEY = 'akash-crackers-session';
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/** Admin screens are staff activity, not website traffic. */
const IGNORED_PREFIXES = ['/admin'];

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Private mode with storage blocked — the hit still counts as a page view,
    // it just cannot be tied to the rest of the session.
    return 'anonymous';
  }
}

let lastPath: string | null = null;

export function trackPageView(path: string): void {
  if (typeof window === 'undefined') return;
  if (IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix))) return;
  // React Router can re-run an effect for the same location; one view per
  // navigation, not per render.
  if (path === lastPath) return;
  lastPath = path;

  const payload = JSON.stringify({
    sessionId: sessionId(),
    path,
    referrer: document.referrer || undefined,
  });

  const url = `${BASE_URL.replace(/\/+$/, '')}/track`;

  try {
    // sendBeacon survives the page being closed mid-navigation, which a fetch
    // can't promise. It only accepts a few content types, hence the Blob.
    if (navigator.sendBeacon?.(url, new Blob([payload], { type: 'application/json' }))) {
      return;
    }
  } catch {
    // Fall through to fetch.
  }

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {});
}
