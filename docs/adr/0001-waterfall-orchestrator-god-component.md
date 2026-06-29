# ADR-0001: waterfall-orchestrator.ts como god component

**Data:** 28/06/2026
**Status:** Aceito — débito técnico documentado
**Componente:** `features/dossier/waterfall-orchestrator.ts` (1604 LOC)
**Branch de referência:** `stabilize/from-production-fe6c6f9` @ `4e65bb1`

---

## Contexto

O `waterfall-orchestrator.ts` é o coração da geração de dossiês no Senior Scout 360, plataforma de inteligência comercial e sales intelligence para o agronegócio brasileiro.

Ele é responsável por coordenar a execução sequencial de até 7 módulos LLM:
Porte/Teia Societária, Operação, Bordas de Controle, Riscos & Compliance, Caminho de
Venda, Benchmark e Consolidação. Juntos, estes módulos produzem o dossiê final de
inteligência comercial para cada empresa analisada. Sem este arquivo, nenhum dossiê
é gerado no produto.

Ele é o único ponto de entrada que conecta a interface de chat do usuário (via
`message-orchestrator.ts`) aos serviços de LLM (Gemini e/ou LiteLLM), lookup de
clientes senior, grounding web, validação de CNPJ contra fontes oficiais (Brasil API)
e persistência no Supabase. Ou seja: é o "cérebro" que decide o que perguntar para
o modelo de IA, em que ordem, com que contexto, e o que fazer com a resposta.

O arquivo cresceu organicamente ao longo de 8 sprints de desenvolvimento intensivo,
com contribuições de pelo menos 3 engenheiros diferentes. O que começou como um hook
React simples (`useDossierWaterfallOrchestrator`, ainda visível na linha 518) para
coordenar algumas chamadas de API se transformou em um god component de 1604 linhas.

O god component mescla as seguintes responsabilidades:

- Orquestração de pipeline (5 módulos + 1 sub-pipeline + benchmark + consolidação)
- Lógica de negócio (derivação de complexidade, detecção de holdings/entidades internacionais)
- Validação de saída (CNPJ contra fontes oficiais, fontes inline promovíveis)
- Gerenciamento de estado React (loading progress em 7 stages, failure count, active generation ref)
- Fallback de sessão contra race condition do React 18 batching
- Persistência assíncrona fire-and-forget
- Health-check pós-execução com snapshot completo de DOM e store

A história do arquivo no git reflete o crescimento do produto e a urgência dos
sprints. Commits como `a637f955` (finalizeWaterfallUI — extração bem-sucedida que
serviu de template para este ADR), `f6ff864d` (inline source validation non-blocking),
`5edb1afc` (QSA CNPJs no knownCnpjs + log no catch silencioso), `270d7d05` (fix:
Consolidando informações travado + 4 alertas Sentry), `4a102b10` (useEffect
self-destruct, normalize stage) e `12009558` (valida 14 dígitos + CNPJ no texto QSA)
mostram que correções de bugs P0 e melhorias contínuas foram aplicadas diretamente
aqui, em vez de em módulos especializados.

Isso era a decisão pragmática no momento: cada P0 resolvido rapidamente salvava a
experiência do usuário no piloto de 20 usuários do agronegócio brasileiro. O custo
de extrair uma função para outro arquivo, atualizar imports, testar o isolamento,
e garantir que o contrato não quebrou era maior que o custo de simplesmente adicionar
mais linhas no arquivo existente.

Porém, o custo acumulado é significativo. O arquivo faz 13 responsabilidades
distintas, é difícil de testar isoladamente, e exige ler o arquivo inteiro para
entender qualquer fluxo. São 1604 linhas, 63 linhas de imports de 30+ arquivos de
16+ módulos diferentes. Cada novo recurso adiciona um import e mais linhas neste
arquivo central, aumentando o acoplamento e o risco de regressão.

O arquivo importa de módulos variados como:

- `foundation-cache.ts` (106 linhas, cache Gemini com TTL de 600s)
- `finalizeWaterfallUI.ts` (121 linhas, limpeza atômica de loading com double RAF e 4 seletores DOM)
- `waterfall-guard.ts` (172 linhas, trava anti-restart-loop por sessão com cooldown de 5s)
- `benchmark-stage.ts` (estágio de benchmark entre módulos e PORTA)
- `porta-reconciliation.ts` (reconciliação de score com timeout de 120s)
- `megaPrompts.ts` (7 prompts diferentes para os módulos)
- `clientLookupService.ts`, `competitorService.ts`, `portaStateService.ts`
- `brasilApiService.ts`, `storage.ts`, `chatStore.ts`
- Diversas utils de diagnóstico, CNPJ, privacidade e fonte de dados

