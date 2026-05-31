# Simplificação Supabase — Plano de Implementação (Fase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover a camada offline-first (IDB cache + sync queue + retry/merge) e acessar Supabase diretamente, reduzindo `storage.ts` de 872 para ~200 linhas.

**Architecture:** Supabase como fonte única da verdade. Leitura e escrita vão direto no banco. IDB mantido apenas para extract cache (TTL 7 dias). Script de migração executa 1x na primeira carga para mover dados IDB → Supabase.

**Tech Stack:** React 19, TypeScript 5, Supabase JS client, IDB-keyval (mantido só para extract cache)

**Spec:** `docs/superpowers/specs/2026-05-29-simplificacao-supabase-design.md`

**Ajustes pós-auditoria (2026-05-30):**

1. Radar alerts/config adicionados ao novo storage.ts (gap identificado)
2. `console.error` obrigatório em todo catch/error de consulta (lição: catch silencioso cria duplicata)
3. `setIsLoading(false)` no `finally` do load (lição: completeLoadingProgress no finally)
4. `utils/idbStorage.ts` é wrapper de localStorage, NÃO IndexedDB — manter como está
5. 5 arquivos importam `storage` mas não precisam de mudança (ChatInterface, GreetingWelcomeScreen, MessageActionsBar, DossierShareBar, extractContentService, sessionExport)

---

## File Map

| Arquivo                                      | Ação                  | Responsabilidade                                                           |
| -------------------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| `services/storage.ts`                        | Reescrever (872→~200) | CRUD direto Supabase, sem sync queue, sem IDB (exceto extract)             |
| `services/syncQueue.ts`                      | Deletar               | Não mais necessário                                                        |
| `utils/mergeChatSessions.ts`                 | Deletar               | Não mais necessário                                                        |
| `utils/waterfallLogger.ts`                   | Deletar               | Substituído por scoutDiag direto                                           |
| `hooks/useSessionStorage.ts`                 | Modificar             | +isLoading shimmer, +debounce 1s, -scout:sync-complete, -mergeChatSessions |
| `hooks/useAppInitialization.ts`              | Modificar             | -mergeChatSessions, load direto Supabase                                   |
| `components/SyncIndicator.tsx`               | Reescrever            | Status conexão Supabase simples (~50 linhas)                               |
| `contexts/OperatorContext.tsx`               | Modificar             | -2 chamadas scheduleDossierSync, load direto                               |
| `stores/chatStore.tsx`                       | Modificar             | -setDossierGenerationActive                                                |
| `features/dossier/waterfall-orchestrator.ts` | Modificar             | -waterfallLogger import                                                    |
| `lib/supabaseClient.ts`                      | Sem alteração         | Já está no modelo alvo                                                     |

---

### Task 1: Script de migração IDB → Supabase

**Files:**

- Create: `lib/migration/idbToSupabase.ts`
- Test: `tests/lib/migration/idbToSupabase.test.ts`

- [ ] **Step 1: Escrever o teste de migração**

```typescript
// tests/lib/migration/idbToSupabase.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runIdbToSupabaseMigration } from '../../../lib/migration/idbToSupabase';

const MOCK_SESSIONS = [
  { id: 'session-1', title: 'Test 1', empresaAlvo: 'Empresa A', messages: [] },
  { id: 'session-2', title: 'Test 2', empresaAlvo: 'Empresa B', messages: [] },
];

describe('runIdbToSupabaseMigration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('deve pular migração se flag já existe', async () => {
    localStorage.setItem('scout360:migration_v2_complete', 'true');
    const upsertMock = vi.fn();
    await runIdbToSupabaseMigration({ upsertFn: upsertMock });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('deve migrar dados IDB para Supabase e setar flag', async () => {
    const upsertMock = vi.fn().mockResolvedValue(undefined);
    // Mock IDB get
    vi.stubGlobal('idb-keyval', {
      get: vi.fn().mockResolvedValue(MOCK_SESSIONS),
    });

    await runIdbToSupabaseMigration({ upsertFn: upsertMock });

    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('scout360:migration_v2_complete')).toBe('true');
  });

  it('não deve setar flag se migração falhar', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('Supabase offline'));
    vi.stubGlobal('idb-keyval', {
      get: vi.fn().mockResolvedValue(MOCK_SESSIONS),
    });

    await expect(runIdbToSupabaseMigration({ upsertFn: upsertMock })).rejects.toThrow();
    expect(localStorage.getItem('scout360:migration_v2_complete')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar teste para ver falhar**

Run: `npx vitest run tests/lib/migration/idbToSupabase.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implementar script de migração**

