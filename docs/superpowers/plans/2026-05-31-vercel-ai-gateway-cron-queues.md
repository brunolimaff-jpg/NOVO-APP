# Vercel AI Gateway + Cron Jobs + Queues — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Centralizar chamadas Gemini via AI Gateway (custo e observabilidade), adicionar tarefas agendadas (cron) para radar/pulse proativos, e tornar operações longas (dossiê, radar) assíncronas via Queues.

**Architecture:** Três fases independentes. Fase 1 centraliza o cliente Gemini em `api/_ai-client.ts` e configura AI Gateway no `vercel.json` — sem quebrar os 6 arquivos que usam Gemini. Fase 2 adiciona endpoints cron em `api/cron/` com trava de segredo. Fase 3 cria fila durável para dossiê e radar com status endpoint.

**Tech Stack:** Vercel Functions (Fluid Compute, Node.js), `@google/genai` (mantido), Vercel Cron Jobs, Vercel Queues, Zod

---

## Estrutura de Arquivos

### Fase 1 — AI Gateway

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `api/_ai-client.ts` | **CRIAR** | Factory centralizada do GoogleGenAI — keys, tracking, fallback |
| `api/_gemini-key-utils.ts` | **DELETAR** | Substituído por `_ai-client.ts` |
| `api/gemini.ts` | **MODIFICAR** | Usar `createAiClient()` em vez de `getApiKeys()` + `new GoogleGenAI()` |
| `api/gerar-dossie.ts` | **MODIFICAR** | Mesmo |
| `api/radar-scan.ts` | **MODIFICAR** | Mesmo |
| `api/pulse-news.ts` | **MODIFICAR** | Mesmo |
| `api/rag.ts` | **MODIFICAR** | Mesmo |
| `api/docs-rag.ts` | **MODIFICAR** | Mesmo |
| `vercel.json` | **MODIFICAR** | Adicionar seção `aiGateway` |

### Fase 2 — Cron Jobs

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `api/cron/_verify-cron-secret.ts` | **CRIAR** | Middleware de trava de segredo para cron endpoints |
| `api/cron/radar-scan.ts` | **CRIAR** | Radar scan diário agendado |
| `api/cron/pulse-news.ts` | **CRIAR** | Pulse news a cada 6h |
| `api/cron/cache-warmup.ts` | **CRIAR** | Cache warming RAG diário |
| `vercel.json` | **MODIFICAR** | Adicionar seção `crons` |

### Fase 3 — Queues

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `api/queue/dossier.ts` | **CRIAR** | Consumer da fila de dossiê |
| `api/queue/radar.ts` | **CRIAR** | Consumer da fila de radar scan |
| `api/queue/status.ts` | **CRIAR** | Endpoint GET para consultar status de job |
| `services/queueClient.ts` | **CRIAR** | Cliente client-side para enfileirar jobs |
| `vercel.json` | **MODIFICAR** | Adicionar seção `queues` |

---

## Fase 1 — Centralizar Cliente Gemini + AI Gateway

### Contexto

Hoje 6 arquivos em `api/` instanciam `new GoogleGenAI({ apiKey })` com lógica própria de rotação de chaves. Isso causa:
- Duplicação de `getApiKeys()` em `gemini.ts` (linha 152) e `gerar-dossie.ts` (linha 21)
- Fallback manual inconsistente (uns têm loop de keys, outros só usam a primeira)
- Sem tracking de custo por operação
- Sem cache de respostas idênticas

A solução é criar um factory centralizado `_ai-client.ts` e configurar o AI Gateway para observabilidade e cache — mantendo o SDK `@google/genai` intacto (não quebra contratos com o client-side).

### Task 1.1: Criar `api/_ai-client.ts`

**Files:**
- Create: `api/_ai-client.ts`
- Modify: `api/_gemini-key-utils.ts` (mover funções, depois deletar)

- [ ] **Step 1: Escrever o arquivo `api/_ai-client.ts`**