O grafo de dependências é complexo e qualquer mudança em um módulo importado pode
quebrar o waterfall silenciosamente.

---

## Responsabilidades acumuladas

| #   | Responsabilidade                                                                               | Linhas aprox       | Deveria estar em                           |
| --- | ---------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------ |
| 1   | Orquestração de 5 módulos LLM sequenciais com abort, timeout (90s/60s) e fallback opcional     | 729-983            | `features/dossier/dossier-pipeline.ts`     |
| 2   | Sub-orquestração Teia Societária (Identidade + Profundidade com fallback genérico)             | 787-927            | `features/dossier/teia-orchestrator.ts`    |
| 3   | Construção de contexto estático (lookup, senior evidence, teia research para foundation cache) | 643-696            | `services/llm/foundation-cache.ts`         |
| 4   | Validação pós-geração de CNPJs contra fontes oficiais (threshold de 30% não confirmados)       | 430-516            | `services/cnpj-validator.ts`               |
| 5   | Reconciliação de score PORTA com Promise.race + timeout de 120s                                | 1010-1067          | `features/dossier/porta-reconciliation.ts` |
| 6   | Validação inline de fontes promovíveis (timeout total 5s, body read timeout 3s)                | 254-416            | `services/web-verification.ts`             |
| 7   | Gerenciamento de estado de loading (7 stages, reset incremental com keepHistory: 4)            | 930-1008           | `hooks/useLoadingProgress.ts`              |
| 8   | Fallback de sessão perdida por race condition React 18 (2 cenários documentados)               | 1374-1435          | `stores/chatStore.ts`                      |
| 9   | Persistência fire-and-forget no Supabase com evento dossier:completed + timeout 15s            | 1440-1481          | `services/storage.ts`                      |
| 10  | Cache foundation: criação (antes dos módulos) e deleção (finally, fire-and-forget 15s)         | 669-696, 1487-1509 | `services/llm/foundation-cache.ts`         |
| 11  | Health-check final com snapshot DOM + store (5+ dimensões, 35+ linhas de diagnóstico)          | 1520-1557          | `utils/diagnosticLog.ts`                   |
| 12  | Finalização atômica de UI (isLoading, loadingVariant, progress, failureCount, overlay DOM)     | 1566-1579          | `utils/finalizeWaterfallUI.ts`             |
| 13  | Geração de sugestões de continuidade com timeout de 20s e fallback para sugestões genéricas    | 1150-1239          | `utils/messageHelpers.ts`                  |

---

## Riscos conhecidos

1. **Vazamento de contexto entre módulos**: `WATERFALL_CONTEXT_WINDOW_CHARS` (12.000 chars)
   limita o contexto acumulado passado entre módulos via `accumulatedText.slice(-WATERFALL_CONTEXT_WINDOW_CHARS)`,
   implementado em `buildDynamicDossierContext` no `foundation-cache.ts` (linha 46).
   Não há isolamento garantido entre módulos. Se o módulo 1 (Porte/Teia) alucinar um
   CNPJ ou uma relação societária, essa informação incorreta será passada como contexto
   para o módulo 2 (Operação), que pode usá-la como verdade para construir a análise.
   O erro se propaga silenciosamente por todo o dossiê.
   Impacto: alucinação propagada por 2-3 seções do dossiê. Probabilidade: média.

2. **Timeouts rígidos sem adaptive retry**: `MODULAR_REQUIRED_STEP_TIMEOUT_MS` (90s, linha 70)
   e `MODULAR_OPTIONAL_STEP_TIMEOUT_MS` (60s, linha 71) são constantes fixas. Se a API
   do LLM estiver lenta (já aconteceu em produção com Gemini durante picos de uso),
   módulos obrigatórios falham e o dossiê inteiro é perdido. Não há retry adaptativo,
   escalonamento de timeout baseado em latência histórica, ou fallback para modelo
   mais rápido. Impacto: dossiê perdido, usuário precisa reiniciar. Probabilidade: baixa-média.

