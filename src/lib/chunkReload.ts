/**
 * Recovering from a deploy that happened while the page was open.
 *
 * Every page after the first is a lazily loaded chunk with a content-hashed
 * name. A deploy replaces those files, so a tab opened before it asks for a
 * chunk that no longer exists — and the host answers with the SPA's index.html,
 * which the browser refuses to run as a script. The only fix is the new build,
 * which a reload fetches.
 */

const RELOAD_KEY = 'akash-crackers-chunk-reload';
/** A second failure this soon after reloading is not a stale build — stop and show it. */
const RELOAD_WINDOW_MS = 60_000;

/** The messages each browser uses for "that script chunk could not be loaded". */
const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Expected a JavaScript(?:-or-Wasm)? module script|Loading (?:CSS )?chunk [\w-]+ failed|Unable to preload CSS/i;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '');
  return CHUNK_ERROR.test(message);
}

/**
 * Reload to pick up the new build — once. Returns false when a reload was
 * already tried moments ago, so the caller shows an error instead of looping.
 */
export function reloadOnceForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // No sessionStorage means no loop guard, so do not risk a reload loop.
    return false;
  }
  window.location.reload();
  return true;
}
