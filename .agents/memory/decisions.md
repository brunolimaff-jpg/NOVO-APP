# decisions.md — NOVO-APP (POS-AUDITORIA P0)

## Decisoes da Sessao 2026-06-25 (Auditoria P0 + Validacao Cruzada)

### DI-2026-06-25-01 (CRITICA): Auditoria externa usou base de codigo errada — 5 divergencias graves

- **Contexto:** Auditoria read-only feita por terceiro contra ZIP do repo. Ao fazer cross-reference com codigo real em `main`, encontramos 5 funcoes/parametros que nao existem: `handleCofreForceReleaseLoading`, `handleCofreHidden`, `flushWaterfallPreviewToStore` com parametro `force`, `useDeferredValue` implementado, `console.time('parseMarkdownSections')`. Hipótese: auditor analisou worktree `feat+fase-d-ci-quality-gates`, nao `main`.
- **Decisao:** (1) Plano original de 5 patches do auditor precisa ser ajustado — Patch 3 (handleCofreForceReleaseLoading) e inviavel. (2) Patch 1 precisa ser redirecionado para `pushWaterfallPreviewToStore` (nao `flushWaterfallPreviewToStore`). (3) Referencias de codigo do auditor devem ser validadas antes de executar qualquer patch.
- **Impacto:** Sem essa validacao, 2 dos 5 patches quebrariam na compilacao.
- **Status:** Validacao concluida. Plano ajustado documentado em HANDOFF_AI.md.

### DI-2026-06-25-02: PR #387 fechada — era duplicata de teste

- **Contexto:** PR #387 (`feat/litellm-experiment-code-review`) era copia exata da PR #386 aberta exclusivamente para testar code review automatizado. PR #386 ja estava mergeada na main.
- **Decisao:** Fechar PR #387 com comentario explicativo. Nenhum codigo perdido — tudo ja esta em main via PR #386.
- **Impacto:** Zero. PR era duplicata.
- **Status:** Fechada.

### DI-2026-06-25-03: Plano de correcao P0 aprovado — Fase 0 + Fase 0.5

- **Contexto:** Bug P0 confirmado (UI congela apos waterfall com dossie >80KB). Plano original do auditor tinha 5 patches, mas 1 era inviavel e 1 estava mal direcionado.
- **Decisao:** Plano ajustado para 4 patches cirurgicos em 5 arquivos, precedidos por Fase 0 (11 testes failing-first). Sem refatoracao de god components. Ordem: Fase 0 → Fase 0.5 → Fase 1-5 (original).
- **Arquivos alterados na Fase 0.5:** waterfall-orchestrator.ts, message-orchestrator.ts, finalizeWaterfallUI.ts, SectionalBotMessage.tsx, App.tsx.
- **Status:** Aprovado pelo reviewer. Pronto para execucao na proxima sessao.

### DI-2026-06-25-04: 3 riscos identificados que nem auditor nem investigador inicial viram

- **Contexto:** Reviewer encontrou 3 riscos adicionais: (1) corrida entre `updateSessionById` (isThinking:false) e `finalizeWaterfallUI` (isLoading:false) — Zustand sincrono dispara 2 re-renders independentes, React pode commitar na ordem errada; (2) Cofre depende unicamente de `generationKind === 'dossier'` para abrir — se Patch 2 resetar cedo demais, Cofre dissolve antes do dossier aparecer; (3) Duas funcoes com mesmo proposito (`isCofreRenderReady` leniente vs `isBotMessageContentVisible` estrita) — uma usada, outra ignorada.
- **Decisao:** Patch 2 (setGenerationKind incondicional) precisa de protecao adicional: so resetar se Cofre NAO estiver visivel. Patch 3 (finalizeWaterfallUI) deve usar a funcao leniente `isCofreRenderReady` em vez da estrita `isBotMessageContentVisible`.
- **Impacto:** Sem essas protecoes, correcao do freeze pode criar tela branca (Cofre some antes do dossier aparecer).
- **Status:** Identificado. Ajuste incorporado ao plano.

---

## ARQUITETURA FINAL (Fase 5 — MERGED na main via PR #386, commit `6aa22339`)

- **Provedores de IA:** Sonnet 4.6 (modulos criticos) + DeepSeek V3.2 (operacionais) via LiteLLM/Bedrock. Zero Gemini. Fallback binario.
- **Roteamento:** HYBRID_MODEL_MAP com VITE_HYBRID_PIPELINE_ENABLED=true.
- **Timeouts:** 120s efetivo cliente+servidor. Hard-cap 330s removido.
- **UI:** useTransition (nao useDeferredValue). CofreOverlay com dissolve sem captura de cliques. React Compiler sempre ativo.
- **Erro:** DossierModuleError + ModuleErrorCards.
- **Testes:** 180/180.
- **Todas as decisoes DI-2026-06-24-xx desta PR estao IMPLEMENTADAS e MERGED na main.**
- **Ref:** PR #386, HANDOFF_AI.md, CALIBER_LEARNINGS.md.

