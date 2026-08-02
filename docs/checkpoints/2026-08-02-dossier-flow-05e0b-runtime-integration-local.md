# Checkpoint — DOSSIER-FLOW 05E.0B runtime integration local

## Modo escolhido: full

Integração local autorizada pelo Planner; publicação remota permanece bloqueada.

## Identidade

- `TASK_ID`: `DOSSIER-FLOW-05E.0B-RUNTIME-INTEGRATION-02`
- `SOURCE_HEAD`: `a65f425b579ae429d9dd3823b0721a1a1d7d52bf`
- Worktree: `/private/tmp/novo-app-dossier-flow-05a`
- Branch: `codex/dossier-flow-server-owned-05a`
- `DELIVERY_LOOP`: enabled; terminal permitido nesta etapa: `REPORT_READY`.
- Migration 05E.0C não alterada; SHA-256 `5bbf36cbcd30da2c8a6dc68c96dcfb7d9be83cef3a434ff55a418b49feee9a61`.

## Autorização

`05E_0B_RUNTIME_INTEGRATION_AUTHORIZED=YES`, limitado a integração e validação local. `COMMIT/PUSH/GITHUB/PR/CI/SUPABASE/MIGRATION/PREVIEW/DEPLOY/PRODUCTION/MERGE/REAL_PROVIDER=NO`.

## Implementação

- `api/dossier.ts` delega `generate` para `runDossierRuntime`; chat permanece com ownership separado.
- `api/_dossier-run-rpc.ts` usa os oito RPCs do contrato, headers autenticados, sem `keepalive`, timeout total e leitura de body sob o tempo restante.
- `api/_dossier-runtime-orchestrator.ts` controla 300s/270s/240s/30s, attempt/fence, heartbeat sem sobreposição, checkpoints ordenados, resume, retry limitado, cancelamento terminal independente e persistência atômica.
- `api/_dossier-persistence.ts` chama somente `persist_and_complete_dossier_run_attempt` e grava conteúdo do pipeline server-owned.
- Testes antigos do generate foram alinhados ao contrato novo; não há branch de compatibilidade somente para teste.

## Evidência local

| Gate | Resultado |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS; warnings de chunks/dynamic import |
| `npm run lint` | PASS sem erros; avisos preexistentes |
| RPC + orchestrator + handler + persistence + prova vertical | 51 PASS |
| `npm run test:contracts` | 136 PASS |
| `npm test` | 1668 PASS; 1 suíte PG não inicia sem `R1_PG_*` |
| `git diff --check` | PASS |

## Não validado / bloqueios

- Replay PostgreSQL R1 exige `R1_PG_SOCKET`, `R1_PG_PORT`, `R1_PG_DATABASE`; nenhum servidor local estava disponível.
- Provider real, Vercel Preview, Supabase remoto, E2E live, Produção e contagem efetiva de Functions permanecem `NAO VALIDADO`.
- Nenhuma alteração remota, commit, push, PR ou deploy foi feita.

## Próximo passo

Enviar este checkpoint e o pacote canônico ao Planner Web. A decisão final dele define se a etapa remota poderá ser aberta.
