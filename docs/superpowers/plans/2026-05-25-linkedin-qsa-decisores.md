# LinkedIn + QSA — Integração de Decisores no Senior Scout 360

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enriquecer sócios do QSA com perfil real do LinkedIn via Apify, com cache persistente no Supabase, alimentando o CAMINHO DE VENDA com dados verificados de decisores.

**Architecture:** `api/linkedin-search.ts` (serverless) → Apify REST API (waitForFinish=120) → cache Supabase (30 dias, evita re-busca) → `SocietaryMap.tsx` (UI) + `waterfall-orchestrator.ts` (prompt). Cache primeiro, API só em cache miss. Nunca 500 — graceful degradation sempre.

**Tech Stack:** TypeScript 5, Vercel Node.js runtime, Apify REST API, Supabase (cache table), Zod, Vitest

**Spec:** Conversa com Bruno Lima em 2026-05-25 — viabilidade Apify validada (Scheffer retornou 10 perfis, 5 diretores corretos), custo ~$0.004/profile.

---

## Arquivos Criados/Modificados

| Ação   | Arquivo                                                 | Responsabilidade                                         |
| ------ | ------------------------------------------------------- | -------------------------------------------------------- |
| Create | `api/linkedin-search.ts`                                | Endpoint serverless — chama Apify, cache, retorna perfis |
| Create | `supabase/migrations/20260526000000_linkedin_cache.sql` | Migration — tabela de cache no Supabase                  |
| Create | `tests/api/linkedin-search.test.ts`                     | Testes do endpoint (mock Apify + cache)                  |
| Create | `components/LinkedInSocioCard.tsx`                      | Card visual com foto, headline, skills, link             |
| Create | `tests/components/LinkedInSocioCard.test.tsx`           | Testes do componente                                     |
| Modify | `types.ts`                                              | Adicionar `LinkedInProfile`, `LinkedInSearchResponse`    |
| Modify | `config/localDevApiProxy.ts`                            | Adicionar `/api/linkedin-search` ao proxy                |
| Modify | `features/dossier/SocietaryMap.tsx`                     | Buscar LinkedIn ao carregar QSA, renderizar cards        |
| Modify | `features/dossier/societaryGraph.ts`                    | Estender `SocietaryPartnerInput` com `linkedinProfile`   |
| Modify | `features/dossier/waterfall-orchestrator.ts`            | Coletar dados LinkedIn e injetar no seed context         |

---

## Design da Tabela Supabase

A tabela resolve o problema de re-pesquisa: cada perfil LinkedIn cacheado evita nova chamada à Apify (custo $0 e latência 0).

### Schema SQL

```sql
CREATE TABLE linkedin_profile_cache (
  id TEXT PRIMARY KEY,
  socio_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  profiles JSONB NOT NULL,
  found BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'apify',
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_linkedin_cache_socio ON linkedin_profile_cache (socio_name);
CREATE INDEX idx_linkedin_cache_expires ON linkedin_profile_cache (expires_at) WHERE found = TRUE;
```

**Cache key:** `normalizeText(socioName) + '::' + normalizeText(companyName)` (mesmo algoritmo de `socio-search.ts`)

**found = FALSE:** Armazena "não encontrado" também, evita re-buscar pessoas sem LinkedIn. TTL menor (7 dias) pois o perfil pode ser criado depois.

**TTL:** 30 dias para perfis encontrados, 7 dias para não-encontrados.

### Por que tabela dedicada, não reusar `extract_cache`?

| Comparação             | `extract_cache`         | `linkedin_profile_cache`            |
| ---------------------- | ----------------------- | ----------------------------------- |
| Schema                 | genérico (jsonb result) | tipado (profiles jsonb, found bool) |
| TTL                    | 7 dias                  | 30 dias (LinkedIn muda pouco)       |
| Índices                | só PK                   | PK + socio_name + expires_at        |
| Cache "não encontrado" | não suporta             | `found = FALSE` com TTL menor       |
| Query por sócio        | full scan               | índice dedicado                     |

---

## Task 1: Tabela Supabase + Types

**Files:**