```typescript
// lib/migration/idbToSupabase.ts
import { get } from 'idb-keyval';
import type { ChatSession } from '../../types';

const MIGRATION_FLAG = 'scout360:migration_v2_complete';
const IDB_SESSIONS_KEY = 'scout360_sessions_v2';

interface MigrationDeps {
  upsertFn: (session: ChatSession) => Promise<void>;
  getOperatorId: () => string | null;
}

export async function runIdbToSupabaseMigration(deps: MigrationDeps): Promise<number> {
  // Skip if already migrated
  if (localStorage.getItem(MIGRATION_FLAG) === 'true') {
    return 0;
  }

  const operatorId = deps.getOperatorId();
  if (!operatorId) {
    throw new Error('Operador não registrado — migração abortada');
  }

  // Read all sessions from IDB
  let sessions: ChatSession[] = [];
  try {
    sessions = (await get<ChatSession[]>(IDB_SESSIONS_KEY)) || [];
  } catch {
    // IDB unavailable — nothing to migrate
    localStorage.setItem(MIGRATION_FLAG, 'true');
    return 0;
  }

  if (sessions.length === 0) {
    localStorage.setItem(MIGRATION_FLAG, 'true');
    return 0;
  }

  // Upsert each session to Supabase
  let migrated = 0;
  const errors: Error[] = [];

  for (const session of sessions) {
    try {
      await deps.upsertFn(session);
      migrated++;
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    }
  }

  if (errors.length > 0) {
    throw new Error(`Migração falhou: ${errors.length}/${sessions.length} erros. Primeiro: ${errors[0].message}`);
  }

  localStorage.setItem(MIGRATION_FLAG, 'true');
  return migrated;
}
```

- [ ] **Step 4: Rodar teste para ver passar**

Run: `npx vitest run tests/lib/migration/idbToSupabase.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/migration/idbToSupabase.ts tests/lib/migration/idbToSupabase.test.ts
git commit -m "feat: script de migração IDB → Supabase com flag de controle"
```

---

### Task 2: Simplificar storage.ts — remover sync queue e IDB para dados de negócio

**Files:**

- Modify: `services/storage.ts` (reescrever inteiro, 872 → ~200 linhas)
- Test: `tests/services/storage.test.ts` (reescrever)

- [ ] **Step 1: Escrever storage.ts simplificado**

