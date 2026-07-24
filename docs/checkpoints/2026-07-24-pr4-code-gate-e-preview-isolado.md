# Checkpoint canônico — PR4 code gate e Preview isolado

> Data: 2026-07-24
> Plano: estabilização do dossiê e migração LiteLLM
> Objetivo de retomada: aplicar os envs em novo Preview, validar isolamento efetivo e avançar os gates remotos sem reconstruir o histórico.

## 1. Estado das PRs

| Etapa | Estado |
| --- | --- |
| PR1 | `#448` — mergeada |
| PR2 | `#449` — concluída |
| PR3 | `#450` — code gate aprovado; release gate bloqueado |
| PR4 | `#451` — draft, mergeável e code gate aprovado |

- PR3 branch: `codex/dossie-pr3-lifecycle`.
- PR3 head: `3b929f7b4d2be01e9b9c1d33e753599b96f98355`.
- PR4 branch: `codex/dossie-pr4-gateway`.
- PR4 base: `codex/dossie-pr3-lifecycle`.
- PR4 head funcional antes deste commit documental: `5807e630a3134b321847b900293b6b59f4622868`.

## 2. Arquitetura aprovada da PR4

- autenticação Supabase obrigatória;
- ownership derivado server-side;
- chat vinculado a `runId`, `dossierId` e `operator_id`;
- contexto do dossiê carregado server-side;
- bloqueio de acesso entre operadores;
- limites de contexto e payload;
- lease server-side;
- heartbeat fail-closed;
- cancelamento cooperativo;
- finalização e recuperação de cancelamento;
- descarte de resposta em cancelamento tardio ou perda de lease;
- `AbortSignal` e timeout físico;
- erros estáveis;
- logs correlacionados sem conteúdo sensível;
- alias lógico obrigatório para modelo LiteLLM;
- ausência de modelo físico hardcoded;
- zero retry da aplicação no gateway do dossiê;
- retry legado preservado;
- nenhuma tool ou function calling adicionada.

Evidência de code gate registrada: 65 testes focados passando, build passando e zero erro novo de typecheck nos arquivos da PR4. Esses gates não foram repetidos nesta atualização exclusivamente documental.

## 3. Preview Vercel

```text
PREVIEW_STATUS: READY
PREVIEW_COMMIT: 5807e630a3134b321847b900293b6b59f4622868
PREVIEW_COMMIT_MATCH: SIM
PREVIEW_FUNCTIONS: 10
DEPLOYMENT_SOURCE: Git
DEPLOY_MANUAL_EXECUTED: NÃO
```

Os envs configurados depois desse deployment ainda exigem um novo deployment Preview para entrarem em vigor.

## 4. Isolamento Supabase

```text
PRODUCTION_SUPABASE_REF: vmqf…npig
PREVIEW_SUPABASE_PROJECT: scoutagro-preview
PREVIEW_SUPABASE_REF: xlvs…owec
PREVIEW_SUPABASE_ORGANIZATION: brunolimaff-jpg's Org
PREVIEW_SUPABASE_REGION: sa-east-1
PREVIEW_SUPABASE_COST: 0 por mês
PREVIEW_SUPABASE_STATUS: ACTIVE_HEALTHY
PREVIEW_DATABASE_ISOLATION: CONFIRMADO
PRODUCTION_CHANGED: NÃO
```

Nenhum dado de Produção foi copiado para o Preview.

## 5. Envs configurados no Preview

```text
SUPABASE_URL_PREVIEW: CONFIGURADO
VITE_SUPABASE_URL_PREVIEW: CONFIGURADO
NEXT_PUBLIC_SUPABASE_URL_PREVIEW: CONFIGURADO
SUPABASE_ANON_KEY_PREVIEW: CONFIGURADO
VITE_SUPABASE_ANON_KEY_PREVIEW: CONFIGURADO
LITELLM_BASE_URL_PREVIEW: PRESENTE
LITELLM_API_KEY_PREVIEW: PRESENTE
LITELLM_DOSSIER_MODEL_PREVIEW: PRESENTE
LITELLM_DOSSIER_CHAT_MODEL_PREVIEW: AUSENTE — opcional
PRODUCTION_ENV_CHANGED: NÃO
```

Valores completos, chaves, tokens e URLs não são registrados neste checkpoint.

## 6. Decisões arquiteturais

```text
LITELLM_DOSSIER_MODEL_SOURCE:
alias lógico obrigatório configurado por env

LITELLM_DOSSIER_APP_RETRIES:
0

LITELLM_PROXY_RETRIES_AND_FALLBACKS:
desativados no primeiro cutover ou controlados exclusivamente no proxy

TOOLS_FUNCTION_CALLING:
reservado para PR5

BRAVE_AND_EVIDENCEPACK:
PR5

WATERFALL_PERSISTENCE_UI_CUTOVER:
PR6
```

### Heartbeat

```text
HEARTBEAT_TRANSIENT_TOLERANCE:
REJEITADA NA PR4

MOTIVO:
A execução permanece fail-closed quando a posse válida da lease não pode ser comprovada.

FOLLOW_UP:
Pode ser reavaliada posteriormente com evidência operacional, sem bloquear a PR4.
```

## 7. Itens ainda não executados

```text
PR3_MIGRATION_APPLIED_TO_PREVIEW: NÃO
SQL_EXECUTED_ON_PREVIEW: NÃO
CONTROLLED_SMOKE_EXECUTED: NÃO
AUTHORIZED_TEST_USER: NÃO_VERIFICADO
CONTROLLED_TEST_RUN: NÃO_VERIFICADO
```

Categorias amplas preexistentes no CI: Tests, Typecheck, Dossier Golden e E2E Critical Browser. Não são novos bloqueadores da PR4 porque existiam na baseline e os gates focados da PR4 passaram.

## 8. Bloqueios

- PR3 release gate continua bloqueado até deployment com envs novos, confirmação de refs, migration autorizada e validação correspondente.
- PR4 permanece draft; ready/merge dependem dos gates remotos e de decisão humana.

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

## 9. Sequência autorizável

1. Gerar novo deployment Preview após os envs.
2. Confirmar que o deployment usa o Supabase `xlvs…owec`.
3. Confirmar que Produção continua em `vmqf…npig`.
4. Aplicar a migration da PR3 somente no Supabase Preview, mediante autorização.
5. Validar RPCs e RLS no Preview.
6. Criar usuário e run controlados, mediante autorização.
7. Executar smoke autenticado do `/api/dossier`.
8. Validar logs, lifecycle, lease, cancelamento e LiteLLM.
9. Fechar release gate da PR3.
10. Decidir ready/merge da PR4.
11. Iniciar PR5 somente depois.
12. Resolver contrato da lease no cutover da PR6.

## 10. Proibições vigentes sem nova autorização

- não aplicar migration ou SQL;
- não criar tabelas, RPCs, usuário ou run;
- não executar smoke nem chamar LiteLLM;
- não alterar Produção, domínios, aliases ou branches;
- não fazer deploy manual;
- não marcar PR como ready;
- não fazer merge;
- não iniciar PR5 ou PR6;
- não registrar valores completos de env, project refs sem máscara, dados pessoais ou prompts.

## Retomada

Usar este checkpoint como fonte objetiva. Não reconstruir o histórico por chats e não reler o repositório inteiro. A primeira ação depende de autorização específica para gerar um novo deployment Preview; depois, validar o isolamento efetivo antes de qualquer migration.
