# ADR-0002: App.tsx como god component

**Data:** 28/06/2026
**Status:** Aceito — débito técnico documentado
**Componente:** `App.tsx` (702 LOC)
**Branch de referência:** `stabilize/from-production-fe6c6f9` @ `f014852b`

---

## Contexto

`App.tsx` é o componente raiz do Senior Scout 360. Ele é o ponto de montagem onde
20 hooks diferentes são instanciados e seus contratos são conectados. Toda a
infraestrutura de sessão, autenticação, carregamento, notificações, exportação,
chat e waterfall é inicializada aqui.

Este arquivo não implementa lógica de negócio — ele é um **orquestrador de hooks**.
Sua complexidade vem do número de hooks que gerencia e das 10+ condições que
controlam o que é renderizado na tela (overlay de loading, modais de auth, splash
de atualização, sidebar, chat, error boundaries).

O arquivo cresceu de ~200 linhas (versão inicial do produto) para 702 linhas
porque cada novo subsistema adicionava 1-3 hooks sem extrair a lógica de composição.
Commits como `a637f955` (finalizeWaterfallUI), `86753ecc` (force-clear overlay),
`baa1d00e` (Supabase Auth) e `8526982f` (truncamento de dossiê) mostram que
funcionalidades transversais foram adicionadas diretamente no App em vez de em
wrappers especializados.

O impacto no produto é total: se App.tsx falhar na montagem, o usuário vê tela
branca. Não há fallback — o `ErrorBoundary` captura erros em sub-árvores (chat,
dossiê) mas não cobre falhas na raiz do App.

---

## Responsabilidades acumuladas

| # | Responsabilidade | Linhas aprox | Deveria estar em |
|---|---|---|---|
| 1 | Instanciar 20 hooks e conectar contratos | 79-245 | `features/app-shell/AppProviders.tsx` |
| 2 | 4 lazy-loaded modais com retry (LoadingSmart, Email, FollowUp, Update) | 23-31, 425-460 | `components/AppModals.tsx` |
| 3 | Fallback de carregamento (HeroLoadingChunkFallback) | 36-47 | `components/HeroLoadingFallback.tsx` |
| 4 | Decisão de overlay hero (WATERFALL_PREVIEW_MIN_CHARS = 200, 6 condições) | 130-152 | `hooks/useHeroOverlayDecision.ts` |
| 5 | Timer de segurança anti-freeze (15s, RAF + setInterval + display:none) | 154-207 | `hooks/useHeroOverlaySafetyNet.ts` |
| 6 | Limpeza de serviço offline (clearWasOffline) | 214-224 | `hooks/useOfflineRecovery.ts` |
| 7 | Gerenciamento de sidebar (isSidebarOpen, toggle, atalho \\) | 128-129, 336-352 | `hooks/useSidebar.ts` |
| 8 | Lógica de tela de atualização (updateAvailable + dismissUpdate) | 226-227 | `hooks/useUpdateNotification.ts` |
| 9 | Render tree principal: Suspense + ErrorBoundary + condicionais de loading/auth | 500-700 | `components/AppShell.tsx` |

---

## Riscos conhecidos

1. **20 hooks instanciados na raiz**: Qualquer hook que lance exceção na montagem
   quebra o App inteiro. O `ErrorBoundary` só cobre sub-árvores (chat, dossiê),
   não a raiz. Impacto: tela branca total. Probabilidade: baixa.

2. **Timer de segurança com escopo acoplado** (linhas 154-207): O `setInterval`
   de 1s roda `document.querySelector` no DOM inteiro e chama `setIsLoading(false)`
   diretamente. Se o seletor mudar (ex: renomear data-testid no LoadingSmart),
   o timer nunca dispara e o overlay fica preso. Impacto: freeze permanente.
   Probabilidade: baixa-média.

3. **Decisão de overlay com 6 disjunções** (linhas 130-152):
   `showFullscreenLoadingSmart` combina `isWaterfallLoading`, `isNonWaterfallLoading`,
   `isFirstWaterfallGeneration`, `hasRenderableBotMessage`, `WATERFALL_PREVIEW_MIN_CHARS`,
   e `shouldShowHeroLoadingOverlay`. Cada condição adicional aumenta o risco de
   interação inesperada entre estados. Impacto: overlay aparece quando não deveria
   (ou não aparece quando deveria). Probabilidade: média.