```typescript
// services/storage.ts
// Storage interface — acesso direto ao Supabase.
// IDB mantido APENAS para extract cache (TTL 7 dias).

import { get, set } from 'idb-keyval';
import { supabase, isSupabaseAvailable } from '../lib/supabaseClient';
import { trackOperatorEvent } from './operatorTracking';
import type { ChatSession } from '../types';

// ===================================================================
// IDB KEYS (mantido apenas extract cache)
// ===================================================================

const IDB_KEYS = {
  EXTRACT_CACHE_PREFIX: 'ext-cache-',
} as const;

function getOperatorId(): string | null {
  return localStorage.getItem('scout360:operator_id');
}

// ===================================================================
// STORAGE INTERFACE
// ===================================================================

export const storage = {
  // ===================================================================
  // DOSSIERS
  // ===================================================================

  async getDossiers(): Promise<ChatSession[]> {
    if (!isSupabaseAvailable()) return [];

    const operatorId = getOperatorId();
    if (!operatorId) return [];

    const { data, error } = await supabase!
      .from('dossies')
      .select('content')
      .eq('operator_id', operatorId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[Storage] getDossiers failed:', error);
      return [];
    }
    if (!data) return [];

    return data.map((row: { content: ChatSession }) => row.content);
  },

  async getDossier(id: string): Promise<ChatSession | null> {
    if (!isSupabaseAvailable()) return null;

    const { data, error } = await supabase!
      .from('dossies')
      .select('content')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      console.error('[Storage] getDossier failed:', error);
      return null;
    }
    if (!data) return null;
    return data.content as ChatSession;
  },

  async saveDossier(session: ChatSession): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    const { error } = await supabase!.from('dossies').upsert({
      id: session.id,
      operator_id: operatorId,
      operator_email: localStorage.getItem('scout360:operator_email') || null,
      title: session.title,
      empresa_alvo: session.empresaAlvo,
      cnpj: session.cnpj,
      modo_principal: session.modoPrincipal,
      score_oportunidade: session.scoreOportunidade,
      resumo_dossie: session.resumoDossie,
      content: session as unknown as Record<string, unknown>,
      updated_at: session.updatedAt || new Date().toISOString(),
    });

    if (error) {
      console.error('[Storage] Failed to save dossier:', error);
    }
  },

  async saveAllDossiers(sessions: ChatSession[]): Promise<void> {
    // Bulk save — usado com debounce no hook
    for (const session of sessions) {
      await this.saveDossier(session);
    }
  },

  async deleteDossier(id: string): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    const { error } = await supabase!
      .from('dossies')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[Storage] Failed to delete dossier:', error);
    }
  },

  // ===================================================================
  // EXTRACT CACHE (mantido IDB — TTL 7 dias, consultado frequentemente)
  // ===================================================================

  async getExtractCache(cacheKey: string): Promise<{ result: unknown; timestamp: number } | null> {
    try {
      const result = await get<{ result: unknown; timestamp: number }>(IDB_KEYS.EXTRACT_CACHE_PREFIX + cacheKey);
      return result ?? null;
    } catch {
      return null;
    }
  },

  async saveExtractCache(cacheKey: string, result: unknown): Promise<void> {
    const entry = { result, timestamp: Date.now() };
    await set(IDB_KEYS.EXTRACT_CACHE_PREFIX + cacheKey, entry);

    // Também salva no Supabase para cross-device (fire-and-forget)
    if (isSupabaseAvailable()) {
      const operatorId = getOperatorId();
      if (!operatorId) return;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      void supabase!.from('extract_cache').upsert({
        id: cacheKey,
        result,
        expires_at: expiresAt.toISOString(),
        operator_id: operatorId,
      });
    }
  },

  // ===================================================================
  // USER CONTEXT
  // ===================================================================

  async saveUserContext(data: { operatorId: string; name: string; email: string }): Promise<void> {
    if (!isSupabaseAvailable()) return;

    const emailNormalized = data.email?.toLowerCase().trim() || '';
    const payload = {
      operator_id: data.operatorId,
      display_name: data.name,
      email: data.email,
      email_normalized: emailNormalized,
      last_seen: new Date().toISOString(),
    };

    try {
      await supabase!.from('user_context').upsert(payload, { onConflict: 'operator_id' });
    } catch (error) {
      console.warn('storage.saveUserContext: erro remoto', error);
    }
  },

  async touchUserContext(operatorId: string): Promise<void> {
    if (!operatorId || !isSupabaseAvailable()) return;

    try {
      await supabase!
        .from('user_context')
        .update({ last_seen: new Date().toISOString() })
        .eq('operator_id', operatorId);
    } catch (error) {
      console.warn('storage.touchUserContext: erro remoto', error);
    }
  },

  async findUserByEmail(email: string): Promise<{ operatorId: string; displayName: string } | null> {
    if (!isSupabaseAvailable()) return null;

    const emailNormalized = email?.toLowerCase().trim() || '';
    if (!emailNormalized) return null;

    const { data, error } = await supabase!
      .from('user_context')
      .select('operator_id, display_name')
      .eq('email_normalized', emailNormalized)
      .maybeSingle();

    if (error || !data) return null;

    return {
      operatorId: data.operator_id,
      displayName: data.display_name || '',
    };
  },

  // ===================================================================
  // AUDIT LOG
  // ===================================================================

  async logAudit(
    action: string,
    targetType?: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!isSupabaseAvailable()) return;

    const operatorId = getOperatorId();
    if (!operatorId) return;

    void supabase!.from('audit_log').insert({
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
      operator_id: operatorId,
      created_at: new Date().toISOString(),
    });
  },

  // ===================================================================
  // FAVORITES
  // ===================================================================

  async getFavorites(): Promise<unknown[]> {
    if (!isSupabaseAvailable()) return [];

    const operatorId = getOperatorId();
    if (!operatorId) return [];

    const { data } = await supabase!.from('favorites').select('*').eq('operator_id', operatorId);
    return data || [];
  },

  async addFavorite(cnpj: string, companyName: string, reason?: string, dossierId?: string): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    void supabase!.from('favorites').upsert(
      {
        operator_id: operatorId,
        cnpj,
        company_name: companyName,
        reason,
        dossier_id: dossierId,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'operator_id,cnpj' },
    );

    await this.logAudit('favorite_added', 'dossier', dossierId, { cnpj, company_name: companyName, reason });
  },

  async removeFavorite(cnpj: string): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    void supabase!.from('favorites').delete().eq('operator_id', operatorId).eq('cnpj', cnpj);
    await this.logAudit('favorite_removed', 'dossier', undefined, { cnpj });
  },

  // ===================================================================
  // RADAR (alerts + config via Supabase, lastScan/metaInsight via localStorage)
  // ===================================================================

  async getRadarAlerts(): Promise<unknown[]> {
    if (!isSupabaseAvailable()) return [];
    const operatorId = getOperatorId();
    if (!operatorId) return [];

    const { data, error } = await supabase!
      .from('radar_alerts')
      .select('alert_data')
      .eq('operator_id', operatorId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Storage] getRadarAlerts failed:', error);
      return [];
    }
    return (data?.alert_data as unknown[]) || [];
  },

  async saveRadarAlerts(alerts: unknown[]): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    const { error } = await supabase!
      .from('radar_alerts')
      .upsert({ alert_data: alerts, operator_id: operatorId }, { onConflict: 'operator_id' });

    if (error) console.error('[Storage] saveRadarAlerts failed:', error);
  },

  async getRadarConfig(): Promise<unknown | null> {
    if (!isSupabaseAvailable()) return null;
    const operatorId = getOperatorId();
    if (!operatorId) return null;

    const { data, error } = await supabase!
      .from('radar_configs')
      .select('config')
      .eq('operator_id', operatorId)
      .maybeSingle();

    if (error) {
      console.error('[Storage] getRadarConfig failed:', error);
      return null;
    }
    return data?.config ?? null;
  },

  async saveRadarConfig(config: unknown): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    const { error } = await supabase!
      .from('radar_configs')
      .upsert({ config, operator_id: operatorId }, { onConflict: 'operator_id' });

    if (error) console.error('[Storage] saveRadarConfig failed:', error);
  },

  // ===================================================================
  // SHARED DOSSIERS
  // ===================================================================

  async shareDossier(dossierId: string): Promise<string | null> {
    if (!isSupabaseAvailable()) return null;

    const operatorId = getOperatorId();
    if (!operatorId) return null;

    const token = crypto.randomUUID();
    const dossier = await this.getDossier(dossierId);
    if (!dossier) return null;

    const { error } = await supabase!
      .from('shared_dossiers')
      .insert({
        access_token: token,
        dossier_id: dossierId,
        operator_id: operatorId,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('access_token')
      .single();

    if (error) {
      console.error('[Storage] Failed to share dossier:', error);
      return null;
    }

    trackOperatorEvent('dossier_shared', {
      operatorId,
      email: localStorage.getItem('scout360:operator_email') || undefined,
      entityType: 'shared_dossier',
      entityId: dossierId,
      companyCnpj: dossier.cnpj || undefined,
      companyName: dossier.empresaAlvo || undefined,
      shareChannel: 'link',
    });

    return token;
  },

  async getSharedDossier(accessToken: string): Promise<ChatSession | null> {
    if (!isSupabaseAvailable()) return null;

    const { data: shareData, error: shareError } = await supabase!
      .from('shared_dossiers')
      .select('dossier_id')
      .eq('access_token', accessToken)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (shareError || !shareData) return null;

    const { data: dossierData, error: dossierError } = await supabase!
      .from('dossies')
      .select('content')
      .eq('id', shareData.dossier_id)
      .is('deleted_at', null)
      .single();

    if (dossierError || !dossierData) return null;

    return dossierData.content as ChatSession;
  },
};
```

