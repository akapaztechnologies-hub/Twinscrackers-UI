import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App.tsx';
import { reloadOnceForNewBuild } from '@/lib/chunkReload.ts';
import '@/styles/index.css';

// Initialize theme before render to prevent flash. Guarded: a corrupt value, or
// storage the browser refuses to open, must not stop the app from starting.
let savedTheme: { state?: { theme?: string } } | null = null;
try {
  savedTheme = JSON.parse(localStorage.getItem('akash-crackers-theme') ?? '{}');
} catch {
  savedTheme = null;
}
if (savedTheme?.state?.theme === 'light') {
  document.documentElement.classList.remove('dark');
} else {
  document.documentElement.classList.add('dark');
}

// Vite reports a chunk it could not load — the usual sign that a deploy
// replaced the files this tab was built against. Start the (once-only) reload
// onto the new build here, which also covers imports made outside rendering.
// The event is deliberately NOT cancelled: cancelling makes the import resolve
// to `undefined`, which surfaced as a cryptic crash. Left alone, the import
// fails as a chunk error, and the error boundary shows "a new version is
// available" for as long as the reload takes — or for good, with a Reload
// button, if a leave-page prompt stops it.
window.addEventListener('vite:preloadError', () => {
  reloadOnceForNewBuild();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Offline support.
 *
 * Registered after load so it never competes with the first paint — the worker
 * is for the SECOND visit, and fetching it during the first one only makes that
 * visit slower.
 *
 * Skipped in development: a service worker caching a dev bundle is how you
 * spend an afternoon debugging a change that was never served.
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Blocked, unsupported, or served over plain HTTP. The site works
      // exactly as before — it simply will not open without a connection.
    });
  });
}
