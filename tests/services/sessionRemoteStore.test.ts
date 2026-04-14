import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock do módulo retry para que os testes não dependam de timers reais
vi.mock('../../utils/retry', () => ({
  withAutoRetry: vi.fn((_key: string, fn: () => Promise<unknown>) => fn()),
}));

// Mock do apiConfig para URL controlada
vi.mock('../../services/apiConfig', () => ({
  BACKEND_URL: 'https://mock-backend.test',
}));

// Mock stripInternalMarkers — não relevante para testes de rede
vi.mock('../../utils/textCleaners', () => ({
  stripInternalMarkers: (text: string) => text,
}));

describe('sessionRemoteStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // ─── listRemoteSessions ────────────────────────────────────────────────────

  describe('listRemoteSessions', () => {
    it('returns mapped ChatSession[] on success', async () => {
      const rows = [
        {
          sessionId: 'abc',
          title: 'Sessão Scheffer',
          empresaAlvo: 'Grupo Scheffer',
          cnpj: '12345678000195',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          scoreOportunidade: '82',
        },
      ];

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ok: true, sessions: rows }),
      } as Response);

      const { listRemoteSessions } = await import('../../services/sessionRemoteStore');
      const result = await listRemoteSessions();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('abc');
      expect(result[0].title).toBe('Sessão Scheffer');
      expect(result[0].scoreOportunidade).toBe(82);
      expect(result[0].messages).toEqual([]);
    });

    it('returns empty array on HTTP error (silent failure)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response);

      const { listRemoteSessions } = await import('../../services/sessionRemoteStore');
      const result = await listRemoteSessions();

      expect(result).toEqual([]);
    });

    it('returns empty array on network failure (silent failure)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const { listRemoteSessions } = await import('../../services/sessionRemoteStore');
      const result = await listRemoteSessions();

      expect(result).toEqual([]);
    });

    it('returns empty array when API responds with ok:false', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ok: false, message: 'Auth error' }),
      } as Response);

      const { listRemoteSessions } = await import('../../services/sessionRemoteStore');
      const result = await listRemoteSessions();

      expect(result).toEqual([]);
    });

    it('returns empty array on invalid JSON response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => '<html>Error page</html>',
      } as Response);

      const { listRemoteSessions } = await import('../../services/sessionRemoteStore');
      const result = await listRemoteSessions();

      expect(result).toEqual([]);
    });

    it('uses default title when title field is empty', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            ok: true,
            sessions: [
              {
                sessionId: 'xyz',
                title: '',
                empresaAlvo: '',
                cnpj: '',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
              },
            ],
          }),
      } as Response);

      const { listRemoteSessions } = await import('../../services/sessionRemoteStore');
      const result = await listRemoteSessions();

      expect(result[0].title).toBe('Sessão sem título');
    });

    it('fallback para POST quando GET retorna payload inválido', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({ ok: true, encontrado: false, results: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            JSON.stringify({
              ok: true,
              sessions: [
                {
                  sessionId: 'fallback-1',
                  title: 'Sessão fallback',
                  empresaAlvo: 'Acme',
                  cnpj: '',
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z',
                },
              ],
            }),
        } as Response);

      const { listRemoteSessions } = await import('../../services/sessionRemoteStore');
      const result = await listRemoteSessions();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('fallback-1');
    });
  });

  // ─── getRemoteSession ──────────────────────────────────────────────────────

  describe('getRemoteSession', () => {
    it('returns full ChatSession with parsed messages on success', async () => {
      const messages = [
        { id: 'm1', sender: 'user', text: 'Olá', timestamp: '2024-01-01T10:00:00Z' },
        { id: 'm2', sender: 'model', text: 'Resposta', timestamp: '2024-01-01T10:01:00Z' },
      ];

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            ok: true,
            session: {
              sessionId: 'sess-1',
              title: 'Investigação Scheffer',
              empresaAlvo: 'Scheffer',
              cnpj: '99887766000155',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-02T00:00:00Z',
              messagesJson: JSON.stringify(messages),
              scoreOportunidade: 70,
            },
          }),
      } as Response);

      const { getRemoteSession } = await import('../../services/sessionRemoteStore');
      const result = await getRemoteSession('sess-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('sess-1');
      expect(result!.messages).toHaveLength(2);
      expect(result!.messages[0].timestamp).toBeInstanceOf(Date);
    });

    it('returns null when session not found (ok:false)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ok: false, session: null }),
      } as Response);

      const { getRemoteSession } = await import('../../services/sessionRemoteStore');
      const result = await getRemoteSession('not-found');

      expect(result).toBeNull();
    });

    it('returns null on HTTP error (silent failure)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      } as Response);

      const { getRemoteSession } = await import('../../services/sessionRemoteStore');
      const result = await getRemoteSession('any-id');

      expect(result).toBeNull();
    });

    it('returns null on network failure (silent failure)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const { getRemoteSession } = await import('../../services/sessionRemoteStore');
      const result = await getRemoteSession('any-id');

      expect(result).toBeNull();
    });

    it('returns session with empty messages when messagesJson is malformed', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            ok: true,
            session: {
              sessionId: 'sess-2',
              title: 'Sessão corrompida',
              empresaAlvo: null,
              cnpj: null,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              messagesJson: '{invalid json',
            },
          }),
      } as Response);

      const { getRemoteSession } = await import('../../services/sessionRemoteStore');
      const result = await getRemoteSession('sess-2');

      expect(result).not.toBeNull();
      expect(result!.messages).toEqual([]);
    });
  });

  // ─── saveRemoteSession ─────────────────────────────────────────────────────

  describe('saveRemoteSession', () => {
    const mockSession = {
      id: 'sess-save',
      title: 'Sessão para salvar',
      empresaAlvo: 'Empresa Teste',
      cnpj: null,
      modoPrincipal: null,
      scoreOportunidade: null,
      resumoDossie: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      messages: [],
    };

    it('resolves on successful save', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      } as Response);

      const { saveRemoteSession } = await import('../../services/sessionRemoteStore');
      await expect(saveRemoteSession(mockSession, 'user-1', 'João')).resolves.not.toThrow();
    });

    it('throws when API responds with ok:false', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ok: false, message: 'Save failed' }),
      } as Response);

      const { saveRemoteSession } = await import('../../services/sessionRemoteStore');
      await expect(saveRemoteSession(mockSession)).rejects.toThrow('Save failed');
    });

    it('sends correct action and session payload', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      } as Response);

      const { saveRemoteSession } = await import('../../services/sessionRemoteStore');
      await saveRemoteSession(mockSession, 'user-42', 'Maria');

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]!.body as string);
      expect(body.action).toBe('saveSession');
      expect(body.session.id).toBe('sess-save');
      expect(body.session.userId).toBe('user-42');
      expect(body.session.userName).toBe('Maria');
    });

    it('uses default userId/userName when not provided', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      } as Response);

      const { saveRemoteSession } = await import('../../services/sessionRemoteStore');
      await saveRemoteSession(mockSession);

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.session.userId).toBe('user_default');
      expect(body.session.userName).toBe('Convidado');
    });
  });
});
