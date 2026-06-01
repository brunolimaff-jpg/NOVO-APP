// tests/utils/localStorage.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageSet, storageGet, storageRemove } from '../../utils/localStorage';

const PREFIX = 'scout360:';

function replaceWindowLocalStorage(storage: Storage): () => void {
  const originalStorage = window.localStorage;
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: originalStorage,
    });
  };
}

describe('idbStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('storageSet', () => {
    it('armazena valor com prefixo', () => {
      expect(storageSet('theme', 'dark')).toBe(true);
      expect(window.localStorage.getItem(PREFIX + 'theme')).toBe('dark');
    });

    it('sobrescreve valor existente', () => {
      storageSet('key', 'v1');
      storageSet('key', 'v2');
      expect(window.localStorage.getItem(PREFIX + 'key')).toBe('v2');
    });

    it('não lança erro quando localStorage está indisponível', () => {
      const restoreStorage = replaceWindowLocalStorage({
        length: 0,
        clear: () => undefined,
        getItem: () => null,
        key: () => null,
        removeItem: () => undefined,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      });
      try {
        expect(() => storageSet('k', 'v')).not.toThrow();
        expect(storageSet('k', 'v')).toBe(false);
      } finally {
        restoreStorage();
      }
    });
  });

  describe('storageGet', () => {
    it('retorna valor armazenado', () => {
      window.localStorage.setItem(PREFIX + 'mode', 'investigacao');
      expect(storageGet('mode')).toBe('investigacao');
    });

    it('retorna null para chave inexistente', () => {
      expect(storageGet('chave-que-nao-existe')).toBeNull();
    });

    it('retorna null quando localStorage falha', () => {
      vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new Error('Storage error');
      });
      expect(storageGet('k')).toBeNull();
      vi.restoreAllMocks();
    });
  });

  describe('storageRemove', () => {
    it('remove chave existente', () => {
      window.localStorage.setItem(PREFIX + 'toRemove', 'val');
      storageRemove('toRemove');
      expect(window.localStorage.getItem(PREFIX + 'toRemove')).toBeNull();
    });

    it('não lança erro ao remover chave inexistente', () => {
      expect(() => storageRemove('chave-inexistente')).not.toThrow();
    });

    it('não lança erro quando localStorage falha', () => {
      vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('Storage error');
      });
      expect(() => storageRemove('k')).not.toThrow();
      vi.restoreAllMocks();
    });
  });
});
