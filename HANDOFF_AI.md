# Handoff — estabilização do dossiê e migração LiteLLM

> Atualizado: 2026-07-24
> Checkpoint canônico: `docs/checkpoints/2026-07-24-pr4-code-gate-e-preview-isolado.md`
> Head funcional da PR4 antes deste commit documental: `5807e630a3134b321847b900293b6b59f4622868`

## Estado das PRs

- PR1 `#448`: mergeada.
- PR2 `#449`: concluída.
- PR3 `#450`: branch `codex/dossie-pr3-lifecycle`, head `3b929f7b4d2be01e9b9c1d33e753599b96f98355`.
- PR3: code gate **APROVADO**; release gate **BLOQUEADO**.
- PR4 `#451`: branch `codex/dossie-pr4-gateway`, base `codex/dossie-pr3-lifecycle`.
- PR4: **DRAFT**, mergeável, code gate **APROVADO**.

## Preview e isolamento

- Preview da PR4: **READY**, commit `5807e630a3134b321847b900293b6b59f4622868`, match confirmado.
- Build Output remoto: **10 Functions**; deployment originado por Git, sem deploy manual.
- Produção Supabase: `vmqf…npig`, sem alteração.
- Preview Supabase: `scoutagro-preview`, ref `xlvs…owec`, organização `brunolimaff-jpg's Org`, região `sa-east-1`.
- Projeto Preview: custo registrado de `0 por mês`, status `ACTIVE_HEALTHY`.
- `PREVIEW_DATABASE_ISOLATION`: **CONFIRMADO**.
- Envs Preview configurados: `SUPABASE_URL`, `VITE_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`.
- LiteLLM Preview: base URL, API key e alias geral presentes; alias de chat ausente e opcional.
- Os envs ainda exigem um novo deployment Preview para entrarem em vigor.

## Code gate da PR4

- Auth Supabase obrigatória e ownership server-side; cliente não escolhe proprietário, provider, modelo, base URL ou chave.
- Generate/chat vinculados a `runId`, `dossierId` e `operator_id`; contexto carregado server-side e acesso entre operadores bloqueado.
- Limites de contexto/payload, lease server-side, heartbeat fail-closed e cancelamento cooperativo.
- Finalização/recuperação de cancelamento e descarte de resposta após cancelamento tardio ou perda de lease.
- `AbortSignal` chega ao fetch; timeout aborta a chamada física.
- Erros estáveis e logs correlacionados sem conteúdo sensível.
- Alias lógico LiteLLM obrigatório; nenhum modelo físico hardcoded.
- Gateway do dossiê com zero retry; retry legado preservado; nenhuma tool/function calling.
- Baseline registrada: **65 testes focados**, build passando e zero erro novo de typecheck nos arquivos da PR4.

## Decisões

```text
LITELLM_DOSSIER_MODEL_SOURCE: alias lógico obrigatório configurado por env
LITELLM_DOSSIER_APP_RETRIES: 0
LITELLM_PROXY_RETRIES_AND_FALLBACKS: desativados no primeiro cutover ou controlados exclusivamente no proxy
TOOLS_FUNCTION_CALLING: reservado para PR5
BRAVE_AND_EVIDENCEPACK: PR5
WATERFALL_PERSISTENCE_UI_CUTOVER: PR6
```

```text
HEARTBEAT_TRANSIENT_TOLERANCE: REJEITADA NA PR4
MOTIVO: a execução permanece fail-closed quando a posse válida da lease não pode ser comprovada.
FOLLOW_UP: pode ser reavaliada posteriormente com evidência operacional, sem bloquear a PR4.
```

## Bloqueios e pendências

- Migration da PR3 no Preview: **NÃO APLICADA**.
- SQL, RPC/RLS, usuário/run controlados e smoke autenticado: **NÃO EXECUTADOS**.
- Usuário e run autorizados para teste: **NÃO_VERIFICADOS**.
- Categorias amplas preexistentes: Tests, Typecheck, Dossier Golden e E2E Critical Browser.
- Elas não são novos bloqueadores da PR4: já existiam na baseline; build e testes focados da PR4 passaram.

PR6_INTEGRATION_BLOCKER:

O endpoint generate adquire e libera uma lease server-side.
O waterfall atual mantém lease client-side e completa após persistir.

A PR6 deverá definir um único proprietário da lease durante:
- geração;
- persistência;
- complete_dossier_run;
- tratamento de falha;
- cancelamento.

Isso deve ser resolvido antes de conectar a UI ao novo endpoint.

## Próxima ação

Gerar novo deployment Preview mediante autorização; confirmar Preview em `xlvs…owec` e Produção em `vmqf…npig`. Só depois autorizar migration da PR3 no Preview, validar RPC/RLS e executar smoke autenticado controlado. Não iniciar PR5/PR6, não marcar ready e não fazer merge antes dos gates correspondentes.
