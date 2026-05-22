# Auditoria de Performance — NOVO-APP (Senior Scout 360)

**Data:** 2026-05-22  
**Framework:** Vercel React Best Practices (64 regras)  
**Escopo:** Bundle, re-renders, waterfalls, server-side, fetching, JS perf, rendering  
**Metodologia:** Análise estática de código (grep + inspeção manual)  
**Nota:** Nenhum arquivo foi modificado — apenas auditoria.

---

## Resumo Executivo

| Categoria | Pontuacao (0-5) | Severidade |
|-----------|:---:|:---:|
| 1. Waterfalls / Fetch Cascata | **2/5** | CRITICAL |
| 2. Bundle Size | **2/5** | CRITICAL |
| 3. Re-renders | **3/5** | MEDIUM |
| 4. Server-Side (API Caching) | **1/5** | HIGH |
| 5. Client-Side Fetching | **2/5** | MEDIUM-HIGH |
| 6. JavaScript Performance | **3/5** | LOW-MEDIUM |
| 7. Rendering Performance | **3/5** | MEDIUM |
| **Geral** | **2.3/5** | **ALTA** |

---

## Top 5 Correcoes de Maior Impacto

1.  **Code-split App.tsx com React.lazy** — App.tsx importa estaticamente ~20 componentes (incluindo LoadingSmart de 660 linhas com dependencia de geminiService). A primeira paint carrega todo o grafo de dependencias. **Impacto: ~40-60% reducao no bundle inicial.**

2.  **Adicionar Cache-Control headers nas API routes GET** — Zero rotas tem cache headers. `/api/cnpj`, `/api/comex`, `/api/docs-rag` sao candidatos obvios. **Impacto: reducao de latencia em requests repetidos.**

3.  **Extrair inline handlers e style objects em componentes grandes** — EmptyStateHome (748 linhas), LoadingSmart (660), SettingsDrawer (634), RadarPanel (386) criam handlers/objetos inline em cada render. **Impacto: reducao de re-renders em ~30-50% nesses componentes.**

4.  **Substituir fetch() manual por useQuery / useMutation** — TanStack Query esta configurado no index.tsx (staleTime: 5min, retry: 2) mas NENHUM componente usa. Todas as chamadas sao fetch() direto sem deduplicacao. **Impacto: eliminacao de requests duplicados + cache automatico.**

5.  **Lazy-load framer-motion** — 5,4MB estaticamente importado em 5 componentes (`ClienteSeniorScore`, `StatusIndicator`, `Tooltip`, `ScorePorta`, `ChatShell`). Criar um-wrapper de `motion.div` com lazy import cortaria esse bundle do carregamento inicial. **Impacto: ~5MB a menos no bundle critico.**

---

## 1. Waterfalls / Fetch Cascata (CRITICAL) — 2/5

### 1.1 App.tsx sem code-splitting (CRITICAL)

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/App.tsx`  
**Problema:** App.tsx importa estaticamente ~30 modulos. Zero uso de `React.lazy()` ou `Suspense`.

Componentes carregados na inicializacao (todos estaticos):
- `ChatInterface` (329 linhas)
- `LoadingSmart` (660 linhas, que importa `geminiService`)
- `EmailModal`, `FollowUpModal`, `UpdateNotificationModal`
- `InstallPrompt`, `FooterCredits`, `ToastContainer`
- 15 hooks do sistema (chat, session, radar, dossier, etc.)
- Analytics + Speed Insights do Vercel

**Impacto:** O bundle de entrada contem quase todo o codigo da aplicacao. Nenhum roteamento ou code-splitting por view.

**Sugestao:** Envolver em `React.lazy()` os modais (`EmailModal`, `FollowUpModal`, `UpdateNotificationModal`) e `LoadingSmart`:

```tsx
const LoadingSmart = React.lazy(() => import('./components/LoadingSmart'));
const EmailModal = React.lazy(() => import('./components/EmailModal'));

// No JSX:
<React.Suspense fallback={<div className="h-64 animate-pulse bg-gray-800/20 rounded-xl" />}>
  {isLoading && <LoadingSmart {...props} />}
</React.Suspense>
```

### 1.2 LoadingSmart importa geminiService diretamente (ALTO)

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/components/LoadingSmart.tsx`  
**Problema:** Linha 4 importa `generateLoadingCuriosities` de `../services/geminiService` (201 linhas). Isso significa que o geminiService inteiro e suas dependencias (modelos, tipos, constantes) sao baixados na inicializacao, mesmo que o usuario so va usar o app minutos depois.

