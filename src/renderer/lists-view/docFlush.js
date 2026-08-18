/**
 * Registry of pending bullet/md doc saves so quit can flush the 400ms debounce.
 */

const flushers = new Set();

/**
 * Register a flush callback. Returns unsubscribe.
 * @param {() => void|Promise<void>} fn
 */
export function registerDocFlusher(fn) {
  flushers.add(fn);
  return () => flushers.delete(fn);
}

/** Await every registered pad flush (no-op if nothing dirty). */
export async function flushPendingDocs() {
  await Promise.all([...flushers].map((fn) => fn()));
}