- [ ] **Step 2: Rodar testes para ver o que quebrou**

Run: `npx vitest run tests/services/storage.test.ts 2>&1 | tail -30`
Expected: Vários testes quebrando (mockam syncQueue, getSyncQueueSize, etc.)

- [ ] **Step 3: Reescrever testes de storage**

```typescript
// tests/services/storage.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  gt: vi.fn().mockReturnThis(),
};

vi.mock('../lib/supabaseClient', () => ({
  supabase: mockSupabase,
  isSupabaseAvailable: () => true,
}));

describe('storage (simplificado — Supabase direto)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('scout360:operator_id', 'op_test123');
  });

  describe('getDossiers', () => {
    it('deve retornar dossiers do Supabase', async () => {
      const mockDossiers = [{ content: { id: 'd1', title: 'Test', messages: [] } }];
      mockSupabase.single = vi.fn(); // reset
      const mockData = { data: mockDossiers, error: null };
      // chain: from → select → eq → is → order
      mockSupabase.order.mockResolvedValue(mockData);

      const { storage } = await import('../../services/storage');
      const result = await storage.getDossiers();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('d1');
      expect(mockSupabase.from).toHaveBeenCalledWith('dossies');
    });

    it('deve retornar array vazio se não houver operatorId', async () => {
      localStorage.removeItem('scout360:operator_id');
      const { storage } = await import('../../services/storage');
      const result = await storage.getDossiers();
      expect(result).toEqual([]);
    });
  });

  describe('saveDossier', () => {
    it('deve fazer upsert no Supabase', async () => {
      mockSupabase.upsert.mockResolvedValue({ error: null });

      const { storage } = await import('../../services/storage');
      await storage.saveDossier({
        id: 'd1',
        title: 'Test',
        messages: [],
        empresaAlvo: 'Empresa X',
        cnpj: '123',
        modoPrincipal: 'completo',
        scoreOportunidade: 85,
        resumoDossie: 'resumo',
        updatedAt: '2026-05-29T00:00:00Z',
      } as any);

      expect(mockSupabase.from).toHaveBeenCalledWith('dossies');
      expect(mockSupabase.upsert).toHaveBeenCalled();
    });
  });

  describe('shareDossier', () => {
    it('deve criar token e inserir em shared_dossiers', async () => {
      // Mock getDossier
      mockSupabase.single = vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: null }) // getDossier
        .mockResolvedValueOnce({ data: { content: { id: 'd1', cnpj: '123' } }, error: null }); // getDossier retry

      const mockInsertResult = { data: { access_token: 'token-abc' }, error: null };
      mockSupabase.select = vi.fn().mockReturnThis();
      mockSupabase.eq = vi.fn().mockReturnThis();
      mockSupabase.is = vi.fn().mockReturnThis();
      mockSupabase.single = vi
        .fn()
        .mockResolvedValueOnce({ data: { content: { id: 'd1', cnpj: '123', empresaAlvo: 'Empresa' } }, error: null })
        .mockResolvedValueOnce({ data: { access_token: 'token-abc' }, error: null });

      const { storage } = await import('../../services/storage');
      const token = await storage.shareDossier('d1');

      expect(token).toBeDefined();
    });
  });

  describe('extract cache', () => {
    it('getExtractCache deve usar IDB', async () => {
      vi.stubGlobal('idb-keyval', {
        get: vi.fn().mockResolvedValue({ result: 'cached', timestamp: Date.now() }),
        set: vi.fn(),
      });

      const { storage } = await import('../../services/storage');
      const result = await storage.getExtractCache('test-key');

      expect(result).toEqual({ result: 'cached', timestamp: expect.any(Number) });
    });
  });
});
```

