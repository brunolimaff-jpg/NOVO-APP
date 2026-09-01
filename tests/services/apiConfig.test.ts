import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('apiConfig — fronteira de sessão', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_BACKEND_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('não resolve BACKEND_URL para um fallback público quando VITE_BACKEND_URL está ausente', async () => {
    const { BACKEND_URL } = await import('../../services/apiConfig');

    expect(BACKEND_URL).toBeUndefined();
  });

  it('preserva o backend autorizado quando VITE_BACKEND_URL está definido', async () => {
    vi.stubEnv('VITE_BACKEND_URL', 'https://authorized-backend.test');
    vi.resetModules();

    const { BACKEND_URL } = await import('../../services/apiConfig');

    expect(BACKEND_URL).toBe('https://authorized-backend.test');
  });
});