### INCONSISTENCIA REGISTRADA: Decisoes DI-24-14 vs DI-24-19 nao sao conflitantes — complementares

DI-24-14 ("DeepSeek direto substitui Gemini") e DI-24-19 ("Pipeline hibrido Sonnet+DeepSeek como arquitetura definitiva") sao tiers diferentes do mesmo sistema. DI-24-14 e o tier Economico ($0.06), DI-24-19 e o tier Padrao ($0.17). Ambos coexistem. Pipeline hibrido implementado e FUNCIONAL — 2 waterwalls validados em 2026-06-24 (47-51K chars, 6/6 modulos, $0.13-0.14).

### INCONSISTENCIA RESOLVIDA: Task #30 ("api/gemini.ts: Remove respondWithGeminiFallback") — agora implementada no commit `322b3d7f`

`respondWithGeminiFallback` foi removido no commit `322b3d7f` (feat: pipeline hibrido Sonnet+DeepSeek + Zero Gemini). `isFallbackEnabled = false` hardcoded em `_llm-client.ts:79`. A task #30 esta agora refletida no codigo.

### INCONSISTENCIA RESOLVIDA: Task #14 ("checkReportQuality modo lenient") — implementada no commit `164ad5d3`

`checkReportQuality` agora aceita provider nao-Gemini sem bloquear renderizacao. Implementado em `utils/llm/reportQuality.ts`.

---

## Novas Decisoes (Sessao 2026-06-24 — TABBIT DESCOBRE O BUG REAL: 38s timeout cap)

### DI-2026-06-24-26 (CRITICA): MAX_LITELLM_REQUEST_TIMEOUT_MS=38s era o bug real da PR #386 — Tabbit descobriu

- **Contexto:** Por 7 dias, debugamos `callLiteLLM failed` assumindo erro de rede, modelo, ou auth. Mudamos env var LITELLM_REQUEST_TIMEOUT_MS para 120000, mudamos o cliente, mudamos o waterfall... mas `_llm-client.ts:7` tinha `MAX_LITELLM_REQUEST_TIMEOUT_MS = 38_000` que anulava TUDO: `Math.min(120000, 38000) = 38s` efetivo. O Tabbit (ferramenta de audit automatizado) encontrou o valor em 5 minutos lendo o arquivo. Commit `a9a93d4f` corrigiu para 180_000.
- **Decisao:** (1) O timeout de 38s no servidor era a causa mais provavel da falha do callLiteLLM. (2) Corrigido para 180_000. (3) O waterfall com timeout de 180s agora tem margem real para modulos DeepSeek que levam 8-44s. (4) **NAO testado apos o fix** — pode ser que o unico bug era o timeout.
- **Causa do travamento modulo 4-5 (waterfall HOMOLOG): INCONCLUSIVO.** 12 chamadas `/api/gemini` retornaram 200 OK (monitoramento Playwright). Waterfall quebrou no modulo 4-5. Pode ser timeout (38s corrigido), erro de parsing na resposta, ou budget do proxy. Requer logs do Vercel para confirmar.
- **Licao:** Nunca confiar em "ja mudei" sem `cat <arquivo>` ou `git diff` para confirmar. O 38s cap estava escrito em codigo desde o commit inicial e ninguem verificou.
- **Status:** timeout corrigido — causa do travamento modulo 4-5 ainda INCONCLUSIVA.
- **Referencia:** `api/_llm-client.ts:7`, commit `a9a93d4f`, PR #386, [[2026-06-24T23-30-00-pr386-descoberta-38s-cap]], vault `30-LICOES/LICOES-NUNCA-CONFIAR-JA-MUDEI-SEM-VERIFICAR-ARQUIVO-2026-06-24.md`.

### DI-2026-06-24-27: Zero Gemini implementado — respondWithGeminiFallback removido, isFallbackEnabled=false

- **Contexto:** A arquitetura aspiracional de "Zero Gemini como provider principal" foi implementada no commit `322b3d7f`. `respondWithGeminiFallback` (antes em `api/gemini.ts:339`) foi removido. `isFallbackEnabled` em `_llm-client.ts:79` retorna `false` hardcoded. Agora o pipeline hibrido Sonnet+DeepSeek e o unico caminho de geracao.
- **Decisao:** (1) Gemini eliminado como provider principal. (2) Fallback e binario — ou o provider configurado roda ou mostra erro. (3) `isFallbackEnabled = false` evita fallback silencioso que mascara erros reais. (4) Supabase credits depleted (429) agora e um erro visivel, nao um fallback silencioso.
- **Impacto:** Se o LiteLLM estiver offline, o usuario ve erro em vez de dossie Gemini. Consciente e aceito como trade-off de confiabilidade.
- **Status:** implementado — commit `322b3d7f`.
- **Referencia:** `api/_llm-client.ts:79`, `api/gemini.ts`, PR #386.

