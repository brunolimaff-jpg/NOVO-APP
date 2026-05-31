# Vercel AI Gateway — Integração Gradual no Senior Scout 360

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir o Vercel AI Gateway como camada de roteamento multi-provider, começando pelas chamadas simples (generateContent) e preservando funcionalidades críticas do `@google/genai` (grounding, function calling, cache).

**Architecture:** Abordagem híbrida e gradual. O `api/gemini.ts` ganha um segundo caminho: `generateContent` e `chatSendMessage` simples passam pelo AI SDK (`ai` + `@ai-sdk/google`). Funcionalidades Google-específicas (grounding, function calling com performWebSearch, foundation cache) continuam no `@google/genai`. O contrato externo não muda — o cliente (`geminiProxy.ts`) não sabe qual caminho foi usado.

**Por que gradual:** Grounding (Google Search), function calling (performWebSearch), e foundation cache são recursos proprietários do Gemini que o AI Gateway não replica. Migrá-los de uma vez quebraria funcionalidades de produção. A abordagem híbrida entrega o quick win (multi-provider, fallback) sem risco.

**Tech Stack:** `ai` + `@ai-sdk/google` para o caminho AI Gateway, `@google/genai` mantido para features avançadas

---

## File Structure

| Arquivo            | O que faz                                    | Ação          |
| ------------------ | -------------------------------------------- | ------------- |
| `api/gemini.ts`    | Serverless function — ponto único de entrada | **Modificar** |
| `package.json`     | Dependências                                 | **Modificar** |
| `config/models.ts` | IDs de modelo e routing multi-provider       | **Modificar** |

**Não mexer:**

- `services/geminiProxy.ts` — cliente frontend, contrato estável
- `services/gemini/*.ts` — orquestração, contrato estável

---

### Task 1: Instalar AI SDK + provider Google

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Instalar pacotes**

```bash
npm install ai @ai-sdk/google
```

- [ ] **Step 2: Verificar instalação**

```bash
npm ls ai @ai-sdk/google
```

Expected: ambos listados com versões.

- [ ] **Step 3: Typecheck para garantir compatibilidade**

```bash
npx tsc --noEmit
```

Expected: sem erros (ainda não alteramos código, só instalamos).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add ai + @ai-sdk/google for Vercel AI Gateway integration"
```

---

### Task 2: Atualizar config/models.ts — provider strings e routing

**Files:**

- Modify: `config/models.ts`

Atualmente `config/models.ts` usa strings simples como `'gemini-3-flash-preview'`. Precisamos de strings no formato `provider/model` para o AI Gateway, mantendo backward compat.

- [ ] **Step 1: Reescrever config/models.ts**

```typescript
// ── Provider model strings (formato Vercel AI Gateway) ──
const PROVIDER_MODELS = {
  gemini: {
    flashPreview: 'google/gemini-3-flash-preview',
    flash: 'google/gemini-2.5-flash',
    flashLite: 'google/gemini-2.5-flash-lite',
  },
  deepseek: {
    flash: 'deepseek/deepseek-v4-flash',
  },
} as const;

// ── Model routing ──
// Tarefas de volume/baixa complexidade → podem usar DeepSeek
// Tarefas complexas (deep research, dossiê) → Gemini
const ROUTING = {
  tactical: PROVIDER_MODELS.gemini.flashPreview,
  deepChat: PROVIDER_MODELS.gemini.flashPreview,
  deepResearch: PROVIDER_MODELS.gemini.flashPreview,
  router: PROVIDER_MODELS.gemini.flashPreview,
} as const;

// ── Interface pública (backward compat) ──
const DEFAULT_GEMINI_MODEL_ID = PROVIDER_MODELS.gemini.flashPreview;

export const MODEL_IDS = {
  router: ROUTING.router,
  tactical: ROUTING.tactical,
  deepChat: ROUTING.deepChat,
  deepResearch: ROUTING.deepResearch,
} as const;

export type GeminiModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];

export const ROUTER_MODEL_ID = MODEL_IDS.router;
export const TACTICAL_MODEL_ID = MODEL_IDS.tactical;
export const DEEP_CHAT_MODEL_ID = MODEL_IDS.deepChat;
export const STABLE_RESEARCH_MODEL_ID = MODEL_IDS.deepResearch;
export const LOADING_CURIOSITY_MODEL_ID = MODEL_IDS.router;

export interface MainChatModelSelectionInput {
  isDeepDive: boolean;
  isMegaPromptMessage: boolean;
  shouldForceDirectAnswer: boolean;
}