- Create: `supabase/migrations/20260526000000_linkedin_cache.sql`
- Modify: `types.ts`
- Modify: `features/dossier/societaryGraph.ts`

- [ ] **Step 1: Criar migration SQL**

```sql
-- supabase/migrations/20260526000000_linkedin_cache.sql
CREATE TABLE IF NOT EXISTS linkedin_profile_cache (
  id TEXT PRIMARY KEY,
  socio_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  profiles JSONB NOT NULL DEFAULT '[]'::jsonb,
  found BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'apify',
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_linkedin_cache_socio
  ON linkedin_profile_cache (socio_name);

CREATE INDEX IF NOT EXISTS idx_linkedin_cache_expires
  ON linkedin_profile_cache (expires_at) WHERE found = TRUE;

COMMENT ON TABLE linkedin_profile_cache IS
  'Cache de perfis LinkedIn para socios do QSA. Evita re-buscar na Apify. TTL 30d para found, 7d para nao encontrado.';
```

- [ ] **Step 2: Aplicar migration no Supabase**

```bash
# Via MCP Supabase
```

Use Supabase MCP `apply_migration` com nome `linkedin_cache`.

Expected: tabela criada com índices e comentários.

- [ ] **Step 3: Adicionar types em types.ts**

```typescript
// types.ts — adicionar após o bloco de tipos CNPJ (~linha 170)

/** Perfil LinkedIn retornado pela Apify (modo Short) */
export interface LinkedInProfile {
  /** URL publica do perfil */
  linkedinUrl: string;
  /** Identificador publico (slug) */
  publicIdentifier: string;
  /** Primeiro nome */
  firstName: string;
  /** Sobrenome */
  lastName: string;
  /** Headline / cargo resumido */
  headline: string;
  /** URL da foto de perfil (pode ser null) */
  photo?: string | null;
  /** Localizacao formatada (ex: "Cuiaba, Mato Grosso, Brazil") */
  location?: string | null;
  /** Cargo atual (primeiro da lista) */
  currentPosition?: {
    title: string;
    companyName: string;
    location?: string | null;
    startDate?: { month?: string; year?: number } | null;
  } | null;
  /** Numero de conexoes */
  connectionsCount?: number;
  /** Perfil verificado pelo LinkedIn */
  verified: boolean;
  /** Top 5 skills */
  skills?: string[];
}

/** Resposta do endpoint /api/linkedin-search */
export interface LinkedInSearchResponse {
  /** Perfis encontrados (vazio se nao achou) */
  profiles: LinkedInProfile[];
  /** true se houve falha na busca */
  degraded: boolean;
  /** true se veio do cache */
  cached: boolean;
  /** Mensagem de erro se degraded */
  error?: string;
}
```

- [ ] **Step 4: Estender SocietaryPartnerInput com linkedinProfile**

Editar `features/dossier/societaryGraph.ts`, interface `SocietaryPartnerInput` (~linha 21):

```typescript
export interface SocietaryPartnerInput {
  id?: string;
  name: string;
  role?: string;
  document?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  snippet?: string;
  confidence?: SocietaryConfidence;
  // NOVOS CAMPOS:
  linkedinProfile?: LinkedInProfile;
  linkedinLoaded?: boolean;
  linkedinError?: string;
}
```

Importar `LinkedInProfile` de `../../types`.

- [ ] **Step 5: Rodar typecheck**

```bash
npm run typecheck
```

Expected: zero erros.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260526000000_linkedin_cache.sql types.ts features/dossier/societaryGraph.ts
git commit -m "feat: adiciona tabela linkedin_profile_cache e types LinkedInProfile"
```

---

## Task 2: Endpoint `api/linkedin-search.ts`

**Files:**

- Create: `api/linkedin-search.ts`
- Modify: `config/localDevApiProxy.ts`

- [ ] **Step 1: Escrever o endpoint**

```typescript
// api/linkedin-search.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { setSecurityHeaders } from './_security-headers.js';
import type { LinkedInProfile, LinkedInSearchResponse } from '../types.js';

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const APIFY_ACTOR = 'harvestapi~linkedin-profile-search';
const APIFY_BASE = 'https://api.apify.com/v2';
const CACHE_TTL_FOUND_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const CACHE_TTL_NOT_FOUND_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const CACHE_MAX = 500;
const APIFY_TIMEOUT_MS = 125_000;

