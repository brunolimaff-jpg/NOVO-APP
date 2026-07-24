# Estabilização do dossiê e migração LiteLLM — v1

> **Status:** PR 1 mergeada; PR 2 concluída; PR 3 com code gate aprovado e release gate bloqueado; PR 4 draft com code gate aprovado.
> **Baseline:** `e0e3d8b2468fdf4e1afe3159c2a5b8320e395845`.
> **Prioridade:** estabilizar exclusivamente o fluxo de geração, persistência, exibição e acompanhamento contextual do dossiê.

## Decisões congeladas

- O único endpoint de negócio consumido diretamente pela UI será `api/dossier.ts`.
- `cnpj`, `extract-content`, `link-status`, `open-web-search` e `socio-search` serão auxiliares protegidos, com operação fixa, payload limitado, rate limit e sem prompt livre. A UI não os chamará diretamente.
- O gateway LiteLLM será módulo interno. O frontend não escolhe provider, modelo, workload, prompt, retry ou ferramentas.
- Uma execução usa idempotência, lifecycle persistido, lease e cancelamento em duas camadas: abort da conexão atual e pedido de cancelamento cooperativo por `runId`.
- O primeiro cutover não tem fallback Gemini nem retry automático. Um workload problemático fica `disabled`.
- `gemini-embedding-001`, índice Pinecone, namespaces e scripts de ingestão permanecem; somente Gemini generativo sai do dossiê.
- O RAG do dossiê é uma integração nova, opcional e degradável. O RAG documental do War Room fica indisponível, sem apagar vetores.
- O benchmark interno `runDossierBenchmarkStage` permanece enquanto contribuir ao relatório. Benchmark independente, War Room e Radar ficam indisponíveis.
- Sentry Replay permanece desligado até existir retenção, acesso e sanitização comprovados.
- A meta é oito Functions, mas o gate é sempre o Build Output observado.

## Fluxo canônico do dossiê

```text
Usuário autenticado
→ empresa ou CNPJ
→ auth, ownership e idempotência
→ CNPJ, QSA e empresas relacionadas
→ pesquisa pública e RAG aplicável
→ EvidencePack com proveniência
→ módulos analíticos via LiteLLM interno
→ benchmark interno quando aplicável
→ consolidação, validação e Score PORTA
→ persistência e lifecycle final
→ renderização e acompanhamento contextual vinculado ao dossierId
```

Qualquer falha de identidade, persistência ou validação estrutural bloqueia a entrega. Falha de uma fonte opcional ou do RAG deve aparecer como limitação e permitir apenas resultado degradado, nunca fato inventado.

## Superfícies fora do primeiro ciclo

Radar, auto-scan de notícias, War Room, respostas técnicas livres, benchmark independente, docs-RAG, health generativo, curiosidades de loading e recovery judge não essencial devem mostrar:

> Disponível em breve.
> Estamos priorizando a estabilização e a qualidade dos dossiês.

Elas não podem manter botão funcional, timer, request em background, endpoint sem consumidor ou fallback Gemini silencioso. Dados, tabelas, índices e vetores históricos permanecem preservados.

## PRs e gates

| PR | Objetivo | Functions esperadas | Gate de saída |
| --- | --- | ---: | --- |
| 1 | Node 24, npm fixado, `npm ci`, CI, Vercel e Build Output | 13 | instalação, build e Functions explicadas |
| 2 | Contenção de Radar, War Room e superfícies secundárias | 9 | zero execução oculta; benchmark interno preservado |
| 3 | Auth, Supabase, ownership, lifecycle, leases e cancelamento | 9 | RLS, idempotência e cancelamento comprovados |
| 4 | `api/dossier.ts`, gateway LiteLLM e chat contextual | 10 | Preview G3, auth, abort e logs correlacionados |
| 5 | Busca, RAG opcional e EvidencePack consumido | 9 | proveniência correta; RAG comparado e degradável |
| 6 | Waterfall, persistência, UI e remoção Gemini generativo | 8 alvo | dossiê completo, sem EmptyState e sem Gemini generativo |

