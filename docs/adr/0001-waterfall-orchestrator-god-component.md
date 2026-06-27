# ADR-0001: waterfall-orchestrator.ts como god component

**Data:** 28/06/2026
**Status:** Aceito — debito tecnico documentado
**Componente:** `features/dossier/waterfall-orchestrator.ts` (1604 LOC)
**Branch de referencia:** `stabilize/from-production-fe6c6f9` @ `4e65bb1`

---

## Contexto

O `waterfall-orchestrator.ts` e o coracao da geracao de dossies no Senior Scout 360, plataforma de inteligencia comercial e sales intelligence para o agronegocio brasileiro.

Ele e responsavel por coordenar a execucao sequencial de ate 7 modulos LLM:
Porte/Teia Societaria, Operacao, Bordas de Controle, Riscos & Compliance, Caminho de
Venda, Benchmark e Consolidacao. Juntos, estes modulos produzem o dossier final de
inteligencia comercial para cada empresa analisada. Sem este arquivo, nenhum dossier
e gerado no produto.

Ele e o unico ponto de entrada que conecta a interface de chat do usuario (via
`message-orchestrator.ts`) aos servicos de LLM (Gemini e/ou LiteLLM), lookup de
clientes senior, grounding web, validacao de CNPJ contra fontes oficiais (Brasil API)
e persistencia no Supabase. Ou seja: e o "cerebro" que decide o que perguntar para
o modelo de IA, em que ordem, com que contexto, e o que fazer com a resposta.

O arquivo cresceu organicamente ao longo de 8 sprints de desenvolvimento intensivo,
com contribuicoes de pelo menos 3 engenheiros diferentes. O que comecou como um hook
React simples (`useDossierWaterfallOrchestrator`, ainda visivel na linha 518) para
coordenar algumas chamadas de API se transformou em um god component de 1604 linhas.

O god component mescla as seguintes responsabilidades:
- Orquestracao de pipeline (5 modulos + 1 sub-pipeline + benchmark + consolidacao)
- Logica de negocio (derivacao de complexidade, deteccao de holdings/entidades internacionais)
- Validacao de saida (CNPJ contra fontes oficiais, fontes inline promoviveis)
- Gerenciamento de estado React (loading progress em 7 stages, failure count, active generation ref)
- Fallback de sessao contra race condition do React 18 batching
- Persistencia assincrona fire-and-forget
- Health-check pos-execucao com snapshot completo de DOM e store

A historia do arquivo no git reflete o crescimento do produto e a urgencia dos
sprints. Commits como `a637f955` (finalizeWaterfallUI — extracao bem-sucedida que
serviu de template para este ADR), `f6ff864d` (inline source validation non-blocking),
`5edb1afc` (QSA CNPJs no knownCnpjs + log no catch silencioso), `270d7d05` (fix:
Consolidando informacoes travado + 4 alertas Sentry), `4a102b10` (useEffect
self-destruct, normalize stage) e `12009558` (valida 14 digitos + CNPJ no texto QSA)
mostram que correcoes de bugs P0 e melhorias continuas foram aplicadas diretamente
aqui, em vez de em modulos especializados.

Isso era a decisao pragmatica no momento: cada P0 resolvido rapidamente salvava a
experiencia do usuario no piloto de 20 usuarios do agronegocio brasileiro. O custo
de extrair uma funcao para outro arquivo, atualizar imports, testar o isolamento,
e garantir que o contrato nao quebrou era maior que o custo de simplesmente adicionar
mais linhas no arquivo existente.

Porem, o custo acumulado e significativo. O arquivo faz 13 responsabilidades
distintas, e dificil de testar isoladamente, e exige ler o arquivo inteiro para
entender qualquer fluxo. Sao 1604 linhas, 63 linhas de imports de 30+ arquivos de
16+ modulos diferentes. Cada novo recurso adiciona um import e mais linhas neste
arquivo central, aumentando o acoplamento e o risco de regressao.

O arquivo importa de modulos variados como:
- `foundation-cache.ts` (106 linhas, cache Gemini com TTL de 600s)
- `finalizeWaterfallUI.ts` (121 linhas, limpeza atomica de loading com double RAF e 4 seletores DOM)
- `waterfall-guard.ts` (172 linhas, trava anti-restart-loop por sessao com cooldown de 5s)
- `benchmark-stage.ts` (estagio de benchmark entre modulos e PORTA)
- `porta-reconciliation.ts` (reconciliacao de score com timeout de 120s)
- `megaPrompts.ts` (7 prompts diferentes para os modulos)
- `clientLookupService.ts`, `competitorService.ts`, `portaStateService.ts`
- `brasilApiService.ts`, `storage.ts`, `chatStore.ts`
- Diversas utils de diagnostico, CNPJ, privacidade e fonte de dados