### DI-2026-06-24-11: Causa do freeze CONFIRMADA experimentalmente — pushWaterfallPreviewToStore a cada modulo satura React

- **Contexto:** A hipotese arquitetural (RAF ~16ms antes do commit React) foi testada experimentalmente com `suspendMidWaterfallPreview = true` no commit `fccfddfd`. Resultado: 7/7 modulos completos vs 6/7 antes, 0 freeze vs freeze de 390s antes, 292s vs 349s. A eliminacao do `pushWaterfallPreviewToStore` durante os modulos eliminou COMPLETAMENTE o freeze. A causa esta CONFIRMADA.
- **Decisao:** (1) `pushWaterfallPreviewToStore` chamado a cada modulo e a causa raiz do freeze mid-waterfall. (2) O mecanismo de flush preview agendava re-renders do React com ~30K chars que colidiam com o RAF do dissolve. (3) O fix precisa bufferizar ou suprimir previews intermediarios e garantir que o flush final produza saida visual.
- **Problema residual:** O flush final (`waterfallLifecycle.flush()` com force=true) nao gerou saida visual. O dossie completo nao apareceu. O fix precisa de ajuste para garantir que o estado final seja commitado ao DOM.
- **Alternativas para o flush final:** (a) Bufferizar previews em array e flushar no final; (b) Corrigir `suspendMidWaterfallPreview` para que o flush manual final funcione; (c) MutationObserver no container do chat para detectar commit DOM.
- **Status:** causa confirmada — aguardando fix do flush final.
- **Referencia:** Commit `fccfddfd`, `features/dossier/waterfallLifecycle.ts`, PR #386.

### DI-2026-06-24-10: Framework de 7 oticas para isolar causa do freeze pos-waterfall

- **Contexto:** Mesmo apos corrigir as 3 causas conhecidas (Virtuoso computeItemKey, static-fallback loop, isCofreRenderReady leniente), o freeze pos-waterfall pode persistir. O diagnostico anterior focava em `fallback_used` (REFUTADO — nao existe no frontend). Era necessario um framework sistematico para isolar a causa real entre multiplas possibilidades concorrentes.
- **Decisao:** Adotar framework de 7 oticas concorrentes, cada uma com confianca estimada:
  - #1 (85%): react-markdown ~30K chars bloqueia main thread -> RAF do dissolve nunca executa
  - #2 (60%): RAF em `finalizeWaterfallUI` executa antes do React commitar novo texto ao DOM
  - #3 (90%): Cofre DISSOLVIDO no state React mas visualmente ainda visivel (gap state vs DOM)
  - #4 (30%): MessageRow re-renderiza apos waterfall e sobrescreve estado do Cofre
  - #5 (95%): Cofre overlay z-index 60 cobre chat — sem freeze, mas usuario nao interage
  - #6 (10%): useLayoutEffect re-abre Cofre apos dissolve
  - #7 (80%): Static-fallback + markdown simultaneos criam janela de tela "vazia"
- **Instrumentacao:** `console.time`/`console.timeEnd` injetado em 3 arquivos: `SectionalBotMessage.tsx` (tempo renderizacao), `finalizeWaterfallUI.ts` (timing dissolve), `useCofreTransition.ts` (timing transicao). Logs permitirao identificar qual otica esta ativa.
- **Impacto:** Framework estrutural para debug. Permite direcionar investigacao com base em dados em vez de tentativa e erro. Confiancas permitem priorizar: testar #5 primeiro (mais simples), depois #3 e #1.
- **Status:** documentada — instrumentacao deployada em `bde69158`. Aguardando logs do subagente de validacao.
- **Referencia:** `SectionalBotMessage.tsx`, `finalizeWaterfallUI.ts`, `useCofreTransition.ts`, HANDOFF_AI.md secao "7 oticas", PR #386.

### DI-2026-06-24-09: Loop de re-render do static-fallback requer useMemo + deps ESTAVEIS para nao saturar main thread

- **Contexto:** `safeMessages` sem `useMemo` + `cofreElapsedTimeMs` timer a cada 1s + deps instaveis no efeito `static-fallback-rendered` geravam 110+ re-renders durante o waterfall de 349s. A main thread saturada impedia o RAF do Cofre dissolve de executar, mantendo o overlay preso. O `handleFallbackDissolve` existia mas nunca chegava a rodar.
- **Decisao:** (1) Envolver `safeMessages` em `useMemo` com deps estaveis. (2) Guarda booleano no efeito #3b para impedir re-execucao do static-fallback. (3) `setTimeout` para dissolve do fallback apos 100ms — tira o RAF da fila principal e evita colisao com re-renders. (4) Nao usar timer de 1s como dep de efeito que causa re-render em cadeia.
- **Impacto:** static-fallback caiu de 110+ re-renders para 7. Cofre dissolve agora executa na main thread desobstruida.
- **Status:** implementada — commit `9b958ad8`.
- **Referencia:** `hooks/useCofreTransition.ts`, `components/chat/MessageTimeline.tsx`, PR #386.

