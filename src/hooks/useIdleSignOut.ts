import { useEffect, useState } from 'react';

/** Last activity in ANY admin tab — so working in one tab keeps the others signed in. */
const ACTIVITY_KEY = 'akash-crackers-admin-activity';
const CHECK_EVERY_MS = 30_000;
/** Activity is recorded at most this often; mousemove fires far faster than it matters. */
const RECORD_EVERY_MS = 15_000;
/** The bounds the Settings screen states for the field. */
const MIN_MINUTES = 5;
const MAX_MINUTES = 1440;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'mousemove', 'wheel', 'touchstart', 'scroll'] as const;

/**
 * The Admin Portal's idle sign-out: Settings → Security → Session Timeout.
 *
 * An admin screen left open on the counter PC is a signed-in till for anyone
 * who walks up to it. After the configured minutes with no input in any admin
 * tab, the session is signed out and the route guard sends the page to the
 * login screen. A timeout of 0 — or a shop that never saved the setting —
 * leaves it off.
 */
export function useIdleSignOut(): void {
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void import('@/services/admin.ts')
      .then(({ getContentSection }) => getContentSection<{ sessionTimeout?: number }>('security-settings'))
      .then((section) => {
        const value = Number(section?.sessionTimeout);
        if (cancelled || !Number.isFinite(value) || value <= 0) return;
        setMinutes(Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(value))));
      })
      .catch(() => {
        /* setting unreadable: stay off rather than sign anyone out on a guess */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!minutes) return;
    const limitMs = minutes * 60_000;
    let lastRecorded = 0;

    const record = () => {
      const now = Date.now();
      if (now - lastRecorded < RECORD_EVERY_MS) return;
      lastRecorded = now;
      try {
        localStorage.setItem(ACTIVITY_KEY, String(now));
      } catch {
        /* private mode: this tab's own timer still works off lastRecorded */
      }
    };

    const lastActivity = (): number => {
      try {
        return Math.max(lastRecorded, Number(localStorage.getItem(ACTIVITY_KEY)) || 0);
      } catch {
        return lastRecorded;
      }
    };

    let signingOut = false;
    const check = async () => {
      if (signingOut || Date.now() - lastActivity() < limitMs) return;
      signingOut = true;
      const { signOutUser } = await import('@/services/auth.ts');
      await signOutUser();
    };

    record();
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    // A laptop lid closed past the limit: check the moment the tab is back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, record, { passive: true });
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, record);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [minutes]);
}