- [ ] **Step 4: Rodar testes para ver passar**

Run: `npx vitest run tests/services/storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/storage.ts tests/services/storage.test.ts
git commit -m "refactor: simplifica storage.ts — remove sync queue, IDB dados de negócio, mantém IDB só para extract cache"
```

---

### Task 3: Atualizar useSessionStorage — remover merge, adicionar isLoading + debounce

**Files:**

- Modify: `hooks/useSessionStorage.ts`

- [ ] **Step 1: Reescrever o hook**

```typescript
// hooks/useSessionStorage.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { storage } from '../services/storage';
import { ChatSession } from '../types';
import { stripInternalMarkers } from '../utils/textCleaners';
import { runIdbToSupabaseMigration } from '../lib/migration/idbToSupabase';

const SESSIONS_LEGACY_KEY = 'scout360_sessions_v1';

export function useSessionStorage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const sessionsRef = useRef<ChatSession[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedRef = useRef<string>('');

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const loadSessions = useCallback(async (): Promise<ChatSession[]> => {
    const sanitizeLoadedSessions = (loaded: ChatSession[]): ChatSession[] =>
      loaded.map(session => ({
        ...session,
        messages: (session.messages || []).map(message => ({
          ...message,
          text: stripInternalMarkers(String(message.text || '')),
          timestamp: new Date(message.timestamp),
        })),
      }));

    try {
      // Executa migração IDB → Supabase (1x)
      await runIdbToSupabaseMigration({
        upsertFn: async session => {
          await storage.saveDossier(session);
        },
        getOperatorId: () => localStorage.getItem('scout360:operator_id'),
      });
    } catch {
      console.warn('[useSessionStorage] Migração IDB→Supabase falhou, tentando Supabase direto');
    }

    try {
      const supabaseSessions = await storage.getDossiers();
      if (supabaseSessions && supabaseSessions.length > 0) {
        return sanitizeLoadedSessions(supabaseSessions);
      }
    } catch {
      // Supabase unavailable, try localStorage fallback
    }

    try {
      const raw = localStorage.getItem(SESSIONS_LEGACY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const localSessions = parsed.map((s: Record<string, unknown>) => ({
          ...s,
          messages: ((s.messages as Array<Record<string, unknown>>) || []).map(m => ({
            ...m,
            text: stripInternalMarkers(String(m.text || '')),
            timestamp: new Date(m.timestamp as string),
          })),
        })) as ChatSession[];
        return sanitizeLoadedSessions(localSessions);
      }
    } catch (e) {
      console.error('Session load error', e);
    }

    return [];
  }, []);

  // Initial load — finally garante setIsLoading(false) mesmo em erro
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadSessions();
        if (!cancelled) {
          setSessions(loaded);
          setIsInitialized(true);
        }
      } catch (e) {
        console.error('[useSessionStorage] Initial load failed:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  // Persistência com debounce — evita upsert a cada setSessions durante waterfall
  const persistSessions = useCallback(async (data: ChatSession[]) => {
    const key = JSON.stringify(data.map(s => s.id).sort());
    if (key === lastPersistedRef.current) return; // Skip se mesma lista

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      lastPersistedRef.current = key;
      try {
        await storage.saveAllDossiers(data);
      } catch {
        try {
          localStorage.setItem(SESSIONS_LEGACY_KEY, JSON.stringify(data));
        } catch (e: unknown) {
          const storageErr = e as { name?: string; code?: number };
          if (storageErr?.name === 'QuotaExceededError' || storageErr?.code === 22) {
            console.warn('[Storage] Quota exceeded — trimming oldest sessions');
            const trimmed = data.slice(0, Math.max(data.length - 5, 1));
            localStorage.setItem(SESSIONS_LEGACY_KEY, JSON.stringify(trimmed));
          }
        }
      }
    }, 1000);
  }, []);

  useEffect(() => {
    if (isInitialized && sessions.length >= 0) {
      persistSessions(sessions);
    }
  }, [sessions, isInitialized, persistSessions]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    sessions,
    setSessions,
    sessionsRef,
    isInitialized,
    setIsInitialized,
    isLoading,
    setIsLoading,
    loadSessions,
  };
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -i "useSessionStorage\|error" | head -20`
Expected: 0 erros relacionados a useSessionStorage