const RequestSchema = z.object({
  socioName: z.string().min(3).max(160),
  companyName: z.string().min(2).max(180),
  companyLinkedinUrl: z.string().url().optional(),
  maxResults: z.number().int().min(1).max(10).optional().default(3),
});

function normalizeText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildCacheKey(socioName: string, companyName: string): string {
  return `linkedin:${normalizeText(socioName)}::${normalizeText(companyName)}`;
}

interface CacheEntry {
  profiles: LinkedInProfile[];
  found: boolean;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();

function getMemoryCached(key: string): CacheEntry | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry;
}

function setMemoryCached(key: string, entry: CacheEntry): void {
  if (memoryCache.size >= CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }
  memoryCache.set(key, entry);
}

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/g, ''), key };
}

async function getPersistentCached(key: string): Promise<CacheEntry | null> {
  const config = getSupabaseConfig();
  if (!config) return null;

  try {
    const url = `${config.url}/rest/v1/linkedin_profile_cache?id=eq.${encodeURIComponent(key)}&expires_at=gt.${new Date().toISOString()}&select=profiles,found`;
    const res = await fetch(url, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ profiles: LinkedInProfile[]; found: boolean }>;
    if (!rows[0]) return null;
    return {
      profiles: rows[0].profiles ?? [],
      found: rows[0].found,
      expiresAt: Date.now() + CACHE_TTL_FOUND_MS,
    };
  } catch {
    return null;
  }
}

async function setPersistentCached(key: string, entry: CacheEntry): Promise<void> {
  const config = getSupabaseConfig();
  if (!config) return;

  try {
    const ttl = entry.found ? CACHE_TTL_FOUND_MS : CACHE_TTL_NOT_FOUND_MS;
    await fetch(`${config.url}/rest/v1/linkedin_profile_cache`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: key,
        socio_name: '',
        company_name: '',
        profiles: entry.profiles,
        found: entry.found,
        expires_at: new Date(Date.now() + ttl).toISOString(),
      }),
    });
  } catch {
    // cache persistente é bônus — falha silenciosa
  }
}

function buildApifyPayload(params: z.infer<typeof RequestSchema>) {
  return {
    searchQuery: params.socioName,
    currentJobTitles: ['Diretor', 'Diretora', 'Sócio', 'Gerente', 'CEO', 'CFO', 'CTO', 'Controller', 'Head'],
    locations: ['Brasil'],
    profileScraperMode: 'Short' as const,
    maxItems: params.maxResults,
  };
}

function mapApifyToLinkedInProfile(raw: Record<string, unknown>): LinkedInProfile {
  const currentPosition =
    Array.isArray(raw.currentPosition) && raw.currentPosition[0]
      ? {
          title: ((raw.currentPosition[0] as Record<string, unknown>).position as string) || '',
          companyName: ((raw.currentPosition[0] as Record<string, unknown>).companyName as string) || '',
          location: ((raw.currentPosition[0] as Record<string, unknown>).location as string) || null,
          startDate:
            ((raw.currentPosition[0] as Record<string, unknown>)
              .startDate as LinkedInProfile['currentPosition'] extends { startDate?: infer D } | null ? D : never) ||
            null,
        }
      : null;

  const skills = Array.isArray(raw.skills) ? (raw.skills as Array<{ name: string }>).slice(0, 5).map(s => s.name) : [];

  return {
    linkedinUrl: (raw.linkedinUrl as string) || '',
    publicIdentifier: (raw.publicIdentifier as string) || '',
    firstName: (raw.firstName as string) || '',
    lastName: (raw.lastName as string) || '',
    headline: (raw.headline as string) || '',
    photo: (raw.photo as string) || null,
    location: raw.location ? ((raw.location as Record<string, unknown>).linkedinText as string) || null : null,
    currentPosition,
    connectionsCount: (raw.connectionsCount as number) || undefined,
    verified: Boolean(raw.verified),
    skills,
  };
}