## Checkpoint canônico — 2026-07-24

- PR3 `#450`: branch `codex/dossie-pr3-lifecycle`, head `3b929f7b4d2be01e9b9c1d33e753599b96f98355`, code gate aprovado e release gate bloqueado.
- PR4 `#451`: branch `codex/dossie-pr4-gateway`, base intencional na PR3, draft, mergeável e code gate aprovado.
- Head funcional da PR4 antes do commit documental: `5807e630a3134b321847b900293b6b59f4622868`.
- Preview Vercel READY no head esperado, originado por Git e com 10 Functions; nenhum deploy manual.
- Supabase Preview `scoutagro-preview` (`xlvs…owec`) está `ACTIVE_HEALTHY` e isolado da Produção (`vmqf…npig`).
- Cinco envs Supabase foram configurados somente no Preview; é necessário um novo deployment para aplicá-los.
- LiteLLM Preview tem base URL, API key e alias geral; alias de chat é opcional e está ausente.
- Migration PR3, SQL, validação RPC/RLS, usuário/run controlados e smoke autenticado ainda não foram executados.
- Evidência detalhada: `docs/checkpoints/2026-07-24-pr4-code-gate-e-preview-isolado.md`.

### Contratos congelados da PR4

- autenticação Supabase obrigatória e ownership derivado server-side;
- chat/run/contexto vinculados server-side e bloqueio entre operadores;
- limites de contexto/payload, lease server-side e heartbeat fail-closed;
- cancelamento cooperativo, finalização/recuperação e descarte de resposta tardia;
- `AbortSignal`, timeout físico, erros estáveis e logs correlacionados sem conteúdo sensível;
- alias lógico LiteLLM obrigatório, sem modelo físico hardcoded;
- zero retry da aplicação no gateway do dossiê e retry legado preservado;
- nenhuma tool ou function calling adicionada.

```text
LITELLM_DOSSIER_MODEL_SOURCE: alias lógico obrigatório configurado por env
LITELLM_DOSSIER_APP_RETRIES: 0
LITELLM_PROXY_RETRIES_AND_FALLBACKS: desativados no primeiro cutover ou controlados exclusivamente no proxy
TOOLS_FUNCTION_CALLING: reservado para PR5
BRAVE_AND_EVIDENCEPACK: PR5
WATERFALL_PERSISTENCE_UI_CUTOVER: PR6
```

### Bloqueador de integração da PR6

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

### Decisão de heartbeat

```text
HEARTBEAT_TRANSIENT_TOLERANCE:
REJEITADA NA PR4

MOTIVO:
A execução permanece fail-closed quando a posse válida da lease não pode ser comprovada.

FOLLOW_UP:
Pode ser reavaliada posteriormente com evidência operacional, sem bloquear a PR4.
```

Cada checkpoint segue o mesmo loop:

```text
INSPECIONAR → CLASSIFICAR → PLANEJAR → IMPLEMENTAR
→ TESTAR ESTATICAMENTE → TESTAR LOCALMENTE → GERAR BUILD
→ PUBLICAR PREVIEW → EXECUTAR PROVA CONTROLADA → LER LOGS
→ VERIFICAR BANCO → COMPARAR ESPERADO E OBSERVADO
→ REVISAR → DOCUMENTAR LIÇÃO → DECIDIR
```

Decisões permitidas: `AVANÇAR`, `CORRIGIR UMA VEZ`, `REVERTER`, `BLOQUEAR`, `DIVIDIR ESCOPO` ou `PEDIR EVIDÊNCIA`.

A regra de uma correção vale por hipótese ou checkpoint, não pela PR inteira. Resultado inconclusivo não avança. Merge e deploy exigem autorização humana separada.

## PR 1 — escopo autorizado