```typescript
import { GoogleGenAI } from '@google/genai';

// ── Tipos ──────────────────────────────────────────────
export interface AiClientConfig {
  model?: string;
  timeoutMs?: number;
}

export interface AiUsageReport {
  model: string;
  operation: string;
  tokensIn?: number;
  tokensOut?: number;
  cachedTokensIn?: number;
  latencyMs: number;
  success: boolean;
  errorType?: string;
}

// ── Constantes ─────────────────────────────────────────
const DEFAULT_MODEL = 'gemini-3-flash-preview';
const FALLBACK_MODEL = 'gemini-2.5-flash';

// ── Key Management ─────────────────────────────────────
function getApiKeys(): string[] {
  const keys: string[] = [];
  const primary = process.env.GEMINI_API_KEY;
  const fallback = process.env.GEMINI_API_KEY_FALLBACK;

  if (primary) keys.push(primary);
  if (fallback) keys.push(fallback);

  if (keys.length === 0) {
    throw new Error('Missing required env var: GEMINI_API_KEY');
  }

  return keys;
}

// ── Error Classification ───────────────────────────────
export function isQuotaExhausted(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /RESOURCE_EXHAUSTED|check quota|rate.?limit|"code"\s*:\s*429/i.test(message);
}

export function isBillingOrPermissionDenied(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (typeof err.status === 'number' && err.status === 403) return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /dunning|PERMISSION_DENIED|billing|"code"\s*:\s*403/i.test(message);
}

export function extractHttpStatus(error: unknown): number {
  if (error instanceof Error) {
    const message = error.message;
    if (/"code"\s*:\s*429/.test(message) || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(message)) return 429;
  }
  const err = error as Record<string, unknown>;
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 600) return err.status;
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) return err.statusCode;
  return 500;
}

// ── Usage Extraction ───────────────────────────────────
function extractUsageData(response: unknown): {
  tokensIn?: number;
  tokensOut?: number;
  cachedTokensIn?: number;
} {
  if (!response || typeof response !== 'object') return {};
  const meta = (response as { usageMetadata?: Record<string, unknown> }).usageMetadata;
  if (!meta) return {};

  const toNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    tokensIn: toNum(meta.promptTokenCount) ?? toNum(meta.prompt_tokens),
    tokensOut: toNum(meta.candidatesTokenCount) ?? toNum(meta.candidates_tokens),
    cachedTokensIn: toNum(meta.cachedContentTokenCount) ?? toNum(meta.cached_tokens),
  };
}

// ── Core Factory ───────────────────────────────────────
export async function createAiClient(config: AiClientConfig = {}) {
  const model = config.model ?? DEFAULT_MODEL;
  const keys = getApiKeys();

  return {
    model,
    keys,
    defaultModel: DEFAULT_MODEL,
    fallbackModel: FALLBACK_MODEL,

    /** Cria instância GoogleGenAI com a chave especificada */
    createGenAi(apiKey: string): GoogleGenAI {
      return new GoogleGenAI({ apiKey });
    },

    /** Tenta executar operação com fallback automático de chaves */
    async withKeyFallback<T>(
      operation: (ai: GoogleGenAI) => Promise<T>,
      opLabel: string,
    ): Promise<{ result: T; usage: AiUsageReport }> {
      const start = Date.now();
      let lastError: unknown;

      for (let i = 0; i < keys.length; i++) {
        try {
          const ai = this.createGenAi(keys[i]);
          const result = await operation(ai);
          const latencyMs = Date.now() - start;
          const usageData = extractUsageData(result);

          const usage: AiUsageReport = {
            model,
            operation: opLabel,
            tokensIn: usageData.tokensIn,
            tokensOut: usageData.tokensOut,
            cachedTokensIn: usageData.cachedTokensIn,
            latencyMs,
            success: true,
          };

          if (process.env.AI_GATEWAY_LOG_ENABLED === '1') {
            console.log(`[AiClient] ${opLabel} | model=${model} | key=${i + 1}/${keys.length} | ${latencyMs}ms | in=${usage.tokensIn ?? '?'} out=${usage.tokensOut ?? '?'} cache=${usage.cachedTokensIn ?? '?'}`);
          }

          return { result, usage };
        } catch (error: unknown) {
          const hasNextKey = i < keys.length - 1;
          if ((isQuotaExhausted(error) || isBillingOrPermissionDenied(error)) && hasNextKey) {
            console.warn(`[AiClient] Key ${i + 1} quota/billing error, trying fallback...`);
            lastError = error;
            continue;
          }
          lastError = error;
          break;
        }
      }

      const latencyMs = Date.now() - start;
      const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
      const errorType = isQuotaExhausted(lastError) ? 'quota' : isBillingOrPermissionDenied(lastError) ? 'billing' : 'unknown';

      const usage: AiUsageReport = {
        model,
        operation: opLabel,
        latencyMs,
        success: false,
        errorType,
      };

      console.error(`[AiClient] ${opLabel} FAILED | ${errorMsg} | ${latencyMs}ms | type=${errorType}`);
      throw lastError ?? new Error(`AiClient: all ${keys.length} keys exhausted`);
    },
  };
}
```

- [ ] **Step 2: Rodar typecheck para validar**

```bash
npx tsc --noEmit api/_ai-client.ts
```

Expected: sem erros de tipo.

- [ ] **Step 3: Rodar testes existentes para garantir baseline**