**Sugestao:** Dynamic import da funcao:

```tsx
// Em vez de:
import { generateLoadingCuriosities } from '../services/geminiService';

// Usar:
const generateCuriosities = useCallback(async (context: string) => {
  const { generateLoadingCuriosities } = await import('../services/geminiService');
  return generateLoadingCuriosities(context);
}, []);
```

### 1.3 useAppInitialization — waterfall local depois remoto (MEDIO)

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/hooks/useAppInitialization.ts`  
**Problema:** A inicializacao roda em duas fases but a Fase 1 (`await loadSessions()`) bloqueia o render da fase 2. Embora o design seja intencional (local primeiro, remoto depois), o `await` na Fase 1 ainda cria latencia perceptivel se IndexedDB/localStorage estiver lento.

**Sugestao:** Usar `startTransition` para nao bloquear a renderizacao:

```tsx
import { startTransition } from 'react';

const init = async () => {
  startTransition(async () => {
    const localSessions = await loadSessions();
    // ... fase 1
    setIsInitialized(true);
    // ... fase 2
  });
};
```

### 1.4 waterfall-orchestrator — execucao serial de modulos (BAIXO)

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/features/dossier/waterfall-orchestrator.ts`  
**Problema:** Linha 282: `for (let index = 0; index < modules.length; index++)` com `await` dentro. Os modulos sao executados sequencialmente, o que e intencional (cada modulo pode depender do anterior), mas aumenta o TTFB (Time to First Bot response).

**Impacto:** Esperado pelo design. `PORTA` foi desenhado para waterfall. Sem correcao.

---

## 2. Bundle Size (CRITICAL) — 2/5

### 2.1 mermaid ~3.1MB chunk (CRITICAL)

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/vite.config.ts` (manualChunks)  
**Problema:** mermaid (10.9.5) e corretamente chunkado em `mermaid.js` via `manualChunks`, porem ~3.1MB e o chunk e baixado mesmo se o usuario nunca ver um grafico mermaid.

**O que ja esta bom:** O chunk e lazy-loaded (dynamic import em `MarkdownRenderer.tsx` linha 86 e `PDFGenerator.ts` linha 351). O singleton pattern (linha 81) evita multiplos downloads.

**Sugestao:** Adicionar preconnect hint para preparar o download:

```html
<link rel="preload" href="/assets/mermaid-xxx.js" as="script" />
```

Ou, melhor ainda, so carregar o chunk mermaid quando o usuario realmente abrir um relatorio ou clicar num grafico.

### 2.2 framer-motion ~5.4MB estatico (CRITICAL)

**Arquivo:** Multiplos componentes importam `framer-motion` estaticamente.  
**Problema:** `framer-motion` (5.4MB em disco) e importado estaticamente em 5 componentes sem chunk separado:

| Componente | Arquivo |
|---|---|
| ClienteSeniorScore | `/components/ClienteSeniorScore.tsx` |
| StatusIndicator | `/components/StatusIndicator.tsx` |
| Tooltip | `/components/Tooltip.tsx` |
| ScorePorta | `/components/ScorePorta.tsx` |
| ChatShell | `/components/chat/ChatShell.tsx` |

Nao ha `manualChunks` para framer-motion no `vite.config.ts`.

**Sugestao:** Adicionar ao `vite.config.ts`:

```ts
if (id.includes('/node_modules/framer-motion/')) return 'vendor-anim';
```

E considerar `React.lazy()` para componentes pesados de animacao.

### 2.3 jspdf ~582 linhas estatico (ALTO)

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/utils/PDFGenerator.ts`  
**Problema:** `jspdf` e importado estaticamente (linha 9: `import { jsPDF } from 'jspdf'`). O modulo inteiro carrega mesmo se o usuario nunca exportar.

**Sugestao:** Dynamic import:

```ts
// Em vez de:
import { jsPDF } from 'jspdf';

// Usar:
const { jsPDF } = await import('jspdf');
```