export function selectMainChatModelId({
  isDeepDive,
  isMegaPromptMessage,
  shouldForceDirectAnswer,
}: MainChatModelSelectionInput): GeminiModelId {
  if (isDeepDive || isMegaPromptMessage) return STABLE_RESEARCH_MODEL_ID;
  if (shouldForceDirectAnswer) return TACTICAL_MODEL_ID;
  return DEEP_CHAT_MODEL_ID;
}
```

- [ ] **Step 2: Verificar que nada quebrou nos imports**

```bash
npx tsc --noEmit
```

Expected: sem erros de tipo. O tipo `GeminiModelId` continua sendo `string`, compatível com tudo que já existe.

- [ ] **Step 3: Commit**

```bash
git add config/models.ts
git commit -m "feat: add provider-prefixed model strings for AI Gateway routing"
```

---

### Task 3: Adicionar caminho AI Gateway em api/gemini.ts (abordagem híbrida)

**Files:**

- Modify: `api/gemini.ts`

**Estratégia:** Adicionar uma função `executeViaAiGateway()` que lida com ações simples (`generateContent` sem tools, `chatSendMessage` sem grounding). As ações complexas continuam no `executeGeminiAction` existente. Um router decide qual caminho usar baseado na ação e nos parâmetros.

**O que NÃO muda:**

- Zod schemas de validação (linhas 8-45)
- `config.runtime`, `maxDuration` (linhas 47-51)
- Funções de sanitização: `stripInternalMarkersLocal`, `detectPromptLeakIndicatorsLocal`, `applyPromptLeakShieldLocal`
- `extractGeminiText`, `extractUsageMetadata`
- `getEnvVar`, `toNumberSafe`
- Handler principal com key rotation (linhas 519-599)
- `recordDiagnostics` action

- [ ] **Step 1: Adicionar imports do AI SDK**

Adicionar no topo do arquivo (após linha 4):

```typescript
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
```

- [ ] **Step 2: Adicionar helper que decide se usa AI Gateway**

Inserir após a função `toNumberSafe` (~linha 166):

```typescript
/**
 * Decide se esta chamada pode usar o AI Gateway ou precisa do SDK nativo.
 * AI Gateway: chamadas simples (generateContent sem tools, chat sem grounding)
 * SDK Nativo: grounding, function calling, cached content, health check
 */
function shouldUseAiGateway(body: ParsedBody): boolean {
  if (body.action === 'generateContent') {
    const config = (body.config ?? {}) as Record<string, unknown>;
    const hasTools = Array.isArray(config.tools) && config.tools.length > 0;
    const hasCachedContent = typeof config.cachedContent === 'string';
    return !hasTools && !hasCachedContent;
  }
  if (body.action === 'chatSendMessage') {
    const useGrounding = body.useGrounding ?? true;
    const useOpenWebSearch = body.useOpenWebSearch ?? false;
    return !useGrounding && !useOpenWebSearch;
  }
  return false;
}
```

- [ ] **Step 3: Adicionar função executeViaAiGateway**

Inserir após `shouldUseAiGateway`:

```typescript
async function executeViaAiGateway(body: ParsedBody, res: VercelResponse): Promise<VercelResponse> {
  if (body.action === 'generateContent') {
    const model = body.model ?? DEFAULT_GEMINI_MODEL;
    const contents = body.contents;

    if (!contents) {
      return res.status(400).json({ error: 'Missing contents' });
    }

    const prompt =
      typeof contents === 'string'
        ? contents
        : Array.isArray(contents)
          ? (contents as Array<{ text?: string }>).map(c => c?.text || '').join('\n')
          : JSON.stringify(contents);

    const configIn = (body.config ?? {}) as Record<string, unknown>;
    const systemInstruction = typeof configIn.systemInstruction === 'string' ? configIn.systemInstruction : undefined;

    const result = await generateText({
      model: google(model),
      prompt,
      system: systemInstruction,
      temperature: toNumberSafe(configIn.temperature, 0.2),
      maxOutputTokens: toNumberSafe(configIn.maxOutputTokens, 65536),
    });

    // Sanitização (usa as funções locais existentes)
    const leakShieldResult = applyPromptLeakShieldLocal(result.text);
    const finalText = leakShieldResult.blocked ? leakShieldResult.text : result.text;

    return res.status(200).json({
      text: finalText,
      candidates: [],
      usageMetadata: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
          }
        : undefined,
    });
  }

  if (body.action === 'chatSendMessage') {
    const model = body.model ?? DEFAULT_GEMINI_MODEL;
    const systemInstruction = body.systemInstruction ?? '';

    const result = await generateText({
      model: google(model),
      prompt: body.message,
      system: systemInstruction,
      temperature: 0.1,
      maxOutputTokens: 65536,
    });

    const leakShieldResult = applyPromptLeakShieldLocal(result.text);

    return res.status(200).json({
      text: leakShieldResult.text,
      groundingChunks: [],
      groundingUsed: false,
    });
  }

  return res.status(400).json({ error: 'Unsupported action for AI Gateway' });
}
```

- [ ] **Step 4: Adicionar router no handler principal**

No handler `executeGeminiAction`, adicionar dispatch condicional ANTES do switch existente. Localizar a função `executeGeminiAction` (linha 219) e adicionar no topo dela:

```typescript
async function executeGeminiAction(ai: GoogleGenAI, body: ParsedBody, res: VercelResponse): Promise<VercelResponse> {
  // ── AI Gateway path: chamadas simples sem features Google-específicas ──
  if (shouldUseAiGateway(body)) {
    return executeViaAiGateway(body, res);
  }

  // ── SDK Nativo path: grounding, function calling, cache ──
  switch (
    body.action
    // ... (código existente, inalterado)
  ) {
  }
}
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: sem erros de tipo.