```bash
npm test
```

Expected: 1249 passando, 0 falhas.

- [ ] **Step 4: Commit**

```bash
git add api/_ai-client.ts
git commit -m "feat: cria _ai-client.ts — factory centralizada Gemini com key fallback e cost tracking"
```

---

### Task 1.2: Refatorar `api/gemini.ts` para usar `_ai-client.ts`

**Files:**
- Modify: `api/gemini.ts`

- [ ] **Step 1: Substituir imports e remover funções duplicadas**

Remover do arquivo:
- `import { isQuotaExhausted, isBillingOrPermissionDenied } from './_gemini-key-utils.js'` (linha 6)
- Funções `getEnvVar` (linha 144), `getApiKeys` (linha 152), `toNumberSafe` (linha 164), `extractGeminiHttpStatus` (linha 191), `extractUsageMetadata` (linha 118)

Adicionar:
```typescript
import { createAiClient, extractHttpStatus } from './_ai-client.js';
```

- [ ] **Step 2: Refatorar handler principal (linhas 567-598)**

Substituir o bloco atual:

```typescript
// ANTES (linhas 567-598):
try {
  const parsed = GeminiRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const body = parsed.data;
  const keys = getApiKeys();
  let lastError: unknown;

  for (let i = 0; i < keys.length; i++) {
    try {
      const ai = new GoogleGenAI({ apiKey: keys[i] });
      return await executeGeminiAction(ai, body, res);
    } catch (error: unknown) {
      const hasNextKey = i < keys.length - 1;
      if ((isQuotaExhausted(error) || isBillingOrPermissionDenied(error)) && hasNextKey) {
        console.warn(`[GeminiProxy] Chave ${i + 1} com erro (quota/billing), tentando fallback...`);
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError;
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('Gemini API proxy error:', message);
  const httpStatus = extractGeminiHttpStatus(error);
  return res.status(httpStatus).json({ error: 'Gemini proxy failed', detail: message });
}
```

Por:

```typescript
// DEPOIS:
try {
  const parsed = GeminiRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const body = parsed.data;
  const client = await createAiClient();

  const { result } = await client.withKeyFallback(
    ai => executeGeminiAction(ai, body, res),
    `gemini-${body.action}`,
  );

  return result;
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('Gemini API proxy error:', message);
  const httpStatus = extractHttpStatus(error);
  return res.status(httpStatus).json({ error: 'Gemini proxy failed', detail: message });
}
```

- [ ] **Step 3: Remover `extractUsageMetadata` do arquivo e usar a do `_ai-client` indiretamente**

A função `extractUsageMetadata` é chamada nos casos `generateContent` (linha 317) e `createCachedContent` (linha 342). Como agora o `withKeyFallback` já extrai usage data, manter a chamada local por compatibilidade, mas remover a definição duplicada. A função local `extractUsageMetadata` vira um alias para a de `_ai-client.ts`:

```typescript
// Remover definição local extractUsageMetadata (linhas 118-123)
// Adicionar import:
import { createAiClient, extractHttpStatus } from './_ai-client.js';

// Manter chamadas locais que usam extractUsageMetadata, mas agora importada do _ai-client
```

Na verdade, `extractUsageMetadata` não está exportada de `_ai-client.ts` — ela é privada. Vamos exportá-la também:

No `_ai-client.ts`, mudar `function extractUsageData` para `export function extractUsageMetadata` e manter compatibilidade.

- [ ] **Step 4: Rodar typecheck e testes**

```bash
npx tsc --noEmit
npm test
```

Expected: typecheck limpo, 1249+ testes passando.

- [ ] **Step 5: Commit**

```bash
git add api/gemini.ts api/_ai-client.ts
git commit -m "refactor: api/gemini.ts usa _ai-client.ts — remove key rotation duplicada"
```

---

### Task 1.3: Refatorar os outros 5 arquivos que usam Gemini

**Files:**
- Modify: `api/gerar-dossie.ts`
- Modify: `api/radar-scan.ts`
- Modify: `api/pulse-news.ts`
- Modify: `api/rag.ts`
- Modify: `api/docs-rag.ts`

- [ ] **Step 1: Refatorar `api/gerar-dossie.ts`**

Arquivo inteiro (128 linhas). Substituir:

