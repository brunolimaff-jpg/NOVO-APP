# Plano de Auditoria de Codigo - Senior Scout 360

## 2026-05-21

---

## Sumario Executivo

Auditoria em 3 dimensoes: **Falhas Silenciosas**, **Performance (Vercel React Best Practices)**, **Seguranca**.

**Stack auditada:** React 19 + TypeScript + Vite 6 + Tailwind CSS 3 + Gemini API + Pinecone
**Infra:** Vercel (SPA + serverless functions em `api/*.ts`)
**Testes:** 834+ testes (Vitest + Playwright)
**Fachadas congeladas:** `geminiService.ts`, `warRoomService.ts`, `ChatInterface.tsx`, `constants.ts`, `megaPrompts.ts`, `types.ts`

---

## Indice

1. [Estrategia de Execucao](#1-estrategia-de-execucao)
2. [Fase 1: Falhas Silenciosas](#2-fase-1-falhas-silenciosas)
3. [Fase 2: Performance](#3-fase-2-performance)
4. [Fase 3: Seguranca](#4-fase-3-seguranca)
5. [Matriz de Risco](#5-matriz-de-risco)
6. [Ordem de Execucao](#6-ordem-de-execucao)
7. [Criterios de Parada](#7-criterios-de-parada)
8. [Riscos e Mitigacoes](#8-riscos-e-mitigacoes)
9. [Padroes de Codigo](#9-padroes-de-codigo)

---

## 1. Estrategia de Execucao

### Abordagem

As 3 dimensoes sao auditadas em paralelo por agentes independentes, cada uma com checklist propria. A correcao e feita em ondas separadas para evitar conflitos de merge:

```
Onda 1: Audit (3 agentes em paralelo) -> relatorios individuais
Onda 2: Correcoes P0/P1 de Falhas Silenciosas
Onda 3: Correcoes P0/P1 de Seguranca
Onda 4: Correcoes de Performance (baixo risco de quebra)
Onda 5: Verificacao final (testes + typecheck + build)
```

### Agentes por Dimensao

| Dimensao           | Agente        | Modelo | Arquivos-alvo                                       |
| ------------------ | ------------- | ------ | --------------------------------------------------- |
| Falhas Silenciosas | debugger      | sonnet | components/, services/, api/, features/, utils/     |
| Performance        | react-next-ts | sonnet | App.tsx, components/, vite.config.ts, stores/       |
| Seguranca          | reviewer      | sonnet | api/_.ts, index.tsx, services/geminiProxy.ts, .env_ |

### Regras Fixas

1. NUNCA modificar fachadas congeladas: `geminiService.ts`, `warRoomService.ts`, `ChatInterface.tsx`, `constants.ts`, `megaPrompts.ts`, `types.ts`
2. NUNCA modificar arquivos de teste (tests/\*) — apenas codigo de producao
3. NUNCA modificar `.env.local` ou `.env.example` — apenas alertar sobre riscos
4. APOS cada correcao, rodar: `npm run typecheck && npm run lint -- --quiet`
5. AO FINAL de cada onda, rodar: `npm test` completo (834+ testes)
6. Bruno e Jr em codigo — correcoes devem ser seguras, com explicacao em comentario

---

## 2. Fase 1: Falhas Silenciosas

### 2.1 Escopo

Identificar `catch` blocks que engolem erros sem log, registro, ou indicacao ao usuario. Inclui:

- `catch {}` (sem parametro e sem corpo)
- `catch { /* comment */ }` (comentario sem acao)
- `catch (e) {}` (captura sem uso)
- `catch (error) { /* silent */ }` (captura sem log nem rethrow)
- `.catch(() => {})` (promises engolidas)
- Promises nao tratadas (fire-and-forget sem catch)
- Fallbacks que escondem problemas reais

### 2.2 Padroes a Procurar

**Prioridade P0 (critico — corrigir imediatamente):**

```
// ANTI-PADRAO: erro engolido sem nenhum registro
catch { }
catch (e) {}
.catch(() => {})

// ANTI-PADRAO: fallback silencioso sem warning
try { result = await api(); }
catch { result = defaultValue; }
// se api() falhar por auth, o fallback mascara o problema
```

**Prioridade P1 (alto — deve ter logging):**

```
// ANTI-PADRAO: catch comentado mas sem log
catch { /* IDB unavailable */ }
// Melhor: scoutDiag.warn('Scope', 'IDB unavailable')

// ANTI-PADRAO: fire-and-forget sem tratamento
somePromise(); // sem await, sem catch
fetch(url).catch(() => {}); // engole erro de rede
```

**Prioridade P2 (medio — bom ter):**

```
// ANTI-PADRAO: try/catch muito amplo sem contexto
try { ... 200 linhas ... }
catch (e) { log(e); }
// Melhor: try/catch por operacao
```

### 2.3 Arquivos de Risco Conhecido (do grep)

Baseado em inspecao previa, estes arquivos tem ocorrencias confirmadas de `catch {}` (sem parametro):

| Arquivo                                    | Linhas       | Risco                            | Prioridade |
| ------------------------------------------ | ------------ | -------------------------------- | ---------- |
| contexts/ModeContext.tsx                   | 23, 32       | Erro de parse JSON silencioso    | P0         |
| features/radar/useRadar.ts                 | 104-116, 138 | IDB ops falham sem warning       | P0         |
| features/radar/service.ts                  | 192          | Erro oculto em scan              | P0         |
| features/dossier/waterfall-orchestrator.ts | 104          | Erro em waterfall                | P0         |
| utils/idbStorage.ts                        | 13, 22, 30   | Storage falha silenciosamente    | P0         |
| utils/diagnosticLog.ts                     | 31, 47       | catch em modulo de log (ironico) | P1         |
| utils/conversationHistory.ts               | 42           | Parse history falha              | P1         |
| utils/textCleaners.ts                      | 386, 463     | Cleaner falha sem aviso          | P1         |
| utils/webVerification.ts                   | 38, 52, 96   | Verificacao de URL falha         | P1         |
| utils/documentExtractor.ts                 | 37           | Extracao falha                   | P1         |
| utils/loadingCuriosities.ts                | 150          | Loading state falha              | P2         |
| utils/PDFGenerator.ts                      | 387          | PDF gen falha                    | P1         |
| utils/linkValidation.ts                    | 26           | Link check falha                 | P2         |
| components/InvestigationDashboard.tsx      | 36           | Dashboard falha                  | P1         |
| components/SectionalBotMessage.tsx         | 30           | Mensagem falha                   | P1         |
| components/FollowUpModal.tsx               | 100          | Modal falha                      | P1         |
| components/SystemHealthCheck.tsx           | 212          | Health check falha               | P1         |
| components/MessageActionsBar.tsx           | 108          | Acoes falham                     | P1         |
| components/WarRoom.tsx                     | 57           | WarRoom falha                    | P1         |
| hooks/useAppInitialization.ts              | 35, 79       | `.catch(() => {})`               | P0         |

### 2.4 Remediacao

Para cada `catch {}` identificado, aplicar uma das seguintes:

1. **Adicionar `scoutDiag.warn()`** — para erros esperados/degradacao (ex: IDB indisponivel)
2. **Adicionar `scoutDiag.error()`** — para erros inesperados que impactam usuario
3. **Adicionar `console.error()`** — em codigo serverless (api/\*.ts) onde scoutDiag nao esta disponivel
4. **Propagar o erro** — quando o chamador precisa saber (rethrow ou retornar Result type)

**Padrao recomendado:**

```typescript
// BOM
try {
  await set(key, data);
} catch (err) {
  scoutDiag.warn('RadarStorage', 'Falha ao salvar alertas IDB', {
    error: err instanceof Error ? err.message : String(err),
    key,
  });
}
```

**Excecoes aceitaveis para catch silencioso:**

- `navigator.clipboard.writeText()` — fallback aceito (UX degradada nao critica)
- Service Worker unregister em dev — operacao best-effort
- Cache API delete em dev — operacao best-effort
- Test files — mocks e expectativas intencionais

### 2.5 Criterio de Aprovacao

- Zero `catch {}` sem parametro em codigo de producao (nao-teste)
- Zero `.catch(() => {})` em codigo de producao
- Todo `catch` tem: `scoutDiag.error/warn`, `console.error/warn`, OU rethrow
- Excecoes documentadas com comentario `// catch silencioso intencional: [razao]`
- Testes continuam passando (`npm test` verde)

### 2.6 Estimativa: 6-8 horas

---

## 3. Fase 2: Performance (Vercel React Best Practices)

### 3.1 Escopo

Auditar contra as 64 regras do framework Vercel React Best Practices, organizadas em 8 categorias. Foco nas de maior impacto para este projeto.

### 3.2 Categorias e Regras Relevantes

#### Categoria A: Waterfalls (cadeias de requisicao)

| Regra | Descricao                                              | Relevancia  |
| ----- | ------------------------------------------------------ | ----------- |
| A1    | Evitar fetch em cascata (request que depende de outra) | ALTA        |
| A2    | Parallel data fetching com Promise.all                 | ALTA        |
| A3    | Streaming SSR para dados lentos                        | BAIXA (SPA) |
| A4    | Route-based code splitting                             | MEDIA       |
| A5    | Layout data fetching independente                      | BAIXA       |

**Padroes a procurar:**

```typescript
// ANTI-PADRAO (serial waterfall)
const company = await lookupCnpj(cnpj);
const dossier = await generateDossier(company); // esperou o primeiro

// PADRAO (paralelo quando independente)
const [company, news] = await Promise.all([lookupCnpj(cnpj), fetchNews(cnpj)]);
```

#### Categoria B: Bundle Size

| Regra | Descricao                                | Relevancia |
| ----- | ---------------------------------------- | ---------- |
| B1    | Dynamic import de bibliotecas pesadas    | ALTA       |
| B2    | Tree-shaking verification                | MEDIA      |
| B3    | Bundle analysis no CI                    | ALTA       |
| B4    | Evitar dependencias duplicadas           | MEDIA      |
| B5    | Lazy load de componentes abaixo da dobra | MEDIA      |

**Bibliotecas pesadas no bundle atual:**

- mermaid (~3.1 MB chunk) — candidato a dynamic import
- jspdf (~1.2 MB) — so usado em export
- mammoth (~0.5 MB) — so usado em extracao de documento
- pdf-parse (~0.8 MB) — so usado em extracao
- framer-motion (~0.6 MB) — animacoes

**Candidatos a dynamic import:**

```typescript
// ANTI-PADRAO: import estatico de lib pesada
import { jsPDF } from 'jspdf';

// PADRAO: dynamic import
const { default: jsPDF } = await import('jspdf');
```

#### Categoria C: Server-Side (Vercel Serverless Functions)

| Regra | Descricao                         | Relevancia |
| ----- | --------------------------------- | ---------- |
| C1    | Cold start minimization           | ALTA       |
| C2    | Edge vs Node runtime choice       | MEDIA      |
| C3    | Response streaming                | MEDIA      |
| C4    | Cache-Control headers             | ALTA       |
| C5    | Avoid heavy computation on server | MEDIA      |

**Verificacoes:**

- api/gemini.ts tem maxDuration = 300 — adequado?
- api/radar-scan.ts tem maxDuration = 120 — adequado?
- Rotas GET estao usando cache headers?
- api/cnpj.ts nao tem Cache-Control (dados mudam, mas pode cachear por 1h)

#### Categoria D: Client-Side Fetching

| Regra | Descricao                        | Relevancia |
| ----- | -------------------------------- | ---------- |
| D1    | TanStack Query usage             | ALTA       |
| D2    | Deduplication of requests        | MEDIA      |
| D3    | Prefetching de dados previsiveis | BAIXA      |
| D4    | Stale-while-revalidate pattern   | MEDIA      |
| D5    | Optimistic updates               | BAIXA      |

**Verificacoes:**

- QueryClient configurado em index.tsx com staleTime: 5min, retry: 2
- Verificar se componentes estao usando hooks do TanStack Query consistentemente
- Identificar useEffect + fetch direto que deveriam ser queries

#### Categoria E: Re-renders

| Regra | Descricao                               | Relevancia |
| ----- | --------------------------------------- | ---------- |
| E1    | React.memo em listas grandes            | ALTA       |
| E2    | useMemo/useCallback para props-estaveis | ALTA       |
| E3    | Evitar new objetos/arrays em render     | ALTA       |
| E4    | Key prop estavel em lists               | ALTA       |
| E5    | Context splitting                       | MEDIA      |

**Padroes a procurar:**

```typescript
// ANTI-PADRAO: novo objeto a cada render
<Component config={{ key: 'value' }} />

// ANTI-PADRAO: funcao inline em props de child que deveria ser memoizada
<Child onChange={(v) => setValue(v)} />

// ANTI-PADRAO: spread em props que causa re-render
<Child {...dynamicProps} />
```

**Componentes grandes a verificar:**

- LoadingSmart.tsx (672 linhas) — candidato a memo
- EmptyStateHome.tsx (32k) — candidato a splitting
- MarkdownRenderer.tsx (20k) — candidato a memo
- SettingsDrawer.tsx (27k) — candidato a lazy loading
- RadarPanel.tsx (17k)
- MessageRow.tsx (15k)

#### Categoria F: Rendering

| Regra | Descricao                             | Relevancia  |
| ----- | ------------------------------------- | ----------- |
| F1    | Avoid unnecessary Suspense boundaries | MEDIA       |
| F2    | Correct SSR hydration                 | BAIXA (SPA) |
| F3    | Image optimization                    | BAIXA       |
| F4    | Avoid layout shift                    | MEDIA       |
| F5    | Font loading strategy                 | BAIXA       |

#### Categoria G: JavaScript Performance

| Regra | Descricao                               | Relevancia |
| ----- | --------------------------------------- | ---------- |
| G1    | Debounce/Throttle em eventos frequentes | ALTA       |
| G2    | Avoid long tasks (>50ms)                | MEDIA      |
| G3    | requestAnimationFrame para animacoes    | BAIXA      |
| G4    | Web Workers para processamento pesado   | MEDIA      |
| G5    | Avoid forcing layout/reflow             | BAIXA      |

#### Categoria H: Advanced Patterns

| Regra | Descricao                               | Relevancia |
| ----- | --------------------------------------- | ---------- |
| H1    | React Compiler (React Forget)           | ALTA       |
| H2    | useOptimistic para UX otimista          | BAIXA      |
| H3    | useTransition para updates nao-urgentes | MEDIA      |
| H4    | Server Actions (se aplicavel)           | BAIXA      |
| H5    | Partial Prerendering                    | BAIXA      |

**Nota importante:** React Compiler (babel-plugin-react-compiler) esta ativo apenas em desenvolvimento (NODE_ENV !== 'production'). O comentario no vite.config.ts diz que em producao causa TDZ. Isso precisa ser investigado — ou o bug foi resolvido em versao mais recente do compilador, ou o codigo precisa ser ajustado para permitir compilacao em producao.

### 3.3 Remediacao

**Prioridade ALTA (impacto direto em UX):**

1. React.memo() em componentes de lista (MessageRow, cards de dossie)
2. Dynamic import de mermaid, jspdf, mammoth, pdf-parse
3. useMemo/useCallback em props de componentes grandes
4. Substituir useEffect + fetch por TanStack Query onde houver
5. Cache-Control headers em API routes GET

**Prioridade MEDIA:** 6. Debounce em search/busca de sessoes 7. Splitting de componentes grandes (>500 linhas) — continuar o trabalho da Fase 2 8. Verificar keys estaveis em listas 9. Promise.all em waterfalls serializados

**Prioridade BAIXA:** 10. Investigar React Compiler em producao 11. Lazy loading de abas/drawers (SettingsDrawer, RadarPanel) 12. Bundle analysis no CI (vite build --analyze ou similar)

### 3.4 Criterio de Aprovacao

- Zero useEffect + fetch sem TanStack Query (onde aplicavel)
- Zero imports estaticos de libs >500KB que poderiam ser dynamic imports
- Componentes de lista com React.memo() + key estavel
- Cache-Control em rotas GET de API
- Bundle size warning reduzido (chunk >1500KB atual)
- Lighthouse performance > 70 (mobile simulated)
- Testes continuam passando

### 3.5 Estimativa: 8-10 horas

---

## 4. Fase 3: Seguranca

### 4.1 Escopo

Auditar contra:

- Exposicao de chaves/segredos em frontend
- Validacao de input (Zod, sanitizacao)
- XSS e injecao
- Secrets em client-side bundle
- Autenticacao de API routes
- CORS e headers de seguranca
- SSRF (Server-Side Request Forgery)

### 4.2 Riscos Conhecidos (Pre-Audit)

#### P0: Pinecone Keys no Frontend (OI-055)

**Status:** Risco aceito pelo owner para app interno.
**Decisao registrada em:** `.agents/memory/decisions.md` (2026-05-16)

```typescript
// index.tsx — OPTIONAL_ENV_VARS
{ key: 'VITE_PINECONE_API_KEY', label: 'Chave Pinecone (RAG)' },
{ key: 'VITE_PINECONE_INDEX_HOST', label: 'Host do indice Pinecone' },
```

**Recomendacao:**

- Manter como risco aceito para app interno
- Adicionar alerta em index.tsx se VITE_PINECONE_API_KEY aparecer em bundle de producao
- Documentar que, se o app virar externo, migrar Pinecone para serverless (OI-055 reabrir)

#### P0: .env.local com chaves reais

**Verificar:** .env.local esta no .gitignore? Chaves reais estao no arquivo?

Baseado em inspecao: `.env.local` contem chaves reais de Pinecone, Gemini e Brave Search.
**Arquivo .gitignore DEVE** conter `.env.local`. Verificar durante auditoria.

#### P1: API Routes sem autenticacao

**Todas as rotas api/\*.ts** sao publicas (sem auth). Para app interno fechado com Vercel Protection, isso e aceitavel, mas:

- api/gemini.ts aceita qualquer payload POST — risco de abuso de quota
- api/open-web-search.ts aceita qualquer payload POST — risco de custo
- api/radar-scan.ts aceita qualquer payload POST — risco de custo

**Recomendacao:** Adicionar token de autenticacao simples (Bearer token via env var) em cada api route como camada extra.

#### P1: GEMINI_API_KEY em .env.example

**Problema:** `.env.example` documenta GEMINI_API_KEY como variavel. Em teoria, deveria ser usada apenas no serverless (api/gemini.ts), mas developer pode acidentalmente expor. Verificar se GEMINI_API_KEY aparece em qualquer arquivo do bundle frontend.

### 4.3 Padroes a Procurar

#### Input Validation

```typescript
// BOM — Zod validation nas API routes
const parsed = GeminiRequestSchema.safeParse(req.body);
if (!parsed.success) { return res.status(400)... }

// RUIM — falta de validacao em props de componente
function UserInput({ value }: { value: string }) {
  // value pode conter injecao
  return <div INNER_HTML_PATTERN />;
}
```

**Verificar:**

- react-markdown com rehype-raw — permite HTML bruto? Risco XSS.
- Props de componente que recebem HTML/markdown sem sanitizacao
- INNER_HTML_PATTERN em qualquer lugar

#### CORS nas API Routes

```typescript
// api/cnpj.ts — tem CORS configurado (bom)
// api/gemini.ts — NAO tem CORS (precisa verificar)
```

**Verificar CORS em TODAS as rotas:**

- api/gemini.ts — sem CORS explicito
- api/open-web-search.ts — sem CORS explicito
- api/radar-scan.ts — sem CORS explicito
- api/docs-rag.ts — sem CORS explicito

#### SSRF Prevention

**Verificar:**

- api/open-web-search.ts — faz fetch para URLs externas com parametro url. Validacao de URL existe?
- api/extract-content.ts — faz fetch de URL. Validacao?
- api/link-status.ts — faz fetch de URL. Validacao SSRF?

#### Prompt Injection / Leak

O codigo ja tem applyPromptLeakShieldLocal em api/gemini.ts (bom).
**Verificar** se a mesma protecao existe em:

- api/gerar-dossie.ts
- features/chat/message-orchestrator.ts (lado do cliente)

### 4.4 Remediacao

**Prioridade P0 (corrigir imediatamente):**

1. Confirmar .env.local no .gitignore — se nao estiver, adicionar
2. Verificar se GEMINI*API_KEY ou PINECONE*\* vazam para o bundle frontend (build + inspecionar dist/)

**Prioridade P1 (alta):** 3. Adicionar CORS com origin validation em TODAS as API routes (seguir padrao de api/cnpj.ts) 4. Adicionar Bearer token check em API routes serverless 5. Sanitizacao de props de componente que renderizam HTML 6. SSRF protection em endpoints que fazem fetch externo (open-web-search, extract-content, link-status) 7. Input validation faltante em props de componente

**Prioridade P2 (media):** 8. CSP (Content Security Policy) headers 9. Auditoria de INNER_HTML_PATTERN em todo o codigo 10. Verificar react-markdown com rehype-raw para XSS

### 4.5 Criterio de Aprovacao

- Zero chaves de API no bundle frontend (verificar em dist/)
- Todas API routes tem CORS validation
- Todas API routes validam input com Zod
- Nenhuma API route aceita fetch externo sem validacao anti-SSRF
- Zero INNER_HTML_PATTERN sem sanitizacao (com DOMPurify ou similar)
- CSP header presente em respostas de API
- .env.local no .gitignore
- Testes continuam passando

### 4.6 Estimativa: 4-6 horas

---

## 5. Matriz de Risco

### Matriz de Priorizacao (RICE)

| Item                                   | Reach         | Impact                   | Confidence                | Effort       | RICE Score |
| -------------------------------------- | ------------- | ------------------------ | ------------------------- | ------------ | ---------- |
| Catch silencioso P0 (IDB, ModeContext) | 100% users    | 3 (bugs sem diagnostico) | 100% (confirmado em grep) | 4h           | 300        |
| Pinecone keys em frontend              | 100% devs     | 2 (risco de vazamento)   | 90% (confirmado)          | 1h (auditar) | 180        |
| CORS ausente em API routes             | 100% requests | 2 (risco de abuso)       | 85% (5 de 6 rotas)        | 2h           | 170        |
| Fetch waterfall serial                 | 80% users     | 2 (lentidao)             | 70% (padrao comum)        | 3h           | 112        |
| Dynamic import de libs pesadas         | 60% users     | 2 (bundle grande)        | 80% (mermaid, jspdf)      | 3h           | 96         |
| Auth em API routes                     | 100% requests | 3 (seguranca)            | 50% (app interno)         | 2h           | 150        |
| XSS via rehype-raw                     | 30% users     | 3 (critico se explorado) | 40% (baixa probabilidade) | 1h           | 36         |

### Matriz de Risco por Dimensao

| Dimensao           | Risco Atual                                   | Impacto Potencial                                | Esforco Total |
| ------------------ | --------------------------------------------- | ------------------------------------------------ | ------------- |
| Falhas Silenciosas | ALTO (30+ ocorrencias)                        | Bugs nao diagnosticaveis, usuario ve tela parada | 6-8h          |
| Performance        | MEDIO (bundle 3MB+, sem code split)           | Carregamento lento, re-renders excessivos        | 8-10h         |
| Seguranca          | MEDIO-ALTO (chaves no frontend, CORS ausente) | Vazamento de credenciais, abuso de API           | 4-6h          |

---

## 6. Ordem de Execucao

```
FASE 0 — Setup (30 min)
  [planner] Preparar branches e ambiente
  git checkout -b audit/falhas-silenciosas
  git checkout -b audit/performance
  git checkout -b audit/seguranca

FASE 1 — Audit Paralelo (2-3h)
  [debugger] Auditar Falhas Silenciosas -> docs/planos/audit-silent-failures.md
  [react-next-ts] Auditar Performance -> docs/planos/audit-performance.md
  [reviewer] Auditar Seguranca -> docs/planos/audit-seguranca.md

FASE 2 — Correcao P0/P1 Falhas Silenciosas (4h)
  [implementer] Corrigir catch {} em:
    1. features/radar/useRadar.ts — IDB operations
    2. contexts/ModeContext.tsx — parse JSON
    3. utils/idbStorage.ts — storage operations
    4. features/dossier/waterfall-orchestrator.ts
    5. features/radar/service.ts
    6. hooks/useAppInitialization.ts — .catch(() => {})
    7. Demais arquivos com catch {} P0

FASE 3 — Correcao P0/P1 Seguranca (3h)
  [implementer] Corrigir:
    1. Adicionar CORS em todas API routes (seguir padrao cnpj.ts)
    2. Verificar .gitignore para .env.local
    3. Sanitizacao de input em componentes
    4. SSRF protection em fetch externo

FASE 4 — Correcao Performance (4h)
  [react-next-ts] Corrigir:
    1. Dynamic import de mermaid, jspdf
    2. React.memo em componentes de lista
    3. Cache-Control em API routes GET
    4. Substituir useEffect+fetch por TanStack Query

FASE 5 — Verificacao Final (1h)
  [validator] Rodar suite completa:
    npm test (834+ testes)
    npm run typecheck
    npm run build
    npm run lint -- --quiet
    npm run analyze:circular
```

### Diagrama de Dependencias

```
FASE 1 (paralelo)
  |-- debugger -> silent-failures.md
  |-- react-next-ts -> performance.md
  +-- reviewer -> seguranca.md
        |
        v
FASE 2 (depende: silent-failures.md)
  +-- implementer -> corrige catches
        |
        v
FASE 3 (depende: seguranca.md, independente da FASE 2)
  +-- implementer -> corrige seguranca
        |
        v
FASE 4 (depende: performance.md, independente da FASE 2/3)
  +-- react-next-ts -> corrige performance
        |
        v
FASE 5 (depende: TODAS as fases anteriores)
  +-- validator -> verificacao final
```

Nota: Fases 2, 3, e 4 podem rodar em branches separadas em paralelo se o risco de conflito for baixo. Recomendado: branches separadas, merge na ordem Fase 2 -> Fase 3 -> Fase 4.

---

## 7. Criterios de Parada

### Por Fase

| Fase                         | Criterio "Aprovado"                                              | Criterio "Precisa Corrigir"                |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| 1 - Silent Failures Audit    | Relatorio com todas as ocorrencias, classificadas por prioridade | Menos de 80% das ocorrencias identificadas |
| 1 - Performance Audit        | Relatorio com pontuacao em cada categoria Vercel                 | Qualquer categoria com nota < 3/5          |
| 1 - Seguranca Audit          | Relatorio com todas portas de entrada identificadas              | Qualquer P0 nao identificado               |
| 2 - Correcao Silent Failures | Zero catch {} sem parametro em producao                          | 1+ ocorrencia restante                     |
| 3 - Correcao Seguranca       | CORS em todas API, .env.local no .gitignore, input validado      | 1+ P0/P1 sem correcao                      |
| 4 - Correcao Performance     | Dynamic import de libs pesadas, memo em listas, cache headers    | Chunk mermaid >2MB, zero memo em listas    |
| 5 - Verificacao Final        | npm test + typecheck + build + lint + analyze:circular verdes    | Qualquer gate vermelho                     |

### Gate Global (antes de mergear qualquer branch)

```
[x] npm run typecheck — zero errors
[x] npm run lint -- --quiet — zero warnings
[x] npm test — 834+ testes verdes
[x] npm run build — sem novos warnings
[x] npm run analyze:circular — zero ciclos
[ ] Nenhuma fachada congelada modificada
[ ] Nenhum arquivo de teste modificado
```

---

## 8. Riscos e Mitigacoes

### Risco 1: Correcao de catch quebra fluxo esperado

**Descricao:** Adicionar scoutDiag.warn() em catch {} pode mudar comportamento de log e expor erros que eram intencionalmente silenciados.
**Mitigacao:** Nao mudar logica de negocios. Apenas adicionar log. O comportamento do catch (usar fallback, continuar execucao) permanece igual.

### Risco 2: Dynamic import quebra lazy loading

**Descricao:** Mover imports estaticos para dynamic em runtime pode introduzir flash de carregamento ou quebrar dependencias.
**Mitigacao:** Usar React.lazy() + Suspense com skeleton existente (LoadingSmart ja tem variantes). Testar manualmente o fluxo de export.

### Risco 3: CORS em API routes quebra chamadas existentes

**Descricao:** Adicionar CORS validation pode bloquear chamadas legitimas de previews Vercel ou dev local.
**Mitigacao:** Reutilizar o padrao de api/cnpj.ts que ja aceita previews Vercel e localhost. Testar com vercel dev.

### Risco 4: Testes falham apos correcoes

**Descricao:** Testes que mockam comportamento de catch podem quebrar se o log mudar.
**Mitigacao:** Nao modificar testes. Se um teste mocka console.warn ou scoutDiag, o novo warning pode ser expectativa adicional. Rodar npm test apos cada alteracao.

### Risco 5: Aderencia ao escopo — evitar gold-plating

**Descricao:** Durante a auditoria de performance, e tentador refatorar componentes grandes (LoadingSmart, EmptyStateHome) em vez de apenas auditar.
**Mitigacao:** O escopo da auditoria e DETECTAR e DOCUMENTAR. Correcoes estruturais grandes (splitting de componentes) ficam para outro plano. Esta auditoria so corrige o que e diretamente relacionado as 3 dimensoes.

### Risco 6: Pinecone keys no bundle

**Descricao:** Chaves Pinecone no bundle frontend sao risco aceito, mas o plano precisa reavaliar.
**Mitigacao:** Auditar se as chaves estao acessiveis no bundle de producao (dist/assets/\*.js). Se sim, documentar o risco e recomendar migracao para serverless. Nao alterar sem autorizacao do owner.

---

## 9. Padroes de Codigo a Procurar

### 9.1 Silent Failures — Expressoes Regulares

```regex
# Catch sem parametro (pior caso)
catch\s*\\{

# Catch com parametro ignorado
catch\s*\(\s*(?:err(?:or)?|e|_\w*)\s*\)\s*\{(?:\s*\/\/[^}]*)?\s*\}

# Promise fire-and-forget sem catch
\.then\(\s*\([^)]*\)\s*=>\s*[^{]*\s*\)\s*;  # .then sem catch chain

# .catch vazio
\.catch\(\s*(?:\(\s*\)|[a-zA-Z_]\s*)\s*(?::\s*[a-zA-Z_]+\s*)?=>\s*\{\s*\}\s*\)

# catch que so tem comentario
catch\s*\([^)]*\)\s*\{\s*\/\/[^}]*\s*\}
```

### 9.2 Performance — Padroes

```regex
# useEffect com fetch (deveria ser TanStack Query)
useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?fetch\s*\(

# Import estatico de lib pesada (via import ... from)
import\s+.*\b(?:jspdf|mammoth|pdf-parse|mermaid)\b

# Objeto/array novo em props de JSX
<[A-Z]\w+[^>]*\{\s*(?:\{[^}]*\}|\[[^\]]*\])\s*\}

# Funcao inline em props de evento (em JSX)
on[A-Z]\w+=\{(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>\s*\{

# key prop numerica (pode ser estavel mas verificar)
key=\{index\}
key=\{i\}
```

### 9.3 Seguranca — Padroes

```regex
# INNER_HTML_PATTERN (sem a palavra exata)
INNER_HTML_PATTERN

# VITE_ env vars em arquivos de runtime (nao config)
VITE_PINECONE
VITE_CLERK

# Fetch externo sem validacao
fetch\s*\(\s*(?:req\.body|body\.[a-zA-Z]*url|params\.url)

# input sem sanitizacao em componente
\.innerHTML\s*=

# rehype-raw (permite HTML)
rehype-raw
```

---

## Anexo A: Checklist Rapida para Agentes

### Para debugger (Falhas Silenciosas)

```
[ ] Listar todos catch {} sem parametro (grep -rn "catch {" ...)
[ ] Listar todos .catch(() => {}) (grep -rn "\.catch(" ...)
[ ] Listar fire-and-forget promises (Promises sem await nem catch)
[ ] Classificar por P0/P1/P2
[ ] Para cada P0: sugerir correcao com scoutDiag.warn/error
[ ] Gerar relatorio em docs/planos/audit-silent-failures.md
```

### Para react-next-ts (Performance)

```
[ ] Auditar waterfalls (useEffect com fetch serial)
[ ] Auditar bundle (imports estaticos de libs pesadas)
[ ] Auditar re-renders (memo, useMemo, useCallback, key)
[ ] Auditar serverless (Cache-Control, cold start)
[ ] Auditar TanStack Query usage
[ ] Gerar relatorio em docs/planos/audit-performance.md
```

### Para reviewer (Seguranca)

```
[ ] Auditar VITE_PINECONE e outras chaves no bundle
[ ] Verificar CORS em todas api/*.ts
[ ] Verificar validacao de input (Zod) em todas api/*.ts
[ ] Verificar SSRF em fetch externo (open-web-search, extract-content, link-status)
[ ] Verificar XSS (INNER_HTML_PATTERN, rehype-raw)
[ ] Verificar .gitignore contem .env.local
[ ] Gerar relatorio em docs/planos/audit-seguranca.md
```

---

## Anexo B: Arquivos por Agente

### debugger (silent failures) — 30+ arquivos

Alta prioridade:

- contexts/ModeContext.tsx
- features/radar/useRadar.ts
- features/radar/service.ts
- features/dossier/waterfall-orchestrator.ts
- utils/idbStorage.ts
- hooks/useAppInitialization.ts
- utils/conversationHistory.ts
- utils/documentExtractor.ts

Media prioridade:

- utils/textCleaners.ts
- utils/webVerification.ts
- utils/PDFGenerator.ts
- utils/loadingCuriosities.ts
- utils/linkValidation.ts
- components/InvestigationDashboard.tsx
- components/SectionalBotMessage.tsx
- components/FollowUpModal.tsx
- components/SystemHealthCheck.tsx
- components/MessageActionsBar.tsx
- components/WarRoom.tsx

### react-next-ts (performance) — 15+ arquivos

- App.tsx (622 linhas — waterfalls)
- components/LoadingSmart.tsx (672 linhas — re-renders)
- components/EmptyStateHome.tsx (32k — splitting)
- components/MarkdownRenderer.tsx (20k — memo)
- components/SettingsDrawer.tsx (27k — lazy loading)
- components/RadarPanel.tsx (17k)
- components/MessageRow.tsx (15k)
- components/SessionsSidebar.tsx (13k)
- services/geminiProxy.ts (fetch patterns)
- features/\*_/_.ts (waterfalls)
- vite.config.ts (chunk config)
- utils/PDFGenerator.ts (lib pesada)
- utils/printExport.ts (mermaid peso)
- utils/mermaid.ts (lib pesada)
- utils/idbStorage.ts (chunk warning)

### reviewer (seguranca) — 20+ arquivos

- api/gemini.ts (CORS, auth, input val)
- api/open-web-search.ts (CORS, SSRF, input val)
- api/cnpj.ts (referencia de CORS)
- api/radar-scan.ts (CORS, input val)
- api/docs-rag.ts (CORS, SSRF, input val)
- api/extract-content.ts (SSRF, input val)
- api/link-status.ts (SSRF, input val)
- api/gerar-dossie.ts (CORS, input val)
- api/rag.ts (CORS, input val)
- api/comex.ts (CORS)
- api/pulse-news.ts (CORS)
- index.tsx (VITE_PINECONE)
- services/geminiProxy.ts (endpoints)
- contexts/OperatorContext.tsx (auth)
- .env.local (chaves)
- .env.example (documentacao)
- .gitignore (verificar .env.local)
- utils/documentExtractor.ts (fetch externo)
- utils/webVerification.ts (fetch externo)
- components/MarkdownRenderer.tsx (XSS)

---

## Resumo de Esforco

| Fase                     | Horas   | Agentes       | Depende de        |
| ------------------------ | ------- | ------------- | ----------------- |
| Setup                    | 0.5h    | planner       | -                 |
| Audit Falhas Silenciosas | 2h      | debugger      | Setup             |
| Audit Performance        | 2h      | react-next-ts | Setup             |
| Audit Seguranca          | 1.5h    | reviewer      | Setup             |
| Correcao P0/P1 Silent    | 4h      | implementer   | Audit Silent      |
| Correcao P0/P1 Seguranca | 3h      | implementer   | Audit Seguranca   |
| Correcao Performance     | 4h      | react-next-ts | Audit Performance |
| Verificacao Final        | 1h      | validator     | Todas correcoes   |
| **Total**                | **18h** | 4 agentes     | -                 |

**Nota:** Fases 2-3-4 (correcoes) podem rodar em paralelo em branches separadas, reduzindo tempo real para ~8-10h.

---

_Plano gerado em 2026-05-21. Revisar apos conclusao de cada fase para ajustar escopo das fases seguintes._