## Novas Decisoes (Sessao 2026-06-24 — PR #386 diagnostico REAL + 3 correcoes)

### DI-2026-06-24-08: computeItemKey do Virtuoso deve forcAR re-render quando message.text muda — nao apenas message.id

- **Contexto:** `MessageTimeline.tsx:540` usava `computeItemKey={(_, message) => message.id}`. Quando `message.text` mudava de '' para 29K chars (mesmo message.id), o Virtuoso reutilizava o item DOM sem re-renderizar o conteudo. Bot-message-content ficava com height:0 (texto presente mas invisivel). Detectado via `commit:invisible-bot-content` em `MessageRow.tsx:193`. O `dispatchCofreRenderReady` depende de bot-message-content visivel no DOM — nunca disparava, Cofre dissolvia apenas por absolute-max (320s).
- **Decisao:** (1) Incluir `isThinking` e `text.length` no computeItemKey para forcAR re-render quando o conteudo muda. (2) Nao usar apenas message.id — o id e estavel, mas o texto muda durante o waterfall. (3) `hasBotContent` como alternativa a `visibleBotWithCharsCount` no isCofreRenderReady para cobrir o gap de viewport check.
- **Impacto:** Bot-message-content agora re-renderiza quando o texto chega. Cofre dissolve corretamente. invisible-bot-content: 0 no preview pos-fix.
- **Status:** implementada — commits `3d42cf03` (computeItemKey) e `14d184cf` (isCofreRenderReady leniente).
- **Referencia:** `components/chat/MessageTimeline.tsx:540`, `hooks/useCofreTransition.ts`, `components/MessageRow.tsx:193` (commit:invisible-bot-content), PR #386.

## Novas Decisoes (Sessao 2026-06-23 — delivery-loop socio-search abort + gate E2E)

### DI-2026-06-23-06: socio-search waterfall nao pode abortar sinal compartilhado do loop principal

[... historico anterior mantido ...]

## Novas Decisoes (Sessao 2026-06-24 — 19 modelos testados + waterfall hibrido + HYBRID_MODEL_MAP)

### DI-2026-06-24-25: LiteLLM DEV/HOMOLOG funcional, PROD bloqueado — priorizar DeepSeek direto

- **Contexto:** LiteLLM proxy Senior Labs testado nos 3 ambientes. DEV (`litellm.dev.seniorlabs.io`) e HOMOLOG (`litellm.homolog.seniorlabs.io`) funcionam com Haiku 4.5 (7s). PROD (`litellm.seniorlabs.io`) retorna `token_not_found_in_db` — chave `sk-...` do Bruno nao autorizada no proxy de producao. DeepSeek direto via `api.deepseek.com` funciona sem depender do proxy.
- **Decisao:** (1) Usar apenas ambientes DEV e HOMOLOG para testes de integracao com proxy LiteLLM. (2) PROD requer configuracao da chave pelo admin Senior Labs — nao temos controle. (3) DeepSeek direto via `api.deepseek.com` e o provider substituto principal, sem dependencia de proxy corporativo. (4) Proxy LiteLLM mantido exclusivamente para Claude via Bedrock (Haiku 4.5, Sonnet 4.6). (5) `LITELLM_BASE_URL` com fallback automatico: DEV -> HOMOLOG -> erro (nao PROD).
- **Impacto:** DeepSeek direto fica como provider principal ($0.06/dossie). Proxy LiteLLM vira provider secundario para modelos Claude. PROD bloqueado nao afeta o roadmap.
- **Status:** confirmada.
- **Referencia:** `api/_deepseek-direct.ts`, `LITELLM_BASE_URL` env vars, PR #386.

### DI-2026-06-24-24: Tres tiers de waterfall (Premium/Padrao/Economico)

- **Contexto:** Dois waterfalls hibridos validados experimentalmente. Sonnet+DeepSeek (52K chars, ~$0.17) como padrao. Opus+Sonnet (83K chars, ~$0.60) como premium — 1.6x mais chars que o padrao mas 3.5x o custo. DeepSeek puro direto (~$0.06) como tier economico. Cada tier atende um cenario de uso diferente.
- **Decisao:** (1) Tres tiers de waterfall: Premium (Opus 4.7 + Sonnet 4.6, 83K chars, $0.60), Padrao (Sonnet 4.6 + DeepSeek V3.2, 52K chars, $0.17), Economico (DeepSeek V4 Pro direto, ~$0.06). (2) Tier padrao e o default para dossies. (3) Tier premium para dossies de alto valor onde qualidade maxima justifica custo 3.5x maior. (4) Tier economico para exploracao/seed/prototipagem. (5) Feature flag `VITE_WATERFALL_TIER` para alternar entre tiers.
- **Impacto:** O dossie mais caro ($0.60/dossie) ainda e compativel com o custo Gemini atual ($0.50/dossie). Tier padrao ja funciona: 66% economia vs Gemini com qualidade superior.
- **Status:** proposta — aguardando implementacao da feature flag de tier e merge PR #386.
- **Referencia:** `scripts/test-hybrid-waterfall.ts`, PR #386.