4. **4 lazy components sem tratamento de chunk timeout**: `LoadingSmart`, `EmailModal`,
   `FollowUpModal` e `UpdateNotificationModal` usam `React.lazy` + `loadWithChunkRetry`,
   mas não há timeout global. Se a CDN estiver lenta e o chunk não carregar, o
   `Suspense` mantém o fallback indefinidamente. Impacto: usuário preso no loading.
   Probabilidade: baixa.

5. **chartStore com 26 campos desestruturados** (linhas 84-118): O App acessa
   26 campos do `chatStore` diretamente, criando acoplamento forte com a interface
   interna do store. Qualquer renomeação ou remoção de campo no `chatStore` quebra
   o App. Impacto: build quebrado ou runtime crash. Probabilidade: baixa-média.

6. **useDossierStore + useChatStore na mesma árvore**: Dois stores globais com
   estado sobreposto (sessão, loading, exportação) coexistem no mesmo componente
   sem barreira de sincronização. Atualizações concorrentes podem causar race
   condition. Impacto: estado inconsistente entre stores. Probabilidade: baixa.

---

## O que entendo que faz (Princípio 14)

1. **Montagem de 20 hooks** (linhas 79-245): Orquestra a inicialização de todos
   os subsistemas do produto em um único componente.

2. **useOperator + useMode** (linhas 80-81): Identidade do operador e modo de
   instrução do sistema (fonte canônica para todo o App).

3. **useChatStore** (linhas 84-118): Extrai 26 campos do store central de chat
   (sessões, loading, abort, progresso).

4. **useDossierStore** (linhas 119-127): Estado de exportação de dossiê (status,
   erro, conteúdo PDF, salvamento remoto).

5. **showFullscreenLoadingSmart** (linhas 130-152): `useMemo` que decide se o
   overlay de loading em tela cheia deve ser exibido, combinando estado do
   waterfall, loading genérico, primeira geração e preview mínimo de 200 chars.

6. **Timer de segurança anti-freeze** (linhas 154-207): `useEffect` que inicia
   um `setInterval` de 1s + `requestAnimationFrame`. Após 15s com overlay visível,
   força `setIsLoading(false)` e esconde elementos de loading via `style.display='none'`.

7. **Lazy loading com retry** (linhas 23-31): 4 componentes carregados sob demanda
   com `React.lazy` + `loadWithChunkRetry` para evitar bloqueio da primeira pintura.

8. **HeroLoadingChunkFallback** (linhas 36-47): Componente inline que exibe
   spinner enquanto chunks lazy são baixados. Separado do LoadingSmart (que é
   para o fluxo de investigação).

9. **Render tree com Suspense + ErrorBoundary** (linhas 500-700): Estrutura de
   renderização principal com `ErrorBoundary` para chat e dossiê, `Suspense` para
   componentes lazy, e condicionais para overlay, auth, onboarding e atualização.

10. **useOffline + clearWasOffline** (linhas 82, 214-224): Detecta reconexão e
    força reload de sessões após período offline.

11. **useUpdateNotification** (linha 226): Detecta nova versão do Service Worker
    e exibe modal de atualização.

12. **useToast + useRadar** (linhas 228-229): Sistema de notificações toast
    conectado ao módulo de radar setorial.

---

## O que NÃO entendo completamente (Princípio 14)

1. **Interação entre `showFullscreenLoadingSmart` e timer de segurança**: O timer
   (linhas 154-207) monitora `[data-testid="hero-loading-fullscreen"]` e força
   `setIsLoading(false)`. Mas `showFullscreenLoadingSmart` (linhas 130-152)
   decide SE o overlay deve aparecer. Se o timer disparar e `showFullscreenLoadingSmart`
   ainda for `true` no próximo render, o overlay volta? Ou o `setIsLoading(false)`
   é permanente?

2. **`WATERFALL_PREVIEW_MIN_CHARS = 200`**: O threshold de 200 caracteres para
   decidir se há "conteúdo renderizável" parece arbitrário. Não está claro se
   veio de medição real (quantos chars o primeiro módulo do waterfall produz)
   ou de estimativa inicial.