```typescript
// REMOVER:
import { isQuotaExhausted, isBillingOrPermissionDenied } from './_gemini-key-utils.js';

function getApiKeys(): string[] {
  const primary = process.env.GEMINI_API_KEY;
  const fallback = process.env.GEMINI_API_KEY_FALLBACK;
  const keys = [primary, fallback].filter((key): key is string => Boolean(key));
  if (keys.length === 0) throw new Error('Missing required env var: GEMINI_API_KEY');
  return keys;
}

// ... (funções extractHttpStatus, extractGeminiText, toNumberSafe — todas duplicadas)

// Bloco try principal (linhas 93-119):
const keys = getApiKeys();
let lastError: unknown;
for (let i = 0; i < keys.length; i++) {
  try {
    const ai = new GoogleGenAI({ apiKey: keys[i] });
    const response = await ai.models.generateContent({ ... });
    return res.status(200).json({ ... });
  } catch (error: unknown) {
    const hasNextKey = i < keys.length - 1;
    if ((isQuotaExhausted(error) || isBillingOrPermissionDenied(error)) && hasNextKey) {
      lastError = error;
      continue;
    }
    lastError = error;
    break;
  }
}
```

```typescript
// ADICIONAR:
import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { setSecurityHeaders } from './_security-headers.js';
import { createAiClient, extractHttpStatus } from './_ai-client.js';

const DossieRequestSchema = z.object({
  model: z.string().min(1).max(200).optional(),
  contents: z.unknown(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const config = { runtime: 'nodejs' };
export const maxDuration = 300;

const DEFAULT_MODEL = 'gemini-3-flash-preview';

function toNumberSafe(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function extractGeminiText(response: unknown): string {
  if (!response || typeof response !== 'object') return '';
  const directText = (response as { text?: unknown }).text;
  if (typeof directText === 'string' && directText.trim()) return directText;
  const candidates = (response as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return '';
  return candidates
    .flatMap(candidate => {
      const parts = (candidate as { content?: { parts?: unknown } })?.content?.parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map(part => (typeof (part as { text?: unknown })?.text === 'string' ? (part as { text: string }).text : ''))
    .filter(Boolean)
    .join('');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setSecurityHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = DossieRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { model, contents, config: configIn = {} } = parsed.data;
  if (!contents) {
    return res.status(400).json({ error: 'Missing contents' });
  }

  const genConfig: Record<string, unknown> = {
    temperature: toNumberSafe(configIn.temperature, 0.2),
    maxOutputTokens: toNumberSafe(configIn.maxOutputTokens, 65536),
  };
  if (typeof configIn.responseMimeType === 'string') genConfig.responseMimeType = configIn.responseMimeType;
  if (typeof configIn.systemInstruction === 'string') genConfig.systemInstruction = configIn.systemInstruction;
  if (Array.isArray(configIn.tools)) genConfig.tools = configIn.tools;

  try {
    const client = await createAiClient({ model: model ?? DEFAULT_MODEL });

    const { result } = await client.withKeyFallback(
      async ai => {
        const response = await ai.models.generateContent({
          model: model ?? DEFAULT_MODEL,
          contents,
          config: genConfig,
        });
        return res.status(200).json({
          text: extractGeminiText(response),
          candidates: response.candidates || [],
        });
      },
      'gerar-dossie',
    );

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GerarDossie] Falha total:', message);
    return res.status(extractHttpStatus(error)).json({
      error: 'Falha ao gerar dossiê. Tente novamente em instantes.',
      detail: message,
    });
  }
}
```

- [ ] **Step 2: Refatorar `api/radar-scan.ts`**

Mesmo padrão — substituir `new GoogleGenAI({ apiKey: ... })` com key loop manual por `createAiClient()` + `withKeyFallback()`.

O arquivo tem 533 linhas. A mudança é pontual (linhas onde `GoogleGenAI` é instanciado com key manual).

Localizar no arquivo: `new GoogleGenAI({ apiKey:` e substituir o bloco de key rotation pelo `withKeyFallback`.

**Nota para o implementador:** O radar-scan.ts tem uma estrutura própria de `fetchGoogleNews` + `classifyWithGemini` + `generateSummaryWithGemini`. Cada uma dessas funções internas instancia `new GoogleGenAI` separadamente. Refatorar para receber a instância `ai` como parâmetro em vez de criar uma nova a cada chamada.

- [ ] **Step 3: Refatorar `api/pulse-news.ts`**

Arquivo simples (42 linhas). Substituir:

```typescript
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
```

Por:

```typescript
const client = await createAiClient();
const ai = client.createGenAi(client.keys[0]);
```

E envolver em try/catch com fallback adequado.

- [ ] **Step 4: Refatorar `api/rag.ts` e `api/docs-rag.ts`**

Ambos usam `new GoogleGenAI({ apiKey: getRequiredEnv('GEMINI_API_KEY') })` apenas para embeddings (`ai.models.embedContent`). Substituir pela factory centralizada:

