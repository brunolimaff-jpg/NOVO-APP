# decisions.md — NOVO-APP

## Novas Decisoes (Sessao 2026-06-26 — Sprint 2: infraestrutura LiteLLM)

### DI-2026-06-26-06: Foundation cache desliga com pipeline hibrido ativo

- **Decisao:** `isFoundationCacheEnabled()` retorna `false` quando `VITE_HYBRID_PIPELINE_ENABLED=1`. Foundation cache e incompativel com proxy LiteLLM — ferramentas de grounding sao descartadas pelo proxy desde maio/2026.
- **Contexto:** O foundation cache do Gemini usa ferramentas de grounding (Google Search). O proxy LiteLLM (versao atual homolog) descarta ferramentas nao-suportadas silenciosamente. Com o cache ativo, o Gemini respondia sem grounding mesmo quando `useGrounding=true`. A solucao foi desligar o foundation cache automaticamente quando o pipeline hibrido esta ativo.
- **Impacto:** Perda de performance de cache quando pipeline hibrido ativo. Mas evita resposta sem grounding silenciosamente. Quando o proxy LiteLLM suportar grounding, esta decisao pode ser revista.
- **Referencia:** `services/gemini/foundation-cache.ts`, PR #390, DI-2026-06-26-04

### DI-2026-06-26-05: LiteLLM gate unico controlado por LLM_PROVIDER

- **Decisao:** LiteLLM possui um unico gate (nao 5 como planejado originalmente). A flag `LLM_PROVIDER` (env var) controla o provider ativo: `gemini` (default, direto) ou `litellm` (via proxy). Ambiente DEV configurado com `LLM_PROVIDER=gemini`. HOMOLOG e PROD usarao Gemini direto ate ativacao explicita.
- **Contexto:** O plano original previa 5 gates (feature flag, env var, runtime, modulo, A/B). Cada gate adicionava complexidade sem ganho proporcional de seguranca. Um unico gate por env var e suficiente: se `LLM_PROVIDER` nao estiver setado ou for `gemini`, o fluxo existente (Gemini direto) e usado. Se for `litellm`, o client LiteLLM e ativado.
- **Impacto:** Reduz complexidade operacional. Rollback e simples: remover/unset `LLM_PROVIDER`. Ambiente DEV ja testado. HOMOLOG precisa de configuracao adicional (foundation cache off).
- **Referencia:** `api/gemini.ts`, `api/_llm-client.ts`, PR #390

### DI-2026-06-26-04: useGrounding removido (default false); Score PORTA recalibrado

- **Decisao:** `useGrounding` removido da configuracao de modulos — default e `false` em todos os casos. Score PORTA recalibrado apos a remocao (resultado atual: 82, benchmark esperado sem grounding: 68-75). Sprint 3 recalibrara metricas formalmente.
- **Contexto:** Grounding (Google Search) causava timeout inconsistente no proxy LiteLLM — ferramentas de grounding eram descartadas no proxy desde maio/2026. O fallback DuckDuckGo funcionava mas com qualidade inferior. A decisao foi remover o grounding por completo e depender do conhecimento do modelo para o Score PORTA.
- **Impacto:** Score PORTA pode estar superestimado (82 vs benchmark 68-75 esperado). Recalibracao agendada para Sprint 3 antes de ativar LiteLLM em HOMOLOG.
- **Referencia:** `services/gemini/investigation-orchestration.ts`, PR #390

### DI-2026-06-26-03: Roteamento de LLM 100% server-side

- **Decisao:** Roteamento entre modelos LLM (Sonnet 4.6, DeepSeek V3.2) e 100% server-side, feito exclusivamente em `api/gemini.ts` via `selectModelForModule()`. O client-side (`investigation-orchestration.ts`) mantem `STABLE_RESEARCH_MODEL_ID` fixo — nao ha roteamento no frontend.
- **Contexto:** Durante o code review, Cursor apontou que roteamento client-side exporia os provedores LLM ao usuario final (via bundle). O padrao correto e server-side: o backend decide qual modelo usar por modulo (regex "bloco de X com extrema" para Sonnet, demais para DeepSeek), e o frontend apenas envia a requisicao.
- **Impacto:** Nenhum provedor ou modelo exposto no bundle. Backend controla 100% da estrategia de roteamento. Flexivel para mudar sem deploy de frontend.
- **Referencia:** `api/gemini.ts`, `utils/llm/modelRouter.ts`, PR #390

## Novas Decisoes (Sessao 2026-06-26 — Sprint 1: cherry-picks sobre fe6c6f9)

