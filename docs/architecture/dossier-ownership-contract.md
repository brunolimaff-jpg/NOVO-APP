# Dossier Ownership Contract — Client-Orchestrated / Server-Arbitrated

> **Decisão:** BRU-7 — Alternativa A (APROVADA em 2026-08-06).
> **Arquitetura oficial:** `CLIENT_ORCHESTRATED` · `SERVER_ARBITRATED` · `DATABASE_TERMINAL_STATE`.

## 1. Decisão

O waterfall do Dossiê é **orquestrado no navegador**. O servidor (RPCs Supabase `SECURITY DEFINER`) é a
autoridade sobre autenticação, autorização, lease e validade das transições persistidas. O banco é o
estado terminal canônico.

Isso substitui qualquer alegação anterior de "server-owned" como arquitetura vigente do fluxo produtivo.

## 2. Responsabilidades

### Cliente (navegador) — orquestra

- Iniciar a geração (criação do `dossier_run` por idempotency).
- Montar o contexto do waterfall (empresa, histórico, fontes, grounding).
- Executar a sequência dos módulos (8+ chamadas LLM via `/api/llm`).
- Manter o heartbeat/renovação do lease enquanto detém o ownership local.
- Solicitar persistência e transições terminais **somente via RPC**.
- Exibir progresso, interrupção, falha e recuperação.

### Servidor + banco — arbitram

- Autenticar o operador (`auth.uid()`).
- Validar ownership (`owner_id`) e lease (`lease_owner`, expiração).
- Rejeitar lease incorreto/expirado e terminalização por owner inválido.
- Persistir o estado canônico; manter `PENDING | RUNNING | CANCEL_REQUESTED | CANCELLED | COMPLETED | FAILED` observáveis.
- Reconciliação de stale runs (medida G — `close_stale_dossier_runs`) quando ativa.

## 3. Lifecycle (transições)

| Transição | Disparo | Autoridade | Evidência (main 6b04302c) |
|---|---|---|---|
| criação do run | cliente (`createOrGetDossierRun`) | RPC `create_or_get_dossier_run` | `features/chat/message-orchestrator.ts:517` |
| aquisição do lease | cliente (`acquireDossierRunLease`) | RPC `acquire_dossier_run_lease` | `message-orchestrator.ts:522` |
| renovação/heartbeat | cliente (15s; fail-closed 5 falhas) | RPC `renew_dossier_run_lease` | `features/dossier/dossier-run-heartbeat.ts:67` |
| persistência incremental/final | cliente (`storage.saveDossierStrict`) | RLS `dossies` (auth) | `waterfall-orchestrator.ts:1572` |
| conclusão `COMPLETED` | cliente (`markDossierRunCompleted`) | RPC `complete_dossier_run` | `waterfall-orchestrator.ts:1587` |
| falha `FAILED` | cliente (`markDossierRunFailed`) | RPC `fail_dossier_run` | `waterfall-orchestrator.ts:570,1554,1576,1592,1619` |
| cancelamento | cliente (`requestDossierRunCancellation` → `markDossierRunCancelled`) | RPCs `request_dossier_run_cancel` / `mark_dossier_run_cancelled` | `cancel-active-dossier-run.ts:9`; `waterfall-orchestrator.ts:1610` |
| retry | cliente (nova idempotency por botMessageId; guard 5s) | RPC idempotente | `waterfall-guard.ts:15`; `message-orchestrator.ts:519` |
| reconciliação stale | servidor (medida G — **inativa até BRU-10**) | RPC `close_stale_dossier_runs` (service_role) | `api/cron-dossier-run-cleanup.ts:50-55` |

## 4. Regras invioláveis

1. O cliente **não** escreve estado terminal ignorando as RPCs.
2. Uma resposta LLM **não** equivale a dossiê concluído.
3. Persistência ocorre **antes** de `COMPLETED`.
4. Um dossiê anterior válido **não** é removido após falha da nova execução.
5. Reload **não** produz falso sucesso nem retoma waterfall sem contexto.
6. Não existe segundo caminho produtivo de geração (nenhum híbrido `api/dossier` vs waterfall cliente).
7. `/api/llm` é a **única** rota de inferência. Sem Gemini, sem rota nova.

## 5. Reload / interrupção

- O registry de execução ativa (`active-run-registry.ts`) é persistido em `sessionStorage` (sobrevive ao
  reload da aba, não ao fechamento) para permitir detecção de `RUN_PERSISTED_AS_ACTIVE` com
  `LOCAL_ACTIVE_RUN_CONTEXT_MISSING`.
- No boot, um run persistido sem contexto local é tratado como **execução interrompida**:
  - nenhuma retomada automática do waterfall;
  - nenhuma reconstrução fictícia de contexto;
  - nenhuma indicação de geração local ativa;
  - estado visual explícito de interrupção + orientação de nova tentativa;
  - lease ainda válido continua protegendo contra disputa (RPC); lease expirado permite nova tentativa;
  - dossiê anterior preservado;
  - telemetria diagnóstica (`reload_interrupted_run`).

## 6. Itens deliberadamente não suportados (nesta arquitetura)

- Execução server-side síncrona do waterfall (`maxDuration=60s` do antigo `api/dossier.ts` é inviável
  para um fluxo real de 5–10 min).
- Job assíncrono / worker / fila (Alternativa B — não adotada).
- Híbrido cliente-gera/servidor-finaliza (Alternativa C — rejeitada).
- Migração e cron da medida G (BRU-10, lote separado).
- DeepSeek V4 Flash como modelo de pesquisa (teste A/B separado, não incorporado).

## 7. Relação com artefatos

- Endpoint órfão `api/dossier.ts` + gateway `api/_dossier-llm-gateway.ts`: **removidos** (sem callsite produtivo).
- `api/_llm-client.ts`: **preservado** (compartilhado com `/api/llm`).
- PR #468 (server-owned): **DO_NOT_MERGE** — direção não adotada, fechada sem merge.
- Decisão registrada em `.agents/memory/decisions.md` (DI-2026-08-06-BRU7-A).