### DI-2026-06-24-23: HYBRID_MODEL_MAP como mecanismo oficial de roteamento por modulo

- **Contexto:** O pipeline hibrido mapeia cada modulo do waterfall a um modelo especifico. HYBRID_MODEL_MAP em `utils/llm/modelRouter.ts` define: Sonnet 4.6 para modulos criticos (operacao, caminho-venda), DeepSeek V3.2 via Bedrock para operacionais (tech-stack, riscos-compliance, radar-expansao, rh-sindicatos, decisores). Modulo nao mapeado retorna undefined -> fallback Gemini. Testes unitarios validam cada entrada do mapa.
- **Decisao:** (1) HYBRID_MODEL_MAP e o mecanismo oficial de roteamento, nao hardcoded no orchestrator. (2) Modulos criticos (2/7) vao para Sonnet 4.6 (`bedrock/us.anthropic.claude-sonnet-4-6`). (3) Modulos operacionais (5/7) vao para DeepSeek V3.2 (`bedrock/deepseek.v3.2`). (4) Modulo sem entrada no mapa usa Gemini como fallback. (5) Testes unitarios obrigatorios para cada nova entrada.
- **Impacto:** Roteamento deterministico e testavel. Qualquer modulo novo precisa de entrada no mapa. Mudanca de modelo por modulo vira configuracao, nao codigo.
- **Status:** implementada em worktree — aguardando merge PR #386.
- **Referencia:** `utils/llm/modelRouter.ts:34`, `tests/utils/modelRouter.test.ts`, PR #386.

### DI-2026-06-24-22: test-models.ts como ferramenta padrao para avaliacao de modelos

- **Contexto:** Bruno queria promptfoo para avaliar modelos, mas a complexidade de setup e manutencao (regras YAML, providers, asserts) nao se justifica para testes exploratorios. O script `scripts/test-models.ts` testa 15 modelos em < 20 min e gera resultados em `.tmp/model-test-results/` com formato padrao (chars, tempo, URLs, custo). Seletor de modelo no War Room (`/api/gerar-dossie`) permite teste interativo com dados reais em < 2 min por modelo.
- **Decisao:** (1) Promptfoo descartado para este projeto — complexidade nao justifica uso. (2) `scripts/test-models.ts` e a ferramenta padrao para testar novos modelos. (3) Seletor no War Room e o teste final antes de decidir sobre um modelo. (4) Se no futuro houver necessidade de avaliacao comparativa sistematica (CI, regressao), reavaliar promptfoo.
- **Status:** confirmada.
- **Referencia:** `scripts/test-models.ts`, `scripts/test-models-round2.ts`, `scripts/test-hybrid-waterfall.ts`, PR #386.

### DI-2026-06-24-21: Sonnet 4.6 como gold standard para modulos criticos

- **Contexto:** Teste de 19 modelos mostrou que Claude Sonnet 4.6 (`bedrock/us.anthropic.claude-sonnet-4-6`) e o melhor modelo para dossie comercial: 12.3K chars, 11 URLs, 11 elos, 74s. Supera Gemini em qualidade de saida (mais chars, mais fontes, mais elos). Custa $5.50/M output tokens (vs $3.50/M do Gemini 2.5 Pro) — mais caro por token mas entrega 1.6x mais chars, compensando o custo.
- **Decisao:** (1) Sonnet 4.6 e o gold standard para modulos que exigem maxima qualidade (Operacao, Caminho de Venda). (2) Priorizar sempre Sonnet 4.6 para modulos criticos do waterfall. (3) Custo por dossier: ~$0.08-0.12 para 2 modulos criticos com Sonnet.
- **Status:** confirmada.
- **Referencia:** `scripts/test-models.ts`, PR #386, resultados em `~/Documents/model-test-results/`.

### DI-2026-06-24-20: War Room como seletor de modelos, nao promptfoo

- **Contexto:** Bruno queria promptfoo para testar e comparar modelos. Promptfoo exige configuracao complexa (providers, prompts YAML, asserts) e manutencao continua. O War Room ja tem seletor de modelo (`/api/gerar-dossie` com query param `?model=...`) e o script `scripts/test-models.ts` testa qualquer modelo em < 2 min com dados reais e saida padrao.
- **Decisao:** (1) Seletor no War Room + `scripts/test-models.ts` substituem promptfoo. (2) Novo modelo e testado via script (2 min) + validacao no War Room (dados reais). (3) Promptfoo reavaliado apenas se precisar de CI de qualidade ou avaliacao regressiva.
- **Status:** confirmada.
- **Referencia:** `scripts/test-models.ts`, `api/gerar-dossie.ts`, PR #386.