### 2.4 react-markdown + remark/rehype estatico (MEDIO)

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/components/MarkdownRenderer.tsx`  
**Problema:** `react-markdown`, `remark-gfm`, `rehype-raw`, `remark-breaks` sao importados estaticamente. MarcdownRenderer e memoizado mas isso nao reduz o tamanho do bundle.

**Impacto:** Moderado (~200KB total). Aceitavel pois MarkdownRenderer e usado em toda mensagem do chat.

**Sugestao:** Se `MarkdownRenderer` for usado condicionalmente, considerar dynamic import tambem.

### 2.5 App.tsx sem React.lazy (CRITICAL)

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/App.tsx`  
**Problema:** Ja mencionado em 1.1, mas reiterado como bundle. App.tsx importa estaticamente: `ChatInterface`, `LoadingSmart`, `EmailModal`, `FollowUpModal`, `UpdateNotificationModal`, `InstallPrompt`, `FooterCredits`, `ToastContainer`, mais 3 contextos, 5+ hooks de feature, etc. Zero lazy loading.

**Contraste:** `ChatPanels.tsx` faz lazy loading de InvestigationDashboard, SettingsDrawer, WarRoom, RadarPanel, RadarSettings. `ChatShell.tsx` faz lazy de `RadarBell`. `SettingsDrawer.tsx` faz lazy de `SystemHealthCheck`. Mas `App.tsx` — o entrypoint — nao faz nada disso.

### 2.6 Barrel imports (OK)

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/features/radar/index.ts`  
**Status:** Apenas 1 barrel import, bem modesto (exporta 3 itens). Sem risco.

---

## 3. Re-renders (MEDIUM) — 3/5

### 3.1 Componentes grandes sem React.memo (ALTO)

| Componente | Linhas | Memo? | Renderiza em |
|---|---|---|---|
| EmptyStateHome | 748 | NAO | Toda inicializacao |
| LoadingSmart | 660 | NAO | Durante loading de IA |
| SettingsDrawer | 634 | NAO | Ao abrir settings |
| RadarPanel | 386 | NAO | Ao abrir radar |
| InvestigationDashboard | 361 | NAO | Ao abrir dashboard |
| WarRoom | 283 | NAO | Durante conversa |
| UserMenu | ~130 | NAO | Header, toda interacao |
| WelcomeScreen | ~150 | NAO | Home screen |
| DossieSkeletonLoader | ~80 | NAO | Durante geracao dossie |
| ClienteSeniorScore | ~130 | NAO | Score card |
| HelpCenterFloating | ~130 | NAO | Flutuante na tela |
| DeepDiveTopics | ~250 | NAO | Durante investigacao |
| GhostMessageBlock | ~60 | NAO | Mensagens de erro |

**Memoizados corretamente:** `MarkdownRenderer`, `ErrorMessageCard`, `MessageRow`, `SmartOptions`, `InlineTypingResponse`.

**Impacto:** Componentes como `WarRoom` (renderiza a cada mensagem nova) e `ChatShell` (renderiza a cada interacao) sem memo causam re-renderizacao em cascata para toda a arvore de filhos.

**Sugestao:** Envolver com `React.memo()` pelo menos `WarRoom`, `EmptyStateHome`, `UserMenu`, `GhostMessageBlock`:

```tsx
export default React.memo(WarRoom);
```

### 3.2 Inline object/array props (MEDIO)

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/components/ClienteSeniorScore.tsx`

Inline style objects que criam novas referencias em todo render:
```tsx
// Linhas 40-118 — ~15 inline style objects
style={{
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  // ...
}}
```

**Impacto:** Quebra o PureComponent/memo dos filhos porque `style={{}}` e sempre uma nova referencia.

**Sugestao:** Extrair styles para constantes fora do componente ou usar `useMemo`:

```tsx
const STYLES = {
  container: { display: 'flex', flexDirection: 'column', gap: '6px' } as const,
  header: { fontSize: '11px', fontWeight: 500 } as const,
  // ...
} as const;

// No JSX: style={STYLES.container}
```

### 3.3 Inline handlers em componentes sem memo (MEDIO)

Multiplos componentes criam arrow functions inline em props `onChange`, `onClick`, `onKeyDown`:

