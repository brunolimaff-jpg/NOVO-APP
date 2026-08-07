# decisions.md — NOVO-APP

## Novas Decisões (Sessão 2026-07-14 — Fase 3B.3C.1)

### DI-2026-07-14-03: Checksum do asset ≠ checksum do binário DCG

- **Decisão:** Preflight live compara SHA-256 do **executável** (`binary_checksums_esperados`). O SHA do `.tar.xz` fica em `asset_checksums_esperados` só para validar download. Hash arm64 do binário registrado com proveniência (download oficial + verify asset + extract + hash + apagar temp).
- **Referência:** `.agents/seguranca/runtime-safety.yaml`

### DI-2026-07-14-04: Hook live + atestação humana local

- **Decisão:** Hook confiável exige entrada DCG **direta** em PreToolUse Bash (realpath = binário validado). Guardian pode coexistir; sozinho não basta. Trust = atestação humana `TRUST_DCG_HOOK` fora do repo (XDG/`~/.config/novo-app/...`, 0600, ≤30 dias). Relatório externo/fixtures nunca concedem trust em live.
- **Referência:** `scripts/lib/dcg_codex_hook_verifier.rb`, `scripts/attest-dcg-hook.rb`

## Novas Decisões (Sessão 2026-07-14 — Fase 3B.3C)

### DI-2026-07-14-01: Planejado × observado no Run Report (sem 4º contrato)

- **Decisão:** Snapshots planejado/observado, comparação, task ledger (exatamente 1 tarefa) e handoff humano ficam **dentro do Run Report** existente. Não criar super-contrato. Ausência de evidência → `indisponivel`, nunca `conforme`. Handoff sempre `requer_aprovacao_humana: true`; nunca recomendar merge automático.
- **Impacto:** Evidência auditável pós-3B.3B sem expandir superfície de contratos centrais.
- **Referência:** `scripts/lib/agent_run_comparator.rb`, `scripts/lib/agent_task_ledger.rb`

### DI-2026-07-14-02: Piloto supervisionado com seis chaves (sem execução nesta PR)

- **Decisão:** Piloto real exige simultaneamente as três chaves 3B.3B **mais** `--supervised-pilot`, `--pilot-ack RUN_SUPERVISED_PILOT` e `AGENT_RUNTIME_PILOT=1`. Escopo: exatamente 1 arquivo não funcional (`.agents/pilotos/sandbox/...`). Idempotência via `.agents/pilotos/state/` (gitignored, criação atômica). Runtime normal 3B.3B continua sem as chaves de piloto.
- **Referência:** `.agents/pilotos/README.md`, `scripts/lib/agent_supervised_pilot.rb`

## Novas Decisões (Sessão 2026-07-13 — Fase 3B.3B)

### DI-2026-07-13-15: Runtime Codex só com três chaves + preflight live

- **Decisão:** Spawn single-agent exige simultaneamente `--agent-runtime`, `--runtime-ack RUN_SINGLE_AGENT` e `AGENT_RUNTIME_EXECUTE=1`. Relatório externo é evidência, não credencial. Preflight **live** interno imediatamente antes do spawn; DCG obrigatório para `workspace-write`; hook não verificado → bloqueio (`DCG_HOOK_NOT_VERIFIED`). Um agente, um writer (`executor-escopo`), sem subdelegação/rede/multi-agent. Codex via argv/`Open3` (CLI testada 0.144.0). Testes usam fake Codex só com env de teste exclusiva.
- **Impacto:** Substitui hard-deny `AGENT_RUNTIME_NOT_ENABLED` da 3B.3A pela barreira tripla da 3B.3B.
- **Referência:** `.agents/seguranca/CODEX-RUNTIME.md`, `scripts/lib/codex_single_agent_runtime.rb`

## Novas Decisões (Sessão 2026-07-13 — Fase 3B.3A)

### DI-2026-07-13-14: DCG é barreira secundária; preflight fail-closed