3. **Race condition de sessão (Cenários A e B do React 18 batching)**: Documentado em
   detalhe nas linhas 1329-1333. `updateSessionById` pode perder a sessão quando React
   faz batch de `setState` e o cache do store está limpo (primeira carga da página).
   O fallback via `sessionsRef.current` (linhas 1374-1435) recupera a sessão, mas cada
   recuperação replica ~50 linhas de lógica de atualização de mensagem (score PORTA,
   grounding sources, web verification status, suggestions, isThinking, isError,
   errorDetails). A lógica duplicada é um ponto de divergência futura.
   Impacto: sessão perdida sem fallback = usuário vê tela de chat vazia.
   Probabilidade: baixa.

4. **Sentry captureMessage sem mecanismo de rollback**: `Sentry.captureMessage` é chamado
   em 2 pontos críticos (generation ref cleared na linha 1251, session persist failed
   na linha 1335), ambos com nível `warning` e tags de área específicas. Não há
   mecanismo de retry automático ou rollback de estado. O Sentry captura o erro para
   diagnóstico, mas o usuário já perdeu o dossiê ou a sessão. Se o Sentry estiver
   configurado apenas para `error` level (padrão), estes warnings passam despercebidos.
   Impacto: P0 silencioso. Probabilidade: baixa.

5. **Fire-and-forget sem garantia de persistência**: Persistência Supabase (linhas
   1440-1481) e deleção de cache foundation (linhas 1487-1509) são fire-and-forget
   com timeout de 15s e warning. Se ambas falharem (Supabase offline, rede intermitente),
   o dossiê existe apenas no React state em memória e é perdido no refresh da página.
   Não há fallback para localStorage, IndexedDB, ou retry programado. O evento
   `dossier:completed` também não é disparado se o save falhar.
   Impacto: perda de dados do usuário sem recuperação. Probabilidade: baixa.

6. **Módulo opcional falha sem validação de coerência**: Quando um módulo opcional falha
   (catch na linha 969-981), o pipeline continua com `previousStageCompleted = false`
   e o texto acumulado anterior. Não há validação de que o texto acumulado é coerente
   sem aquele módulo. O usuário vê um dossiê parcial sem indicação clara de quais
   seções faltam. A nota operacional na linha 1070-1072 lista os módulos que falharam,
   mas fica no final do dossiê, depois de todas as seções.
   Impacto: dossiê parcial enganoso. Probabilidade: alta.

7. **Complexidade ciclomática da useCallback**: O callback `runMegaPromptWaterfall`
   (linhas 547-1601, ~1054 linhas) tem 12 entradas no array de dependências do
   `useCallback` (linhas 1588-1600). Dentro dele, há 2 hooks internos (`useCallback(1)`,
   `useRef(1)`) e mais de 20 chamadas a `scoutDiag`. Qualquer mudança em qualquer
   dependência pode causar re-render imprevisível ou stale closure.
   Impacto: bugs difíceis de rastrear (já ocorreram — ver commits `4a102b10` e
   `270d7d05`). Probabilidade: média.

8. **30+ imports de 16+ módulos**: As importações (linhas 1-62) formam um grafo onde o
   waterfall é folha de consumo de quase todos os módulos do sistema. Uma mudança de
   interface em `megaPrompts.ts`, `foundation-cache.ts`, `porta-reconciliation.ts`,
   `benchmark-stage.ts` ou qualquer outro módulo importado pode quebrar o waterfall
   silenciosamente em tempo de execução. Não há barreira de contrato entre os módulos.
   Impacto: regressão difícil de rastrear. Probabilidade: baixa-média.

---

## O que entendo que faz (Princípio 14)

1. **`useDossierWaterfallOrchestrator`** (linha 518): Hook React que retorna
   `runMegaPromptWaterfall`, o único callback público. Conecta o `chatStore` ao
   pipeline, resolvendo 7 dependências com `requireDependency` que lança `Error` se
   algo essencial estiver faltando. Aceita `Partial<UseDossierWaterfallOrchestratorOptions>`.

2. **`runMegaPromptWaterfall`** (linhas 547-1601): Callback principal de ~1054 linhas
   que executa todo o pipeline, do registro no WaterfallGuard até a finalização da UI.
   Inclui 5 módulos LLM, benchmark, reconciliação PORTA, validação inline, finalização
   markdown, continuidade, persistência, health-check e finalizeWaterfallUI.

