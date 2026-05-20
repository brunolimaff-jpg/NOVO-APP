// tests/utils/idbStorage.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageSet, storageGet, storageRemove } from '../../utils/idbStorage';

const PREFIX = 'scout360:';

describe('idbStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('storageSet', () => {
    it('armazena valor com prefixo', () => {
      expect(storageSet('theme', 'dark')).toBe(true);
      expect(localStorage.getItem(PREFIX + 'theme')).toBe('dark');
    });

    it('sobrescreve valor existente', () => {
      storageSet('key', 'v1');
      storageSet('key', 'v2');
      expect(localStorage.getItem(PREFIX + 'key')).toBe('v2');
    });

    it('não lança erro quando localStorage está indisponível', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => storageSet('k', 'v')).not.toThrow();
      expect(storageSet('k', 'v')).toBe(false);
      vi.restoreAllMocks();
    });
  });

  describe('storageGet', () => {
    it('retorna valor armazenado', () => {
      localStorage.setItem(PREFIX + 'mode', 'investigacao');
      expect(storageGet('mode')).toBe('investigacao');
    });

    it('retorna null para chave inexistente', () => {
      expect(storageGet('chave-que-nao-existe')).toBeNull();
    });

    it('retorna null quando localStorage falha', () => {
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('Storage error');
      });
      expect(storageGet('k')).toBeNull();
      vi.restoreAllMocks();
    });
  });

  describe('storageRemove', () => {
    it('remove chave existente', () => {
      localStorage.setItem(PREFIX + 'toRemove', 'val');
      storageRemove('toRemove');
      expect(localStorage.getItem(PREFIX + 'toRemove')).toBeNull();
    });

    it('não lança erro ao remover chave inexistente', () => {
      expect(() => storageRemove('chave-inexistente')).not.toThrow();
    });

    it('não lança erro quando localStorage falha', () => {
      vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('Storage error');
      });
      expect(() => storageRemove('k')).not.toThrow();
      vi.restoreAllMocks();
    });
  });
});
