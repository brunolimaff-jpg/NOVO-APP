export const CHUNK_RELOAD_GUARD_KEY = 'scout-chunk-reload-attempted';
export const CHUNK_RELOAD_PENDING_KEY = 'scout-chunk-reload-pending';

export function isChunkLoadError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || error || '');
  return /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\d]+ failed/i.test(
    message,
  );
}

/**
 * Loads an optional non-critical chunk (e.g. Mermaid) without triggering a full page reload.
 * Returns null on ChunkLoadError so the caller can degrade gracefully.
 */
export async function loadOptionalChunk<T>(loader: () => Promise<T>): Promise<T | null> {
  try {
    return await loader();
  } catch (error) {
    if (typeof window !== 'undefined' && isChunkLoadError(error)) {
      console.warn('[chunkRetry] optional chunk failed, degrading without reload:', error);
      return null;
    }
    throw error;
  }
}

/**
 * Handles stale hashed chunks after deploys by reloading once.
 */
export async function loadWithChunkRetry<T>(loader: () => Promise<T>): Promise<T> {
  try {
    const mod = await loader();
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
    }
    return mod;
  } catch (error) {
    if (typeof window !== 'undefined' && isChunkLoadError(error)) {
      const hasRetried = window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === '1';
      if (!hasRetried) {
        window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
        window.sessionStorage.setItem(CHUNK_RELOAD_PENDING_KEY, '1');
        // Reservado para futuro uso em analytics/telemetria de chunk errors
        window.dispatchEvent(new CustomEvent('scout:chunk-reload'));
        window.location.reload();
        return new Promise<T>(() => {});
      }
      window.sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
    }
    throw error;
  }
}