- [ ] **Step 3: Rodar testes relacionados**

Run: `npx vitest run tests/hooks/useSessionStorage.test.ts 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add hooks/useSessionStorage.ts
git commit -m "refactor: useSessionStorage — remove mergeChatSessions, adiciona migração IDB, debounce 1s no persist"
```

---

### Task 4: Atualizar useAppInitialization — remover mergeChatSessions

**Files:**

- Modify: `hooks/useAppInitialization.ts`

- [ ] **Step 1: Ajustar o hook**

No arquivo `hooks/useAppInitialization.ts`:

Remover a linha:

```typescript
import { mergeChatSessions } from '../utils/mergeChatSessions';
```

Substituir a linha ~58 de:

```typescript
setSessions(current => mergeChatSessions(current, remoteList));
```

Para:

```typescript
setSessions(remoteList);
```

- [ ] **Step 2: Commit**

```bash
git add hooks/useAppInitialization.ts
git commit -m "refactor: useAppInitialization — remove mergeChatSessions, usa load direto do Supabase"
```

---

### Task 5: Reescrever SyncIndicator → status de conexão simples

**Files:**

- Modify: `components/SyncIndicator.tsx` (reescrever, 198 → ~50 linhas)

- [ ] **Step 1: Reescrever componente**

```typescript
// components/SyncIndicator.tsx
import { useState, useEffect } from 'react';
import { isSupabaseAvailable } from '../lib/supabaseClient';

interface SyncIndicatorProps {
  isDarkMode: boolean;
}

export function SyncIndicator({ isDarkMode }: SyncIndicatorProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [supabaseAvailable, setSupabaseAvailable] = useState(isSupabaseAvailable());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Verifica Supabase a cada 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setSupabaseAvailable(isSupabaseAvailable());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusText = !isOnline
    ? 'Offline'
    : !supabaseAvailable
      ? 'Nuvem indisponível'
      : 'Conectado';

  const colorClasses = !isOnline
    ? isDarkMode ? 'text-red-400' : 'text-red-500'
    : !supabaseAvailable
      ? isDarkMode ? 'text-amber-400' : 'text-amber-500'
      : isDarkMode ? 'text-emerald-400' : 'text-emerald-600';

  const dotColor = !isOnline
    ? 'bg-red-500'
    : !supabaseAvailable
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <div
      title={statusText}
      aria-label={`Nuvem · ${statusText}`}
      className={`flex items-center gap-1.5 px-2 py-1 text-xs ${colorClasses}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
      <span className="hidden sm:inline">{statusText}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -i "SyncIndicator" | head -10`
Expected: 0 erros

- [ ] **Step 3: Commit**

```bash
git add components/SyncIndicator.tsx
git commit -m "refactor: SyncIndicator vira indicador de status de conexão simples"
```

---

### Task 6: Atualizar OperatorContext — remover scheduleDossierSync

**Files:**

- Modify: `contexts/OperatorContext.tsx`

- [ ] **Step 1: Remover chamadas scheduleDossierSync**

No arquivo `contexts/OperatorContext.tsx`:

**Linha ~131** — remover:

```typescript
storage.scheduleDossierSync({ pull: true });
```

**Linha ~185** — remover:

```typescript
storage.scheduleDossierSync({ pull: true });
```

Ambas as chamadas não são mais necessárias porque a leitura agora é direto do Supabase.

- [ ] **Step 2: Commit**

```bash
git add contexts/OperatorContext.tsx
git commit -m "refactor: OperatorContext — remove scheduleDossierSync, leitura agora é direta"
```

---

### Task 7: Atualizar chatStore — remover setDossierGenerationActive

**Files:**

- Modify: `stores/chatStore.tsx`

- [ ] **Step 1: Remover efeito setDossierGenerationActive**

No arquivo `stores/chatStore.tsx`, linha ~112-114, remover:

```typescript
useEffect(() => {
  storage.setDossierGenerationActive(loading.isLoading);
}, [loading.isLoading]);
```

- [ ] **Step 2: Commit**

```bash
git add stores/chatStore.tsx
git commit -m "refactor: chatStore — remove setDossierGenerationActive, não mais necessário"
```

---

### Task 8: Atualizar waterfall-orchestrator — remover waterfallLogger

**Files:**

- Modify: `features/dossier/waterfall-orchestrator.ts`

- [ ] **Step 1: Remover import e chamadas**

Remover a linha:

```typescript
import { initWaterfallTrace, waterfallTrace } from '../../utils/waterfallLogger';
```

Substituir chamadas a `initWaterfallTrace(...)` e `waterfallTrace(...)` por console.debug (diagnóstico não-crítico):

```typescript
// Antes: initWaterfallTrace(sessionId, operatorId, company);
// Depois:
console.debug('[Waterfall] Trace iniciado', { sessionId, operatorId, company });