O grafo de dependencias e complexo e qualquer mudanca em um modulo importado pode
quebrar o waterfall silenciosamente.

---

## Responsabilidades acumuladas

| # | Responsabilidade | Linhas aprox | Deveria estar em |
|---|-----------------|-------------|-----------------|
| 1 | Orquestracao de 5 modulos LLM sequenciais com abort, timeout (90s/60s) e fallback opcional | 729-983 | `features/dossier/dossier-pipeline.ts` |
| 2 | Sub-orquestracao Teia Societaria (Identidade + Profundidade com fallback generico) | 787-927 | `features/dossier/teia-orchestrator.ts` |
| 3 | Construcao de contexto estatico (lookup, senior evidence, teia research para foundation cache) | 643-696 | `services/llm/foundation-cache.ts` |
| 4 | Validacao pos-geracao de CNPJs contra fontes oficiais (threshold de 30% nao confirmados) | 430-516 | `services/cnpj-validator.ts` |
| 5 | Reconciliacao de score PORTA com Promise.race + timeout de 120s | 1010-1067 | `features/dossier/porta-reconciliation.ts` |
| 6 | Validacao inline de fontes promoviveis (timeout total 5s, body read timeout 3s) | 254-416 | `services/web-verification.ts` |
| 7 | Gerenciamento de estado de loading (7 stages, reset incremental com keepHistory: 4) | 930-1008 | `hooks/useLoadingProgress.ts` |
| 8 | Fallback de sessao perdida por race condition React 18 (2 cenarios documentados) | 1374-1435 | `stores/chatStore.ts` |
| 9 | Persistencia fire-and-forget no Supabase com evento dossier:completed + timeout 15s | 1440-1481 | `services/storage.ts` |
| 10 | Cache foundation: criacao (antes dos modulos) e delecao (finally, fire-and-forget 15s) | 669-696, 1487-1509 | `services/llm/foundation-cache.ts` |
| 11 | Health-check final com snapshot DOM + store (5+ dimensoes, 35+ linhas de diagnostico) | 1520-1557 | `utils/diagnosticLog.ts` |
| 12 | Finalizacao atomica de UI (isLoading, loadingVariant, progress, failureCount, overlay DOM) | 1566-1579 | `utils/finalizeWaterfallUI.ts` |
| 13 | Geracao de sugestoes de continuidade com timeout de 20s e fallback para sugestoes genericas | 1150-1239 | `utils/messageHelpers.ts` |

---

## Riscos conhecidos

1. **Vazamento de contexto entre modulos**: `WATERFALL_CONTEXT_WINDOW_CHARS` (12.000 chars)
    limita o contexto acumulado passado entre modulos via `accumulatedText.slice(-WATERFALL_CONTEXT_WINDOW_CHARS)`,
    implementado em `buildDynamicDossierContext` no `foundation-cache.ts` (linha 46).
    Nao ha isolamento garantido entre modulos. Se o modulo 1 (Porte/Teia) alucinar um
    CNPJ ou uma relacao societaria, essa informacao incorreta sera passada como contexto
    para o modulo 2 (Operacao), que pode usa-la como verdade para construir a analise.
    O erro se propaga silenciosamente por todo o dossier.
    Impacto: alucinacao propagada por 2-3 secoes do dossier. Probabilidade: media.

2. **Timeouts rigidos sem adaptive retry**: `MODULAR_REQUIRED_STEP_TIMEOUT_MS` (90s, linha 70)
    e `MODULAR_OPTIONAL_STEP_TIMEOUT_MS` (60s, linha 71) sao constantes fixas. Se a API
    do LLM estiver lenta (ja aconteceu em producao com Gemini durante picos de uso),
    modulos obrigatorios falham e o dossier inteiro e perdido. Nao ha retry adaptativo,
    escalonamento de timeout baseado em latencia historica, ou fallback para modelo
    mais rapido. Impacto: dossier perdido, usuario precisa reiniciar. Probabilidade: baixa-media.