| Arquivo | Linha | Handler |
|---|---|---|
| EmptyStateHome.tsx | 394, 454, 518, 535 | `onChange={e => ...}` |
| InvestigationDashboard.tsx | 223, 228, 240, 256, 287 | `onChange/onClick={() => ...}` |
| SettingsDrawer.tsx | 213, 215, 281, 299, 479, 496 | `onChange/onClick={() => ...}` |
| RadarPanel.tsx | 127, 145, 296, 367 | `onChange/onClick={() => ...}` |
| UserMenu.tsx | 64, 108, 119 | `onClick={() => ...}` |
| WelcomeScreen.tsx | 104, 126 | `onClick={() => ...}` |
| DeepDiveTopics.tsx | 213 | `onClick={() => ...}` |
| HelpCenterFloating.tsx | 80, 98, 128 | `onClick={() => ...}` |
| ToastContainer.tsx | 39 | `onClick={() => ...}` |
| GhostMessageBlock.tsx | 31, 43 | `onClick={() => ...}` |
| Composer.tsx | — (potencial) | `onChange/onKeyDown` |

**Impacto:** Em componentes sem memo, cada render cria novas funcoes — nao causa re-render extra no proprio componente, mas causa nos filhos. Se Eventual filhos sao `memo`, eles quebram.

**Sugestao:** Extrair handlers com `useCallback` ou mover para fora:

```tsx
// Em vez de:
<button onClick={() => setOpen(true)} />

// Usar:
const handleOpen = useCallback(() => setOpen(true), []);
<button onClick={handleOpen} />
```

### 3.4 key={index} em listas (MEDIO)

| Arquivo | Linha |
|---|---|
| EmptyStateHome.tsx | 695 |
| RadarPanel.tsx | 264 |
| LoadingSmart.tsx | 114, 129, 632 |
| WelcomeScreen.tsx | 125 |
| DossieSkeletonLoader.tsx | 72 |

**Problema:** `key={i}` ou `key={index}` em listas que podem ser reordenadas ou filtradas causa reconciliacao incorreta.

**Sugestao:** Usar um identificador unico. Se nao houver ID, usar `${prefix}-${index}` como fallback com comentario explicando.

```tsx
// Em vez de:
{array.map((item, i) => <div key={i}>...</div>)}

// Usar:
{array.map((item) => <div key={item.id}>...</div>)}
```

---

## 4. Server-Side (HIGH) — 1/5

### 4.1 Zero Cache-Control headers em API routes (CRITICAL)

**Problema:** Nenhuma rota `/api/*.ts` define `Cache-Control`. Nem mesmo GET endpoints idempotentes.

| Rota | Metodo | maxDuration | Cache? |
|---|---|---|---|
| `/api/gemini.ts` | POST | 300s | NAO aplicavel |
| `/api/gerar-dossie.ts` | POST | 300s | NAO aplicavel |
| `/api/radar-scan.ts` | POST | 120s | NAO aplicavel |
| `/api/extract-content.ts` | GET | 60s | **Sem cache** |
| `/api/docs-rag.ts` | GET/POST | 60s | **Sem cache** |
| `/api/rag.ts` | GET/POST | 60s | **Sem cache** |
| `/api/open-web-search.ts` | GET | 60s | **Sem cache** |
| `/api/cnpj.ts` | GET | — | **Sem cache** |
| `/api/comex.ts` | GET | — | **Sem cache** |
| `/api/link-status.ts` | GET | — | **Sem cache** |

**Sugestao:** Adicionar Cache-Control para GET endpoints:

```tsx
// api/cnpj.ts
res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=3600, stale-while-revalidate=604800');

// api/comex.ts
res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=3600');

// api/docs-rag.ts
res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=300');

// api/extract-content.ts — nao cachear (conteudo pode mudar)
```

### 4.2 maxDuration adequado (OK)

Todas as rotas tem `maxDuration` definido explicitamente. Nenhuma timeout configuracao ausente.

| Rota | maxDuration | Uso |
|---|---|---|
| gemini.ts | 300s | Resposta IA complexa |
| gerar-dossie.ts | 300s | Dossie completo |
| radar-scan.ts | 120s | Scan de radar |
| extract-content.ts | 60s | Extracao de URL |
| docs-rag.ts | 60s | RAG doc |
| rag.ts | 60s | RAG geral |
| open-web-search.ts | 60s | Web search |

Sem alteracao necessaria.

---

## 5. Client-Side Fetching (MEDIUM-HIGH) — 2/5

### 5.1 TanStack Query configurado mas nao usado (CRITICAL)

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/index.tsx` (linha 78)  
**Problema:** `QueryClientProvider` esta no provider tree com config:

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,  // 5 min
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
```