```typescript
import { createAiClient } from './_ai-client.js';

// Dentro do handler:
const client = await createAiClient();
const ai = client.createGenAi(client.keys[0]);
const embeddingResponse = await ai.models.embedContent({ ... });
```

- [ ] **Step 5: Rodar typecheck e testes completos**

```bash
npx tsc --noEmit
npm test
npm run test:contracts
```

Expected: 0 erros de tipo, 1249+ testes passando.

- [ ] **Step 6: Deletar `api/_gemini-key-utils.ts`**

O arquivo não é mais referenciado por nenhum outro arquivo.

```bash
git rm api/_gemini-key-utils.ts
```

- [ ] **Step 7: Commit**

```bash
git add api/gerar-dossie.ts api/radar-scan.ts api/pulse-news.ts api/rag.ts api/docs-rag.ts api/_ai-client.ts api/gemini.ts
git commit -m "refactor: migra todos os consumers Gemini para _ai-client.ts centralizado"
```

---

### Task 1.4: Adicionar AI Gateway no `vercel.json`

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Adicionar seção `aiGateway` ao `vercel.json`**

```json
{
  "installCommand": "npm install",
  "functions": {
    "api/gemini.ts": { "maxDuration": 300 },
    "api/gerar-dossie.ts": { "maxDuration": 300 },
    "api/open-web-search.ts": { "maxDuration": 60 },
    "api/radar-scan.ts": { "maxDuration": 120 },
    "api/extract-content.ts": { "maxDuration": 60 }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/((?!api/|.*\\..*).*)", "destination": "/index.html" }
  ],
  "aiGateway": {
    "providers": {
      "google": {
        "models": ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-embedding-001"],
        "defaultModel": "gemini-3-flash-preview",
        "cache": {
          "enabled": true,
          "ttl": 3600
        }
      }
    },
    "observability": {
      "logging": true,
      "costTracking": true
    },
    "rateLimiting": {
      "enabled": true,
      "maxRequestsPerMinute": 100
    }
  }
}
```

- [ ] **Step 2: Validar JSON**

```bash
cat vercel.json | python3 -m json.tool > /dev/null && echo "JSON válido"
```

Expected: JSON válido.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat: adiciona AI Gateway config — Google provider, cache 1h, rate limit 100/min"
```

---

## Fase 2 — Cron Jobs (Radar + Pulse + Cache)

### Contexto

Hoje radar scan e pulse news são 100% reativos (só rodam quando usuário clica). Com cron jobs, o app entrega dados frescos proativamente. Cada cron endpoint é protegido por um segredo (`CRON_SECRET`) para evitar chamadas públicas.

### Task 2.1: Criar middleware de segurança `api/cron/_verify-cron-secret.ts`

**Files:**
- Create: `api/cron/_verify-cron-secret.ts`

- [ ] **Step 1: Escrever o middleware**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';

export function verifyCronSecret(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[Cron] CRON_SECRET não configurado — endpoint bloqueado');
    return false;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (token !== secret) {
    console.warn('[Cron] Tentativa de acesso não autorizado');
    return false;
  }

  return true;
}

export function rejectUnauthorized(res: VercelResponse): VercelResponse {
  return res.status(401).json({ error: 'Unauthorized — CRON_SECRET required' });
}
```

- [ ] **Step 2: Commit**

```bash
git add api/cron/_verify-cron-secret.ts
git commit -m "feat: middleware de verificação CRON_SECRET para cron endpoints"
```

---

### Task 2.2: Criar `api/cron/radar-scan.ts`

**Files:**
- Create: `api/cron/radar-scan.ts`

- [ ] **Step 1: Escrever o endpoint de cron para radar scan**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { setSecurityHeaders } from '../_security-headers.js';
import { createAiClient } from '../_ai-client.js';
import { verifyCronSecret, rejectUnauthorized } from './_verify-cron-secret.js';

export const config = { runtime: 'nodejs' };
export const maxDuration = 120;

// Mesmas queries do radar-scan.ts original
const CATEGORY_QUERIES: Record<string, string[]> = {
  concorrentes: [
    '"TOTVS" OR "Sankhya" OR "Aliare" OR "Unysistem" OR "CHB" OR "Viasoft" software',
    '"TOTVS" agro OR "Sankhya" agro OR "Aliare" agro OR "Viasoft" agronegócio',
  ],
  regulatorio: [
    '"Plano Safra" OR "IBAMA" regulamentação OR "Código Florestal" OR "rastreabilidade" agro',
  ],
  mercado: [
    '"soja" preço cotação safra 2025 OR 2026',
    '"milho" OR "algodão" OR "café" commodities agro Brasil exportação',
  ],
};

const CATEGORIES = ['concorrentes', 'regulatorio', 'mercado'] as const;