- **Decisão:** Destructive Command Guard (v0.6.6 pinada) é **segunda barreira**, não autorização primária. Preflight gera `ready|denied|unavailable`. CI nunca instala DCG — só fixtures. `DCG_BYPASS` / `DCG_DISABLE` presentes → `denied`. Hook trust sem evidência → `hook_confiado: unknown` → `denied`.
- **Referência:** https://github.com/Dicklesworthstone/destructive_command_guard

### DI-2026-07-13-12: Path hardening — ATENDIDA em 3B.3A

- **Decisão:** Função canônica em `scripts/lib/agent_path_guard.rb` (UTF-8, null byte, percent-decode limitado, NFC, absoluta, `..`, cleanpath, realpath/ancestral, symlink escape, relativo canônico, dedupe ordenado).
- **Status:** Atendida na Fase 3B.3A (finding SEC-04 fechado nesta fatia documental/técnica).

## Novas Decisões (Sessão 2026-07-13 — Fase 3B.2B corretiva)

### DI-2026-07-13-12 (histórico): Path hardening diferido em 3B.2B

- **Contexto:** Em 3B.2B paths eram metadados; checagens bloqueavam absolutos e `..` literais somente. Diferido para 3B.3 — cumprido em 3B.3A.

### DI-2026-07-13-13: max_agentes fail-closed (sem elevação silenciosa)

- **Decisão:** `max_agentes` ausente → usa quantidade declarada. Presente e menor que a quantidade → `MAX_AGENTS_TOO_LOW` (não eleva). Teto 3 (`MAX_AGENTS_EXCEEDED`). `agente-unico` exige exatamente 1 (`SINGLE_AGENT_MAX_AGENTS_INVALID`). Multi permite entre qtde e 3.
- **Referência:** PR #427 corretiva

## Novas Decisões (Sessão 2026-07-13 — Fase 3B.2B)

### DI-2026-07-13-11: Multi-agent só por declaração explícita no Cartão

- **Decisão:** Sem `execucao_planejada` (ou estratégia omitida) → default determinístico `agente-unico`. Multi-agent somente se o Cartão declarar `estrategia: multiagente` + justificativa/ganho/agentes/tarefas estruturalmente válidos. Planner **não** infere quantidade de agentes por texto livre, tamanho, complexidade aparente ou disponibilidade de subagentes.
- **Referências conceituais:** Ponytail (YAGNI/menor diff); Agency Agents (responsabilidade/entrega/evidência) — sem instalar repos externos.
- **Impacto:** 3B.2B propaga intenção para o Plano; spawn real fica em 3B.3.

## Novas Decisões (Sessão 2026-07-13 — Fase 3B.2A corretiva)

### DI-2026-07-13-09: Plano analítico ≠ executável

- **Decisão:** `resumo_operacional.executavel=true` só com `planejado` + `executor-escopo` + comandos não vazios + sem negações. Leitores podem ser `planejado` com `comandos:[]` e `executavel:false` e **não** devem ir ao `run-agent-mission`. Missão executor/escrita sem comandos → `negado`/`PLANEJADO_REQUIRES_COMMANDS` no planner (não só no runner).
- **Contexto:** Gap planner→executor com cartões canônicos sem chave `executor`.
- **Referência:** PR #426 corretiva

### DI-2026-07-13-10: Simplicidade permanece não avaliada na 3B.2A

- **Decisão:** `simplicidade.avaliada=false` + aviso `SIMPLICITY_REQUIRES_REVIEW`; campos de reutilização/dependência/abstração são intenção/default, não fatos. Avaliação automática em 3B.2B.
- **Referência:** PR #426 corretiva

## Novas Decisões (Sessão 2026-07-13 — Fase 3B.2A)

### DI-2026-07-13-08: Schema `if/then` deferido; validação operacional no planner