3. **`buildDossierSeedContext`** (linhas 109-118): Extrai contexto cadastral do prompt
   bruto do usuário via 2 regexes (contexto obrigatório e radar context). Função pura,
   0 dependências. Retorna string vazia se input vazio.

4. **`buildTeiaResearchContext`** (linhas 141-229): Função assíncrona que busca QSA
   oficial na Brasil API, concorrentes regionais e estado PORTA. Retorna
   `TeiaResearchContext` com texto combinado + `objectiveComplexity` (BAIXA/MEDIA/ALTA).
   Cada chamada externa tem try/catch próprio com `scoutDiag.warn`.

5. **`validateTeiaCnpjsOutput`** (linhas 430-516): Após geração do módulo Teia, extrai
   CNPJs do texto gerado com regex e cruza com CNPJs conhecidos do contexto QSA/lookup.
   Se >30% dos CNPJs citados não forem confirmados, emite warning. Detecta entidades
   internacionais (S.A.S., B.V., GmbH, Inc., Ltd., S.L.) com 6 regexes.

6. **`validateInlineSourcesForPromotion`** (linhas 254-416): Exportada publicamente.
   Extrai fontes inline candidatas do texto final (max `MAX_INLINE_SOURCES_TO_VALIDATE`=8).
   Valida cada uma com timeout total de `VALIDATE_INLINE_TOTAL_TIMEOUT_MS` (5s) e
   body read de `VALIDATE_INLINE_BODY_READ_TIMEOUT_MS` (3s).

7. **`runTeiaSocietariaOrchestration`** (linhas 787-927): Sub-pipeline interno de 2
   passos: módulo Identidade (obrigatório, timeout 90s, temperature 0.1) + módulo
   Profundidade (condicional, só se MEDIA/ALTA). Se Identidade falha, fallback para
   módulo Porte genérico. Extrai marcador `[[TEIA_COMPLEXIDADE:X]]` para decidir.

8. **`reconcileWaterfallPorta`** (linhas 1021-1067): Reconciliação de score PORTA com
   `Promise.race` + timeout de `PORTA_RECONCILIATION_TIMEOUT_MS` (120s). Se falha ou
   timeout, ativa `portaIntegrityHold = true` e continua sem score.

9. **`appendGroundingSources`** (linhas 595-611): Acumula fontes de grounding com
   deduplicação por URL normalizada. Mantém `waterfallGroundingSources` (VerifiedSource[])
   e `sessionSourcePool` (DossierSourceRef[]) sincronizados.

10. **`withInlineValidationBudget`** (linhas 235-252): Helper Promise.race contra timeout.
    Usado para URLs lentas na validação inline. Inclui `finally` com `clearTimeout`.

11. **`ensureContinuitySuggestions`** (linhas 1235-1239): Garante sugestões de continuidade
    mesmo se `generateContinuityQuestion` falhar ou timeout (20s). Fallback para
    sugestões genéricas baseadas no nome da empresa.

12. **Health-check final** (linhas 1520-1557): Snapshot completo do sistema: sessão no
    ref, contagem de mensagens, texto do bot, estados de loading (isLoading,
    loadingVariant), e 4 métricas de DOM (body text, bot-message-content,
    loading-smart-overlay, chat-input disabled).

13. **WaterfallGuard** (linhas 563-576): Trava anti-restart-loop: 1 waterfall por sessão,
    cooldown de `WATERFALL_COOLDOWN_MS` (5s). Se bloqueado por `already_running`,
    `cooldown` ou `max_restarts`, remove a mensagem do bot e retorna.

14. **Foundation cache** (linhas 669-696): Cache de contexto para Gemini via
    `createWaterfallFoundationCache`. TTL `WATERFALL_FOUNDATION_CACHE_TTL` (600s),
    ferramentas `WATERFALL_FOUNDATION_CACHE_TOOLS` com googleSearch. Só ativo se
    `isFoundationCacheEnabled()` retornar true. Deletado no `finally`.

---

## O que NÃO entendo completamente (Princípio 14)

1. **`deriveObjectiveComplexity`** (linhas 130-139): A lógica de thresholds (>=9 CNPJs
   = ALTA, >=4 = MEDIA, >=3 QSA = MEDIA, holding = MEDIA, internacional = ALTA) parece
   empírica. Não está claro se esses números vieram de análise de dados reais de QSA
   no agronegócio brasileiro ou de estimativa inicial. Thresholds errados podem
   subestimar ou superestimar a complexidade.

