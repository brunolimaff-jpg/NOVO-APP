---
type: licoes-aprendidas
area: code-review
data: 2026-05-28
sessao: revisao-60-prs-licoes-perdidas
tags:
  - licao
  - code-review
  - gemini
  - typescript
  - testing
  - vercel
  - react
  - serverless
---

# Licoes Aprendidas — Revisao de 60 PRs (2026-05-28)

Voltar para [[DECISIONS-Index]].

## Contexto

Revisao sistematica dos comentarios de review (Gemini Code Assist) nas ultimas 60 PRs mergeadas (#239-#306) para identificar padroes recorrentes que ainda nao estavam documentados como licoes aprendidas ou no CALIBER_LEARNINGS.md.

---

## Tabela de Licoes

| #   | Licao                                                                      | Ocorrencias                                      | Tipo               |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------ | ------------------ |
| 1   | **`signal.aborted` precisa de verificacao sincrona ANTES do async**        | PR #289, #303, #305                              | AbortSignal        |
| 2   | **Cache em memoria sem limite cresce indefinidamente**                     | PR #296 (Mermaid SVG), PR #243 (CNPJ serverless) | Memory/Performance |
| 3   | **`import.meta.env` dinâmico retorna `undefined` em build**                | PR #239                                          | Vite/Build         |
| 4   | **`Promise.all` em chamadas independentes — `allSettled` + merge parcial** | PR #241                                          | Resiliencia        |
| 5   | **`catch (err: any)` perde `message` — usar `unknown` + type guard**       | PR #255 (#2 arquivos)                            | TypeScript         |
| 6   | **Regex de parsing sem ancora (`^`) causa falso positivo**                 | PR #245, #248                                    | Regex              |
| 7   | **`console.warn` nao e substituto semantico de `console.log`**             | PR #263 (6 endpoints)                            | Logging            |
| 8   | **Rules of Hooks: hooks dentro de `map`/callback NUNCA funcionam**         | PR #286                                          | React              |
| 9   | **`console.error` silenciado globalmente em testes esconde warnings**      | PR #258                                          | Testing            |
| 10  | **Mock de Promise que nunca resolve causa memory leak em teste**           | PR #258                                          | Testing            |

---

## 1. `signal.aborted` precisa de verificacao sincrona ANTES do async

**Ocorrencias:** PR #289, #303, #305 (3 PRs)

**Problema:** `addEventListener('abort')` nao dispara se o `AbortSignal` **ja foi abortado** antes do listener ser registrado. O codigo assume que o callback do listener sempre sera chamado, mas se o signal entrou em estado terminal antes do `await`, o listener nunca executa e a Promise fica pendente para sempre.

```typescript
// ERRADO
function withAbortSignal<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    fn().then(resolve, reject); // Se signal ja abortou, addEventListener nunca dispara
  });
}

// CERTO
function withAbortSignal<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError')); // ← sincrono!
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    fn().then(resolve, reject);
  });
}
```

**Regra:** Toda criacao de Promise com `AbortSignal` DEVE verificar `signal.aborted` sincronamente ANTES de registrar o listener. O estado `aborted` e terminal — nao depende de event loop.

---

## 2. Cache em memoria sem limite cresce indefinidamente

**Ocorrencias:** PR #296 (`mermaidSvgCache` — cliente), PR #243 (`cache` Map — serverless)

**Problema:** Maps module-level em clientes (`mermaidSvgCache` no `MarkdownRenderer.tsx`) e em serverless functions (`cache` Map no `api/cnpj.ts`) crescem sem limite. No cliente, causa memory leak gradual. No serverless, o cache e perdido no recycle da funcao mas o Map acumula durante a vida util da instancia.

```typescript
// ERRADO
const mermaidSvgCache = new Map<string, string>(); // Sem limite

// CERTO (ou equivalente com LRU)
const MERMAID_CACHE_MAX = 50;
const mermaidSvgCache = new Map<string, string>();
function getCachedSvg(key: string): string | undefined {
  const val = mermaidSvgCache.get(key);
  if (val) mermaidSvgCache.delete(key); // re-insert to maintain LRU-like ordering
  mermaidSvgCache.set(key, val);
  return val;
}
function setCachedSvg(key: string, svg: string) {
  if (mermaidSvgCache.size >= MERMAID_CACHE_MAX) {
    const firstKey = mermaidSvgCache.keys().next().value;
    mermaidSvgCache.delete(firstKey);
  }
  mermaidSvgCache.set(key, svg);
}
```

**Regra:** Todo `Map` ou objeto usado como cache em memoria precisa de limite explicito (`MAX_ENTRIES`) e politica de eviccao (LRU, FIFO, ou TTL). Aplicavel tanto em clientes quanto em serverless.

---

## 3. `import.meta.env` dinâmico retorna `undefined` em build

**Ocorrencias:** PR #239 (`services/apiConfig.ts`)

**Problema:** Vite substitui `import.meta.env.VITE_*` estaticamente em tempo de build. Acesso dinâmico como `import.meta.env[key]` retorna `undefined` em producao porque o substituidor do Vite so reconhece acesso direto por chave literal.

```typescript
// ERRADO — retorna undefined em producao
function getEnv(key: string): string | undefined {
  return import.meta.env[key];
}

// CERTO
const envMap = {
  VITE_SCOUT_DIAGNOSTICS_ENABLED: import.meta.env.VITE_SCOUT_DIAGNOSTICS_ENABLED,
  VITE_GEMINI_API_KEY: import.meta.env.VITE_GEMINI_API_KEY,
  // ... todas as chaves explicitamente
} as const;
function getEnv(key: keyof typeof envMap): string | undefined {
  return envMap[key];
}
```

**Regra:** Nunca acessar `import.meta.env` com chave dinâmica. Usar um objeto tipado com acesso direto estatico para cada variavel. Acessos dinamicos so funcionam em dev e quebram silenciosamente em producao (Vite/HMR).

---

## 4. `Promise.all` em chamadas independentes — `allSettled` + merge parcial

**Ocorrencias:** PR #241 (`services/war-room/retrieval.ts`)

**Problema:** `Promise.all` em 2+ chamadas independentes (ex: RAG docs + global search) faz com que uma falha unica derrube o resultado inteiro. Se o Pinecone timeout, o usuario perde tambem a busca global que funcionou.

```typescript
// ERRADO — se uma falha, perde tudo
const [docs, global] = await Promise.all([searchDocs(query), searchGlobal(query)]);

// CERTO
const results = await Promise.allSettled([searchDocs(query), searchGlobal(query)]);
const [docs, global] = results.map(r => (r.status === 'fulfilled' ? r.value : []));
```

**Regra:** `Promise.all` so e seguro quando TODAS as promises sao obrigatorias para o resultado final. Para chamadas independentes onde falha parcial e aceitavel, usar `Promise.allSettled` + merge dos resultados fulfilled. Considerar `AbortController` compartilhado para nao esperar mais que o necessario.

---

## 5. `catch (err: any)` perde `message` — usar `unknown` + type guard

**Ocorrencias:** PR #255 (`clientLookupService.ts`, `extractContentService.ts`)

**Problema:** `catch (err: any)` permite acesso a `err.message` sem garantia de que `err` seja um `Error`. Em runtime, `throw "string"` ou `throw null` faz `err.message` ser `undefined`, que propagado para log ou resposta vira `"undefined"`.

```typescript
// ERRADO
catch (err: any) {
  logger.error('Falha', err.message); // undefined se nao for Error
  return { error: err.message };
}

// CERTO
catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('Falha', message);
  return { error: message };
}
```

**Regra:** Todo `catch` deve usar `unknown` como tipo. Extrair `message` via type guard (`err instanceof Error`) antes de logar ou retornar. `String(err)` como fallback captura qualquer tipo. Evitar `err: any` que desativa type checking no catch.

---

## 6. Regex de parsing sem ancora (`^`) causa falso positivo

**Ocorrencias:** PR #245 (regex de deteccao HTML no `geminiProxy.ts`), PR #248 (regex de link markdown no `printExport.ts`)

**Problema:** Regex que detecta padroes em strings longas (HTML, Markdown, URLs) sem ancora de inicio (`^`) ou delimitadores claros pode casar com conteudo que contem o padrao acidentalmente. Exemplo: detectar `html` dentro de `legitimate-html-parser.html` da falso positivo porque o regex `/html/i` casa com qualquer posicao.

```typescript
// ERRADO — casa em qualquer posicao
const HAS_HTML = /<html/i.test(body);
// Verdadeiro para "legitimate_response" se conter "html"

// CERTO
const HAS_HTML = /^<!DOCTYPE html|<html[\s>]/i.test(body.trim());
```

**Regra:** Regex de classificacao/parse de formato (HTML, Markdown, JSON) deve usar ancora (`^` para inicio, `$` para fim, ou `\b` para boundary). Testar com edge cases: parenteses em URL, caracteres especiais, strings que contem o padrao acidentalmente.

---

## 7. `console.warn` nao e substituto semantico de `console.log`

**Ocorrencias:** PR #263 (6 endpoints diferentes)

**Problema:** Para satisfazer regra de lint `no-console`, varios endpoints substituiram `console.log` por `console.warn`. `console.warn` tem semantica de "aviso" — usado por ferramentas de observabilidade para alertar. Logs de inicio de operacao, progresso e sucesso sendo emitidos como `warn` poluem alertas e enganam monitoramento.

```typescript
// ERRADO — log de inicio de operacao nao e um aviso
console.warn('[CNPJ] Iniciando consulta...');

// CERTO — cada nivel tem semantica propria
if (import.meta.env.DEV) console.log('[CNPJ] Iniciando consulta...');
// Ou usar logger.info()
```

**Regra:** `console.warn` e para situacoes excepcionais que merecem atencao (queda de performance, fallback ativado, dado inesperado). Logs de inicio/fim/progresso de operacao normal sao `console.log` ou `console.info`. Nunca mudar o nivel do log so para passar linter.

---

## 8. Rules of Hooks: hooks dentro de `map`/callback NUNCA funcionam

**Ocorrencias:** PR #286 (`SectionalBotMessage.tsx`)

**Problema:** `useMemo` (e qualquer hook) chamado dentro de uma funcao `map` do React viola as Rules of Hooks. React nao reclama em runtime (se a ordem for estavel), mas se o array mudar de tamanho, a ordem dos hooks quebra e o comportamento fica imprevisivel.

```typescript
// ERRADO — useMemo dentro de map viola Rules of Hooks
{sections.map(s => {
  const parsed = useMemo(() => parseSection(s), [s]); // 🚫
  return <SectionBlock parsed={parsed} />;
})}

// CERTO — processamento fora do map ou em componente separado
{sections.map(s => <SectionBlock key={s.id} text={s.text} />)}
// SectionBlock internamente pode usar useMemo
```

**Regra:** Nenhum hook (`useState`, `useEffect`, `useMemo`, `useCallback`) pode estar dentro de `map`, `filter`, `forEach`, `if`, ou qualquer callback que nao seja o corpo direto do componente. Se precisar de memoization por item, extrair para um sub-componente.

---

## 9. `console.error` silenciado globalmente em testes esconde warnings

**Ocorrencias:** PR #258 (`tests/components/CRMDetail.test.tsx`)

**Problema:** `beforeEach` com `jest.spyOn(console, 'error').mockImplementation(() => {})` suprime TODOS os `console.error`, incluindo warnings legítimos do React sobre props missing, renderização inesperada, e erros reais de teste. O teste passa mas esconde problemas.

```typescript
// ERRADO — silencia TUDO, inclusive warnings uteis
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// CERTO — mock seletivo com assercao
const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
// validar no afterEach
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});
```

**Regra:** `console.error` so deve ser silenciado com mock seletivo + verificacao no `afterEach` de que nenhum erro inesperado foi emitido. Silenciar globalmente sem verificacao aceita warnings falsos como "comportamento esperado" e leva a regressoes silenciosas.

---

## 10. Mock de Promise que nunca resolve causa memory leak em teste

**Ocorrencias:** PR #258 (`tests/components/WarRoom.test.tsx`)

**Problema:** Mock que retorna `new Promise(() => {})` (sem resolver ou rejeitar) deixa o teste pendente ate timeout do framework. Alem de tornar o teste lento, acumula listeners no event loop.

```typescript
// ERRADO — Promise pendente eternamente
jest.mock('api', () => ({
  fetchData: () => new Promise(() => {}), // nunca resolve
}));

// CERTO — Promise que resolve ou rejeita
jest.mock('api', () => ({
  fetchData: () => Promise.resolve(mockData), // ou Promise.reject()
}));
```

**Regra:** Mock de funcao assincrona SEMPRE deve retornar Promise que resolve ou rejeita explicitamente. Promise pendente para "simular carregamento" deve usar `Promise.resolve()` postergado com `Promise.withResolvers()` ou `useFakeTimers` + promessa controlada, nunca Promise que nao termina.

---

## Sumario

| #   | Licao                                    | Severidade | Contexto    |
| --- | ---------------------------------------- | ---------- | ----------- |
| 1   | `signal.aborted` síncrono antes do async | Alta       | AbortSignal |
| 2   | Cache em memória com limite              | Alta       | Performance |
| 3   | `import.meta.env` dinâmico               | Alta       | Vite        |
| 4   | `Promise.all` vs `allSettled`            | Alta       | Resiliência |
| 5   | `catch (err: any)` → `unknown`           | Média      | TypeScript  |
| 6   | Regex sem âncora                         | Média      | Regex       |
| 7   | `console.warn` ≠ `console.log`           | Média      | Logging     |
| 8   | Rules of Hooks em map                    | Alta       | React       |
| 9   | console.error silenciado em teste        | Média      | Testing     |
| 10  | Mock de Promise pendente                 | Média      | Testing     |

## Registro

- `CALIBER_LEARNINGS.md` — este documento serve como fonte, mas o CALIBER pode ser atualizado manualmente
- Bruno Vault `30-LICOES/`

## Referencias

- PR #239, #241, #243, #245, #248, #255, #258, #263, #270, #286, #289, #296, #297, #303, #305
- `docs/obsidian/decisions/LICOES-APRENDIDAS-DIAGNOSTICO-PERSISTENTE-2026-05-28.md`
- `docs/obsidian/decisions/LICOES-APRENDIDAS-TELA-BRANCA-PR307-2026-05-28.md`
- `docs/obsidian/decisions/LICOES-APRENDIDAS-PROMPTS-2026-05-24.md`
- `docs/obsidian/decisions/LICOES-APRENDIDAS-TEIA-CNPJ-2026-05-24.md`
- `docs/obsidian/decisions/LICOES-APRENDIDAS-BUSCA-REVERSA-2026-05-25.md`