Contudo, NENHUM componente usa `useQuery` ou `useMutation`. Todas as chamadas API sao `fetch()` direto.

**Locais de fetch() direto (sem TanStack Query):**
- `services/ragService.ts` linha 29
- `services/extractContentService.ts` linha 56
- `services/clientLookupService.ts` linha 104, 133, 445, 500
- `services/feedbackRemoteStore.ts` linha 31
- `services/sessionRemoteStore.ts` linha 189
- `services/brasilApiService.ts` linha 46
- `services/geminiProxy.ts` linha 108, 177
- `services/sessionRemoteStore.ts` linha 189
- `hooks/useAppInitialization.ts` linha 18 (warmup fetch)

**Sugestao:** Envolver pelo menos as chamadas mais frequentes em hooks useQuery:

```tsx
// Em vez de:
const data = await fetch('/api/cnpj?cnpj=...');

// Usar:
const { data } = useQuery({
  queryKey: ['cnpj', cnpj],
  queryFn: () => fetch(`/api/cnpj?cnpj=${cnpj}`).then(r => r.json()),
  staleTime: 1000 * 60 * 60, // 1 hora — CNPJ nao muda
});
```

### 5.2 Sem deduplicacao de requests (ALTO)

**Problema:** Fetch manual nao deduplica. Se dois componentes montam e chamam a mesma URL simultaneamente, duas requisicoes sao disparadas.

**Locais de risco:**
- `clientLookupService.ts` — consultas de CNPJ (linha 445 usa `Promise.allSettled` para variantes, mas nao ha cache entre chamadas)
- `geminiProxy.ts` — multiplas chamadas para a mesma rota API

**Sugestao:** Alem de migrar para TanStack Query, implementar cache simples:

```tsx
const lookupCache = new Map<string, Promise<LookupResponse>>();

function fetchLookup(query: string): Promise<LookupResponse> {
  const cached = lookupCache.get(query);
  if (cached) return cached;
  const promise = fetchWithRetry(url).then(r => r.json());
  lookupCache.set(query, promise);
  return promise;
}
```

---

## 6. JavaScript Performance (LOW-MEDIUM) — 3/5

### 6.1 filter().map() em cadeia (MEDIO)

| Arquivo | Linha | Codigo |
|---|---|---|
| components/MessageRow.tsx | 105 | `.filter(s => !!s.url).map(s => s.url)` |
| components/MessageRow.tsx | 232 | `.filter(group => ...).map(group => ...)` |
| api/gemini.ts | 71 | `.filter(pattern => ...).map((_, i) => ...)` |
| api/gemini.ts | 72 | `filter(...).map(...)` |

Estes percorrem o array duas vezes quando uma unica iteracao bastaria.

**Sugestao:** Usar `flatMap()` ou `reduce()`:

```tsx
// Em vez de:
items.filter(s => !!s.url).map(s => s.url)

// Usar:
items.flatMap(s => s.url ? [s.url] : [])

// Ou reduce:
items.reduce<string[]>((acc, s) => {
  if (s.url) acc.push(s.url);
  return acc;
}, []);
```

### 6.2 RegExp criado em render path (MEDIO)

| Arquivo | Linha | Descricao |
|---|---|---|
| utils/mermaid.ts | 129 | `new RegExp(...)` criado no escopo do modulo — OK |
| utils/continuitySuggestions.ts | 161 | `new RegExp(...)` em funcao de transformacao |
| utils/continuitySuggestions.ts | 181 | `new RegExp(detect.source, ...)` |
| utils/linkFixer.ts | 43 | `new RegExp(...)` no escopo do modulo — OK |
| EmptyStateHome.tsx | 121 | `new RegExp(sourceName.replace(...))` em JSX de renderizacao |
| api/radar-scan.ts | 98, 102, 331 | `new RegExp(...)` dentro de loops |

**Sugestao:** Para `EmptyStateHome.tsx` linha 121, memoizar o regex ou extrair para constante:

```tsx
const sourceRegex = useMemo(
  () => new RegExp(`${sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  [sourceName]
);
```

### 6.3 localStorage sem cache em memoria (MEDIO)

**Locais de risco:**
- `services/gemini/recovery.ts` linhas 17-18: le localStorage em cada chamada de funcao
- `utils/conversationHistory.ts` linhas 30-69: le e escreve localStorage em toda operacao
- `utils/sessionExport.ts` linhas 138-189: acesso direto sem cache
- `hooks/useUpdateNotification.ts` linhas 57-117: multiplas leituras em hooks

`localStorage.getItem()` e sincrono e bloqueia a thread principal.

**Sugestao:** Cache em memoria com validacao:

```tsx
let _cachedSnooze: string | null = null;

