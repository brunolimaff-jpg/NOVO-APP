# Migracao IndexedDB → Supabase — Plano de Implementacao

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar persistencia de IndexedDB/localStorage para Supabase com offline-first sync, mantendo IDB como cache local.

**Architecture:** Browser → `services/storage.ts` (unica interface) → Supabase direto (anon key + RLS). IDB como cache local + fila de sync offline. Stale-while-revalidate para leituras.

**Tech Stack:** React 19, TypeScript 5, Vite 6, @supabase/supabase-js, idb-keyval (mantido como cache), Vitest

**Spec:** `docs/superpowers/specs/2026-05-22-supabase-migration-design.md`

---

## Arquivos Criados/Modificados

| Acao | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Create | `lib/supabaseClient.ts` | Cliente Supabase browser (anon key) |
| Create | `services/storage.ts` | Interface unificada de storage (Supabase + IDB) |
| Create | `services/syncQueue.ts` | Fila offline com retry automatico |
| Create | `tests/services/storage.test.ts` | Testes do storage |
| Create | `tests/services/syncQueue.test.ts` | Testes da fila de sync |
| Modify | `hooks/useSessionStorage.ts` | Trocar idb-keyval por storage.ts |
| Modify | `features/radar/useRadar.ts` | Trocar idb-keyval por storage.ts |
| Modify | `services/extractContentService.ts` | Trocar idb-keyval por storage.ts |
| Modify | `contexts/OperatorContext.tsx` | Adicionar campo email + salvar no Supabase |
| Modify | `.env.example` | Adicionar vars Supabase |
| Modify | `package.json` | Adicionar @supabase/supabase-js |

---

## Task 1: Setup Supabase — Projeto + Dependencias

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Create: `lib/supabaseClient.ts`

- [ ] **Step 1: Instalar @supabase/supabase-js**

```bash
cd /Users/brunolima/Documents/NOVO-APP && npm install @supabase/supabase-js
```

Run: `npm ls @supabase/supabase-js`
Expected: `@supabase/supabase-js@x.x.x`

- [ ] **Step 2: Adicionar env vars ao .env.example**

Acrescentar ao final de `.env.example`:

```
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 3: Criar cliente Supabase**

Criar `lib/supabaseClient.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Variaveis de ambiente ausentes. Storage remoto desativado.');
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function isSupabaseAvailable(): boolean {
  return supabase !== null;
}
```

- [ ] **Step 4: Criar projeto Supabase no dashboard**

Acao manual:
1. Acessar https://supabase.com/dashboard
2. Criar novo projeto (nome: `scout360`, regiao: sao-paulo)
3. Anotar `Project URL` e `anon public` key
4. Adicionar ao `.env.local` (NAO commitar keys reais)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example lib/supabaseClient.ts
git commit -m "feat: add Supabase client and env vars"
```

---

## Task 2: Schema Supabase — Tabelas + RLS

**Files:**
- Nenhum arquivo local (SQL executado no Supabase Dashboard → SQL Editor)

- [ ] **Step 1: Criar tabelas no SQL Editor do Supabase**