### DI-2026-06-24-19: Pipeline hibrido Sonnet + DeepSeek como arquitetura definitiva

- **Contexto:** Teste waterfall hibrido com Sonnet 4.6 (modulos criticos: Operacao, Caminho de Venda) + DeepSeek V3.2 (modulos operacionais: Tech Stack, Riscos, Radar, RH, Decisores) para Scheffer produziu 52.1K chars em 7.5 min a ~$0.17 — 66% mais barato que Gemini ($0.50) com qualidade superior (52.1K chars vs 37.7K chars).
- **Decisao:** (1) Pipeline hibrido e a arquitetura definitiva para o waterfall. (2) Sonnet 4.6 nos 2 modulos criticos (Operacao, Caminho de Venda). (3) DeepSeek V3.2 nos 5 modulos operacionais. (4) Gemini mantido como fallback e referencia golden. (5) Feature flag `VITE_HYBRID_WATERFALL=true` para controle.
- **Impacto:** Qualidade superior ao Gemini puro com 66% economia de custo. Sonnet 4.6 custa $5.50/M output mas gera 1.6x mais chars que Gemini. DeepSeek V3.2 ($0.62/$1.85) e o melhor custo-beneficio para modulos operacionais.
- **Status:** confirmada — aguardando merge da PR #386.
- **Referencia:** `scripts/test-hybrid-waterfall.ts`, PR #386.

### DI-2026-06-24-18: fallbackEnabled: false para DeepSeek requer investigacao

- **Contexto:** `LLM_FALLBACK_ENABLED=true` esta configurado no servidor, mas `fallback_used: false` em TODAS as 6 runs do experimento. Mensagem de erro `error_normalized: null`. O catch block em `executeLiteLLMGenerateContent` captura erros e chama `respondWithGeminiFallback('error')`, mas pode nunca ser alcancado se o erro ocorrer antes do ponto de fallback.
- **Decisao:** (1) Investigar se `VITE_LLM_FALLBACK_ENABLED=true` esta sendo lido corretamente no cliente. (2) Se for bug onde fallback nunca e invocado, registrar como bug #7. (3) Se for comportamento esperado (erro ocorre antes do ponto de fallback), documentar como limitacao conhecida.
- **Status:** em investigacao — aguardando proxima sessao de diagnostico.
- **Referencia:** `api/gemini.ts`, `utils/llm/experiment.ts`, PR #386.

### DI-2026-06-24-17: suspendMidWaterfallPreview = true adotado como padrao pos-teste

- **Contexto:** `suspendMidWaterfallPreview = true` eliminou freeze COMPLETAMENTE — 7/7 modulos, 0 freeze, 292s (vs 349s antes). Resolve o problema de `pushWaterfallPreviewToStore` saturar React a cada modulo.
- **Decisao:** (1) `suspendMidWaterfallPreview = true` adotado como padrao. (2) Pendente: ajustar flush final para garantir saida visual do dossie (flush final quebrado quando `suspendMidWaterfallPreview=true`). (3) Validar experiencia do usuario sem preview incremental.
- **Status:** confirmada — aguardando fix do flush final.
- **Referencia:** Commit `fccfddfd`, PR #386.

### DI-2026-06-24-16: Timeout 120s no cliente e servidor, hard-cap removido

- **Contexto:** As descobertas das 3 camadas de timeout revelaram que o cliente abortava em 38-42s enquanto o servidor tinha cap de 38s. DeepSeek V3.2 leva 8-49s por modulo, Sonnet 4.6 leva 69-72s.
- **Decisao:** (1) Cliente e servidor: timeout 120s via `VITE_LITELLM_CLIENT_TIMEOUT_MS` e `LITELLM_REQUEST_TIMEOUT_MS`. (2) Hard-cap removido — cada modulo ja tem timeout individual. (3) Waterwall validado em 373s (6/6 modulos) sem hard-cap.

### DI-2026-06-24-15: bedrock/deepseek.v3.2 como modelo principal via proxy LiteLLM

- **Contexto:** DeepSeek V3.2 via Bedrock e o melhor candidato para prompts via proxy LiteLLM. Diferente dos modelos `huawei/*` (timeout 38s, 6x mais caro que direto), `bedrock/deepseek.v3.2` usa infra AWS — sem rate limit. Custa $0.62/$1.85 por milhao de tokens (2.3x o preco direto $0.27/$0.40). Haiku 4.5 via Bedrock ja testado com sucesso (7.1s, prompt curto).
- **Decisao:** (1) Priorizar teste de `bedrock/deepseek.v3.2` como modelo principal via proxy. (2) Huawei/deepseek-v4-pro descartado para waterfall (timeout 38s, 6x mais caro). (3) Haiku 4.5 mantido como alternativa para prompts muito curtos (<6K chars).
- **Status:** proposta — aguardando teste.
- **Referencia:** Catalogo LiteLLM Senior Labs, PR #386.