function getSnoozeUntil(): string | null {
  if (_cachedSnooze === undefined) {
    _cachedSnooze = localStorage.getItem(STORAGE_KEY_SNOOZE);
  }
  return _cachedSnooze;
}
```

### 6.4 Sem debounce em inputs (BAIXO)

**Locais:**
- `InvestigationDashboard.tsx` linha 223: `onChange={(e) => setSearchText(e.target.value)}` — sem debounce, causa re-render em cada tecla
- `EmptyStateHome.tsx` linhas 394-535: varios inputs de busca/CNPJ sem debounce

**Sugestao:** Adicionar debounce de 300ms para inputs de busca:

```tsx
import { debounce } from '...';

const handleSearch = useMemo(
  () => debounce((value: string) => setSearchText(value), 300),
  []
);
```

---

## 7. Rendering Performance (MEDIUM) — 3/5

### 7.1 Inline style objects em componentes nao memoizados (MEDIO)

**Locais principais:**

| Componente | Linhas com inline style |
|---|---|
| LoadingSmart.tsx | 80, 111, 115, 130, 155, 462, 476 |
| ClienteSeniorScore.tsx | 40, 49, 57, 58, 59, 61, 73, 74, 78, 83, 87, 93, 104, 116, 117, 118 (~15 objetos) |
| SectionalBotMessage.tsx | 64 |
| EmptyStateHome.tsx | 645 |
| InvestigationDashboard.tsx | 75, 271, 348 |
| RadarPanel.tsx | 264 |

**Impacto:** Cada inline `style={{}}` cria um novo objeto em toda renderizacao. Se esse elemento JSX tem filhos memoizados, eles serao forçados a re-renderizar.

**Sugestao:** Extrair para constantes ou `useMemo`:

```tsx
// LoadingSmart.tsx — fora do componente:
const RADAR_SWEEP_STYLE = { animationDuration: '2s' } as const;

// No JSX:
<div className="..." style={RADAR_SWEEP_STYLE} />
```

### 7.2 Sem content-visibility em listas (MEDIO)

**Problema:** Nenhum componente usa `content-visibility: auto` para otimizar renderizacao de listas longas. Ideal para:
- `SessionsSidebar.tsx` (lista de sessoes)
- `InvestigationDashboard.tsx` (lista de investigacoes)

**Sugestao:**

```tsx
<div className="..." style={{ contentVisibility: 'auto' }}>
  {items.map(item => <div key={item.id}>{item.name}</div>)}
</div>
```

### 7.3 Componentes definidos dentro de componentes (BAIXO)

Nao foram encontrados casos de inline component definitions (componentes definidos dentro do render de outro componente) — bom.

### 7.4 && conditional em vez de ternario (BAIXO)

`&&` e amplamente usado em JSX:
- `RadarPanel.tsx`: 10+ ocorrencias
- `EmptyStateHome.tsx`: 10+ ocorrencias
- Outros componentes: uso extensivo

**Risco:** `&&` com numero `0` renderiza "0" na tela. Exemplo: `{items.length && <Component/>}` renderiza "0" quando vazio.

**Sugestao:** Usar `ternario` com `null` ou `Boolean()` cast:

```tsx
// Em vez de:
{unreadCount > 0 && <span>{unreadCount}</span>}

// Manter (este e seguro pois > 0 ja e bool):
seguro

// Mas para casos como:
{items.length && <List items={items} />}  // PERIGO: renderiza "0"