3. **Race condition de sessao (Cenarios A e B do React 18 batching)**: Documentado em
    detalhe nas linhas 1329-1333. `updateSessionById` pode perder a sessao quando React
    faz batch de `setState` e o cache do store esta limpo (primeira carga da pagina).
    O fallback via `sessionsRef.current` (linhas 1374-1435) recupera a sessao, mas cada
    recuperacao replica ~50 linhas de logica de atualizacao de mensagem (score PORTA,
    grounding sources, web verification status, suggestions, isThinking, isError,
    errorDetails). A logica duplicada e um ponto de divergencia futura.
    Impacto: sessao perdida sem fallback = usuario ve tela de chat vazia.
    Probabilidade: baixa.

4. **Sentry captureMessage sem mecanismo de rollback**: `Sentry.captureMessage` e chamado
    em 2 pontos criticos (generation ref cleared na linha 1251, session persist failed
    na linha 1335), ambos com nivel `warning` e tags de area especificas. Nao ha
    mecanismo de retry automatico ou rollback de estado. O Sentry captura o erro para
    diagnostico, mas o usuario ja perdeu o dossier ou a sessao. Se o Sentry estiver
    configurado apenas para `error` level (padrao), estes warnings passam despercebidos.
    Impacto: P0 silencioso. Probabilidade: baixa.

5. **Fire-and-forget sem garantia de persistencia**: Persistencia Supabase (linhas
    1440-1481) e delecao de cache foundation (linhas 1487-1509) sao fire-and-forget
    com timeout de 15s e warning. Se ambas falharem (Supabase offline, rede intermitente),
    o dossier existe apenas no React state em memoria e e perdido no refresh da pagina.
    Nao ha fallback para localStorage, IndexedDB, ou retry programado. O evento
    `dossier:completed` tambem nao e disparado se o save falhar.
    Impacto: perda de dados do usuario sem recuperacao. Probabilidade: baixa.

6. **Modulo opcional falha sem validacao de coerencia**: Quando um modulo opcional falha
    (catch na linha 969-981), o pipeline continua com `previousStageCompleted = false`
    e o texto acumulado anterior. Nao ha validacao de que o texto acumulado e coerente
    sem aquele modulo. O usuario ve um dossier parcial sem indicacao clara de quais
    secoes faltam. A nota operacional na linha 1070-1072 lista os modulos que falharam,
    mas fica no final do dossier, depois de todas as secoes.
    Impacto: dossier parcial enganoso. Probabilidade: alta.

7. **Complexidade ciclomatica da useCallback**: O callback `runMegaPromptWaterfall`
    (linhas 547-1601, ~1054 linhas) tem 12 entradas no array de dependencias do
    `useCallback` (linhas 1588-1600). Dentro dele, ha 2 hooks internos (`useCallback(1)`,
    `useRef(1)`) e mais de 20 chamadas a `scoutDiag`. Qualquer mudanca em qualquer
    dependencia pode causar re-render imprevisivel ou stale closure.
    Impacto: bugs dificeis de rastrear (ja ocorreram — ver commits `4a102b10` e
    `270d7d05`). Probabilidade: media.

8. **30+ imports de 16+ modulos**: As importacoes (linhas 1-62) formam um grafo onde o
    waterfall e folha de consumo de quase todos os modulos do sistema. Uma mudanca de
    interface em `megaPrompts.ts`, `foundation-cache.ts`, `porta-reconciliation.ts`,
    `benchmark-stage.ts` ou qualquer outro modulo importado pode quebrar o waterfall
    silenciosamente em tempo de execucao. Nao ha barreira de contrato entre os modulos.
    Impacto: regressao dificil de rastrear. Probabilidade: baixa-media.

---

## O que entendo que faz (Principio 14)

1. **`useDossierWaterfallOrchestrator`** (linha 518): Hook React que retorna
    `runMegaPromptWaterfall`, o unico callback publico. Conecta o `chatStore` ao
    pipeline, resolvendo 7 dependencias com `requireDependency` que lanca `Error` se
    algo essencial estiver faltando. Aceita `Partial<UseDossierWaterfallOrchestratorOptions>`.

2. **`runMegaPromptWaterfall`** (linhas 547-1601): Callback principal de ~1054 linhas
    que executa todo o pipeline, do registro no WaterfallGuard ate a finalizacao da UI.
    Inclui 5 modulos LLM, benchmark, reconciliacao PORTA, validacao inline, finalizacao
    markdown, continuidade, persistencia, health-check e finalizeWaterfallUI.

