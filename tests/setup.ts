import '@testing-library/jest-dom/vitest';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

if (typeof window !== 'undefined') {
  const browserStorage = window.localStorage ?? createMemoryStorage();
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: browserStorage,
    });
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: browserStorage,
  });

  if (window.Storage) {
    Object.defineProperty(globalThis, 'Storage', {
      configurable: true,
      value: window.Storage,
    });
  }
}