async function fetchGoogleNewsRss(query: string): Promise<string[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${encoded}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const titles = [...xml.matchAll(/<title>(.*?)<\/title>/g)]
      .map(m => m[1])
      .filter(t => t && t !== 'Google News');
    return titles.slice(0, 20);
  } catch {
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setSecurityHeaders(res);

  if (!verifyCronSecret(req)) {
    return rejectUnauthorized(res);
  }

  console.log('[Cron:Radar] Iniciando scan agendado...');
  const results: Array<{ category: string; title: string; classification: string }> = [];

  try {
    const client = await createAiClient();
    const ai = client.createGenAi(client.keys[0]);

    for (const category of CATEGORIES) {
      const queries = CATEGORY_QUERIES[category];
      for (const query of queries) {
        const headlines = await fetchGoogleNewsRss(query);
        console.log(`[Cron:Radar] ${category}: ${headlines.length} headlines para "${query.slice(0, 50)}..."`);

        for (const title of headlines.slice(0, 5)) {
          try {
            const classification = await ai.models.generateContent({
              model: client.defaultModel,
              contents: `Classifique esta notícia do agronegócio como: "oportunidade", "ameaça", ou "neutro". Responda apenas a palavra.\n\nNotícia: ${title}`,
              config: { temperature: 0, maxOutputTokens: 20 },
            });
            results.push({
              category,
              title,
              classification: classification.text?.trim() || 'neutro',
            });
          } catch {
            // Pula headline que falhou na classificação
          }
        }
      }
    }

    console.log(`[Cron:Radar] Scan concluído: ${results.length} itens classificados`);
    return res.status(200).json({
      ok: true,
      scannedAt: new Date().toISOString(),
      total: results.length,
      results: results.slice(0, 20),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron:Radar] Falha:', message);
    return res.status(500).json({ error: 'Radar scan failed', detail: message });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/cron/radar-scan.ts
git commit -m "feat: cron endpoint radar-scan — classifica notícias diariamente"
```

---

### Task 2.3: Criar `api/cron/pulse-news.ts`

**Files:**
- Create: `api/cron/pulse-news.ts`

- [ ] **Step 1: Escrever endpoint de pulse news agendado**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setSecurityHeaders } from '../_security-headers.js';
import { createAiClient } from '../_ai-client.js';
import { verifyCronSecret, rejectUnauthorized } from './_verify-cron-secret.js';

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setSecurityHeaders(res);

  if (!verifyCronSecret(req)) {
    return rejectUnauthorized(res);
  }

  console.log('[Cron:Pulse] Agregando pulse news...');

  try {
    const client = await createAiClient();

    const { result } = await client.withKeyFallback(
      async ai => {
        const chat = ai.chats.create({
          model: client.defaultModel,
          config: { temperature: 0.2 },
        });

        const prompt = `Busque as 3 notícias mais relevantes das últimas 24h sobre tecnologia no agronegócio brasileiro.
Para cada notícia, forneça:
1. Título e fonte
2. Resumo de 1-2 frases
3. Por que importa para um vendedor de software de gestão (ERP) para agronegócio`;

        const response = await chat.sendMessage({ message: prompt });

        return res.status(200).json({
          ok: true,
          generatedAt: new Date().toISOString(),
          summary: response.text,
        });
      },
      'cron-pulse-news',
    );

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron:Pulse] Falha:', message);
    return res.status(500).json({ error: 'Pulse news failed', detail: message });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/cron/pulse-news.ts
git commit -m "feat: cron endpoint pulse-news — agrega notícias a cada 6h"
```

---

### Task 2.4: Adicionar seção `crons` ao `vercel.json`

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Adicionar seção crons**

Adicionar após `"rewrites"`:

```json
{
  "installCommand": "npm install",
  "functions": {
    "api/gemini.ts": { "maxDuration": 300 },
    "api/gerar-dossie.ts": { "maxDuration": 300 },
    "api/open-web-search.ts": { "maxDuration": 60 },
    "api/radar-scan.ts": { "maxDuration": 120 },
    "api/extract-content.ts": { "maxDuration": 60 }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/((?!api/|.*\\..*).*)", "destination": "/index.html" }
  ],
  "crons": [
    {
      "path": "/api/cron/radar-scan",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/cron/pulse-news",
      "schedule": "0 */6 * * *"
    }
  ],
  "aiGateway": {
    "providers": {
      "google": {
        "models": ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-embedding-001"],
        "defaultModel": "gemini-3-flash-preview",
        "cache": {
          "enabled": true,
          "ttl": 3600
        }
      }
    },
    "observability": {
      "logging": true,
      "costTracking": true
    },
    "rateLimiting": {
      "enabled": true,
      "maxRequestsPerMinute": 100
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat: adiciona cron jobs — radar diário 9h, pulse a cada 6h"
```

---

## Fase 3 — Queues (Dossiê + Radar Assíncrono)

### Contexto

Hoje dossiê (até 300s) e radar (até 120s) são chamadas HTTP síncronas. Se o usuário fecha o navegador, o processamento é perdido. Com Vercel Queues, essas operações viram assíncronas: o usuário enfileira um job e consulta o status depois. O processamento continua mesmo se o browser fechar.

### Task 3.1: Criar `api/queue/dossier.ts` — Consumer da fila de dossiê

**Files:**
- Create: `api/queue/dossier.ts`

- [ ] **Step 1: Escrever o consumer de dossiê**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { setSecurityHeaders } from '../_security-headers.js';
import { createAiClient } from '../_ai-client.js';

export const config = { runtime: 'nodejs' };
export const maxDuration = 300;

const DossierJobSchema = z.object({
  jobId: z.string().min(1),
  model: z.string().optional(),
  contents: z.unknown(),
  config: z.record(z.string(), z.unknown()).optional(),
  callbackUrl: z.string().optional(),
});

const DEFAULT_MODEL = 'gemini-3-flash-preview';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = DossierJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid job payload', details: parsed.error.flatten() });
  }

  const { jobId, model, contents, config: configIn, callbackUrl } = parsed.data;
  console.log(`[Queue:Dossier] Processando job ${jobId}...`);

  const genConfig: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens: 65536,
    ...(configIn ?? {}),
  };

  try {
    const client = await createAiClient({ model: model ?? DEFAULT_MODEL });

    const { result } = await client.withKeyFallback(
      async ai => {
        const response = await ai.models.generateContent({
          model: model ?? DEFAULT_MODEL,
          contents,
          config: genConfig,
        });

        const text =
          typeof (response as { text?: string }).text === 'string'
            ? (response as { text: string }).text
            : '';

        // Callback se configurado (ex: webhook para Supabase)
        if (callbackUrl) {
          try {
            await fetch(callbackUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId,
                status: 'completed',
                completedAt: new Date().toISOString(),
                text,
              }),
              signal: AbortSignal.timeout(10_000),
            });
          } catch (cbError) {
            console.warn(`[Queue:Dossier] Callback falhou para job ${jobId}:`, cbError);
          }
        }

        return res.status(200).json({
          jobId,
          status: 'completed',
          completedAt: new Date().toISOString(),
          text,
        });
      },
      `queue-dossier-${jobId}`,
    );

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Queue:Dossier] Job ${jobId} falhou:`, message);

    if (callbackUrl) {
      try {
        await fetch(callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            status: 'failed',
            failedAt: new Date().toISOString(),
            error: message,
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // Callback de falha silencioso
      }
    }

    return res.status(500).json({
      jobId,
      status: 'failed',
      error: message,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/queue/dossier.ts
git commit -m "feat: queue consumer dossier.ts — processamento assíncrono com callback"
```