3. **`buildDossierSeedContext`** (linhas 109-118): Extrai contexto cadastral do prompt
    bruto do usuario via 2 regexes (contexto obrigatorio e radar context). Funcao pura,
    0 dependencias. Retorna string vazia se input vazio.

4. **`buildTeiaResearchContext`** (linhas 141-229): Funcao assincrona que busca QSA
    oficial na Brasil API, concorrentes regionais e estado PORTA. Retorna
    `TeiaResearchContext` com texto combinado + `objectiveComplexity` (BAIXA/MEDIA/ALTA).
    Cada chamada externa tem try/catch proprio com `scoutDiag.warn`.

5. **`validateTeiaCnpjsOutput`** (linhas 430-516): Apos geracao do modulo Teia, extrai
    CNPJs do texto gerado com regex e cruza com CNPJs conhecidos do contexto QSA/lookup.
    Se >30% dos CNPJs citados nao forem confirmados, emite warning. Detecta entidades
    internacionais (S.A.S., B.V., GmbH, Inc., Ltd., S.L.) com 6 regexes.

6. **`validateInlineSourcesForPromotion`** (linhas 254-416): Exportada publicamente.
    Extrai fontes inline candidatas do texto final (max `MAX_INLINE_SOURCES_TO_VALIDATE`=8).
    Valida cada uma com timeout total de `VALIDATE_INLINE_TOTAL_TIMEOUT_MS` (5s) e
    body read de `VALIDATE_INLINE_BODY_READ_TIMEOUT_MS` (3s).

7. **`runTeiaSocietariaOrchestration`** (linhas 787-927): Sub-pipeline interno de 2
    passos: modulo Identidade (obrigatorio, timeout 90s, temperature 0.1) + modulo
    Profundidade (condicional, so se MEDIA/ALTA). Se Identidade falha, fallback para
    modulo Porte generico. Extrai marcador `[[TEIA_COMPLEXIDADE:X]]` para decidir.

8. **`reconcileWaterfallPorta`** (linhas 1021-1067): Reconciliacao de score PORTA com
    `Promise.race` + timeout de `PORTA_RECONCILIATION_TIMEOUT_MS` (120s). Se falha ou
    timeout, ativa `portaIntegrityHold = true` e continua sem score.

9. **`appendGroundingSources`** (linhas 595-611): Acumula fontes de grounding com
    deduplicacao por URL normalizada. Mantem `waterfallGroundingSources` (VerifiedSource[])
    e `sessionSourcePool` (DossierSourceRef[]) sincronizados.

10. **`withInlineValidationBudget`** (linhas 235-252): Helper Promise.race contra timeout.
    Usado para URLs lentas na validacao inline. Inclui `finally` com `clearTimeout`.

11. **`ensureContinuitySuggestions`** (linhas 1235-1239): Garante sugestoes de continuidade
    mesmo se `generateContinuityQuestion` falhar ou timeout (20s). Fallback para
    sugestoes genericas baseadas no nome da empresa.

12. **Health-check final** (linhas 1520-1557): Snapshot completo do sistema: sessao no
    ref, contagem de mensagens, texto do bot, estados de loading (isLoading,
    loadingVariant), e 4 metricas de DOM (body text, bot-message-content,
    loading-smart-overlay, chat-input disabled).

13. **WaterfallGuard** (linhas 563-576): Trava anti-restart-loop: 1 waterfall por sessao,
    cooldown de `WATERFALL_COOLDOWN_MS` (5s). Se bloqueado por `already_running`,
    `cooldown` ou `max_restarts`, remove a mensagem do bot e retorna.

14. **Foundation cache** (linhas 669-696): Cache de contexto para Gemini via
    `createWaterfallFoundationCache`. TTL `WATERFALL_FOUNDATION_CACHE_TTL` (600s),
    ferramentas `WATERFALL_FOUNDATION_CACHE_TOOLS` com googleSearch. So ativo se
    `isFoundationCacheEnabled()` retornar true. Deletado no `finally`.

---

## O que NAO entendo completamente (Principio 14)

1. **`deriveObjectiveComplexity`** (linhas 130-139): A logica de thresholds (>=9 CNPJs
    = ALTA, >=4 = MEDIA, >=3 QSA = MEDIA, holding = MEDIA, internacional = ALTA) parece
    empirica. Nao esta claro se esses numeros vieram de analise de dados reais de QSA
    no agronegocio brasileiro ou de estimativa inicial. Thresholds errados podem
    subestimar ou superestimar a complexidade.

