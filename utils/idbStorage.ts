/**
 * idbStorage — wrapper seguro sobre localStorage para persistência PWA.
 * Em PWA instalado, localStorage persiste entre sessões igual a IndexedDB para dados simples.
 * Fallback silencioso em ambientes que bloqueiam storage (modo privado, iframes).
 */

const PREFIX = 'scout360:';

export function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Ignora falhas silenciosamente (modo privado, storage cheio, iframe sandboxado).
  }
}

export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function storageRemove(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Ignora falhas silenciosamente.
  }
}
