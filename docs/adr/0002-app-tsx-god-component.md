# ADR-0002: App.tsx como god component

**Data:** 28/06/2026
**Status:** Aceito — débito técnico documentado
**Componente:** `App.tsx` (702 LOC)
**Branch de referência:** `stabilize/from-production-fe6c6f9` @ `4e65bb1`

---

## Contexto

O `App.tsx` é o ponto de entrada da aplicação Scout 360 (Vite + React 18 + TypeScript). Em uma arquitetura saudável, um `App.tsx` deveria ter ~50-100 LOC e ser apenas **composição de providers + roteamento**. Este arquivo tem **702 LOC** e acumula responsabilidades que pertencem a camadas distintas (estado, handlers de UX, diagnóstico, lifecycle).

Ele é o componente raiz onde 20 hooks diferentes são instanciados e seus contratos são conectados. Toda a infraestrutura de sessão, autenticação, carregamento, notificações, exportação, chat e waterfall é inicializada aqui. `ChatInterface` e `AuthGate` são os dois principais componentes renderizados a partir da árvore do App.

### Como chegou a este tamanho

- **Origem (2025):** App.tsx começou pequeno (~200 LOC) com providers + ChatInterface.
- **Crescimento orgânico (2025-2026):** Cada novo feature (radar, follow-up, deep dive, export PDF, service worker cleanup) adicionou um handler diretamente no App em vez de em hook especializado. Commits como `a637f955` (finalizeWaterfallUI), `86753ecc` (force-clear overlay), `baa1d00e` (Supabase Auth) e `8526982f` (truncamento de dossiê) mostram que funcionalidades transversais foram adicionadas diretamente aqui.
- **P0 de tela branca (2026-06-25 a 27):** Foram adicionados 2 `useEffect` de diagnóstico e 1 invariante de segurança (forçar remoção do overlay stuck) via `scoutDiag`. Cada um adicionou 15-30 LOC.
- **PWA removal (PR #334):** Adicionou 25 LOC de cleanup de service worker antigo — deveria estar em `utils/swCleanup.ts`.
- **Resultado:** hoje são 9 `useEffect`, 6 handlers de UX, 3 sub-componentes (`HeroLoadingChunkFallback`, `isTopicDeepDiveDisplayMessage`) inline, e 1 bloco JSX com 30+ props passadas ao `ChatInterface`.

O impacto no produto é total: se App.tsx falhar na montagem, o usuário vê tela branca. Não há fallback — o `ErrorBoundary` captura erros em sub-árvores (chat, dossiê) mas não cobre falhas na raiz do App.

---

## Responsabilidades acumuladas

| # | Responsabilidade | Linhas aprox | Deveria estar em |
|---|---|---|---|
| 1 | Composição de providers (AuthGate, ChatErrorBoundary, DossierErrorBoundary, modais) | 514-694 | ✅ App.tsx (correto) |
| 2 | Estado de UI (sidebar open/close, theme toggle) | 80-128 | ✅ App.tsx (correto) |
| 3 | Diagnóstico de overlay stuck (`useEffect` que força `display: none` no `hero-loading-fullscreen`) | 167-183 | `hooks/useOverlaySafetyCheck.ts` |
| 4 | Diagnóstico de render-decision (`scoutDiag.info` overlay:render-decision) | 142-165 | `hooks/useOverlayRenderLogging.ts` |
| 5 | Service Worker cleanup (PWA removido, mas código ficou) | 185-213 | `utils/swCleanup.ts` |
| 6 | Diagnóstico de build info (buildSha, vercelEnv) | 215-223 | `hooks/useBuildInfo.ts` |
| 7 | 4 lazy-loaded modais com retry (LoadingSmart, Email, FollowUp, UpdateNotification) via `loadWithChunkRetry` | 23-31, 425-460 | `components/AppModals.tsx` |
| 8 | Fallback de carregamento `HeroLoadingChunkFallback` inline | 36-49 | `components/HeroLoadingChunkFallback.tsx` |
| 9 | Helper `isTopicDeepDiveDisplayMessage` inline | 74-77 | `utils/topicDeepDive.ts` |
| 10 | Instanciar `useDossierWaterfallOrchestrator` + `useChatMessageOrchestrator` + `useSessionManager` | 259-292 | `features/app-shell/AppOrchestrators.tsx` |
| 11 | Invocar `useAppInitialization` que controla gate `isInitialized` | 261 | `hooks/useAppInitialization.ts` |
| 12 | Decisão de overlay hero (`shouldShowHeroLoadingOverlay` + `WATERFALL_PREVIEW_MIN_CHARS = 200`) | 130-152 | `hooks/useHeroOverlayDecision.ts` |

---

## Riscos conhecidos

1. **Re-render em cascata**: Qualquer mudança em `allMessages` (que muda a cada token LLM) re-renderiza todo App.tsx. Isso re-renderiza 15+ filhos, mesmo os que não dependem de messages. Impacto: performance em dossiês longos (48K chars).

2. **20 hooks instanciados na raiz**: Qualquer hook que lance exceção na montagem quebra o App inteiro. O `ErrorBoundary` só cobre sub-árvores (chat, dossiê), não a raiz. Impacto: tela branca total. Probabilidade: baixa.

3. **Timer de segurança com escopo acoplado** (linhas 167-183): O `setInterval` de 1s roda `document.querySelector` no DOM inteiro e chama `setIsLoading(false)` diretamente. Se o seletor mudar (ex: renomear data-testid no LoadingSmart), o timer nunca dispara e o overlay fica preso. Impacto: freeze permanente. Probabilidade: baixa-média.

4. **Decisão de overlay com 6 disjunções** (linhas 130-152): `showFullscreenLoadingSmart` combina `isWaterfallLoading`, `isNonWaterfallLoading`, `isFirstWaterfallGeneration`, `hasRenderableBotMessage`, `WATERFALL_PREVIEW_MIN_CHARS`, e `shouldShowHeroLoadingOverlay`. Cada condição adicional aumenta o risco de interação inesperada entre estados. Impacto: overlay aparece quando não deveria. Probabilidade: média.

5. **chatStore com 26 campos desestruturados** (linhas 84-118): O App acessa 26 campos do `chatStore` diretamente, criando acoplamento forte com a interface interna do store. Qualquer renomeação ou remoção de campo no `chatStore` quebra o App. Impacto: build quebrado ou runtime crash. Probabilidade: baixa-média.

6. **useDossierStore + useChatStore na mesma árvore**: Dois stores globais com estado sobreposto (sessão, loading, exportação) coexistem no mesmo componente sem barreira de sincronização. Atualizações concorrentes podem causar race condition. Impacto: estado inconsistente entre stores. Probabilidade: baixa.

7. **Diagnóstico misturado com produção**: 3 `useEffect` são puramente de diagnóstico (`scoutDiag.info`). Em produção são inofensivos, mas em refactor podem ser removidos por engano — perdendo telemetria crítica de P0. Impacto: P0 silencioso. Probabilidade: baixa.

---

## O que entendo que faz (Princípio 14)

1. **Montagem de 20 hooks** (linhas 79-245): Orquestra a inicialização de todos os subsistemas do produto em um único componente.

2. **useOperator + useMode** (linhas 80-81): Identidade do operador e modo de instrução do sistema (fonte canônica para todo o App).

3. **useChatStore** (linhas 84-118): Extrai 26 campos do store central de chat (sessões, loading, abort, progresso).

4. **useDossierStore** (linhas 119-127): Estado de exportação de dossiê (status, erro, conteúdo PDF, salvamento remoto).

5. **showFullscreenLoadingSmart** (linhas 130-152): `useMemo` que decide se o overlay de loading em tela cheia deve ser exibido, combinando estado do waterfall, loading genérico, primeira geração e preview mínimo de 200 chars. Inclui `shouldShowHeroLoadingOverlay` importado de `utils/loadingVariant.ts`.

6. **Timer de segurança anti-freeze** (linhas 167-183): `useEffect` que inicia um `setInterval` de 1s + `requestAnimationFrame`. Após 15s com overlay visível, força `setIsLoading(false)` e esconde elementos de loading via `style.display='none'`.

7. **Lazy loading com retry** (linhas 23-31): 4 componentes (`LoadingSmart`, `EmailModal`, `FollowUpModal`, `UpdateNotificationModal`) carregados sob demanda com `React.lazy` + `loadWithChunkRetry` para evitar bloqueio da primeira pintura.

8. **HeroLoadingChunkFallback** (linhas 36-49): Componente inline que exibe spinner enquanto chunks lazy são baixados. Separado do LoadingSmart (que é para o fluxo de investigação).

9. **Render tree com Suspense + ErrorBoundary** (linhas 500-700): Estrutura de renderização principal com `ErrorBoundary` para chat e dossiê, `Suspense` para componentes lazy, e condicionais para overlay, auth, onboarding e atualização.

10. **useOffline** (linhas 82, 214-224): Detecta reconexão e força reload de sessões após período offline com `clearWasOffline`.

11. **useUpdateNotification** (linha 226): Detecta nova versão do Service Worker e exibe modal de atualização.

12. **useToast + useRadar** (linhas 228-229): Sistema de notificações toast conectado ao módulo de radar setorial.

13. **Composição de providers** (linhas 514-694): Estrutura `AuthGate` → `ChatErrorBoundary` → `ChatInterface` → `DossierErrorBoundary` → modais lazy. Padrão React claro.

14. **Service Worker cleanup** (linhas 185-213): Desregistra SWs antigos e limpa caches Workbox. PWA foi removido (PR #334), mas usuários antigos ainda têm SW instalado. Comportamento defensivo correto.

15. **`isTopicDeepDiveDisplayMessage`** (linhas 74-77): Checa se displayMessage começa com "Dossiê completo:" — heurística para feature flag de deep dive.

16. **`useSessionManager`** (linha 259): Retorna handlers para nova/selecionar/deletar sessão. Conecta o ciclo de vida de sessão ao App.

17. **`useChatMessageOrchestrator`** (linha 292): Retorna `handleSendMessage` e `retryLastSendMessage` — callbacks principais do fluxo de chat.

18. **`useAppInitialization`** (linha 261): Controla o gate `isInitialized` que bloqueia render até sessões carregarem. Espera load sessions + auth.

19. **`useDossierWaterfallOrchestrator`** (linha 287): Retorna `runMegaPromptWaterfall` — callback principal para gerar dossiê via waterfall.

---

## O que NÃO entendo completamente (Princípio 14)

1. **Interação entre `showFullscreenLoadingSmart` e timer de segurança**: O timer (linhas 167-183) monitora `[data-testid="hero-loading-fullscreen"]` e força `setIsLoading(false)`. Mas `showFullscreenLoadingSmart` (linhas 130-152) decide SE o overlay deve aparecer. Se o timer disparar e `showFullscreenLoadingSmart` ainda for `true` no próximo render, o overlay volta? Ou o `setIsLoading(false)` é permanente?

2. **`WATERFALL_PREVIEW_MIN_CHARS = 200`**: O threshold de 200 caracteres para decidir se há "conteúdo renderizável" parece arbitrário. Não está claro se veio de medição real (quantos chars o primeiro módulo do waterfall produz) ou de estimativa inicial.

3. **`loadWithChunkRetry` sem limite de tentativas visível no App**: O retry é delegado para `utils/chunkRetry.ts`, mas o App não parece ter um fallback se TODAS as tentativas falharem (ex: CDN offline por 5 minutos).

4. **26 campos do chatStore**: A desestruturação massiva (linhas 84-118) sugere que o App conhece detalhes internos do store que idealmente seriam encapsulados. Não está claro quais desses 26 campos são essenciais para o App.

5. **Sincronização chatStore ↔ dossierStore**: `isSavingRemote` e `remoteSaveStatus` do `dossierStore` (linhas 125-126) coexistem com `sessions` do `chatStore` (linha 85). Se o dossiê for salvo remotamente e o chatStore não for atualizado, há divergência?

6. **`shouldShowHeroLoadingOverlay` importado** (linha 18): Função importada de `utils/loadingVariant.ts` que adiciona mais uma condição ao overlay. Não está claro o que exatamente ela verifica além das condições já presentes.

7. **`activeGenerationRef.current[sessionId]`** — é um mapa session→botMessageId? Por que via ref e não store? Padrão não documentado.

8. **`completedLoadingStatuses`, `loadingTotalStages`, `loadingIsIncremental`** — extraídos do store mas não usados neste arquivo. Por que estão na desestruturação? Bug de refactor passado?

---

## Plano de refatoração futuro

### Triviais (risco baixo)

1. **Extrair `HeroLoadingChunkFallback`** para `components/HeroLoadingChunkFallback.tsx`. ~15 linhas, componente puro sem estado. Pré-requisito: nenhum.

2. **Extrair 4 lazy-loads** para `components/AppModals.tsx`. ~20 linhas, imports + lazy declarations. Pré-requisito: nenhum.

3. **Extrair `isTopicDeepDiveDisplayMessage`** para `utils/topicDeepDive.ts`. ~4 linhas, com teste unitário. Pré-requisito: nenhum.

### Médio (risco médio)

4. **Extrair `showFullscreenLoadingSmart` + timer de segurança** para `hooks/useHeroOverlayWithSafetyNet.ts`. ~80 linhas. Pré-requisito: testes de regressão de overlay.

5. **Extrair Service Worker cleanup** para `hooks/useServiceWorkerCleanup.ts`. ~30 linhas. Pré-requisito: nenhum.

6. **Extrair build-info logging** para `hooks/useBuildInfo.ts`. ~10 linhas. Pré-requisito: nenhum.

7. **Criar `AppProviders` wrapper** que instancia useOperator, useMode, useOffline, useTheme, useToast, useRadar. ~40 linhas. Pré-requisito: nenhum.

### Complexo (risco alto)

8. **Extrair render tree condicional** para `components/AppShell.tsx`. ~200 linhas, com 10+ condições de renderização. Pré-requisito: extrações #1-#7 + testes E2E de todos os fluxos de entrada (login, convidado, onboarding, atualização).

---

## Justificativa de não refatorar agora

1. **Piloto de 20 usuários ativo**: O App é o ponto de entrada do produto. Qualquer erro de extração que quebre a montagem resulta em tela branca total — pior cenário possível.

2. **P0 de tela branca resolvido há 1 dia** (PR #396): O timer de segurança (linhas 167-183) é uma das defesas contra freeze. Mexer nele agora, sem testes de regressão de overlay, pode reintroduzir o P0.

3. **Bruno não lê código fluentemente**: Refatoração que ele não consegue validar é dívida técnica disfarçada de melhoria. Melhor documentar e esperar Fase 9 (self-audit) ou revisão sênior externa.

4. **13 testes baseline insuficientes**: Nenhum teste cobre o App diretamente com todos os hooks montados. Refatorar sem coverage é aposta.

5. **Fase 6 é documentação, não refatoração**: O plano V3 determina que a Fase 6 apenas documenta débitos. A refatoração do App está planejada para após a Fase 5 (testes E2E de caminho crítico).

---

## Referências

- Plano V3: `PLAN/Review/07_PLANO_V3_REALISTA.md` — Fase 6, god component #2
- Princípios 12-14 (CLAUDE.md)
- ADR-0001 (waterfall-orchestrator.ts): `docs/adr/0001-waterfall-orchestrator-god-component.md`
- P0 original (tela branca): PR #396 (commit `d2ea67f`)
- PR #399 (teste anti-regressão): commit `4e65bb1`
- PR #334 (PWA removal, origem do SW cleanup)
- Commits do git log (branch `stabilize/from-production-fe6c6f9`):
  - `78c919e7` — Fase 3: desgeminização
  - `baa1d00e` — Supabase Auth (AuthContext, AuthModal, profiles)
  - `8526982f` — Truncamento frontend de dossiê
  - `a637f955` — finalizeWaterfallUI
  - `86753ecc` — Force-clear overlay
  - `d0528cb2` — Remove Pinecone dependency
  - `2cd2cffa` — Fix freeze dossiê hero

---

## Histórico de revisão

| Data | Revisor | Ação |
|---|---|---|
| 28/06/2026 | DeepSeek + IA gestora | Autor — análise de código (DeepSeek v1) + merge com piloto IA gestora (v2) |
| 28/06/2026 | IA Gestora | Validação — consistência com princípios 12-14 e plano V3 |
| Pendente | Bruno | Revisão — confirmação de que não refatorar agora é a decisão correta |
| Pendente | Sênior (Fase 9) | Revisão técnica aprofundada antes de iniciar refatoração |