### DI-2026-06-26-02: useStaticTimelineFallback.ts e blankPanelTelemetry.ts sao parte de fe6c6f9, nao scar tissue

- **Decisao:** `useStaticTimelineFallback.ts` e `blankPanelTelemetry.ts` nao devem ser removidos ou considerados scar tissue. Eles FAZEM parte do baseline fe6c6f9 e estao presentes em producao. Poderao ser tratados em Sprint posterior de codebase cleanup, mas apenas com validacao explicita.
- **Contexto:** Durante a limpeza pos-cherry-pick, esses dois arquivos foram confundidos com scar tissue de refatoracao (Sprint 5-11). Na verdade, `blankPanelTelemetry.ts` e referenciado em pelo menos 3 lugares em fe6c6f9 e `useStaticTimelineFallback.ts` e usado pelo `MessageTimeline.tsx`. O que efetivamente NAO esta em fe6c6f9: `useCofreTransition.ts`, `CofreOverlay.tsx`, `api/_llm-client.ts`, `api/llm-experiment.ts`.
- **Impacto:** Evita remocao acidental de codigo de producao. Sessao futura que quiser limpar esses arquivos deve primeiro confirmar que estao realmente mortos.
- **Referencia:** commit `fe6c6f9ba59fb7063356a5f0adcc51c411db3c4a`, `stabilize/from-production-fe6c6f9`

### DI-2026-06-26-01: Cherry-pick inviavel para commits com dependencias cross-cutting; reimplementacao manual