2. **`runDossierBenchmarkStage`** (importado de `features/dossier/benchmark-stage.ts`, 54 LOC): Executa
   benchmark de mercado via `getIsolatedBenchmark` com timeout de 20s, injeta resultado no waterfall
   via `appendWaterfallChunk`. Entendo o fluxo básico, mas NÃO entendo completamente: (a) como o
   benchmark interage com o texto acumulado dos módulos anteriores — ele sobrescreve, prepende ou
   appende? (b) o que `getIsolatedBenchmark` retorna exatamente (texto formatado? JSON? markdown?);
   (c) qual a relação entre este benchmark e o módulo "Benchmark" citado no Contexto deste ADR
   (7 módulos LLM) — são o mesmo conceito ou coisas diferentes?

3. **Fallback de sessão `setSessions` com findIndex + prepend** (linhas 1407-1417):
   O comentário explica que `findIndex + prepend` previne perda de sessão com `prev[]`
   vazio (React 18 batching). Mas a interação entre `updateSessionById` (callback de
   `setState`) e `setSessions` (chamada direta no store) não é evidente.

4. **`ensureWaterfallScorePorta`** (linha 1080): Chamado após reconciliação, importado
   de `porta-reconciliation.ts`. Não está claro como o score de oportunidade é mesclado
   no texto final do dossiê sem quebrar a fluência narrativa.

5. **`enforceSeniorEvidenceConstraints` e `appendSeniorEvidenceNote`** (linhas 1088-1093):
   Modificam o texto final do dossiê. Não está claro o critério de inclusão ou remoção
   de evidências de senioridade, ou se há efeitos colaterais na coerência narrativa.

6. **Evento `dossier:completed`** (linha 1458-1465): Disparado via `window.dispatchEvent`
   após `saveDossier` bem-sucedido. Não está claro quais listeners escutam este evento
   ou qual o impacto se ele nunca disparar (save falhou).

7. **`resetLoadingProgress` com `keepHistory: 4`** (linha 934): Na segunda interação,
   o loading progress é reiniciado com `{ incremental: true, keepHistory: 4 }`. Não
   está claro o que são esses 4 itens de histórico ou como afetam a UI.

8. **`withAbortSignal` vs AbortSignal nativo** (linhas 618-635): O helper corre uma
   promise contra AbortSignal manualmente com event listeners. Não está claro por que
   o AbortSignal nativo (que já faz isso com fetch) precisou de wrapper customizado,
   provavelmente porque `generateDossierModule` não herda de fetch.

---

## Plano de refatoração futuro

As extrações abaixo estão organizadas em ordem crescente de risco e complexidade.
Nenhuma deve ser executada antes da Fase 5 do plano de profissionalização (testes de
carga e estabilização). Todas exigem `npm run typecheck` e `npm test` passando.

### Triviais (risco baixo, extração segura, 0 dependências externas)

1. **Extrair `deriveObjectiveComplexity` + `hasHoldingSignal` + `hasInternationalSignal`**
   para `utils/teia-complexity.ts`. ~30 linhas, funções puras com regex e comparação
   numérica. Pré-requisito: nenhum.

2. **Extrair `validateTeiaCnpjsOutput`** para `services/cnpj-validator.ts`. ~85 linhas,
   função pura que recebe string e retorna `{ text, warnings }`. Pré-requisito: nenhum.

3. **Extrair `buildDossierSeedContext`** para `utils/dossier-seed-context.ts`. ~10 linhas,
   regex simples. Pré-requisito: nenhum.

### Médio (risco médio, requer testes baseline)

4. **Extrair `buildTeiaResearchContext`** para `services/teia-research.ts`. ~90 linhas,
   depende de `fetchCompanyByCnpj`, `getContextoConcorrentesRegionais`,
   `generatePortaContextForDeepDive`. Pré-requisito: teste de integração.

5. **Extrair `runTeiaSocietariaOrchestration`** para `features/dossier/teia-orchestrator.ts`.
   ~140 linhas, depende de `generateDossierModule`, `buildModuleExtraContext`,
   `validateTeiaCnpjsOutput`. Pré-requisito: extração #2 + teste de aceitação.