// Antes: waterfallTrace('module_started', { module_name: name });
// Depois:
console.debug('[Waterfall] Módulo iniciado', { module_name: name });
```

- [ ] **Step 2: Commit**

```bash
git add features/dossier/waterfall-orchestrator.ts
git commit -m "refactor: waterfall-orchestrator — substitui waterfallLogger por console.debug"
```

---

### Task 9: Atualizar useRadar — lastScanAt/metaInsight → localStorage

**Files:**

- Modify: `features/radar/useRadar.ts`

- [ ] **Step 1: Migrar persistência para localStorage**

No arquivo `features/radar/useRadar.ts`:

Substituir chamadas a `storage.getRadarLastScan()` por leitura de localStorage:

```typescript
const loadLastScanAt = (): number | null => {
  const val = localStorage.getItem('scout360:radar_last_scan');
  return val ? Number(val) : null;
};

const saveLastScanAt = (ts: number) => {
  localStorage.setItem('scout360:radar_last_scan', String(ts));
};
```

Substituir chamadas a `storage.getRadarMetaInsight()` / `storage.saveRadarMetaInsight()` por localStorage:

```typescript
const loadMetaInsight = (): string | null => {
  return localStorage.getItem('scout360:radar_meta_insight');
};

const saveMetaInsight = (insight: string | null) => {
  if (insight) {
    localStorage.setItem('scout360:radar_meta_insight', insight);
  } else {
    localStorage.removeItem('scout360:radar_meta_insight');
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add features/radar/useRadar.ts
git commit -m "refactor: useRadar — lastScanAt e metaInsight migram para localStorage"
```

---

### Task 10: Remover arquivos obsoletos

**Files:**

- Delete: `services/syncQueue.ts`
- Delete: `utils/waterfallLogger.ts`
- Delete: `utils/mergeChatSessions.ts`

- [ ] **Step 1: Verificar que não há mais imports destes arquivos**

Run: `grep -rn "syncQueue\|waterfallLogger\|mergeChatSessions" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v .vercel | grep -v ".test." | grep -v "docs/"`

Expected: Nenhum resultado (todos os imports já foram removidos nas tasks anteriores)

- [ ] **Step 2: Deletar os arquivos**

```bash
git rm services/syncQueue.ts utils/waterfallLogger.ts utils/mergeChatSessions.ts
```

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: remove syncQueue, waterfallLogger e mergeChatSessions — substituídos por acesso Supabase direto"
```

---

### Task 11: Atualizar testes — remover mocks de sync, ajustar contratos

**Files:**

- Delete: `tests/integration/supabase-sync.test.ts`
- Modify: `tests/contracts/supabaseMigrations.contract.test.ts`
- Modify: `tests/lib/supabase/dossierDuplicate.test.ts`
- Modify: `tests/services/feedbackRemoteStore.test.ts`

- [ ] **Step 1: Remover teste de sync**

```bash
git rm tests/integration/supabase-sync.test.ts
```

- [ ] **Step 2: Atualizar teste de contrato de migrations**

No arquivo `tests/contracts/supabaseMigrations.contract.test.ts`, remover asserts que verificam funções removidas (`scheduleDossierSync`, `syncAll`, `getSyncQueueSize`).

- [ ] **Step 3: Rodar todos os testes**

Run: `npx vitest run 2>&1 | tail -30`
Expected: Todos passando (contagem pode reduzir pela remoção de testes de sync)

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: atualiza testes para storage simplificado, remove testes de sync"
```

---

### Task 12: Typecheck final e validação

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 erros

- [ ] **Step 2: Todos os testes**

Run: `npx vitest run`
Expected: Todos passando

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 erros

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: Build sucesso

- [ ] **Step 5: Verificar se share link funciona**

Run: `grep -rn "api/dossie.ts\|shared_dossiers\|/dossie/" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v .vercel | grep -v ".test." | grep -v "docs/"`
Expected: `api/dossie.ts` permanece inalterado, imports de `storage.shareDossier` continuam funcionando

---

## Verificação Final

| Gate       | Comando                 | Esperado       |
| ---------- | ----------------------- | -------------- |
| TypeScript | `npx tsc --noEmit`      | 0 erros        |
| Testes     | `npx vitest run`        | Todos passando |
| Lint       | `npm run lint`          | 0 erros        |
| Build      | `npm run build`         | Sucesso        |
| Share link | `grep` em api/dossie.ts | Inalterado     |