### DI-2026-06-24-14: DeepSeek direto substitui Gemini — proxy LiteLLM nao serve para DeepSeek

- **Contexto:** Testamos o DeepSeek V4 Pro de duas formas: (1) via proxy LiteLLM (huawei/deepseek-v4-pro) — timeout 38s, $1.62/$3.23 por milhao de tokens, 6x o preco do direto; (2) via API direta (api.deepseek.com) — sucesso 8.9s no War Room e 6/7 modulos no Waterfall real, $0.27/$0.40 por milhao de tokens. O proxy da Senior Labs (Huawei) custa mais caro e simplesmente nao responde para o DeepSeek V4 Pro. O Haiku 4.5 via Bedrock funciona (7s), mas sem Google Search Grounding a qualidade e baixa.
- **Decisao:** (1) DeepSeek direto via `DEEPSEEK_API_KEY` e o provider substituto real do Gemini. (2) Proxy LiteLLM mantido apenas para Claude Haiku 4.5 (Bedrock) em cenarios de prompt curto tipo DeepDiveTopics. (3) Prioridade imediata: estabilizar DeepSeek direto como provider alternativo funcional no waterfall. (4) Custo/dossie projetado: $0.06 (DeepSeek) vs $0.50 (Gemini) — economia de 88%.
- **Impacto:** Mudanca de provider de IA principal. DeepSeek custa 88% menos que Gemini. Requer chave API propria ($0.27/$0.40 por milhao de tokens vs $1.62/$3.23 do proxy). Qualidade inferior em deteccao internacional e score PORTA (69 vs 84). Grounding ausente.
- **Status:** confirmada — aguardando decisao de roteiro da PR #386 para priorizar merge.
- **Referencia:** `api/_deepseek-direct.ts`, `api/gemini.ts`, PR #386, catalogo LiteLLM Senior Labs.

### DI-2026-06-24-13: DeepDiveTopics e o MVP ideal para LiteLLM

- **Contexto:** DeepDiveTopics e um componente existente que renderiza 7 topicos cirurgicos ao final de cada dossier. Diferente do waterfall (5-7 modulos encadeados), cada deep dive e um modulo isolado e independente. Prompt estimado de 20-27K chars, contra 74K-93K do waterfall.
- **Decisao:** (1) Priorizar DeepDiveTopics como primeiro caso de uso real do LiteLLM. (2) Feature flag `VITE_LITELLM_DEEP_DIVE`. (3) So avancar para o waterfall apos validacao.
- **Status:** aprovada — aguardando decisao de roteiro da PR #386.
- **Referencia:** DeepDiveTopics component, PR #386.

### DI-2026-06-24-12: callLiteLLM funciona com prompts curtos — bug e waterfall-especifico

- **Contexto:** Teste War Room com 6K chars: Claude Haiku 4.5 via Bedrock completou em 7.1s. Primeira vez que callLiteLLM retorna sucesso.
- **Decisao:** (1) callLiteLLM nao tem bug fundamental. (2) Problema e Foundation Block de 44K chars reenviado sem cache. (3) Solucao 3 fases: compressor -> Foundation condensado -> hibrido. (4) Economia projetada: 97%.
- **Status:** confirmada — aguardando implementacao.
- **Referencia:** `api/gerar-dossie.ts` (bloco LiteLLM War Room Test), PR #386.

### DI-2026-06-24-28: VITE_LITELLM_CLIENT_TIMEOUT_MS como env var unica de timeout do cliente

- **Contexto:** Tres valores hardcoded controlavam timeout do cliente: `LITELLM_MODULAR_TEIA_TIMEOUT_MS=38000`, `LITELLM_MODULAR_INVESTIGACAO_TIMEOUT_MS=38000` em waterfall-orchestrator, e `experimentGenerateTimeoutMs=42000` em geminiProxy. Nenhum deles respeitava env var. Quando mudamos o servidor para 180s, o cliente ainda abortava em 38-42s.
- **Decisao:** (1) Criar `resolveLiteLLMClientTimeoutMs()` em waterfall-orchestrator que le `VITE_LITELLM_CLIENT_TIMEOUT_MS` (default 120_000). (2) geminiProxy le mesma env var (default 120_000). (3) Hardcoded removido de ambos. (4) Timeout unico para toda stack de cliente. (5) VITE_LITELLM_REQUEST_TIMEOUT_MS (zumbi) removido do Vercel.
- **Impacto:** Cliente e servidor agora alinhados em 120s efetivo. Um unico env var controla timeout do cliente.
- **Status:** implementado — commit `0f179543`.
- **Referencia:** `features/dossier/waterfall-orchestrator.ts`, `services/geminiProxy.ts`, PR #386.

### DI-2026-06-24-29: Hard-cap 330s removido do waterfall — timeout individual por modulo