async function callApifyApi(payload: Record<string, unknown>): Promise<LinkedInProfile[]> {
  if (!APIFY_TOKEN) return [];

  const runRes = await fetch(`${APIFY_BASE}/acts/${APIFY_ACTOR}/runs?waitForFinish=120`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${APIFY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
  });

  if (!runRes.ok) return [];

  const runData = (await runRes.json()) as { data?: { defaultDatasetId?: string } };
  const datasetId = runData?.data?.defaultDatasetId;
  if (!datasetId) return [];

  const datasetRes = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items`, {
    headers: { Authorization: `Bearer ${APIFY_TOKEN}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!datasetRes.ok) return [];

  const items = (await datasetRes.json()) as Array<Record<string, unknown>>;
  return items.map(mapApifyToLinkedInProfile);
}

async function searchLinkedIn(params: z.infer<typeof RequestSchema>): Promise<LinkedInSearchResponse> {
  const cacheKey = buildCacheKey(params.socioName, params.companyName);

  // 1. memory cache
  const memCached = getMemoryCached(cacheKey);
  if (memCached) {
    return { profiles: memCached.profiles, degraded: false, cached: true };
  }

  // 2. persistent cache
  const persistentCached = await getPersistentCached(cacheKey);
  if (persistentCached) {
    setMemoryCached(cacheKey, persistentCached);
    return { profiles: persistentCached.profiles, degraded: false, cached: true };
  }

  // 3. cache miss — chamar Apify
  try {
    const apifyPayload = buildApifyPayload(params);
    const profiles = await callApifyApi(apifyPayload);
    const found = profiles.length > 0;

    const entry: CacheEntry = {
      profiles,
      found,
      expiresAt: Date.now() + (found ? CACHE_TTL_FOUND_MS : CACHE_TTL_NOT_FOUND_MS),
    };

    setMemoryCached(cacheKey, entry);
    // fire-and-forget — nao bloqueia a resposta
    setPersistentCached(cacheKey, entry).catch(() => {});

    return { profiles, degraded: false, cached: false };
  } catch {
    return { profiles: [], degraded: true, cached: false, error: 'Apify indisponivel' };
  }
}

export const config = { runtime: 'nodejs' };
export const maxDuration = 180;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  try {
    const result = await searchLinkedIn(parsed.data);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(200).json({
      profiles: [],
      degraded: true,
      cached: false,
      error: error instanceof Error ? error.message : 'Erro inesperado',
    });
  }
}
```

- [ ] **Step 2: Adicionar ao proxy de dev local**

Editar `config/localDevApiProxy.ts`:

```typescript
export const LOCAL_DEV_API_PROXY_PATHS = [
  '/api/gemini',
  '/api/radar-scan',
  '/api/gerar-dossie',
  '/api/cnpj',
  '/api/comex',
  '/api/open-web-search',
  '/api/link-status',
  '/api/extract-content',
  '/api/rag',
  '/api/docs-rag',
  '/api/socio-search',
  '/api/linkedin-search', // ← NOVO
];
```

- [ ] **Step 3: Rodar typecheck**

```bash
npm run typecheck
```

Expected: zero erros. Se houver erro de import de `types.js`, ajustar path.

- [ ] **Step 4: Commit**

```bash
git add api/linkedin-search.ts config/localDevApiProxy.ts
git commit -m "feat: endpoint /api/linkedin-search com cache Supabase + Apify"
```

---

## Task 3: Testes do Endpoint

**Files:**

- Create: `tests/api/linkedin-search.test.ts`

- [ ] **Step 1: Escrever testes**

```typescript
// tests/api/linkedin-search.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch global
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Importa o handler (ajustar path conforme necessário)
// Como é Vercel serverless, testamos a função searchLinkedIn exportada
// ou mockamos o handler completo