2. **`runDossierBenchmarkStage`** (linhas 993-1000): Importado de `benchmark-stage.ts`,
    executa entre os modulos e o PORTA. Nao esta claro o que exatamente faz (benchmark
    de que?), como interage com o texto acumulado, ou se modifica o pipeline de forma
    irreversivel. O modulo `benchmark-stage.ts` nao foi encontrado na pasta.

3. **Fallback de sessao `setSessions` com findIndex + prepend** (linhas 1407-1417):
    O comentario explica que `findIndex + prepend` previne perda de sessao com `prev[]`
    vazio (React 18 batching). Mas a interacao entre `updateSessionById` (callback de
    `setState`) e `setSessions` (chamada direta no store) nao e evidente.

4. **`ensureWaterfallScorePorta`** (linha 1080): Chamado apos reconciliacao, importado
    de `porta-reconciliation.ts`. Nao esta claro como o score de oportunidade e mesclado
    no texto final do dossier sem quebrar a fluencia narrativa.

5. **`enforceSeniorEvidenceConstraints` e `appendSeniorEvidenceNote`** (linhas 1088-1093):
    Modificam o texto final do dossier. Nao esta claro o criterio de inclusao ou remocao
    de evidencias de senioridade, ou se ha efeitos colaterais na coerencia narrativa.

6. **Evento `dossier:completed`** (linha 1458-1465): Disparado via `window.dispatchEvent`
    apos `saveDossier` bem-sucedido. Nao esta claro quais listeners escutam este evento
    ou qual o impacto se ele nunca disparar (save falhou).

7. **`resetLoadingProgress` com `keepHistory: 4`** (linha 934): Na segunda interacao,
    o loading progress e reiniciado com `{ incremental: true, keepHistory: 4 }`. Nao
    esta claro o que sao esses 4 itens de historico ou como afetam a UI.

8. **`withAbortSignal` vs AbortSignal nativo** (linhas 618-635): O helper corre uma
    promise contra AbortSignal manualmente com event listeners. Nao esta claro por que
    o AbortSignal nativo (que ja faz isso com fetch) precisou de wrapper customizado,
    provavelmente porque `generateDossierModule` nao herda de fetch.

---

## Plano de refatoracao futuro

As extracoes abaixo estao organizadas em ordem crescente de risco e complexidade.
Nenhuma deve ser executada antes da Fase 5 do plano de profissionalizacao (testes de
carga e estabilizacao). Todas exigem `npm run typecheck` e `npm test` passando.

### Triviais (risco baixo, extracao segura, 0 dependencias externas)

1. **Extrair `deriveObjectiveComplexity` + `hasHoldingSignal` + `hasInternationalSignal`**
    para `utils/teia-complexity.ts`. ~30 linhas, funcoes puras com regex e comparacao
    numerica. Pre-requisito: nenhum.

2. **Extrair `validateTeiaCnpjsOutput`** para `services/cnpj-validator.ts`. ~85 linhas,
    funcao pura que recebe string e retorna `{ text, warnings }`. Pre-requisito: nenhum.

3. **Extrair `buildDossierSeedContext`** para `utils/dossier-seed-context.ts`. ~10 linhas,
    regex simples. Pre-requisito: nenhum.

### Medio (risco medio, requer testes baseline)

4. **Extrair `buildTeiaResearchContext`** para `services/teia-research.ts`. ~90 linhas,
    depende de `fetchCompanyByCnpj`, `getContextoConcorrentesRegionais`,
    `generatePortaContextForDeepDive`. Pre-requisito: teste de integracao.

5. **Extrair `runTeiaSocietariaOrchestration`** para `features/dossier/teia-orchestrator.ts`.
    ~140 linhas, depende de `generateDossierModule`, `buildModuleExtraContext`,
    `validateTeiaCnpjsOutput`. Pre-requisito: extracao #2 + teste de aceitacao.

6. **Extrair configuracao de modulos** (`modules` + `modulesByName` +
    `sharedDossierModuleOptions`) para `features/dossier/dossier-modules.config.ts`.
    ~50 linhas, pura configuracao. Pre-requisito: nenhum.

### Complexo (risco alto, requer Fase 5 completa)