6. **Extrair configuração de módulos** (`modules` + `modulesByName` +
   `sharedDossierModuleOptions`) para `features/dossier/dossier-modules.config.ts`.
   ~50 linhas, pura configuração. Pré-requisito: nenhum.

### Complexo (risco alto, requer Fase 5 completa)

7. **Extrair pipeline loop** (linhas 939-983) para `features/dossier/dossier-pipeline.ts`.
   Lógica de iteração sobre módulos com abort, timeout, fallback e progresso.
   Pré-requisito: extração #5 + #6 + testes de carga.

8. **Extrair persistência fire-and-forget com fallback de sessão** (linhas 1440-1481 +
   fallback 1374-1435) para `services/dossier-persistence.ts`.
   Pré-requisito: extração #7 + teste de race condition React 18 batching.

---

## Justificativa de não refatorar agora

1. **Piloto de 20 usuários ativo**: O produto está em produção com usuários reais do
   agronegócio brasileiro. Refatorar o componente central de geração de dossiê sem
   suite de testes de aceitação robusta arrisca interromper a operação comercial.
   Cada extração mudaria caminhos de importação e contratos de chamada de funções
   profundamente acopladas que compartilham estado mutável.

2. **Último P0 resolvido há 1 dia**: O commit `270d7d05` (fix: Consolidando informações
   travado + 4 alertas Sentry, 28/06/2026) mostra que bugs críticos ainda estão sendo
   descobertos e corrigidos no waterfall. O engenheiro trabalhou diretamente no arquivo
   existente — extrações precisariam portar a correção, criando risco de regressão.

3. **Bruno não lê código**: O usuário final é um executivo de negócios em transição para
   Data Analyst. Refatoração puramente técnica, sem impacto visível na experiência do
   usuário, não agrega valor agora. O débito técnico está documentado.

4. **13 testes baseline insuficientes**: O projeto tem 854 testes no total (Sprint 9),
   mas poucos cobrem o waterfall diretamente por ser um hook React com dependências
   externas (chatStore, lookup, API Gemini, Brasil API). Refatorar sem coverage
   adequado aumenta o risco de regressão silenciosa.

5. **Fase 5 do plano de profissionalização parcial**: O plano prevê que a Fase 5
   (estabilização, que incluiria refatoração de god components) aconteceria após a
   Fase 4 (testes). Sem a Fase 4 completa, o custo de refatorar supera o benefício.

---

## Referências

- Plano de profissionalização V3: Seção "Débito Técnico" item 3.1 — god components
  identificados como alvo de refatoração na Fase 5
- Princípios 12-14 (CLAUDE.md): "Não refatorar o que não quebrou" + "Entender antes de
  modificar" + "Extrair quando custo de manter > custo de extrair"
- PR #396: `finalizeWaterfallUI` — extração parcial bem-sucedida (121 linhas) que provou
  que extrações são possíveis com contrato claro
- Commits do git log (branch `stabilize/from-production-fe6c6f9`):
  - `78c919e7` — Fase 3: desgeminização (rename services/gemini/ -> services/llm/)
  - `aded9714` — Sprint 2: Pipeline híbrido LiteLLM + useDeferredValue anti-freeze
  - `991daf86` — Sprint 1: Cherry-picks limpos sobre fe6c6f9
  - `a637f955` — finalizeWaterfallUI: zera atomicamente todos os estados de loading
  - `f6ff864d` — fix: keep inline source validation non-blocking
  - `5edb1afc` — fix: QSA CNPJs no knownCnpjs + log no catch silencioso
  - `270d7d05` — fix: "Consolidando informações" travado + 4 alertas Sentry
  - `4a102b10` — fix: code review feedback — useEffect self-destruct, normalize stage
  - `12009558` — fix: valida 14 dígitos + CNPJ no texto QSA
  - `515f786f` — chore: AuthGate, waterfall, smoke, tests

---

## Histórico de revisão

| Data       | Revisor         | Ação                                                                 |
| ---------- | --------------- | -------------------------------------------------------------------- |
| 28/06/2026 | DeepSeek        | Autor — análise de código e redação do ADR                           |
| 28/06/2026 | IA Gestora      | Validação — consistência com princípios 12-14 e plano V3             |
| 28/06/2026 | Bruno           | Revisão — confirmação de que não refatorar agora é a decisão correta |
| Pendente   | Sênior (Fase 9) | Revisão técnica aprofundada antes de iniciar refatoração             |