3. **`loadWithChunkRetry` sem limite de tentativas visível no App**: O retry é
   delegado para `utils/chunkRetry.ts`, mas o App não parece ter um fallback
   se TODAS as tentativas falharem (ex: CDN offline por 5 minutos).

4. **26 campos do chatStore**: A desestruturação massiva (linhas 84-118) sugere
   que o App conhece detalhes internos do store que idealmente seriam encapsulados.
   Não está claro quais desses 26 campos são essenciais para o App (vs. poderiam
   ser resolvidos internamente pelo store ou por hooks intermediários).

5. **Sincronização chatStore ↔ dossierStore**: `isSavingRemote` e `remoteSaveStatus`
   do `dossierStore` (linhas 125-126) coexistem com `sessions` do `chatStore`
   (linha 85). Se o dossiê for salvo remotamente e o chatStore não for atualizado,
   há divergência? Ou o chatStore é a fonte canônica e o dossierStore é só cache?

6. **`shouldShowHeroLoadingOverlay` importado** (linha 18): Função importada de
   `utils/loadingVariant.ts` que adiciona mais uma condição ao overlay.
   Não está claro o que exatamente ela verifica além das 5 condições já
   presentes em `showFullscreenLoadingSmart`.

---

## Plano de refatoração futuro

### Triviais (risco baixo)

1. **Extrair `HeroLoadingChunkFallback`** para `components/HeroLoadingFallback.tsx`.
   ~15 linhas, componente puro sem estado. Pré-requisito: nenhum.

2. **Extrair 4 lazy-loads** para `components/AppModals.tsx`. ~20 linhas,
   imports + lazy declarations. Pré-requisito: nenhum.

### Médio (risco médio)

3. **Extrair `showFullscreenLoadingSmart` + timer de segurança** para
   `hooks/useHeroOverlayWithSafetyNet.ts`. ~80 linhas. Pré-requisito: testes
   de regressão de overlay.

4. **Extrair `useOfflineRecovery`** para hook dedicado. ~15 linhas.
   Pré-requisito: nenhum.

5. **Criar `AppProviders` wrapper** que instancia useOperator, useMode,
   useOffline, useTheme, useToast, useRadar. ~40 linhas.
   Pré-requisito: nenhum.

### Complexo (risco alto)

6. **Extrair render tree condicional** para `components/AppShell.tsx`. ~200 linhas,
   com 10+ condições de renderização. Pré-requisito: extrações #1-#5 + testes E2E
   de todos os fluxos de entrada (login, convidado, onboarding, atualização).

---

## Justificativa de não refatorar agora

1. **Piloto de 20 usuários ativo**: O App é o ponto de entrada do produto.
   Qualquer erro de extração que quebre a montagem resulta em tela branca total —
   pior cenário possível.

2. **P0 de tela branca resolvido há 1 dia** (PR #396): O timer de segurança
   (linhas 154-207) é uma das defesas contra freeze. Mexer nele agora, sem
   testes de regressão de overlay, pode reintroduzir o P0.

3. **20 hooks interdependentes**: Mover hooks para wrappers separados exige
   entender a ordem de inicialização e as dependências entre eles. Uma inversão
   acidental na ordem dos providers pode quebrar silenciosamente.

4. **13 testes baseline insuficientes**: Nenhum teste cobre o App diretamente
   com todos os hooks montados. Refatorar sem coverage é aposta.

5. **Fase 6 é documentação, não refatoração**: O plano V3 determina que a
   Fase 6 apenas documenta débitos. A refatoração do App está planejada para
   após a Fase 5 (testes E2E de caminho crítico).

---

## Referências

- Plano V3: `PLAN/Review/07_PLANO_V3_REALISTA.md` — Fase 6, god component #2
- Princípios 12-14 (CLAUDE.md)
- ADR-0001 (waterfall-orchestrator.ts): `docs/adr/0001-waterfall-orchestrator-god-component.md`
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
| 28/06/2026 | Claude (Opus) | Autor — análise de código e redação do ADR |
| 28/06/2026 | IA Gestora | Validação — consistência com princípios 12-14 e plano V3 |
| Pendente | Bruno | Revisão — confirmação de que não refatorar agora é a decisão correta |
| Pendente | Sênior (Fase 9) | Revisão técnica aprofundada antes de iniciar refatoração |