Esta PR altera somente a reprodutibilidade da baseline:

- Node 24 nos workflows CI;
- npm `11.11.0` fixado no pacote;
- `.nvmrc` para desenvolvimento local;
- `npm ci` no deploy Vercel e nas instruções operacionais;
- plugin de build Sentry com upload de sourcemaps estritamente opt-in;
- documentação do plano e handoff de continuidade.

Ficam fora: LiteLLM, Gemini, prompts, APIs, Supabase, Vercel remoto, Sentry runtime, Pinecone, Radar, War Room e comportamento funcional do dossiê.

## Critérios de aceite da PR 1

- `npm ci` com Node 24.14.1 conclui sem modificar o lockfile;
- typecheck, testes e build são executados e registrados separadamente;
- Vercel Build Output é gerado ou bloqueado com motivo verificável;
- as 13 Functions observadas são registradas com origem, runtime e duração;
- `git diff --check` passa;
- nenhum segredo ou arquivo local é versionado;
- nenhuma chamada LLM, migration, deploy ou runtime de agentes é executado.

## Validação registrada em 2026-07-20

- `npm ci` passou com Node `24.14.1` e npm `11.11.0`, sem alterar o lockfile.
- O Preview final `dpl_AMQkRove9o47UHrVwt1pB8okXE9d` ficou READY em Preview, executou `npm ci`, concluiu `/vercel/output` e gerou 13 Functions Node. Production e deploy manual não foram executados.
- Sentry runtime não mudou. O plugin de build envia sourcemaps somente com `SENTRY_UPLOAD_SOURCEMAPS=true` e token; o Preview final não registrou upload.
- `npm run docs:obsidian:check` passou.
- Typecheck e a suíte geral falharam em arquivos e contratos fora deste diff, incluindo módulos de dossiê, LiteLLM, auth, socio-search e fixtures Golden. Com Node `24.14.1` e npm `11.11.0`, Typecheck e Golden reproduzem as causas funcionais da baseline; essas falhas não serão corrigidas nesta PR.
- O build Vercel local permanece `LOCAL_VERCEL_BUILD_UNLINKED`: a CLI exige vínculo local, mas o Build Output remoto já foi comprovado. Não usar `vercel pull`, `VERCEL_ORG_ID` ou `VERCEL_PROJECT_ID` apenas para repetir essa evidência.

## PR 2 — contenção em execução

- Radar, auto-scan, War Room, benchmark independente, docs-RAG, health generativo e ping LiteLLM saem da aplicação ativa.
- O aviso estático substitui as superfícies na Home e em Configurações, sem ação, timer ou request.
- `api/gemini`, `api/rag`, Pinecone, dados históricos e `runDossierBenchmarkStage` permanecem.
- Gate remoto: Preview READY, Build Output e exatamente nove Functions Node.

## Próxima sessão

Seguir a sequência do checkpoint de 2026-07-24: gerar novo deployment Preview mediante autorização, confirmar as refs efetivas e somente então decidir migration PR3, validações RPC/RLS e smoke autenticado. PR5 começa apenas depois do fechamento dos gates anteriores.

## Comparação de falhas preexistentes

| Job | Baseline | Head com Node 24/npm 11.11.0 | Mesma causa? | Classificação |
| --- | --- | --- | :---: | --- |
| Typecheck | exports e módulos ausentes | mesmos exports e módulos ausentes | sim | `PREEXISTENTE_CONFIRMADO` |
| Tests | timeouts de lookup oficial | mesmos timeouts no CI | sim | `PREEXISTENTE_CONFIRMADO` |
| Dossier Golden | bloqueio de autenticação antes do botão do dossiê | mesmo bloqueio local | sim | `PREEXISTENTE_CONFIRMADO` |
| E2E Critical Browser | `app-shell` ausente após 15 s | mesmo timeout no CI | sim | `PREEXISTENTE_CONFIRMADO` |