- **Decisão:** Não adicionar `if`/`then` ao JSON Schema nesta fase (`SUPPORTED_SCHEMA_KEYS` ainda não as aceita). Exigência de `comandos` quando `planejado` (+ Cartão com `executor`) fica em `propagate_commands` + `validate_operational_plan!` (+ executor).
- **Contexto:** Slice 3B.2A precisa de plano decisível sem ampliar o validador schema.
- **Impacto:** Schema `if/then` fica para ciclo posterior (3B.2B+).
- **Referência:** `scripts/plan-agent-mission.rb`, `.agents/orquestracao/contrato-plano.schema.json`

### DI-2026-07-13-07: Comandos do plano preservam ordem (primeira ocorrência)

- **Decisão:** Propagação `executor.comandos` → `plano.comandos` faz dedupe sem `sort` alfabético — mantém a primeira ocorrência de cada ID do catálogo.
- **Contexto:** Ordem pode refletir sequência operacional pretendida; sort quebraria essa intenção.
- **Impacto:** Alinhamento card/plan no executor continua via uniq+sort na comparação; o plano emite ordem estável de entrada.
- **Referência:** `scripts/plan-agent-mission.rb#propagate_commands`

### DI-2026-07-13-06: Default absoluto single-agent no plano operacional

- **Decisão:** Planner dry-run emite sempre topologia `agente-unico` / 1 agente / `max_paralelo=1` / ≤1 writer / depth=1 / sem subdelegação / `harness=codex-cli`. Multi-agent só passa em `validate_operational_plan!` com `multiagente_necessario=true` + justificativa não vazia (testes); produto do planner permanece single-agent.
- **Contexto:** Plano mínimo decisível (go/no-go) sem scheduler nem adapters multi-tool.
- **Impacto:** YAGNI — sem entrada explícita no cartão para multi-agent nesta fase.
- **Referência:** Fase 3B.2A

## Novas Decisões (Sessão 2026-07-13 — Fase 3B.1.5 / PR #425)

### DI-2026-07-13-05: Parser TOML do auditor é fail-closed na gramática mínima

- **Decisão:** O validador de harness Codex rejeita chaves/segmentos quoted, valores compostos (`{`/`[`), dotted assignment keys e segmentos vazios em cabeçalhos; não amplia a gramática TOML completa nesta fase. Strings com aspas escapadas fora do subset canônico ficam como melhoria futura não bloqueante.
- **Contexto:** Bypass reproduzível via quoted keys / inline tables / dotted keys evitaria `reject_forbidden_keys!` se o parser engolisse construções desconhecidas como strings.
- **Impacto:** Suite de política com 37 testes; `.codex/config.toml` canônico permanece sem essas construções.
- **Referência:** `scripts/validate-codex-harness-policy.rb`, PR #425 squash `46765ab8`

### DI-2026-07-13-04: Multi-Agent V2 não é tratado como roteador confiável até prova de runtime

