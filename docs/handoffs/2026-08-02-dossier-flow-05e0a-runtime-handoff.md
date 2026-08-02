# Handoff 05E.0A — Runtime target freeze e harness local

Atualizado em 2026-08-02. Este handoff é somente local/documental; nenhum commit, push, deploy, Preview, migration, SQL remoto, provider real ou Produção foi executado.

## Entrada rápida

1. Leia o checkpoint [`2026-08-02-dossier-flow-05e0a-runtime-target-freeze.md`](../checkpoints/2026-08-02-dossier-flow-05e0a-runtime-target-freeze.md).
2. Leia o pacote canônico [`2026-08-02-dossier-flow-05e0a-canonical-package.md`](../checkpoints/2026-08-02-dossier-flow-05e0a-canonical-package.md).
3. Execute `bash scripts/proofs/dossier-300s-runtime/run-05e0a.sh` no worktree `/private/tmp/novo-app-dossier-flow-05a`.
4. Não use o waterfall cliente como alvo de aprovação; ele é baseline.

## Estado verificado

- Planner congelou `RUNTIME_PROOF_TARGET=SERVER_OWNED_END_TO_END_MULTI_CALL`.
- Helper canônico foi identificado e exercitado diretamente com adapters sintéticos.
- Harness usa relógio virtual e zero rede/provider/Supabase.
- `17/17` testes do harness, `67/67` testes focados API/contrato, typecheck, lint focado, build e diff-check passaram.
- Guard confirmou que `api/` não foi alterado durante a prova.

## Bloqueio que permanece

O helper canônico não implementa o recovery necessário para equivaler ao produto: não há retry de módulos, reconciliação PORTA ou persistência terminal. O envelope existente sob `api/` também está parametrizado para 50s/60s e não pode ser alterado neste lote. Assim, a prova local demonstra contratos de orçamento e call graph sintético, mas não autoriza prova real nem declara 270s pronto.

## Próximo passo autorizado somente pelo Planner

Produzir uma decisão separada sobre como incorporar recovery/persistência ao pipeline server-owned sem criar nova função nem alterar Produção. Depois disso, preparar B1 Preview (máximo seis execuções) com isolamento explícito. Até essa autorização, manter 05E.0B pendente.

## Referências

- `api/_dossier-server-pipeline.ts` — helper canônico read-only.
- `api/dossier.ts` — envelope atual de 60s, não conectado ao frontend.
- `features/dossier/waterfall-orchestrator.ts` — baseline client-owned.
- `scripts/proofs/dossier-300s-runtime/` e `tests/proofs/dossier-300s-runtime/` — prova local.
- Lições consultadas: pipeline server-side isolado exige budget/indisponibilidade; body-read precisa entrar no timeout; timeout aninhado multiplica tempo; Hobby 300s só com confirmação oficial; limite de 12 funções.
