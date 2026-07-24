# Handoff — PR4 gateway LiteLLM local

> Atualizado: 2026-07-23
> Vault canônico: [[2026-07-23T13-54-30-novo-app-pr4-local-gateway]]

## Estado

- PR3: `#450`, branch `codex/dossie-pr3-lifecycle`, head `3b929f7b4d2be01e9b9c1d33e753599b96f98355`.
- PR3 code gate: **APROVADO**; release gate: **BLOQUEADO**.
- PR3 worktree permanece limpa.
- Consulta agregada Vercel aos envs efetivos: uma requisição, `HTTP 403`.
- `PREVIEW_DATABASE_ISOLATION`: **NÃO_VERIFICADO**; project refs: **NÃO_VERIFICADO**.
- O plugin Vercel autenticou em leitura neutra depois, mas os envs não foram consultados novamente.
- PR4 branch: `codex/dossie-pr4-gateway`.
- PR4 worktree: `/Users/brunolima/Documents/NOVO-APP-dossie-pr4-gateway`.
- Base exata: `3b929f7b4d2be01e9b9c1d33e753599b96f98355`.
- Commit funcional local: `2f132aa1` (`feat(dossier): add authenticated LiteLLM gateway`).
- Sem push, deploy, abertura de PR, migration, alteração de env, Supabase remoto ou merge.

## Implementado na PR4

- `api/dossier.ts`: endpoint de negócio `generate` e `chat`.
- Auth real via bearer Supabase; `operatorId` local não autoriza.
- Ownership via `get_own_dossier_run`; chat exige run `COMPLETED` vinculado ao `dossierId`.
- Gateway LiteLLM interno com modelos fixados no servidor.
- `AbortSignal` encadeado a auth, ownership e transporte LiteLLM.
- Timeout do gateway limitado a 50 s para respeitar a Function de 60 s.
- Logs correlacionados sem token, prompt, contexto, body upstream ou identidade.
- Compatibilidade de `/api/gemini` preservada: timeout legado 120 s, temperatura 0,7 e 4096 tokens.

## Validação local

- Focados: **32/32 passaram** (`llm-client` + `dossier`).
- ESLint focado: **passou**.
- `git diff --check`: **passou**.
- Build Vite: **passou**.
- Typecheck amplo: falha preexistente da baseline; zero erro nos arquivos PR4 ao filtrar o output.
- Suíte ampla: 1.008 passaram; 21 falharam; 58 suítes falharam antes de executar por débitos preexistentes.
- Revisão adversarial encontrou 1 P0 + 2 P1; os três foram corrigidos e os gates focados repetidos.

## Functions

- Handoff PR3 registra 9 Functions observadas.
- PR4 adiciona uma Function (`api/dossier.ts`): **10 esperadas** no Build Output.
- Contagem estática local mostra 8 handlers na PR3 e 9 na PR4; a décima depende do Build Output Vercel.
- Prova remota não executada porque deploy/push/Preview estão proibidos nesta sessão.

## Fora do escopo preservado

- Sem Brave, EvidencePack, RAG, PR5, waterfall final, UI final, cutover, remoção Gemini ou PR6.

PR6_INTEGRATION_BLOCKER:
O endpoint generate adquire e libera uma lease server-side.
O waterfall atual mantém lease client-side e completa após persistir.
A PR6 deverá definir um único proprietário da lease durante geração,
persistência e complete_dossier_run antes de conectar a UI ao endpoint.

LITELLM_DOSSIER_MODEL_SOURCE:
alias lógico obrigatório configurado por env

LITELLM_DOSSIER_APP_RETRIES:
0

LITELLM_PROXY_RETRIES_AND_FALLBACKS:
desativados no primeiro cutover ou controlados exclusivamente no proxy

TOOLS_FUNCTION_CALLING:
reservado para PR5

## Próximo passo seguro

Revisar o commit documental local e, somente com autorização futura, decidir push/abertura de PR e Preview G3. Antes do release, resolver isolamento Supabase e migration sem inferência.