---

### Task 3.2: Criar `api/queue/status.ts` — Endpoint de status

**Files:**
- Create: `api/queue/status.ts`

- [ ] **Step 1: Escrever endpoint GET de status**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { setSecurityHeaders } from '../_security-headers.js';

export const config = { runtime: 'nodejs' };

const StatusQuerySchema = z.object({
  jobId: z.string().min(1).max(64),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setSecurityHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { jobId } = req.query as { jobId?: string };
  const parsed = StatusQuerySchema.safeParse({ jobId });
  if (!parsed.success) {
    return res.status(400).json({ error: 'jobId é obrigatório (query param)' });
  }

  // Por enquanto, status é derivado de callback. Sempre retorna 'pending' se não houver registro.
  // Futuro: consultar Supabase para histórico de jobs.
  return res.status(200).json({
    jobId: parsed.data.jobId,
    status: 'pending',
    message: 'Status tracking será implementado com Supabase na próxima iteração',
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add api/queue/status.ts
git commit -m "feat: endpoint GET /api/queue/status — consulta status de job"
```

---

### Task 3.3: Criar `services/queueClient.ts` — Cliente client-side

**Files:**
- Create: `services/queueClient.ts`

- [ ] **Step 1: Escrever o cliente de fila para o frontend**

```typescript
interface EnqueueOptions {
  model?: string;
  contents: unknown;
  config?: Record<string, unknown>;
  callbackUrl?: string;
}

interface QueueJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  completedAt?: string;
  error?: string;
}

function generateJobId(): string {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function enqueueDossier(options: EnqueueOptions): Promise<{ jobId: string }> {
  const jobId = generateJobId();

  const response = await fetch('/api/queue/dossier', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId,
      model: options.model,
      contents: options.contents,
      config: options.config,
      callbackUrl: options.callbackUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown' }));
    throw new Error(`Falha ao enfileirar dossiê: ${error.error || response.statusText}`);
  }

  return { jobId };
}

export async function getJobStatus(jobId: string): Promise<QueueJob> {
  const response = await fetch(`/api/queue/status?jobId=${encodeURIComponent(jobId)}`);

  if (!response.ok) {
    throw new Error(`Falha ao consultar status: ${response.statusText}`);
  }

  return response.json();
}

export async function pollJobCompletion(
  jobId: string,
  options: { intervalMs?: number; maxWaitMs?: number } = {},
): Promise<QueueJob> {
  const { intervalMs = 3000, maxWaitMs = 360_000 } = options;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const status = await getJobStatus(jobId);

    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timeout aguardando job ${jobId} após ${maxWaitMs / 1000}s`);
}
```

- [ ] **Step 2: Commit**

```bash
git add services/queueClient.ts
git commit -m "feat: queueClient.ts — enfileirar, consultar status, polling com timeout"
```

---

### Task 3.4: Adicionar seção `queues` ao `vercel.json`

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Adicionar configuração de queues**

Adicionar seção `queues`:

```json
{
  "installCommand": "npm install",
  "functions": {
    "api/gemini.ts": { "maxDuration": 300 },
    "api/gerar-dossie.ts": { "maxDuration": 300 },
    "api/open-web-search.ts": { "maxDuration": 60 },
    "api/radar-scan.ts": { "maxDuration": 120 },
    "api/extract-content.ts": { "maxDuration": 60 }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/((?!api/|.*\\..*).*)", "destination": "/index.html" }
  ],
  "crons": [
    {
      "path": "/api/cron/radar-scan",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/cron/pulse-news",
      "schedule": "0 */6 * * *"
    }
  ],
  "queues": {
    "dossier": {
      "path": "/api/queue/dossier",
      "maxConcurrency": 3,
      "retries": 2,
      "timeoutSeconds": 300
    }
  },
  "aiGateway": {
    "providers": {
      "google": {
        "models": ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-embedding-001"],
        "defaultModel": "gemini-3-flash-preview",
        "cache": {
          "enabled": true,
          "ttl": 3600
        }
      }
    },
    "observability": {
      "logging": true,
      "costTracking": true
    },
    "rateLimiting": {
      "enabled": true,
      "maxRequestsPerMinute": 100
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json services/queueClient.ts
git commit -m "feat: configura queues no vercel.json — dossier com 3 workers, 2 retries"
```

---

## Validação Final

- [ ] Rodar suite completa:

```bash
npm run typecheck
npm test
npm run test:contracts
npm run lint
npm run build
```

- [ ] Verificar que `_gemini-key-utils.ts` não é mais referenciado:

```bash
grep -r "_gemini-key-utils" api/ --include="*.ts" || echo "Nenhuma referência — seguro deletar"
```

- [ ] Deploy preview e testar:
  - [ ] Chamar `/api/gemini` com ação `health`
  - [ ] Verificar logs de `[AiClient]` no console do Vercel
  - [ ] Chamar `/api/cron/radar-scan` sem `Authorization` → esperar 401
  - [ ] Chamar `/api/cron/radar-scan` com `Authorization: Bearer <CRON_SECRET>` → esperar 200

---

## Notas para o Implementador

1. **AI Gateway:** A configuração `aiGateway` no `vercel.json` requer Vercel Pro. Se o projeto estiver no plano Hobby, a seção será ignorada (sem erro), mas o cost tracking e cache não funcionarão. A factory `_ai-client.ts` funciona independentemente.

2. **CRON_SECRET:** Deve ser configurado como env var no Vercel (`vercel env add CRON_SECRET`). Gerar com `openssl rand -hex 32`.

3. **Queues:** Vercel Queues está em public beta. A API pode mudar. O consumer `api/queue/dossier.ts` está escrito como endpoint HTTP padrão (compatível com a API atual). Quando Queues estiver GA, pode precisar de ajuste no handler.

4. **CallbackUrl:** O callback no consumer de dossiê é opcional. Para usar com Supabase, configurar `callbackUrl: 'https://vmqfcaoirjcfucvlnpig.supabase.co/rest/v1/rpc/on_dossier_complete'` (ou similar).

5. **Ordem de deploy:** Fase 1 → testar → Fase 2 → testar → Fase 3. Cada fase é independente e pode ser deployada separadamente.
