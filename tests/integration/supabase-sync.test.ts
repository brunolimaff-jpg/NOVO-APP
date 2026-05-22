import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock completo do ambiente Supabase
vi.mock('../../lib/supabaseClient', () => {
  const mockFrom = vi.fn().mockReturnValue({
    upsert: vi.fn().mockReturnValue({ error: null }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ data: [], error: null }),
        }),
        data: [],
        error: null,
      }),
    }),
  });

  return {
    supabase: { from: mockFrom },
    isSupabaseAvailable: vi.fn().mockReturnValue(true),
  };
});

vi.mock('idb-keyval', () => {
  const store: Record<string, unknown> = {};
  return {
    get: vi.fn().mockImplementation(async (key: string) => store[key] ?? null),
    set: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      store[key] = value;
      return undefined;
    }),
    del: vi.fn().mockImplementation(async (key: string) => {
      delete store[key];
      return undefined;
    }),
  };
});

import { storage } from '../../services/storage';

describe('Integracao Supabase Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('scout360:operator_id', 'op_test_123');
  });

  it('deve salvar dossie localmente e enfileirar sync', async () => {
    const session = {
      id: 'int-test-1',
      title: 'Teste Integracao',
      empresaAlvo: 'Empresa Teste',
      cnpj: '11222333000144',
      modoPrincipal: null,
      scoreOportunidade: null,
      resumoDossie: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };

    await storage.saveDossier(session);

    // Verificar que foi enfileirado
    expect(storage.getSyncQueueSize()).toBeGreaterThan(0);

    // Processar fila
    await storage.processSyncQueue();

    // Verificar que fila esvaziou
    expect(storage.getSyncQueueSize()).toBe(0);
  });

  it('deve funcionar em modo offline (sem Supabase)', async () => {
    // Simular Supabase indisponivel
    const { isSupabaseAvailable } = await import('../../lib/supabaseClient');
    (isSupabaseAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const session = {
      id: 'int-test-2',
      title: 'Teste Offline',
      empresaAlvo: null,
      cnpj: null,
      modoPrincipal: null,
      scoreOportunidade: null,
      resumoDossie: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };

    await storage.saveDossier(session);
    const dossier = await storage.getDossier('int-test-2');
    expect(dossier).toBeTruthy();
    expect(dossier!.title).toBe('Teste Offline');
  });

  it('deve carregar dossies do IDB local', async () => {
    const sessions = [
      {
        id: 'int-test-3a',
        title: 'Dossie A',
        empresaAlvo: 'Empresa A',
        cnpj: '11111111000111',
        modoPrincipal: null,
        scoreOportunidade: 75,
        resumoDossie: 'Resumo A',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      },
      {
        id: 'int-test-3b',
        title: 'Dossie B',
        empresaAlvo: 'Empresa B',
        cnpj: '22222222000122',
        modoPrincipal: null,
        scoreOportunidade: 60,
        resumoDossie: 'Resumo B',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      },
    ];

    await storage.saveAllDossiers(sessions);
    const loaded = await storage.getDossiers();
    expect(loaded.length).toBeGreaterThanOrEqual(2);
    expect(loaded.some((s) => s.id === 'int-test-3a')).toBe(true);
    expect(loaded.some((s) => s.id === 'int-test-3b')).toBe(true);
  });

  it('deve fazer soft delete de dossie', async () => {
    const session = {
      id: 'int-test-4',
      title: 'Para Deletar',
      empresaAlvo: null,
      cnpj: null,
      modoPrincipal: null,
      scoreOportunidade: null,
      resumoDossie: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };

    await storage.saveDossier(session);
    let dossier = await storage.getDossier('int-test-4');
    expect(dossier).toBeTruthy();

    await storage.deleteDossier('int-test-4');
    dossier = await storage.getDossier('int-test-4');
    expect(dossier).toBeNull();
  });
});