- **Decisao:** Commits que tocam 25+ arquivos com dependencias cross-cutting (Cofre, LiteLLM, auth) devem ser reimplementados manualmente, nao cherry-picked. Cherry-pick e viavel apenas para commits focados (< 5 arquivos, sem dependencias de componentes que nao existem no baseline).
- **Contexto:** Dois cherry-picks foram abortados por conflito massivo: MCP config (25+ arquivos em conflito, modify/delete em docs/mcp/fetch.generic.example.json) e PR #383 (10 arquivos em conflito, useCofreTransition.ts com modify/delete). Ambos dependiam de codigo que nao existe em fe6c6f9 (CofreOverlay, useCofreTransition, LiteLLM).
- **Impacto:** Sprint 2 usara reimplementacao manual para MCP config e CI gates. Custo maior, mas sem risco de conflito ou quebra silenciosa.
- **Referencia:** commits abortados `8670e5e7` (MCP), `62323649` (PR #383)

## Novas Decisoes (Sessao 2026-06-18)

### DI-2026-06-18-02: Cron de limpeza e dry-run por padrao

- **Decisao:** `api/cron-email-confirmation.ts` nao remove usuarios por padrao. A exclusao exige `CRON_DELETE_ENABLED=true`; sem a flag, o endpoint retorna a quantidade de candidatos e `cleaned: 0`.
- **Contexto:** Em 18/06, producao retornou `CRON_SECRET not configured`. Habilitar o segredo na versao antiga acionaria exclusao direta sem prova previa da contagem.
- **Impacto:** O rollout passa a ser em duas etapas: publicar e revisar dry-run; depois autorizar a exclusao.
- **Referencia:** `api/cron-email-confirmation.ts`, `tests/api/cron-email-confirmation.test.ts`.

### DI-2026-06-18-01: Playbook priorizado, sem trava global

- **Decisao:** O playbook permanece como roadmap de qualidade, mas nao bloqueia mudancas de assunto e nao exige confirmacao para pausar.
- **Contexto:** Bruno pediu explicitamente a retirada da trava e a consolidacao do plano revisado.
- **Impacto:** Subagentes continuam disponiveis em paralelo; o agente principal pode executar e integrar resultados sem bloqueio global.
- **Referencia:** `docs/superpowers/plans/2026-06-18-ai-proof-execution-playbook-revised.md`.

## Novas Decisoes (Sessao 2026-06-17)

### DI-2026-06-17-01: Playbook de Execucao a Prova de IA como plano bloqueante [SUPERADA]

- **Decisao:** O Playbook de Execucao a Prova de IA — Senior Scout 360 (16 tarefas, 5 fases) e registrado como plano bloqueante. Toda nova sessao deve carregar este plano como contexto principal. Se o usuario pedir algo fora do escopo do plano, o sistema deve perguntar: "O plano bloqueante ainda esta ativo. Quer pausar o plano e mudar de assunto, ou prefere continuar?"
- **Contexto:** O playbook foi validado com 85% de confianca, 4 ajustes aplicados apos revisao. Contem 16 tarefas em 5 fases: Fundacao (Fase 0), Causa-raiz (Fase A), Loading declarativo (Fase B), Unificar timeout (Fase C), Liquidar divida (Fase D). A Fase 0 esta pronta para iniciar. O maior risco e T-A.1 (causa raiz de display:none desconhecida ha meses). O maior bloqueador e T-00.5 (helper timeout que bloqueia a Fase C).
- **Impacto:** Mudancas de assunto agora exigem confirmacao explicita do Bruno. Proximas sessoes carregam automaticamente o plano.
- **Referencia:** /Users/brunolima/Downloads/Particular e Compartilhado/Playbook de Execucao a Prova de IA — Senior Scout 360 e1af6db4856e40c88043249c0329ce7d.html
- **Superada por:** DI-2026-06-18-01.

## Novas Decisoes (Sessao 2026-06-16)

### DI-2026-06-16-03: gh api com corpo nunca usa backticks — heredoc com aspas simples

- **Decisao:** Comandos `gh api` que enviam corpo com texto sempre usam `cat <<'EOF' | gh api --input -` em vez de `-f body='...'`. O delimitador deve usar aspa simples (`'EOF'`) para evitar qualquer expansao de shell.
- **Contexto:** Backticks em `gh api -f body='text with \`code\`'`foram expandidos pelo shell como substituicao de comando`$(...)`. O GITHUB_TOKEN e outros tokens de ambiente foram expostos publicamente em um comentario GitHub. O GitHub secret scanning removeu o comentario em ~8 minutos e revogou o GITHUB_TOKEN automaticamente.
- **Impacto:** Incidente de seguranca grave. Tokens DeepSeek, Pinecone, Apify, Context7, Vercel Bypass expostos — pendentes de rotacao manual. GITHUB_TOKEN ja revogado e reautenticado.
- **Referencia:** PR #378, commit f8af6206

### DI-2026-06-16-02: Vite define SENTRY_DSN condicional (ignorar vitest)

- **Decisao:** `define` no vite.config.ts para expor `SENTRY_DSN` como `VITE_SENTRY_DSN` deve ser condicional: so substituir quando `!process.env.VITEST`. Sem isso, o define tenta substituir `SENTRY_DSN` mesmo em testes onde a env var nao existe, quebrando o build.
- **Contexto:** Sentry DSN e uma env var de producao. Em dev/test, ela nao existe. `define` sem condicional substitui a string SENTRY_DSN por `undefined` em tempo de compilacao, quebrando o build local e testes.
- **Impacto:** Build local funciona. Testes passam.
- **Referencia:** commit f8af6206, `vite.config.ts`

### DI-2026-06-16-01: Sentry integrado via Vercel Marketplace, nao por env vars manuais

- **Decisao:** Integracao Sentry-Vercel deve ser feita exclusivamente pelo Vercel Marketplace. Env vars manuais de integracao (SENTRY\_\*) devem ser removidas porque tem `internal: true` por padrao, o que bloqueia a injecao de DSN pela integracao oficial.
- **Contexto:** O Sentry estava configurado com env vars manuais no Vercel (SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN, etc.). O Sentry nunca recebia erros das serverless functions porque a integracao Marketplace nao conseguia injetar o SENTRY_DSN automaticamente — as env vars manuais tinham prioridade e internal=true impedia o override.
- **Impacto:** 8 env vars removidas. Sentry integrado via Marketplace. Source maps em producao.
- **Referencia:** PR #378

## Decisoes Ativas (anteriores)

### DI-2026-06-15-07: Debug de sidebar vazia comeca pela network layer, nao pelo state React

- **Decisao:** Ao investigar sidebar vazia com dados intactos no banco, o primeiro passo e inspecionar o network request (payload, content-length, status code), nao o estado React. Sidebar vazia com dados no banco = cadeia de bugs onde cada um mascara o proximo.
- **Contexto:** Ananda e Wuender tinham historico vazio no app. Network request mostrava `content-length: 2` com payload `[]`. Isso revelou a cadeia: localStorage vazio -> query com temp operator_id -> RLS filtra por role authenticated -> retorna []. Cada bug individual passava despercebido porque o resultado final (`[]`) parecia normal.
- **Impacto:** 3 bugs identificados em sequencia. Debug comecando pelo state React nao teria revelado a RLS.
- **Referencia:** commits `4ca4339a`, `9ba0a2cc`, `fe6c6f9b`

### DI-2026-06-15-06: RLS policy de dossies deve cobrir anon + authenticated

- **Decisao:** Toda RLS policy que protege dados de negocios (dossies, user_context) deve explicitar `TO anon, authenticated`. Policy criada apenas com `TO anon` bloqueia silenciosamente usuarios logados (role `authenticated`) retornando `[]`.
- **Contexto:** A policy `operator_own_dossies` foi criada com `TO anon`. Usuarios logados no Supabase usam role `authenticated`. O Supabase nao gera erro — simplesmente aplica RLS e retorna 0 rows. O sintoma era historico vazio (`HISTORICO (0)`) mesmo com 18 ou 47 dossies no banco.
- **Impacto:** Migration aplicada. Historico de Ananda e Wuender restaurado.
- **Referencia:** commit `fe6c6f9b`, `supabase/migrations/20260615_fix_dossies_rls_authenticated.sql`

### DI-2026-06-15-05: Evento operator-relinked deve usar setTimeout(0) para garantir listeners montados

- **Decisao:** `window.dispatchEvent(new CustomEvent('operator-relinked'))` deve ser encapsulado em `setTimeout(() => window.dispatchEvent(...), 0)` para garantir que os listeners dos componentes filhos ja estejam registrados.
- **Contexto:** React executa useEffect dos pais antes dos efeitos dos filhos. Quando o dispatch era sincrono no useEffect do OperatorContext (pai), nenhum listener dos componentes filhos tinha sido registrado ainda. O evento era disparado e perdido para sempre.
- **Impacto:** Componentes que escutam `operator-relinked` (sidebar, historico) agora recebem o evento corretamente.
- **Referencia:** commit `9ba0a2cc`, `contexts/OperatorContext.tsx`

### DI-2026-06-24-FINAL: Arquitetura Final Senior Scout 360 pos-experimento LiteLLM

- **Provedores de IA:** Sonnet 4.6 (modulos criticos) + DeepSeek V3.2 (operacionais) via proxy LiteLLM/Bedrock. DeepSeek direto (`api.deepseek.com`) como provider economico ($0.06/dossie). Gemini ELIMINADO como provider principal.
- **Roteamento:** HYBRID_MODEL_MAP em `utils/llm/modelRouter.ts:34`. Feature flag `VITE_WATERFALL_TIER` para alternar entre 3 tiers (Premium $0.60 / Padrao $0.17 / Economico $0.06).
- **Fallback:** BINARIO — `respondWithGeminiFallback` REMOVIDO (commit `322b3d7f`). `isFallbackEnabled = false` hardcoded em `_llm-client.ts:79`. Pipeline hibrido nao faz fallback automatico.
- **UI Loading:** Aspiracional — skeleton loading (DossieSkeletonLoader). Realidade atual — CofreOverlay com fixes (computeItemKey, isCofreRenderReady leniente, safety-net dissolve 3s). Skeleton em worktree separado (`feature/inline-loading-bubble`).
- **Qualidade:** `checkReportQuality` com modo lenient para non-Gemini (implementado em `164ad5d3`). Aceita provider nao-Gemini sem bloquear renderizacao.
- **LiteLLM Proxy:** DEV (`litellm.dev.seniorlabs.io`) e HOMOLOG funcionais. PROD (`litellm.seniorlabs.io`) bloqueado (`token_not_found_in_db`).
- **Diferencial Gemini irreproduzivel:** Foundation Cache (~43K chars CNPJ) + Google Search Grounding nativo por modulo. LiteLLM recebe ~15K chars sem web search. Brave Search externo e substituto parcial inferior (15 CNPJs vs 35, score 69 vs 84).
- **Causa da falha callLiteLLM ENCONTRADA:** `MAX_LITELLM_REQUEST_TIMEOUT_MS = 38_000` em `_llm-client.ts:7` — Tabbit descobriu. Corrigido para 180_000 (`a9a93d4f`). **2 waterwalls validados apos o fix** — ambos completos (6/6 modulos, 47-51K chars, $0.13-0.14). Timeout de 38s era a unica causa da falha.
- **Causa do travamento modulo 4-5 RESOLVIDA:** `WATERFALL_HARD_CAP_MS = 330_000` em `waterfall-orchestrator.ts:99` abortava o waterfall no modulo 5-6. Removido no commit `ffdcf096`. Waterfall agora completa 6/6 modulos (~373s).
- **Ref:** CALIBER_LEARNINGS.md secao "ARQUITETURA FINAL", HANDOFF_AI.md, decisions.md DI-24-19 a DI-24-25, PR #386.

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