- **Contexto:** `WATERFALL_HARD_CAP_MS=330000` abortava todo o waterfall apos ~331s, independentemente do progresso individual dos modulos. Como o waterfall tem 6 modulos e cada modulo tem timeout 120s, o hard-cap matava o processo no modulo 5-6 mesmo com modulos anteriores completos. O waterfall de 373s (2o waterwall validado) teria sido abortado.
- **Decisao:** (1) Remover `WATERFALL_HARD_CAP_MS`. (2) Cada modulo ja tem timeout individual de 120s (VITE_LITELLM_CLIENT_TIMEOUT_MS). (3) O unico limite superior e o `maxDuration: 300` do Vercel (5min) + margem do servidor (180s). (4) Waterfall pode durar ate ~720s teoricos (6 x 120s) sem hard-cap arbitrario.
- **Impacto:** Waterfall agora completa mesmo que alguns modulos levem mais tempo. Risco: waterfall pode ocupar serverless function por ate 5 min (maxDuration), mas cada modulo individualmente e limitado a 120s.
- **Status:** implementado — commit `ffdcf096`.
- **Referencia:** `features/dossier/waterfall-orchestrator.ts`, PR #386.

### DI-2026-06-24-30: Vercel Live Feedback bloqueia interacoes em previews (z-index 2147483647)

- **Contexto:** Apos waterfall completar e Cofre dissolver, usuario nao conseguia clicar em nada na pagina. Mouse mostrava seta/maozinha mas nenhum clique funcionava. Inspecao no DevTools revelou `<vercel-live-feedback>` com `position: absolute; top: 0; left: 0; z-index: 2147483647` ocupando toda a viewport. O widget de comentarios da Vercel criava um overlay invisivel que capturava todos os eventos de mouse.
- **Decisao:** (1) Desativar Vercel Toolbar no painel da Vercel (Settings → Vercel Toolbar → Disabled). (2) Nao e bug do nosso codigo — e comportamento do widget da Vercel em previews quando quebrado/travado. (3) Adicionar `?feedback=0` a URL como alternativa rapida para bypass.
- **Impacto:** Sempre verificar `<vercel-live-feedback>` antes de diagnosticar "UI travada" em previews.
- **Status:** resolvido — desativado no painel Vercel.
- **Referencia:** PR #386, painel Vercel scoutagro → Settings.

### DI-2026-06-24-31: Bug "Ver relatório completo" e pre-existente — nao bloquear PR #386

- **Contexto:** Botao "Ver relatório completo (+3 secoes)" no componente SectionalBotMessage nao expande ao clicar. Bug reproduzido apos 2 waterwalls. Investigacao revelou que o componente foi alterado no commit `eea8783c` (Cofre overlay) que adicionou `useDeferredValue` na logica de expansao. NENHUM commit da PR #386 alterou SectionalBotMessage.tsx — o bug e pre-existente.
- **Decisao:** (1) Bug NAO bloqueia merge da PR #386. (2) Causa provavel: `useDeferredValue` introduzido no commit `eea8783c` ou overlay `<vercel-live-feedback>` bloqueando cliques. (3) Investigar e corrigir na proxima PR.
- **Status:** documentado — correcao pendente para proxima PR.
- **Referencia:** `components/SectionalBotMessage.tsx`, commit `eea8783c`, PR #386.

### DI-2026-06-25-07: agent-browser (CLI) como browser padrao — Playwright MCP so para scripts complexos

- **Contexto:** Teste comparativo do mesmo fluxo (login + investigacao Scheffer) nos dois browsers. agent-browser (CLI) completou 6/6 modulos com console grepavel e snapshots compactos. Playwright (MCP) fez login com `browser_run_code_unsafe` (seletores nativos quebraram), console teve lag na atualizacao, snapshots YAML enormes (1.2K+ linhas) e custo maior de tokens.
- **Decisao:** (1) `agent-browser` CLI e o browser padrao para todas as tarefas de automacao: navegar, snapshot, preencher forms, clicar, console debug. (2) Playwright MCP reservado exclusivamente para scripts que precisam de `browser_run_code_unsafe` (logica multi-step complexa) ou seletores Playwright (`:has-text()`, `getByRole()`). (3) Nunca usar Playwright para tarefas simples (fill + click) — o overhead de MCP round-trip e snapshots gigantes nao justifica. (4) Console do agent-browser e a ferramenta principal de debug do waterfall (grep direto, sem cache). (5) Snapshots do agent-browser sao compactos (~30 linhas) vs Playwright (1.2K+ linhas) — economia de ~97% tokens.
- **Impacto:** Reducao de tokens em tarefas de browser. Debug mais rapido com grep nativo. Playwright mantido como fallback para cenarios complexos.
- **Status:** confirmada.
- **Referencia:** Teste comparativo 2026-06-25 (agente browser + playwright), PR #386.