Executar no SQL Editor (https://supabase.com/dashboard/project/_/sql):

```sql
-- 1. user_context
CREATE TABLE user_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  email TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  supabase_auth_id UUID UNIQUE,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. dossies
CREATE TABLE dossies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT NOT NULL,
  title TEXT,
  empresa_alvo TEXT,
  cnpj TEXT,
  modo_principal TEXT,
  score_oportunidade INTEGER,
  resumo_dossie TEXT,
  content JSONB NOT NULL,
  synced_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. radar_alerts
CREATE TABLE radar_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT NOT NULL,
  alert_data JSONB NOT NULL,
  meta_insight TEXT,
  last_scan TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. radar_configs
CREATE TABLE radar_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT UNIQUE NOT NULL,
  config JSONB NOT NULL,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. extract_cache
CREATE TABLE extract_cache (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  result JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. audit_log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. favorites
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  company_name TEXT,
  reason TEXT,
  dossier_id UUID REFERENCES dossies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(operator_id, cnpj)
);

-- 8. shared_dossiers
CREATE TABLE shared_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES dossies(id) ON DELETE CASCADE,
  operator_id TEXT NOT NULL,
  access_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Habilitar RLS + criar policies**

Executar no mesmo SQL Editor:

```sql
-- Habilitar RLS em todas as tabelas
ALTER TABLE user_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossies ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE extract_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_dossiers ENABLE ROW LEVEL SECURITY;

-- Helper: obter operator_id do header customizado
-- O cliente Supabase envia operator_id via headers config

-- Policies: cada operador so acessa seus dados
CREATE POLICY "operator_own_dossies" ON dossies
  FOR ALL TO anon
  USING (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id')
  WITH CHECK (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id');

CREATE POLICY "operator_own_radar_alerts" ON radar_alerts
  FOR ALL TO anon
  USING (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id')
  WITH CHECK (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id');

CREATE POLICY "operator_own_radar_configs" ON radar_configs
  FOR ALL TO anon
  USING (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id')
  WITH CHECK (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id');

CREATE POLICY "operator_own_extract_cache" ON extract_cache
  FOR ALL TO anon
  USING (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id')
  WITH CHECK (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id');

CREATE POLICY "operator_own_user_context" ON user_context
  FOR ALL TO anon
  USING (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id')
  WITH CHECK (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id');

CREATE POLICY "operator_own_audit_log" ON audit_log
  FOR ALL TO anon
  USING (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id')
  WITH CHECK (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id');

CREATE POLICY "operator_own_favorites" ON favorites
  FOR ALL TO anon
  USING (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id')
  WITH CHECK (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id');

CREATE POLICY "operator_own_shared_dossiers" ON shared_dossiers
  FOR ALL TO anon
  USING (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id')
  WITH CHECK (operator_id = current_setting('request.headers', true)::json ->> 'x-operator-id');

-- shared_dossiers: leitura publica por access_token (para o gestor clicar no link)
CREATE POLICY "shared_dossier_read" ON shared_dossiers
  FOR SELECT TO anon
  USING (access_token = current_setting('request.headers', true)::json ->> 'x-share-token');
```

- [ ] **Step 3: Criar indices**

```sql
CREATE INDEX idx_dossies_operator_created ON dossies(operator_id, created_at DESC);
CREATE INDEX idx_dossies_operator_cnpj ON dossies(operator_id, cnpj);
CREATE INDEX idx_radar_alerts_operator ON radar_alerts(operator_id);
CREATE INDEX idx_radar_configs_operator ON radar_configs(operator_id);
CREATE INDEX idx_extract_cache_operator ON extract_cache(operator_id);
CREATE INDEX idx_audit_log_operator_created ON audit_log(operator_id, created_at DESC);
CREATE INDEX idx_favorites_operator ON favorites(operator_id);
CREATE INDEX idx_shared_dossiers_token ON shared_dossiers(access_token);
```

- [ ] **Step 4: Verificar tabelas no Dashboard**

Acao manual: Table Editor → confirmar 8 tabelas com colunas corretas.

- [ ] **Step 5: Commit (apenas documentacao do schema)**

Criar `docs/superpowers/schema-supabase.sql` com todo o SQL acima.

```bash
git add docs/superpowers/schema-supabase.sql
git commit -m "docs: add Supabase schema SQL for reference"
```

---

## Task 3: Sync Queue — Fila Offline

**Files:**
- Create: `services/syncQueue.ts`
- Create: `tests/services/syncQueue.test.ts`

- [ ] **Step 1: Escrever teste da sync queue**

Criar `tests/services/syncQueue.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncQueue } from '../../services/syncQueue';

describe('syncQueue', () => {
  beforeEach(() => {
    syncQueue.clear();
  });

  it('deve adicionar operacao a fila', () => {
    syncQueue.enqueue({ table: 'dossies', operation: 'upsert', data: { id: '1', title: 'Test' } });
    expect(syncQueue.size()).toBe(1);
  });

  it('deve processar fila e esvaziar', async () => {
    const mockFn = vi.fn().mockResolvedValue(undefined);
    syncQueue.enqueue({ table: 'dossies', operation: 'upsert', data: { id: '1' } });
    syncQueue.enqueue({ table: 'dossies', operation: 'upsert', data: { id: '2' } });
    await syncQueue.processAll(mockFn);
    expect(mockFn).toHaveBeenCalledTimes(2);
    expect(syncQueue.size()).toBe(0);
  });

  it('deve persistir fila no IDB', async () => {
    syncQueue.enqueue({ table: 'dossies', operation: 'upsert', data: { id: '1' } });
    await syncQueue.persist();
    const restored = await syncQueue.load();
    expect(restored.length).toBe(1);
  });

  it('deve retry com backoff em caso de falha', async () => {
    let attempts = 0;
    const mockFn = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) throw new Error('fail');
      return Promise.resolve();
    });
    syncQueue.enqueue({ table: 'dossies', operation: 'upsert', data: { id: '1' } });
    await syncQueue.processAll(mockFn, { maxRetries: 3, backoffMs: 10 });
    expect(mockFn).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Rodar teste e verificar que falha**

Run: `npx vitest run tests/services/syncQueue.test.ts`
Expected: FAIL — `Cannot find module '../../services/syncQueue'`

- [ ] **Step 3: Implementar syncQueue**

Criar `services/syncQueue.ts`:

```typescript
import { get, set } from 'idb-keyval';

export interface SyncOperation {
  table: string;
  operation: 'upsert' | 'delete';
  data: Record<string, unknown>;
  id?: string;
  attempts?: number;
}

const QUEUE_KEY = 'scout360_sync_queue';
const MAX_RETRIES = 3;
const BACKOFF_MS = 1000;

class SyncQueue {
  private queue: SyncOperation[] = [];

  enqueue(op: SyncOperation): void {
    const existing = this.queue.findIndex(
      (q) => q.table === op.table && q.id === op.id && op.id !== undefined
    );
    if (existing >= 0) {
      this.queue[existing] = { ...op, attempts: 0 };
    } else {
      this.queue.push({ ...op, attempts: 0 });
    }
    this.persist();
  }

  size(): number {
    return this.queue.length;
  }

  peek(): SyncOperation[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
  }

  async persist(): Promise<void> {
    await set(QUEUE_KEY, this.queue);
  }

  async load(): Promise<SyncOperation[]> {
    const stored = await get<SyncOperation[]>(QUEUE_KEY);
    if (stored && Array.isArray(stored)) {
      this.queue = stored;
    }
    return this.queue;
  }

  async processAll(
    executor: (op: SyncOperation) => Promise<void>,
    opts: { maxRetries?: number; backoffMs?: number } = {}
  ): Promise<void> {
    const { maxRetries = MAX_RETRIES, backoffMs = BACKOFF_MS } = opts;
    const failed: SyncOperation[] = [];

    while (this.queue.length > 0) {
      const op = this.queue.shift()!;
      try {
        await executor(op);
      } catch (err) {
        const attempts = (op.attempts ?? 0) + 1;
        if (attempts < maxRetries) {
          failed.push({ ...op, attempts });
          await new Promise((r) => setTimeout(r, backoffMs * attempts));
        } else {
          console.error(`[SyncQueue] Falha definitiva para ${op.table}:${op.id}`, err);
        }
      }
    }

    this.queue = failed;
    await this.persist();
  }
}

export const syncQueue = new SyncQueue();
```

- [ ] **Step 4: Rodar teste e verificar que passa**

Run: `npx vitest run tests/services/syncQueue.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add services/syncQueue.ts tests/services/syncQueue.test.ts
git commit -m "feat: add offline sync queue with retry and IDB persistence"
```

---

## Task 4: Storage — Interface Unificada

**Files:**
- Create: `services/storage.ts`
- Create: `tests/services/storage.test.ts`

- [ ] **Step 1: Escrever testes do storage**

Criar `tests/services/storage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do Supabase
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              data: [],
              error: null,
            }),
          }),
          data: [],
          error: null,
        }),
      }),
      upsert: vi.fn().mockReturnValue({
        error: null,
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ error: null }),
      }),
    }),
  },
  isSupabaseAvailable: vi.fn().mockReturnValue(true),
}));

// Mock do idb-keyval
vi.mock('idb-keyval', () => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}));

// Mock do syncQueue
vi.mock('../../services/syncQueue', () => ({
  syncQueue: {
    enqueue: vi.fn(),
    persist: vi.fn(),
    load: vi.fn().mockResolvedValue([]),
    size: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
  },
  syncQueue: {
    enqueue: vi.fn(),
    persist: vi.fn(),
    load: vi.fn().mockResolvedValue([]),
    size: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
  },
}));

import { storage } from '../../services/storage';

describe('storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dossies', () => {
    it('saveDossier deve chamar IDB set + syncQueue enqueue', async () => {
      const session = {
        id: 'test-id',
        title: 'Test Dossier',
        empresaAlvo: 'Empresa X',
        cnpj: '12345678000100',
        modoPrincipal: null,
        scoreOportunidade: 80,
        resumoDossie: 'Resumo teste',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };

      await storage.saveDossier(session);
      // Verificar que IDB foi chamado
      const { set } = await import('idb-keyval');
      expect(set).toHaveBeenCalled();
      // Verificar que syncQueue foi chamado
      const { syncQueue } = await import('../../services/syncQueue');
      expect(syncQueue.enqueue).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Rodar teste e verificar que falha**

Run: `npx vitest run tests/services/storage.test.ts`
Expected: FAIL — `Cannot find module '../../services/storage'`

- [ ] **Step 3: Implementar storage.ts**

Criar `services/storage.ts`:

```typescript
import { get, set, del } from 'idb-keyval';
import { supabase, isSupabaseAvailable } from '../lib/supabaseClient';
import { syncQueue } from './syncQueue';
import type { ChatSession } from '../types';

// --- IDB Keys (mesmas que ja existem) ---
const IDB_SESSIONS_KEY = 'scout360_sessions_v2';
const IDB_RADAR_ALERTS_KEY = 'scout360_radar_alerts';
const IDB_RADAR_CONFIG_KEY = 'scout360_radar_config';
const IDB_RADAR_LAST_SCAN_KEY = 'scout360_radar_last_scan';
const IDB_RADAR_META_INSIGHT_KEY = 'scout360_radar_meta_insight';
const IDB_EXTRACT_PREFIX = 'ext-cache-';

// --- Helper: obter operator_id do localStorage ---
function getOperatorId(): string | null {
  return localStorage.getItem('scout360:operator_id');
}

// --- Helper: headers com operator_id para RLS ---
function supabaseHeaders(): Record<string, string> {
  const operatorId = getOperatorId();
  return operatorId ? { 'x-operator-id': operatorId } : {};
}

// ========================================
// DOSSIES (ChatSession)
// ========================================

async function getLocalSessions(): Promise<ChatSession[]> {
  const data = await get<ChatSession[]>(IDB_SESSIONS_KEY);
  return data ?? [];
}

async function setLocalSessions(sessions: ChatSession[]): Promise<void> {
  await set(IDB_SESSIONS_KEY, sessions);
}

const storage = {
  // --- Dossies ---

  async getDossiers(): Promise<ChatSession[]> {
    const local = await getLocalSessions();

    // Background: refresh do Supabase
    if (isSupabaseAvailable() && getOperatorId()) {
      supabase
        ?.from('dossies')
        .select('content')
        .eq('operator_id', getOperatorId()!)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .then(({ data }) => {
          if (data && data.length > 0) {
            const remoteSessions = data.map((row: { content: ChatSession }) => row.content);
            setLocalSessions(remoteSessions);
          }
        })
        .catch(() => {});
    }

    return local;
  },

  async getDossier(id: string): Promise<ChatSession | null> {
    const sessions = await getLocalSessions();
    return sessions.find((s) => s.id === id) ?? null;
  },

  async saveDossier(session: ChatSession): Promise<void> {
    // 1. Salvar localmente (instantaneo)
    const sessions = await getLocalSessions();
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.unshift(session);
    }
    await setLocalSessions(sessions);

    // 2. Enfileirar sync com Supabase
    syncQueue.enqueue({
      table: 'dossies',
      operation: 'upsert',
      id: session.id,
      data: {
        id: session.id,
        operator_id: getOperatorId(),
        title: session.title,
        empresa_alvo: session.empresaAlvo,
        cnpj: session.cnpj,
        modo_principal: session.modoPrincipal,
        score_oportunidade: session.scoreOportunidade,
        resumo_dossie: session.resumoDossie,
        content: session,
        updated_at: new Date().toISOString(),
      },
    });
  },

  async deleteDossier(id: string): Promise<void> {
    // Soft delete local + Supabase
    const sessions = await getLocalSessions();
    const filtered = sessions.filter((s) => s.id !== id);
    await setLocalSessions(filtered);

    syncQueue.enqueue({
      table: 'dossies',
      operation: 'upsert',
      id,
      data: { id, deleted_at: new Date().toISOString() },
    });
  },

  // --- Radar ---

  async getRadarAlerts(): Promise<unknown[]> {
    const data = await get<unknown[]>(IDB_RADAR_ALERTS_KEY);
    return data ?? [];
  },

  async saveRadarAlerts(alerts: unknown[]): Promise<void> {
    await set(IDB_RADAR_ALERTS_KEY, alerts);
    syncQueue.enqueue({
      table: 'radar_alerts',
      operation: 'upsert',
      data: {
        operator_id: getOperatorId(),
        alert_data: alerts,
        last_scan: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  },

  async getRadarConfig(): Promise<unknown | null> {
    return await get<unknown>(IDB_RADAR_CONFIG_KEY);
  },

  async saveRadarConfig(config: unknown): Promise<void> {
    await set(IDB_RADAR_CONFIG_KEY, config);
    syncQueue.enqueue({
      table: 'radar_configs',
      operation: 'upsert',
      data: {
        operator_id: getOperatorId(),
        config,
        updated_at: new Date().toISOString(),
      },
    });
  },

  async getRadarLastScan(): Promise<number | null> {
    return await get<number>(IDB_RADAR_LAST_SCAN_KEY);
  },

  async saveRadarLastScan(ts: number): Promise<void> {
    await set(IDB_RADAR_LAST_SCAN_KEY, ts);
  },

  async getRadarMetaInsight(): Promise<string | null> {
    return await get<string | null>(IDB_RADAR_META_INSIGHT_KEY);
  },

  async saveRadarMetaInsight(insight: string | null): Promise<void> {
    await set(IDB_RADAR_META_INSIGHT_KEY, insight);
  },

  // --- Extract Cache ---

  async getExtractCache(cacheKey: string): Promise<{ result: unknown; timestamp: number } | null> {
    const dbKey = `${IDB_EXTRACT_PREFIX}${cacheKey}`;
    return await get<{ result: unknown; timestamp: number }>(dbKey);
  },

  async saveExtractCache(cacheKey: string, result: unknown): Promise<void> {
    const dbKey = `${IDB_EXTRACT_PREFIX}${cacheKey}`;
    const entry = { result, timestamp: Date.now() };
    await set(dbKey, entry);
    syncQueue.enqueue({
      table: 'extract_cache',
      operation: 'upsert',
      id: cacheKey,
      data: {
        id: cacheKey,
        operator_id: getOperatorId(),
        result,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  },

  // --- User Context ---

  async saveUserContext(data: { operatorId: string; name: string; email: string }): Promise<void> {
    syncQueue.enqueue({
      table: 'user_context',
      operation: 'upsert',
      id: data.operatorId,
      data: {
        operator_id: data.operatorId,
        display_name: data.name,
        email: data.email,
        last_seen: new Date().toISOString(),
      },
    });
  },

  // --- Audit Log ---

  async logAudit(action: string, targetType?: string, targetId?: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!isSupabaseAvailable()) return;
    supabase?.from('audit_log').insert({
      operator_id: getOperatorId(),
      action,
      target_type: targetType,
      target_id: targetId,
      metadata: metadata ?? {},
    }).then(() => {}).catch(() => {});
  },

  // --- Favorites ---

  async getFavorites(): Promise<unknown[]> {
    if (!isSupabaseAvailable()) return [];
    const { data } = await supabase!
      .from('favorites')
      .select('*')
      .eq('operator_id', getOperatorId()!)
      .order('created_at', { ascending: false });
    return data ?? [];
  },

  async addFavorite(cnpj: string, companyName: string, reason?: string, dossierId?: string): Promise<void> {
    await supabase!.from('favorites').upsert({
      operator_id: getOperatorId(),
      cnpj,
      company_name: companyName,
      reason,
      dossier_id: dossierId,
    });
    this.logAudit('favorite', 'cnpj', cnpj);
  },

  async removeFavorite(cnpj: string): Promise<void> {
    await supabase!
      .from('favorites')
      .delete()
      .eq('operator_id', getOperatorId()!)
      .eq('cnpj', cnpj);
  },

  // --- Shared Dossiers ---

  async shareDossier(dossierId: string): Promise<string | null> {
    const token = crypto.randomUUID();
    const { error } = await supabase!.from('shared_dossiers').insert({
      dossier_id: dossierId,
      operator_id: getOperatorId(),
      access_token: token,
    });
    if (error) {
      console.error('[Storage] Erro ao compartilhar dossie:', error);
      return null;
    }
    this.logAudit('share', 'dossier', dossierId);
    return token;
  },

  async getSharedDossier(token: string): Promise<ChatSession | null> {
    const { data } = await supabase!
      .from('shared_dossiers')
      .select('dossies(content)')
      .eq('access_token', token)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (!data) return null;
    // Increment view count
    await supabase!
      .from('shared_dossiers')
      .update({ view_count: (data as { view_count?: number }).view_count ?? 0 + 1 })
      .eq('access_token', token);
    return (data as { dossies?: { content: ChatSession } }).dossies?.content ?? null;
  },

  // --- Sync ---

  getSyncQueueSize(): number {
    return syncQueue.size();
  },

  async processSyncQueue(): Promise<void> {
    if (!isSupabaseAvailable()) return;
    await syncQueue.load();

    await syncQueue.processAll(async (op) => {
      const { table, operation, data } = op;
      if (operation === 'upsert') {
        const { error } = await supabase!.from(table).upsert(data);
        if (error) throw error;
      } else if (operation === 'delete') {
        const { error } = await supabase!.from(table).delete().eq('id', data.id);
        if (error) throw error;
      }
    });
  },
};

export { storage };
```

- [ ] **Step 4: Rodar testes e verificar que passam**

Run: `npx vitest run tests/services/storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/storage.ts tests/services/storage.test.ts
git commit -m "feat: add unified storage layer with Supabase + IDB offline"
```

---

## Task 5: Migrar useSessionStorage (Dossies)

**Files:**
- Modify: `hooks/useSessionStorage.ts`

- [ ] **Step 1: Substituir imports idb-keyval por storage**

Em `hooks/useSessionStorage.ts`, trocar:

```typescript
// ANTES:
import { get, set } from 'idb-keyval';

// DEPOIS:
import { storage } from '../services/storage';
```

- [ ] **Step 2: Substituir chamadas get/set por storage**

No mesmo arquivo, substituir todas as chamadas diretas ao idb-keyval:

- `get<ChatSession[]>(SESSIONS_IDB_KEY)` → `storage.getDossiers()`
- `set(SESSIONS_IDB_KEY, data)` → `storage.saveDossier(session)` (individual) ou manter `set` para bulk save

**Detalhe importante:** O hook atual salva o array inteiro de uma vez. Adaptar para chamar `storage.saveDossier()` individual quando uma sessao muda, ou criar um metodo bulk no storage.

Para o caso de carregamento inicial (load), usar `storage.getDossiers()`.
Para o caso de save (persistir array completo), adicionar ao storage:

```typescript
async saveAllDossiers(sessions: ChatSession[]): Promise<void> {
  await setLocalSessions(sessions);
  // Enfileirar sync para cada sessao modificada
  for (const session of sessions) {
    syncQueue.enqueue({
      table: 'dossies',
      operation: 'upsert',
      id: session.id,
      data: {
        id: session.id,
        operator_id: getOperatorId(),
        content: session,
        title: session.title,
        empresa_alvo: session.empresaAlvo,
        cnpj: session.cnpj,
        score_oportunidade: session.scoreOportunidade,
        updated_at: session.updatedAt,
      },
    });
  }
},
```

- [ ] **Step 3: Testar manualmente**

1. `npm run dev`
2. Criar um novo dossie (chat com CNPJ)
3. Verificar no Supabase Dashboard → Table Editor → `dossies` que o registro apareceu
4. Recarregar a pagina e confirmar que o dossie carrega do IDB
5. Abrir DevTools → Application → IndexedDB → confirmar dados locais

- [ ] **Step 4: Commit**

```bash
git add hooks/useSessionStorage.ts services/storage.ts
git commit -m "feat: migrate useSessionStorage from idb-keyval to storage.ts"
```

---

## Task 6: Migrar useRadar (Radar)

**Files:**
- Modify: `features/radar/useRadar.ts`

- [ ] **Step 1: Substituir imports**

Em `features/radar/useRadar.ts`, trocar:

```typescript
// ANTES:
import { get, set } from 'idb-keyval';

// DEPOIS:
import { storage } from '../../services/storage';
```

- [ ] **Step 2: Substituir chamadas**

Mapeamento direto:

| Antes (idb-keyval) | Depois (storage) |
|--------------------|--------------------|
| `get<RadarAlert[]>(IDB_ALERTS_KEY)` | `storage.getRadarAlerts()` |
| `get<RadarConfig>(IDB_CONFIG_KEY)` | `storage.getRadarConfig()` |
| `get<number>(IDB_LAST_SCAN_KEY)` | `storage.getRadarLastScan()` |
| `get<string \| null>(IDB_META_INSIGHT_KEY)` | `storage.getRadarMetaInsight()` |
| `set(IDB_ALERTS_KEY, data)` | `storage.saveRadarAlerts(data)` |
| `set(IDB_CONFIG_KEY, data)` | `storage.saveRadarConfig(data)` |
| `set(IDB_LAST_SCAN_KEY, ts)` | `storage.saveRadarLastScan(ts)` |
| `set(IDB_META_INSIGHT_KEY, insight)` | `storage.saveRadarMetaInsight(insight)` |

Remover constantes de IDB keys (agora estao dentro do storage).

- [ ] **Step 3: Testar manualmente**

1. `npm run dev`
2. Configurar radar (habilitar, selecionar categorias)
3. Executar scan
4. Verificar no Supabase Dashboard → `radar_alerts` e `radar_configs`
5. Recarregar pagina e confirmar config preservada

- [ ] **Step 4: Commit**

```bash
git add features/radar/useRadar.ts
git commit -m "feat: migrate useRadar from idb-keyval to storage.ts"
```

---

## Task 7: Migrar extractContentService (Cache)

**Files:**
- Modify: `services/extractContentService.ts`

- [ ] **Step 1: Substituir imports**

Em `services/extractContentService.ts`, trocar:

```typescript
// ANTES:
import { get, set } from 'idb-keyval';

// DEPOIS:
import { storage } from './storage';
```

- [ ] **Step 2: Substituir chamadas**

| Antes | Depois |
|-------|--------|
| `get<{ result: ExtractResult; timestamp: number }>(dbKey)` | `storage.getExtractCache(cacheKey)` |
| `set(dbKey, { result, timestamp: Date.now() })` | `storage.saveExtractCache(cacheKey, result)` |

Remover `DB_PREFIX` e `CACHE_TTL` (agora o storage gerencia).

- [ ] **Step 3: Testar manualmente**

1. `npm run dev`
2. Abrir um chat e pesquisar um CNPJ
3. Verificar no Supabase → `extract_cache` que o registro apareceu
4. Pesquisar o mesmo CNPJ novamente — deve usar cache (sem chamada extra ao Gemini)

- [ ] **Step 4: Commit**

```bash
git add services/extractContentService.ts
git commit -m "feat: migrate extractContentService from idb-keyval to storage.ts"
```

---

## Task 8: Cadastro Simples (Nome + Email)

**Files:**
- Modify: `contexts/OperatorContext.tsx`

- [ ] **Step 1: Adicionar campo email ao OperatorContext**

Em `contexts/OperatorContext.tsx`:

1. Adicionar `email` ao `OperatorProfile`:

```typescript
interface OperatorProfile {
  operatorId: string;
  name: string;
  email: string;
}
```

2. Adicionar campo de email no formulario de cadastro
3. Salvar email no localStorage via `storageSet`
4. Chamar `storage.saveUserContext({ operatorId, name, email })` ao registrar

- [ ] **Step 2: Adicionar storageSet para email**

Adicionar constante e persistencia:

```typescript
const OPERATOR_EMAIL_KEY = 'operator_email';
// ...
const storedEmail = storageGet(OPERATOR_EMAIL_KEY);
```

- [ ] **Step 3: Importar e chamar storage**

```typescript
import { storage } from '../services/storage';
```

No momento em que o operador registra (digita nome + email):

```typescript
await storage.saveUserContext({ operatorId, name: normalizedName, email });
```

- [ ] **Step 4: Testar manualmente**

1. `npm run dev`
2. Limpar localStorage → recarregar pagina
3. Tela de cadastro aparece → digitar nome e email
4. Verificar no Supabase → `user_context` que o registro apareceu
5. Recarregar pagina → nome e email preservados

- [ ] **Step 5: Commit**

```bash
git add contexts/OperatorContext.tsx
git commit -m "feat: add email field to operator registration with Supabase sync"
```

---

## Task 9: Sync Indicator (Badge Visual)

**Files:**
- Create: `components/SyncIndicator.tsx`
- Modify: componente de layout que contem o header/status bar

- [ ] **Step 1: Criar componente SyncIndicator**

Criar `components/SyncIndicator.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { storage } from '../services/storage';

export function SyncIndicator() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPending(storage.getSyncQueueSize());
    }, 2000);

    // Processar fila ao voltar online
    const handleOnline = () => {
      storage.processSyncQueue();
    };

    window.addEventListener('online', handleOnline);

    // Processar fila ao montar
    if (navigator.onLine) {
      storage.processSyncQueue();
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (pending === 0) {
    return (
      <span className="text-xs text-green-500 flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
        Sincronizado
      </span>
    );
  }

  return (
    <span className="text-xs text-yellow-500 flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block animate-pulse" />
      {pending} pendente{pending > 1 ? 's' : ''}
    </span>
  );
}
```

- [ ] **Step 2: Adicionar ao layout**

Encontrar o componente de layout/header e adicionar `<SyncIndicator />` no canto superior.

- [ ] **Step 3: Testar manualmente**

1. `npm run dev`
2. Com internet: badge deve mostrar "Sincronizado" (verde)
3. Desligar internet (DevTools → Network → Offline)
4. Criar um dossie → badge deve mostrar "1 pendente" (amarelo)
5. Ligar internet → badge volta para "Sincronizado"

- [ ] **Step 4: Commit**

```bash
git add components/SyncIndicator.tsx
git commit -m "feat: add sync status indicator badge"
```

---

## Task 10: Integration Test — Cenario Offline/Online

**Files:**
- Create: `tests/integration/supabase-sync.test.ts`

- [ ] **Step 1: Escrever teste de integracao**

Criar `tests/integration/supabase-sync.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock completo do ambiente
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
});
```

- [ ] **Step 2: Rodar teste de integracao**

Run: `npx vitest run tests/integration/supabase-sync.test.ts`
Expected: 2 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/supabase-sync.test.ts
git commit -m "test: add integration tests for Supabase sync offline/online"
```

---

## Task 11: Smoke Test Final + Verificacao

**Files:** Nenhum arquivo novo

- [ ] **Step 1: Rodar todos os testes existentes**

```bash
npm test
```

Expected: Todos os testes existentes ainda passam (sem regressao).

- [ ] **Step 2: Build de producao**

```bash
npm run build
```

Expected: Build sem erros.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: Sem erros de tipo.

- [ ] **Step 4: Teste manual completo**

1. `npm run dev`
2. Cadastro: nome + email → verificar Supabase `user_context`
3. Criar dossie completo (pesquisar CNPJ, gerar analise) → verificar Supabase `dossies`
4. Verificar `audit_log` no Supabase (acoes registradas)
5. Configurar radar → verificar Supabase `radar_configs`
6. Executar scan → verificar Supabase `radar_alerts`
7. Desligar internet → criar dossie → verificar badge "pendente"
8. Ligar internet → verificar sync automatico + badge "Sincronizado"
9. Abrir em outra aba → verificar que dados estao la

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "feat: complete Supabase migration — IndexedDB → Supabase with offline-first sync"
```

---

## Ordem de Execucao e Dependencias

```
Task 1 (Setup Supabase)
  └── Task 2 (Schema + RLS)
       └── Task 3 (Sync Queue)
            └── Task 4 (Storage unificado)
                 ├── Task 5 (Migrar useSessionStorage)
                 ├── Task 6 (Migrar useRadar)
                 ├── Task 7 (Migrar extractContentService)
                 ├── Task 8 (Cadastro simples)
                 └── Task 9 (Sync indicator)
                      └── Task 10 (Integration tests)
                           └── Task 11 (Smoke test final)
```

Tasks 5, 6, 7, 8 podem rodar em paralelo apos Task 4 estar completa.