describe('/api/linkedin-search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APIFY_TOKEN', 'test-token');
  });

  it('rejeita metodo GET', async () => {
    const { default: handler } = await import('../api/linkedin-search.js');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const req = { method: 'GET' };
    await handler(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('rejeita socioName muito curto', async () => {
    const { default: handler } = await import('../api/linkedin-search.js');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const req = { method: 'POST', body: { socioName: 'AB', companyName: 'Teste' } };
    await handler(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna degraded se APIFY_TOKEN ausente', async () => {
    vi.stubEnv('APIFY_TOKEN', '');
    const { default: handler } = await import('../api/linkedin-search.js');
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockImplementation((data: unknown) => data),
    };
    const req = {
      method: 'POST',
      body: { socioName: 'Guilherme Scheffer', companyName: 'Scheffer' },
    };
    await handler(req as any, res as any);
    const result = (res.json as any).mock.calls[0][0];
    expect(result.degraded).toBe(true);
    expect(result.profiles).toEqual([]);
    expect(result.cached).toBe(false);
  });

  it('retorna perfis do cache na segunda chamada', async () => {
    // Mock Apify response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { defaultDatasetId: 'test-dataset' },
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          linkedinUrl: 'https://linkedin.com/in/test',
          publicIdentifier: 'test',
          firstName: 'Test',
          lastName: 'User',
          headline: 'CEO',
          photo: null,
          location: { linkedinText: 'Cuiaba, MT' },
          currentPosition: [{ position: 'CEO', companyName: 'TestCo' }],
          verified: true,
          connectionsCount: 500,
          skills: [{ name: 'Management' }],
        },
      ],
    });

    const { default: handler } = await import('../api/linkedin-search.js');
    const res1 = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const req = { method: 'POST', body: { socioName: 'Test User', companyName: 'TestCo' } };

    // Primeira chamada — cache miss
    await handler(req as any, res1 as any);
    const r1 = (res1.json as any).mock.calls[0][0];
    expect(r1.cached).toBe(false);
    expect(r1.profiles).toHaveLength(1);

    // Segunda chamada — cache hit (memória)
    const res2 = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler(req as any, res2 as any);
    const r2 = (res2.json as any).mock.calls[0][0];
    expect(r2.cached).toBe(true);
    expect(r2.profiles[0].firstName).toBe('Test');
  });
});
```

- [ ] **Step 2: Rodar testes**

```bash
npx vitest run tests/api/linkedin-search.test.ts
```

Expected: 5 testes passam.

- [ ] **Step 3: Commit**

```bash
git add tests/api/linkedin-search.test.ts
git commit -m "test: endpoint /api/linkedin-search"
```

---

## Task 4: Componente LinkedInSocioCard

**Files:**

- Create: `components/LinkedInSocioCard.tsx`
- Create: `tests/components/LinkedInSocioCard.test.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// components/LinkedInSocioCard.tsx
import React from 'react';
import type { LinkedInProfile } from '../types';

interface LinkedInSocioCardProps {
  profile: LinkedInProfile;
  isLoading?: boolean;
  error?: string;
  isDarkMode?: boolean;
}

const shimmerClass = 'animate-pulse rounded';

function Skeleton() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 min-w-[220px] max-w-[300px]">
      <div className={`w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 ${shimmerClass}`} />
      <div className="flex-1 space-y-2">
        <div className={`h-4 w-28 bg-slate-200 dark:bg-slate-700 ${shimmerClass}`} />
        <div className={`h-3 w-20 bg-slate-100 dark:bg-slate-800 ${shimmerClass}`} />
        <div className={`h-3 w-32 bg-slate-100 dark:bg-slate-800 ${shimmerClass}`} />
      </div>
    </div>
  );
}

function Avatar({ src, name }: { src?: string | null; name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="w-12 h-12 rounded-full object-cover border-2 border-white dark:border-slate-600 shadow-sm"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
        }}
      />
    );
  }

  return (
    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm font-bold shadow-sm">
      {initials}
    </div>
  );
}