7. **Extrair pipeline loop** (linhas 939-983) para `features/dossier/dossier-pipeline.ts`.
    Logica de iteracao sobre modulos com abort, timeout, fallback e progresso.
    Pre-requisito: extracao #5 + #6 + testes de carga.

8. **Extrair persistencia fire-and-forget com fallback de sessao** (linhas 1440-1481 +
    fallback 1374-1435) para `services/dossier-persistence.ts`.
    Pre-requisito: extracao #7 + teste de race condition React 18 batching.

---

## Justificativa de nao refatorar agora

1. **Piloto de 20 usuarios ativo**: O produto esta em producao com usuarios reais do
    agronegocio brasileiro. Refatorar o componente central de geracao de dossier sem
    suite de testes de aceitacao robusta arrisca interromper a operacao comercial.
    Cada extracao mudaria caminhos de importacao e contratos de chamada de funcoes
    profundamente acopladas que compartilham estado mutavel.

2. **Ultimo P0 resolvido ha 1 dia**: O commit `270d7d05` (fix: Consolidando informacoes
    travado + 4 alertas Sentry, 28/06/2026) mostra que bugs criticos ainda estao sendo
    descobertos e corrigidos no waterfall. O engenheiro trabalhou diretamente no arquivo
    existente — extracoes precisariam portar a correcao, criando risco de regressao.

3. **Bruno nao le codigo**: O usuario final e um executivo de negocios em transicao para
    Data Analyst. Refatoracao puramente tecnica, sem impacto visivel na experiencia do
    usuario, nao agrega valor agora. O debito tecnico esta documentado.

4. **13 testes baseline insuficientes**: O projeto tem 854 testes no total (Sprint 9),
    mas poucos cobrem o waterfall diretamente por ser um hook React com dependencias
    externas (chatStore, lookup, API Gemini, Brasil API). Refatorar sem coverage
    adequado aumenta o risco de regressao silenciosa.

5. **Fase 5 do plano de profissionalizacao parcial**: O plano preve que a Fase 5
    (estabilizacao, que incluiria refatoracao de god components) aconteceria apos a
    Fase 4 (testes). Sem a Fase 4 completa, o custo de refatorar supera o beneficio.

---

## Referencias

- Plano de profissionalizacao V3: Secao "Debito Tecnico" item 3.1 — god components
    identificados como alvo de refatoracao na Fase 5
- Principios 12-14 (CLAUDE.md): "Nao refatorar o que nao quebrou" + "Entender antes de
    modificar" + "Extrair quando custo de manter > custo de extrair"
- PR #396: `finalizeWaterfallUI` — extracao parcial bem-sucedida (121 linhas) que provou
    que extracoes sao possiveis com contrato claro
- PR #399: `foundation-cache.ts` — extracao paralela exemplar (106 linhas, 10 exports)
    que reduziu o waterfall em ~80 linhas sem quebrar nada
- Commits do git log (branch `stabilize/from-production-fe6c6f9`):
    - `78c919e7` — Fase 3: desgeminizacao (rename services/gemini/ -> services/llm/)
    - `aded9714` — Sprint 2: Pipeline hibrido LiteLLM + useDeferredValue anti-freeze
    - `991daf86` — Sprint 1: Cherry-picks limpos sobre fe6c6f9
    - `a637f955` — finalizeWaterfallUI: zera atomicamente todos os estados de loading
    - `f6ff864d` — fix: keep inline source validation non-blocking
    - `5edb1afc` — fix: QSA CNPJs no knownCnpjs + log no catch silencioso
    - `270d7d05` — fix: "Consolidando informacoes" travado + 4 alertas Sentry
    - `4a102b10` — fix: code review feedback — useEffect self-destruct, normalize stage
    - `12009558` — fix: valida 14 digitos + CNPJ no texto QSA
    - `515f786f` — chore: AuthGate, waterfall, smoke, tests

---

## Historico de revisao

| Data | Revisor | Acao |
|------|---------|------|
| 28/06/2026 | DeepSeek | Autor — analise de codigo e redacao do ADR |
| 28/06/2026 | IA Gestora | Validacao — consistencia com principios 12-14 e plano V3 |
| 28/06/2026 | Bruno | Revisao — confirmacao de que nao refatorar agora e a decisao correta |
| Pendente | Senior (Fase 9) | Revisao tecnica aprofundada antes de iniciar refatoracao |