- [ ] **Step 6: Rodar testes existentes**

```bash
npm test
```

Expected: todos os testes passam (a funcionalidade existente com grounding/function calling continua inalterada).

- [ ] **Step 7: Commit**

```bash
git add api/gemini.ts
git commit -m "feat: add AI Gateway path for simple generateContent/chat calls in api/gemini.ts"
```

---

### Task 4: Adicionar DeepSeek como fallback provider (opcional)

**Files:**

- Modify: `api/gemini.ts`
- Modify: `package.json`

Só executar depois que Task 3 estiver validada em staging/produção.

- [ ] **Step 1: Instalar provider DeepSeek**

```bash
npm install @ai-sdk/deepseek
```

- [ ] **Step 2: Adicionar import**

No topo de `api/gemini.ts`:

```typescript
import { deepseek } from '@ai-sdk/deepseek';
```

- [ ] **Step 3: Adicionar fallback em executeViaAiGateway**

No `case 'generateContent'` de `executeViaAiGateway`, envolver a chamada principal com try/catch:

```typescript
if (body.action === 'generateContent') {
  // ... (setup de prompt, systemInstruction, etc.) ...

  let result;
  try {
    result = await generateText({
      model: google(model),
      prompt,
      system: systemInstruction,
      temperature: toNumberSafe(configIn.temperature, 0.2),
      maxOutputTokens: toNumberSafe(configIn.maxOutputTokens, 65536),
    });
  } catch (error) {
    console.warn('[AI Gateway] Gemini failed, falling back to DeepSeek', {
      error: error instanceof Error ? error.message : String(error),
    });
    result = await generateText({
      model: deepseek('deepseek-v4-flash'),
      prompt: systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt,
      temperature: toNumberSafe(configIn.temperature, 0.2),
      maxOutputTokens: toNumberSafe(configIn.maxOutputTokens, 65536),
    });
  }
  // ... (resto da resposta) ...
}
```

- [ ] **Step 4: Commit**

```bash
git add api/gemini.ts package.json package-lock.json
git commit -m "feat: add DeepSeek fallback for generateContent via AI Gateway"
```

---

## Verificação

### Checklist de validação

- [ ] `npx tsc --noEmit` passa sem erros
- [ ] `npm test` passa (todos os testes existentes)
- [ ] `npm run dev` sobe sem erros no console
- [ ] Chat simples funciona (mensagem curta, sem grounding)
- [ ] Grounding/function calling continua funcionando (caminho SDK nativo)
- [ ] Geração de dossiê funciona (caminho SDK nativo)
- [ ] Health check do Gemini responde OK
- [ ] Verificar Vercel Dashboard → AI Gateway mostra chamadas

### Como testar localmente

```bash
# Terminal 1: dev server
npm run dev

# Terminal 2: testar endpoint
curl -X POST http://localhost:3000/api/gemini \
  -H "Content-Type: application/json" \
  -d '{"action":"health"}'

# Testar generateContent simples (deve ir pelo AI Gateway)
curl -X POST http://localhost:3000/api/gemini \
  -H "Content-Type: application/json" \
  -d '{"action":"generateContent","model":"gemini-3-flash-preview","contents":"Responda: qual a capital do Brasil?"}'

# Testar chat com grounding (deve ir pelo SDK nativo)
curl -X POST http://localhost:3000/api/gemini \
  -H "Content-Type: application/json" \
  -d '{"action":"chatSendMessage","message":"Quem ganhou a Copa de 2022?","useGrounding":true}'
```

### Rollback

Se algo quebrar em produção: `git revert` os commits desta branch. O código original com `@google/genai` funciona independentemente e não foi removido.