- **Decisão:** Não ativar Multi-Agent V2 globalmente; não tratar Desktop/tool-backed como baseline; validar preferencialmente via `codex exec`/CLI. Adaptadores `.codex/agents/*.toml` permanecem declarativos. Cartão de Missão + executor continuam sendo a fronteira de autorização. Controles de projeto: `max_threads=3`, `max_depth=1`, sem flags experimentais de contexto/fast/V2.
- **Contexto:** Bugs conhecidos do harness (#31814, #31864, #20077, #32291, #32591, #32640, #32806) mostram que modelo/reasoning/agent_type/sandbox podem ser ignorados ou amplificados.
- **Impacto:** Benchmark multi-agent só vira padrão após prova controlada (`docs/benchmarks/codex-harness-5.6.md`). Fases 0–3B.1 permanecem válidas.
- **Referência:** `.codex/config.toml`, `AGENTS.md`, `.agents/adaptadores/README.md`, Fase 3B.1.5

## Novas Decisões (Sessão 2026-07-13 — Fase 3B.1 / PR #424)

### DI-2026-07-13-03: Só `planejado` é executável na Fase 3B.1 (fail-closed)

- **Decisão:** O executor aceita execução apenas com `plan.status == planejado`. `planejado-com-restricoes`, `negado` e `incompleto` retornam `PLAN_STATUS_INVALID`.
- **Contexto:** O executor 3B.1 ainda não interpreta semanticamente restrições. Aceitar `planejado-com-restricoes` criaria falsa sensação de conformidade.
- **Impacto:** Missões com restrições precisam de planner/executor 3B.2+ ou remoção das restrições antes da execução controlada.
- **Referência:** `scripts/run-agent-mission.rb`, `.agents/orquestracao/executor/README.md`, PR #424

### DI-2026-07-13-02: Hook Cursor de branch-health é higiene, não fronteira de segurança

- **Decisão:** `.cursor/hooks.json` usa `failClosed: false` e matcher só em `git commit`. O hook deve `cd` na raiz do repo antes de `check-branch-health.sh`. Autorizações do executor não dependem dele.
- **Contexto:** `failClosed: true` + hook quebrado bloqueava Shell/Write no Cursor; cwd externo fazia o health check falhar silenciosamente e liberar commit.
- **Impacto:** DX preservada; proteção de acúmulo de commits continua best-effort.
- **Referência:** `.cursor/hooks/branch-health-json.sh`, PR #424

### DI-2026-07-13-01: Propagação planner→comandos e schema condicional ficam para 3B.2

- **Decisão:** Na 3B.1, cartão e plano devem trazer manualmente o mesmo conjunto de IDs de catálogo. Runtime rejeita `planejado` sem `comandos` (`PLANEJADO_REQUIRES_COMMANDS`). Não exige `if/then` no schema ainda.
- **Contexto:** `plan-agent-mission.rb` (3A) não emite `comandos`; exigir no schema quebraria planos do planner sem integração.
- **Impacto:** Documentado no README do executor; threads de review deferidas explicitamente para 3B.2.
- **Referência:** `.agents/orquestracao/executor/README.md`, PR #424 squash `9c8b3228`

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

### DI-2026-06-15-04: OperatorContext restaura operator_id no localStorage apos resolucao de auth

- **Decisao:** Apos `resolveOperatorFromAuth()` encontrar o operator_id, o valor deve ser gravado de volta no localStorage via `storageSet(OPERATOR_ID_KEY, resolved.operatorId)`.
- **Contexto:** `storageRemove()` no inicio do fluxo limpava `scout360:operator_id` do localStorage. `getOperatorId()` so lia de la, entao a sidebar ficava vazia porque nenhum operator_id estava disponivel. A resolucao de auth pelo Supabase encontrava o valor correto, mas nao o escrevia de volta.
- **Impacto:** Sidebar exibe historico de dossies normalmente apos criar conta.
- **Referencia:** commit `4ca4339a`, `contexts/OperatorContext.tsx`

### DI-2026-06-15-03: stale-thinking retorna null, nao erro alarmista

- **Decisao:** Quando a bolha inline detecta stale thinking, retorna `null` (nada renderizado) em vez de mostrar erro. O estado `graceExpired` reseta entre ciclos de loading via useEffect.
- **Contexto:** A bolha inline podia ficar travada exibindo "thinking..." mesmo apos o waterfall terminar. Em vez de mostrar erro para o usuario, o componente se auto-destroi silenciosamente.
- **Impacto:** Bolha inline some sem alarme falso quando o estado de loading fica stale.
- **Referencia:** commits `e2d6bbc4`, `abd12e50`, `components/MessageRow.tsx`, `components/InlineLoadingBubble.tsx`

### DI-2026-06-15-02: "Consolidando informacoes..." e rotulo de UI, nao etapa de loading

- **Decisao:** `finalizeLoadingProgress` nao conta "Consolidando informacoes..." como etapa real de progresso. O contador usa `Math.min(completed, total)` como safety cap para nunca exceder 100%.
- **Contexto:** O contador de progresso exibia "8/7" porque o rotulo "Consolidando informacoes..." era contado como etapa extra. Esse rotulo e apenas um status de UI exibido apos todas as etapas reais (score PORTA, bordas de controle, etc.) terminarem.
- **Impacto:** Contador nunca mostra "8/7" ou percentual acima de 100%.
- **Referencia:** commits `4a102b10`, `abd12e50`, `utils/loadingStatus.ts`

### DI-2026-06-15-01: activeGenerationRef sobrevive aos probes; generationValid capturado antes do cleanup

- **Decisao:** `scheduleLoadingStuckProbes` recebe `generationValid` como parametro, capturado ANTES de `activeGenerationRef.current` ser deletado. O `observer` nao depende mais do ref para validar geracao.
- **Contexto:** `finalizeWaterfallUI` deletava `activeGenerationRef.current` no inicio. Os probes (`scheduleLoadingStuckProbes`) nunca conseguiam validar geracao porque o ref ja era `null`. Isso deixava a safety net de loading desarmada por 6 dias.
- **Impacto:** LoadingStuckProbes finalmente funcionam — se o loading travar por mais de 10s, o Sentry alerta.
- **Referencia:** commits `e2d6bbc4`, `270d7d05`, `utils/finalizeWaterfallUI.ts`, `features/chat/message-orchestrator.ts`

### DI-2026-06-14-03: restoreMocks + clearMocks globais no vitest.config.ts

- **Decisao:** Ativar `restoreMocks: true` e `clearMocks: true` no `vitest.config.ts` para prevenir que mocks de modulo (`vi.mock`) vazem entre arquivos de teste.
- **Contexto:** Testes `App/*.test.tsx` mockavam `useToast` via `vi.mock`, e `message-orchestrator.test.ts` usava `useToast` real. O mock vazado quebrava `renderHook` no CI de forma intermitente.
- **Impacto:** CI 100% verde; 162/162 arquivos, 1497/1497 testes passando.
- **Referencia:** commit `9e9d3367`, `vitest.config.ts`

### DI-2026-06-14-02: CNPJ cache com identity check e sem AbortSignal do chamador

- **Decisao:** Cache CNPJ implementado como `Map<string, Promise>`, TTL 30s. O signal do primeiro chamador NAO e passado para os demais. Cada caller faz race do proprio signal contra a promise compartilhada. Rejeicoes removem a promise do cache imediatamente. Delete verifica identity (`===`) para evitar que timer stale sobrescreva entrada nova.
- **Contexto:** Codigo anterior criava nova promise a cada chamada sem cache; 2-3 chamadas simultaneas para o mesmo CNPJ batiam na BrasilAPI em paralelo. O AbortSignal do primeiro chamador contaminava callers posteriores, e promises rejeitadas ficavam em cache por 30s bloqueando retry.
- **Impacto:** `api/cnpj-cache.ts` criado; `brasilApiService.ts` usa cache compartilhado.
- **Referencia:** commits `f834794e`, `14f26d7f`, `6727783e`

### DI-2026-06-14-01: Worktree so para features novas; correcoes em PR aberto na branch atual

- **Decisao:** Worktree isolado e usado apenas para implementar features novas do zero. Correcoes de bug ou ajustes em PR ja aberta sao feitas diretamente na branch de trabalho, sem worktree.
- **Contexto:** O projeto usa worktrees por padrao (MEMORY.md — feedback_always-worktrees). Mas para correcoes em PR ja aberta, o custo de setup/teardown do worktree supera o beneficio de isolamento, especialmente quando o review ja esta em andamento.
- **Impacto:** Commit `ed2d8b17` foi feito direto na branch `feature/supabase-auth` sem worktree.
- **Referencia:** feedback_always-worktrees no MEMORY.md

### DI-2026-06-13-07: Identidade autenticada nao fica no localStorage proprio

- **Decisao:** `scout360:operator_id`, `scout360:operator_name` e `scout360:operator_email` nao devem armazenar dados derivados de Supabase Auth. A sessao autenticada fica no storage do Supabase Auth.
- **Contexto:** CodeQL marcou clear-text storage porque o fluxo autenticado gravava email/nome/operator_id apos `signInWithPassword`.
- **Impacto:** `OperatorContext` remove as chaves proprias ao resolver auth; preview validado com essas chaves `null` apos login/reload.
- **Referencia:** commit `2fd6f3f8`, `contexts/OperatorContext.tsx`

### DI-2026-06-13-06: RLS authenticated minima para user_context e radar

- **Decisao:** `user_context` permite SELECT do proprio `operator_id` ou legado pelo proprio email, mas INSERT/UPDATE apenas quando `profiles.operator_id` corresponde. `radar_alerts` e `radar_configs` seguem o mesmo vinculo por `profiles.operator_id`.
- **Contexto:** Preview autenticado falhava com `new row violates row-level security policy for table "user_context"` e ruido de radar. Isso quebrava a persistencia esperada do usuario autenticado.
- **Impacto:** Migration `auth_storage_rls_policies` aplicada no Supabase remoto. `link_legacy_operator` agora e aguardado antes de salvar o contexto legado.
- **Referencia:** commit `c86fd0dd`, `supabase/migrations/20260613180243_auth_storage_rls_policies.sql`

### DI-2026-06-13-01: Contrato de identidade auth.uid como autoridade unica

- **Decisao:** `auth.uid()` e a autoridade unica de identidade. `profiles.operator_id` e o vinculo com dados de negocio. `resolveOperatorFromAuth()` busca profiles pelo auth.uid(), com fallback para user_context por email. localStorage vira cache, nunca autoridade.
- **Contexto:** O app autenticava via Supabase mas usava operator_id do localStorage como fonte principal, criando risco de dossies invisiveis e bypass de autorizacao.
- **Impacto:** OperatorContext refeito para usar cadeia de identidade. Relink legado passa pela RPC e so e usado apos confirmacao do banco.
- **Referencia:** commits `a953da97`, `c86fd0dd`, `contexts/OperatorContext.tsx`

### DI-2026-06-13-02: profiles.operator_id imutavel com RPC controlado

- **Decisao:** `profiles.operator_id` nao pode ser atualizado diretamente. REVOKE UPDATE on profiles + GRANT UPDATE(name) apenas em auth.users. RPC `link_legacy_operator` com SECURITY DEFINER e verificacao anti-IDOR (auth.uid() match + email ownership).
- **Contexto:** operator_id mutavel permitia que qualquer funcao alterasse o vinculo de identidade, arriscando acesso cruzado a dossies.
- **Impacto:** Migration `20260613_lock_profiles_operator_id.sql`, RPC documentado.
- **Referencia:** `supabase/migrations/20260613_lock_profiles_operator_id.sql`

### DI-2026-06-13-03: Cron Vercel Hobby limitado a 1x/dia

- **Decisao:** Schedule ajustado de `0 */6 * * *` (4x/dia) para `0 0 * * *` (1x/dia) por limite do Vercel Hobby. Handler aceita GET (nao apenas POST) e CRON_SECRET como env var.
- **Contexto:** Vercel Hobby nao suporta schedules mais frequentes que 1x/dia. O handler anterior so aceitava POST e nao tinha CRON_SECRET.
- **Impacto:** Contas nao confirmadas podem levar ate 24h para ser removidas.
- **Referencia:** `api/cron-email-confirmation.ts`

### DI-2026-06-13-04: Schema user_context com colunas de auth

- **Decisao:** Migration idempotente adiciona `supabase_auth_id UUID` e `auth_provider TEXT` com indice em user_context. ALTER TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
- **Contexto:** user_context nao tinha como rastrear qual auth.uid ou provider originou cada registro, dificultando diagnostico de fragmentacao.
- **Impacto:** migration `20260613_user_context_schema.sql` aplicada em producao.

### DI-2026-06-13-05: Radar resetavel no relink de operador

- **Decisao:** Por decisao do Bruno, radar_alerts e radar_configs podem ser resetados quando um operador legado e relinkado a uma nova conta Supabase.
- **Contexto:** Ao relinkar um operador, os dados de radar (alertas e configuracoes) do operator_id anterior podem ficar orfaos. Bruno autorizou o reset.
- **Impacto:** Radar nao bloqueia o fluxo principal. PR #372 adicionou policies authenticated por `profiles.operator_id` e reduziu falhas de persistencia de radar para aviso.

### DI-2026-06-12-05: Dossies devem ser buscados por email alem de operator_id

- **Decisao:** O servico de acesso a dossies (`dossierAccessService.ts`) deve buscar registros por **email** como fallback quando o operator_id atual nao retorna resultados. O trigger `on_auth_user_created` na tabela profiles gera um NOVO UUID `operator_id` mesmo quando o email do usuario e o mesmo de uma conta anterior deletada.
- **Contexto:** Bruno deletou sua conta Supabase Auth e recriou com o mesmo email. Dossies antigos (ex: Scheffer) ficaram vinculados ao operator_id ANTIGO. O historico aparece vazio na nova conta.
- **Motivo:** Impedir perda de historico quando usuarios recriam contas Supabase. O script de consolidacao (430 -> 125 IDs) ja reduziu a fragmentacao historica, mas nao previne nova fragmentacao apos delecao de conta.
- **Impacto:** Alteracao em `dossierAccessService.ts` para incluir `user_email` na query ou fazer fallback por email quando `operator_id` nao encontrar resultados.
- **Referencia:** HANDOFF_AI.md — secao "ACHADO IMPORTANTE: operator_id fragmentado apos delecao de conta Supabase"

### DI-2026-06-12-01: Modelo hibrido de auth Supabase

- **Decisao:** Auto-confirm ativo para cadastro, cron remove contas nao confirmadas apos 48h. Novos usuarios obrigatorio, existentes opcional ate 18/06/2026.
- **Motivo:** Equilibrio entre experiencia do usuario e seguranca. Confirmacao estrita bloquearia usuarios de teste; auto-confirm total nao validaria emails.
- **Impacto:** Deadline 18/06 para usuarios existentes cadastrarem senha. Perda de operadores antigos que nao cadastrarem — mitigado por banner + prazo.
- **Referencia:** Bruno Vault/30-DECISOES/DECISAO-AUTH-HIBRIDO-SUPABASE-2026-06-12.md

### DI-2026-06-12-02: PR unificada (Sprints 1+2+3+4)

- **Decisao:** Sprints consolidadas em PR #372 unificada, nao PRs separadas por sprint.
- **Motivo:** Code review revelou que PRs separadas criavam dependencia (base = outro PR) e revisao duplicada. PR unificada permitiu revisao completa em unico ciclo.
- **Impacto:** 14 arquivos, 1 revisao, 1 ciclo de CI.

### DI-2026-06-12-03: error.code para identificar erros Supabase Auth

- **Decisao:** Usar `error.code` (ex: `user_already_exists`) em vez de `error.message` para identificar erros de autenticacao.
- **Motivo:** error.message pode mudar entre versoes do Supabase. error.code e estavel e documentado.
- **Impacto:** Tratamento de erros mais robusto.

### DI-2026-06-12-04: AuthGate com graceful fallback sem provider

- **Decisao:** AuthGate nao trava se AuthContext nao estiver disponivel. OperatorProvider usa `operatorContext.ok || userContext` como fallback.
- **Motivo:** Evitar tela branca se AuthContext falhar. Manter compatibilidade com fluxos que ainda nao tem auth.
- **Impacto:** AuthGate renderiza children se `AuthContext` estiver ausente.

### DI-2026-06-10-01: Dupla fonte de verdade eliminada

- **Decisao:** `hasLargeBotMessage` removido de `MessageTimeline.tsx`. `useStaticTimelineFallback` e a unica fonte de verdade para decisao de fallback.

### DI-2026-06-10-02: Limite de props ajustado (14 complexos, 8 enxutos)

### DI-2026-06-10-03: Watchdogs consolidados em hook unico

### DI-2026-06-10-04: Copiloto referencia wiki e ai-context ao iniciar sessao

### DI-2026-06-08-01: Nao alterar fluxo visual sem reincidencia

### DI-2026-06-08-02: Manter recovery enquanto causa raiz nao for comprovada

### DI-2026-06-08-03: Wiki e indice arquitetural, nao fonte superior ao codigo

### DI-2026-06-08-04: Auditorias devem conter autorrefutacao obrigatoria

### DI-2026-06-08-05: Documentacao e runtime em PRs distintas

### DI-2026-06-29-04: Tag `pre-prompts-cleanup` como ponto de reversão

- **Decisão:** Tag `pre-prompts-cleanup` criada no commit `61ced7bc` (baseline main) antes de qualquer alteração de prompt. Permite `git revert` ou reset para estado pré-limpeza.
- **Contexto:** O plano de limpeza de prompts (Z.ai) recomendava criar uma tag antes de executar H1/H3/H4. A tag foi criada no início da execução.
- **Impacto:** Rollback seguro em caso de quebra de produção.

### DI-2026-06-29-03: Regex de leak-shield requer adversarial review obrigatória

- **Decisão:** Toda regex adicionada ao `HARD_PROMPT_LEAK_PATTERNS` ou `SOFT_PROMPT_LEAK_PATTERNS` deve passar por adversarial review (falso positivo, bypass, ReDoS) antes de deploy.
- **Contexto:** A regex original `aviso_metodologico` causava falso positivo em relatórios com seção de metodologia. Foi detectado apenas na 3ª camada de revisão (adversarial), após Z.ai e validação de 22 agentes não pegarem.
- **Impacto:** Adicionado como gate no fluxo de PR para mudanças em `textCleaners.ts`.

### DI-2026-06-29-02: Princípio 6 (grep) mantido como gate de qualidade para handoffs

- **Decisão:** Handoffs de agentes externos (Z.ai, outros gestores) devem ser validados com grep antes de serem aceitos como verdade. Nenhuma claim sem evidência de código.
- **Contexto:** O handoff Z.ai tinha 2 discrepâncias (13 vs 8 arquivos, linha 428 vs 440) que só foram detectadas com grep. Nenhuma era crítica, mas estabeleceu o padrão.
- **Impacto:** Validação de handoff agora é etapa obrigatória antes de executar qualquer plano baseado em handoff externo.

### DI-2026-06-29-01: Z.ai é produtor de documentação, não executor

- **Decisão:** A IA gestora Z.ai (sessão web-2804fbf2) produz documentos de alta qualidade (ADRs, planos, validações) mas não executa nenhuma ação — não commita, não cria diretórios, não roda comandos. Toda entrega dela requer um "materializador" externo.
- **Contexto:** Z.ai fez levantamento de 7 arquivos (5 ADRs + resumo + plano) mas salvou tudo em `~/Downloads/` sem commitar. A documentação era precisa (82% claims confirmadas), mas a execução foi zero.
- **Impacto:** Sessões futuras com Z.ai devem incluir etapa explícita de "materialização" — copiar arquivos, commitar, validar.

## Decisoes Historicas

### 2026-06-08 — Handoff final precisa apontar repo + Bruno Vault (APLICADO na PR #346)

### 2026-06-11 — Tracking de Operador: canonical operatorId, findUserByEmail, PII-safe logging
- DI-2026-08-06-P0: P0-SUPABASE-SECURITY-CONTAINMENT aprovado em code-only (98%): isolamento RLS por operador, eventos só INSERT, RPC booleana de duplicidade, views/crm service_role only. Migrations remoto somente com autorização separada após #477/#478 em main. (Vault: Sessões/2026-08/2026-08-06T23-00-00; Lições/supabase/)
- DI-2026-08-06-PILHA: ordem de release #477→#478→#480(P0)→#479; merge por PR exige MERGE explícito + autorização de deploy automático de Produção.