export default function LinkedInSocioCard({
  profile,
  isLoading,
  error,
  isDarkMode = false,
}: LinkedInSocioCardProps) {
  if (isLoading) return <Skeleton />;

  if (error) {
    return (
      <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 min-w-[220px] max-w-[300px]">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          LinkedIn indisponível
        </p>
      </div>
    );
  }

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const currentTitle = profile.currentPosition?.title ?? '';
  const currentCompany = profile.currentPosition?.companyName ?? '';

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 min-w-[220px] max-w-[300px] hover:border-blue-300 dark:hover:border-blue-600 transition-colors group">
      <Avatar src={profile.photo} name={fullName} />

      <div className="flex-1 min-w-0">
        <a
          href={profile.linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 truncate block"
        >
          {fullName}
          {profile.verified && (
            <span className="inline-block ml-1 text-blue-500" title="Perfil verificado">
              <svg className="w-3.5 h-3.5 inline" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l6-6z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </a>

        {profile.headline && profile.headline !== '--' && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
            {profile.headline}
          </p>
        )}

        {currentTitle && (
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
            {currentTitle}
            {currentCompany ? ` na ${currentCompany}` : ''}
          </p>
        )}

        {profile.location && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            {profile.location}
          </p>
        )}

        {profile.skills && profile.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {profile.skills.slice(0, 4).map(skill => (
              <span
                key={skill}
                className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        <a
          href={profile.linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-[10px] text-blue-500 dark:text-blue-400 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Abrir LinkedIn ↗
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar testes do componente**

```typescript
// tests/components/LinkedInSocioCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LinkedInSocioCard from '../../components/LinkedInSocioCard';

const mockProfile = {
  linkedinUrl: 'https://linkedin.com/in/test',
  publicIdentifier: 'test',
  firstName: 'Guilherme',
  lastName: 'Scheffer',
  headline: 'Chief Commercial Officer at Scheffer',
  photo: null,
  location: 'Cuiabá, Mato Grosso, Brazil',
  currentPosition: {
    title: 'Diretor Financeiro/Comercial',
    companyName: 'Scheffer oficial',
  },
  connectionsCount: 4723,
  verified: true,
  skills: ['Estratégia empresarial', 'Planejamento empresarial'],
};

describe('LinkedInSocioCard', () => {
  it('renderiza nome completo', () => {
    render(<LinkedInSocioCard profile={mockProfile} />);
    expect(screen.getByText('Guilherme Scheffer')).toBeInTheDocument();
  });

  it('renderiza headline', () => {
    render(<LinkedInSocioCard profile={mockProfile} />);
    expect(screen.getByText('Chief Commercial Officer at Scheffer')).toBeInTheDocument();
  });

  it('renderiza cargo e empresa', () => {
    render(<LinkedInSocioCard profile={mockProfile} />);
    expect(screen.getByText(/Diretor Financeiro\/Comercial na Scheffer oficial/)).toBeInTheDocument();
  });

  it('renderiza avatar com iniciais quando sem foto', () => {
    render(<LinkedInSocioCard profile={mockProfile} />);
    expect(screen.getByText('GS')).toBeInTheDocument();
  });

  it('renderiza skills', () => {
    render(<LinkedInSocioCard profile={mockProfile} />);
    expect(screen.getByText('Estratégia empresarial')).toBeInTheDocument();
    expect(screen.getByText('Planejamento empresarial')).toBeInTheDocument();
  });

  it('renderiza skeleton quando loading', () => {
    const { container } = render(<LinkedInSocioCard profile={mockProfile} isLoading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renderiza mensagem de erro', () => {
    render(<LinkedInSocioCard profile={mockProfile} error="Falha" />);
    expect(screen.getByText('LinkedIn indisponível')).toBeInTheDocument();
  });

  it('link abre em nova aba', () => {
    render(<LinkedInSocioCard profile={mockProfile} />);
    const links = screen.getAllByRole('link');
    const linkedinLink = links.find(l => l.getAttribute('href') === 'https://linkedin.com/in/test');
    expect(linkedinLink).toBeTruthy();
    expect(linkedinLink?.getAttribute('target')).toBe('_blank');
  });
});
```

- [ ] **Step 3: Rodar testes**

```bash
npx vitest run tests/components/LinkedInSocioCard.test.tsx
```

Expected: 8 testes passam.

- [ ] **Step 4: Commit**

```bash
git add components/LinkedInSocioCard.tsx tests/components/LinkedInSocioCard.test.tsx
git commit -m "feat: componente LinkedInSocioCard com loading/empty/error states"
```

---

## Task 5: Integrar no SocietaryMap

**Files:**

- Modify: `features/dossier/SocietaryMap.tsx`

- [ ] **Step 1: Adicionar estado e busca LinkedIn**

No início do componente `SocietaryMap` (após a declaração de `const [notice, setNotice]` em ~linha 80), adicionar:

```typescript
// NOVO: estado para perfis LinkedIn dos sócios
const [linkedinDataByPartner, setLinkedinDataByPartner] = useState<Record<string, LinkedInProfile | null>>({});
const [linkedinLoadingByPartner, setLinkedinLoadingByPartner] = useState<Record<string, boolean>>({});
```

Adicionar import no topo:

```typescript
import LinkedInSocioCard from '../../components/LinkedInSocioCard';
import type { LinkedInProfile } from '../../types';
```

- [ ] **Step 2: Adicionar useEffect para buscar LinkedIn**

Após o useEffect que carrega `rootData` (linha ~84), adicionar:

```typescript
// Buscar LinkedIn para cada sócio do QSA
useEffect(() => {
  if (!rootData?.partners?.length) return;

  const controller = new AbortController();

  rootData.partners.forEach(async partner => {
    const key = normalizePartnerKey(partner.name);
    if (linkedinDataByPartner[key] !== undefined || linkedinLoadingByPartner[key]) return;

    setLinkedinLoadingByPartner(prev => ({ ...prev, [key]: true }));

    try {
      const resp = await fetch('/api/linkedin-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          socioName: partner.name,
          companyName: rootData.name,
          maxResults: 1,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        setLinkedinDataByPartner(prev => ({ ...prev, [key]: null }));
        return;
      }

      const data = await resp.json();
      setLinkedinDataByPartner(prev => ({
        ...prev,
        [key]: data.profiles?.[0] ?? null,
      }));
    } catch {
      if ((controller as AbortController).signal?.aborted) return;
      setLinkedinDataByPartner(prev => ({ ...prev, [key]: null }));
    } finally {
      setLinkedinLoadingByPartner(prev => ({ ...prev, [key]: false }));
    }
  });

  return () => controller.abort();
}, [rootData]);
```

- [ ] **Step 3: Renderizar cards LinkedIn no JSX**

Após a seção do painel de evidências (antes do fechamento do return principal), adicionar:

```tsx
{
  /* Perfis LinkedIn dos Sócios */
}
{
  rootData?.partners && Object.keys(linkedinDataByPartner).length > 0 && (
    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
        Perfis LinkedIn dos Sócios
      </p>
      <div className="flex flex-wrap gap-3">
        {rootData.partners.map(partner => {
          const key = normalizePartnerKey(partner.name);
          const profile = linkedinDataByPartner[key];
          const loading = linkedinLoadingByPartner[key];

          if (loading) {
            return <LinkedInSocioCard key={key} profile={{} as LinkedInProfile} isLoading isDarkMode={isDarkMode} />;
          }

          if (!profile) return null;

          return <LinkedInSocioCard key={key} profile={profile} isDarkMode={isDarkMode} />;
        })}
      </div>
    </div>
  );
}
```

Corrigir o caso loading: criar uma variante do componente que aceita `isLoading` sem exigir `profile` completo. Ou usar um profile vazio com `isLoading`.

Ajustar a prop do `LinkedInSocioCard` para aceitar `profile` opcional quando `isLoading`:

```typescript
// Em LinkedInSocioCard.tsx, ajustar interface:
interface LinkedInSocioCardProps {
  profile?: LinkedInProfile;
  isLoading?: boolean;
  error?: string;
  isDarkMode?: boolean;
}
```

- [ ] **Step 4: Rodar typecheck + testes existentes**

```bash
npm run typecheck
npx vitest run tests/features/dossier/
```

Expected: typecheck limpo, testes existentes continuam passando sem alterações.

- [ ] **Step 5: Commit**

```bash
git add features/dossier/SocietaryMap.tsx components/LinkedInSocioCard.tsx
git commit -m "feat: integra LinkedInSocioCard no SocietaryMap ao carregar QSA"
```

---

## Task 6: Alimentar CAMINHO DE VENDA

**Files:**

- Modify: `features/dossier/waterfall-orchestrator.ts`

- [ ] **Step 1: Adicionar função formatLinkedinForPrompt e coleta de dados**

No `waterfall-orchestrator.ts`, dentro da função que monta o `teiaResearchContext` (onde `companyData.qsa` está disponível), adicionar:

```typescript
// NOVO: coleta dados LinkedIn dos sócios para enriquecer o prompt
const linkedinBlocks: string[] = [];

if (companyData.qsa && companyData.qsa.length > 0) {
  const linkedinPromises = companyData.qsa
    .filter(p => p.name)
    .slice(0, 5) // máximo 5 sócios para não estourar timeout
    .map(async partner => {
      try {
        const resp = await fetch(`${apiBase}/api/linkedin-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            socioName: partner.name,
            companyName: company,
            maxResults: 1,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (!data.profiles || data.profiles.length === 0) return null;

        const p = data.profiles[0];
        const currentRole = p.currentPosition
          ? `${p.currentPosition.title} na ${p.currentPosition.companyName}`
          : p.headline;

        return [
          `<SOCIO nome="${partner.name}">`,
          `  <headline>${p.headline}</headline>`,
          `  <cargo>${currentRole}</cargo>`,
          `  <localizacao>${p.location ?? 'N/D'}</localizacao>`,
          p.skills?.length ? `  <skills>${p.skills.join(', ')}</skills>` : '',
          `  <perfil>${p.linkedinUrl}</perfil>`,
          `</SOCIO>`,
        ]
          .filter(Boolean)
          .join('\n');
      } catch {
        return null;
      }
    });

  const results = await Promise.all(linkedinPromises);
  for (const r of results) {
    if (r) linkedinBlocks.push(r);
  }
}

// Injetar no contextHint ou no teiaResearchContext
const linkedinContext =
  linkedinBlocks.length > 0
    ? `<linkedin_data>\nDados reais extraídos do LinkedIn para os sócios/administradores do QSA:\n\n${linkedinBlocks.join('\n\n')}\n</linkedin_data>`
    : '';
```

- [ ] **Step 2: Injetar linkedinContext no prompt dos módulos**

O `linkedinContext` deve ser adicionado ao `teiaResearchContext.text` (que alimenta TODOS os módulos), ou especificamente ao contexto do módulo `MAPEAMENTO_DECISORES` e `CAMINHO_DE_VENDA`.

Se houver um objeto de contexto compartilhado, adicionar:

```typescript
if (linkedinContext) {
  // Adiciona ao seed context que alimenta todos os módulos
  teiaResearchContext.text = `${teiaResearchContext.text}\n\n${linkedinContext}`;
}
```

- [ ] **Step 3: Rodar typecheck**

```bash
npm run typecheck
```

Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add features/dossier/waterfall-orchestrator.ts
git commit -m "feat: injeta dados LinkedIn dos sócios no contexto do waterfall"
```

---

## Task 7: Configurar APIFY_TOKEN no Vercel

- [ ] **Step 1: Adicionar env var via CLI**

```bash
vercel env add APIFY_TOKEN
```

Valor: `<APIFY_TOKEN>` (não versionar o valor real).

Selecionar: todos os environments (production, preview, development).

- [ ] **Step 2: Verificar**

```bash
vercel env ls
```

Expected: `APIFY_TOKEN` aparece na lista.

- [ ] **Step 3: Commit (se houver .env.example para atualizar)**

Não necessário — token já está no MCP local e será injetado via Vercel.

---

## Verificação Final

- [ ] **1. Typecheck:** `npm run typecheck` — zero erros
- [ ] **2. Testes:** `npm test` — todos passam (existentes + novos)
- [ ] **3. Preview Vercel:**
  - Fazer deploy do branch `codex/cnpj-socios-todos-cnpjs`
  - Buscar CNPJ da Scheffer (`04.733.767/0001-80`)
  - Verificar cards LinkedIn aparecendo com foto, headline, skills
  - Verificar CAMINHO DE VENDA mencionando nomes reais de decisores
- [ ] **4. Cache:** Segunda pesquisa do mesmo CNPJ deve retornar instantaneamente (`cached: true`)
- [ ] **5. Custo:** ~$0.004/sócio na primeira busca, $0 nas subsequentes (cache 30 dias)