// Usar:
{items.length > 0 && <List items={items} />}
```

Nao foi encontrado caso real de `0` renderizado, mas o padrao existe no codigo e merece atencao.

---

## Apendice A: Componentes Auditados

### Grande porte (~400-750 linhas) — prioridade de revisao

| Arquivo | Linhas | Memo? | useState | useEffect | useMemo | useCallback |
|---|---|---|---|---|---|---|
| EmptyStateHome.tsx | 748 | NAO | 8 | 0 | 2 | 0 |
| LoadingSmart.tsx | 660 | NAO | 8 | 6 | 3 | 6 |
| SettingsDrawer.tsx | 634 | NAO | 9 | 1 | 0 | 0 |
| MarkdownRenderer.tsx | 523 | **SIM** | 4 | 1 | 5 | 0 |
| PDFGenerator.ts | 582 | N/A | 0 | 0 | 0 | 0 |
| App.tsx | 524 | NAO | 0 | 0 | 0 | 0 |
| RadarPanel.tsx | 386 | NAO | 5 | 0 | 1 | 0 |
| InvestigationDashboard.tsx | 361 | NAO | 5 | 1 | 3 | 0 |
| MessageRow.tsx | 342 | **SIM** | 2 | 1 | 0 | 0 |
| ChatInterface.tsx | 329 | NAO | 0 | 0 | 1 | 3 |
| SessionsSidebar.tsx | 311 | NAO | 3 | 1 | 1 | 0 |
| WarRoom.tsx | 283 | NAO | 1 | 4 | 1 | 6 |

## Apendice B: Pacotes Pesados

| Pacote | Tamanho (node_modules) | Uso | Dynamic? |
|---|---|---|---|
| mermaid | 26 MB | MarkdownRenderer, PDFGenerator | **SIM** (ambos) |
| framer-motion | 5.4 MB | 5 componentes | NAO |
| cheerio | ~5 MB | documentExtractor | **SIM** |
| pdf-parse | ~10 MB | documentExtractor | **SIM** |
| mammoth | ~2 MB | documentExtractor | **SIM** |
| jspdf | ~3 MB | PDFGenerator | NAO |
| react-virtuoso | ~500 KB | MessageTimeline | NAO |
| @pinecone-database/pinecone | ~2 MB | Server-side | N/A |

## Apendice C: Pontos Fortes Identificados

1. **Mermaid dynamic import com singleton** — `MarkdownRenderer.tsx` carrega mermaid sob demanda com cache singleton. Excelente.
2. **React Compiler ativo em dev** — `vite.config.ts` usa babel-plugin-react-compiler (so em dev, por razao documentada).
3. **Code splitting de paineis laterais** — `ChatPanels.tsx` faz lazy loading de InvestigationDashboard, SettingsDrawer, WarRoom, RadarPanel, RadarSettings.
4. **manualChunks configurado** — mermaid e vendor (react/react-dom) sao chunkados separadamente.
5. **PWA com Service Worker** — caching de assets estaticos com Workbox (30 dias) e CDN externos (7 dias).
6. **Uso extensivo de useCallback/useMemo** em componentes como WarRoom, ChatInterface, SectionalBotMessage, LoadingSmart, MarkdownRenderer.
7. **TanStack Query ja configurado** — infra pronta, falta usar.
8. **chunkSizeWarningLimit ajustado** para 1500KB (vs default 500KB), consciente do tamanho do mermaid.

---

## Checklist para Remediacao (Prioridade)

### Semana 1 (Alto Impacto / Baixo Esforco)

- [ ] **P1** Adicionar `React.lazy()` para modais em App.tsx (EmailModal, FollowUpModal, UpdateNotificationModal)
- [ ] **P2** Adicionar `Cache-Control` headers nas API routes GET (/api/cnpj, /api/comex, /api/docs-rag)
- [ ] **P3** Adicionar framer-motion ao manualChunks no vite.config.ts
- [ ] **P5** Adicionar `React.memo()` em WarRoom, UserMenu, GhostMessageBlock

### Semana 2 (Medio Impacto / Esforco Moderado)

- [ ] **P1** Migrar fetch() mais frequente para useQuery (clientLookupService, cnpj)
- [ ] **P4** Extrair inline style objects no ClienteSeniorScore e LoadingSmart
- [ ] **P4** Extrair inline handlers com useCallback nos componentes grandes
- [ ] **P6** Adicionar debounce nos inputs de busca

### Semana 3 (Alto Impacto / Esforco Alto)

- [ ] **P1** Lazy-load LoadingSmart com dynamic import de geminiService
- [ ] **P1** Quebrar App.tsx em chunks com React.lazy por view/rota
- [ ] **P2** Dynamic import de jspdf em PDFGenerator.ts
- [ ] **P3** Adicionar deduplicacao de requests no clientLookupService

---

*Relatorio gerado por auditoria estatica em 2026-05-22. Nenhum arquivo foi modificado.*
