# Handoff 05E.0A-R1 — fechamento de viabilidade

Atualizado em 2026-08-02. Handoff local e documental; nenhum código de runtime,
Preview, provider, banco remoto, commit, push ou merge foi executado neste lote.

## Retomada rápida

1. Ler [`2026-08-02-dossier-flow-05e0a-r1-feasibility-closure.md`](../checkpoints/2026-08-02-dossier-flow-05e0a-r1-feasibility-closure.md).
2. Ler [`2026-08-02-dossier-flow-05e0a-r1-canonical-package.md`](../checkpoints/2026-08-02-dossier-flow-05e0a-r1-canonical-package.md).
3. Conferir `.agents/skills/licoes/SKILL.md` e lições de timeout, Vercel, persistência e server-owned antes de qualquer nova etapa.
4. Reusar `bash scripts/proofs/dossier-300s-runtime/run-05e0a.sh` e, quando necessário, `bash scripts/proofs/dossier-300s-runtime/vercel-readonly-evidence.sh`.
5. Enviar o retorno estruturado ao Planner e aguardar adjudicação; não iniciar 05E.0B por inferência.

## Estado atual

- O contrato de recovery foi fechado localmente: 27/27 testes 05E.0A + R1, com fencing,
  lease controlada, retry limitado, checkpoint idempotente, cancelamento dominante,
  timeout sem órfão e persistência terminal sem falso sucesso.
- Vercel read-only confirmou Hobby + Fluid Compute efetivo + 300s no deployment atual;
  10 saídas Lambda observadas (9 `api/`), limite documentado de 12 e 2 slots derivados.
- `api/dossier.ts` fonte permanece com 60s e sem override no `vercel.json`; o valor de
  300s observado é efetivo no deployment por configuração de plataforma, não uma edição local.
- Decisão proposta ao Planner: `CONTINUE_05E_TO_IMPLEMENTATION_ADJUDICATION`.
- Decisão final do Planner: `05E_0A_R1_RESULT=APPROVED_WITH_RESERVATIONS`,
  `NEXT_STATE=CONTINUE_05E_TO_IMPLEMENTATION_ADJUDICATION`.
- `RUNTIME_READINESS=NOT_PROVEN`; `05E_0B_AUTHORIZED=NO`.

## Bloqueios e proibições

- O helper canônico ainda não implementa recovery/persistência; a prova não pode ser
  apresentada como wiring de produção.
- Gate Zero futuro: reconciliar explicitamente `api/dossier.ts maxDuration=60` com a
  Function construída/implantada em 300s. O pior caminho usa 235s, deixando 35s (30s
  de reserva e 5s de margem), portanto não prova robustez real.
- Planner verificou diretamente deployment/SHA/10 funções; plano, Fluid, duração
  individual e testes locais continuam sustentados pelo artefato do executor até a
  reconciliação do Gate Zero.
- Não alterar `api/**`, frontend, services/shared, migration/RPC/RLS/grant, `vercel.json`,
  package/lock ou secrets nesta retomada sem novo cartão.
- Não executar provider real, Preview, deploy, CI remoto, Supabase remoto, commit, push,
  PR, Produção ou merge. Merge exige `MERGE` explícito do Bruno.

## Evidência e validações

```text
run-05e0a.sh                                  PASS
tests/proofs/dossier-300s-runtime              27/27 PASS
npx vitest focused API + harness              67/67 PASS (baseline anterior)
npm run typecheck                              PASS
eslint proof dirs                              PASS
npm run build                                  PASS
git diff --check                               PASS
READ_ONLY_VERCEL_EVIDENCE                      PASS
REAL_PROVIDER_CALLS                            0
SUPABASE_REMOTE_MUTATIONS                      0
PRODUCTION_MUTATIONS                           0
```

## Skills para a próxima sessão

- `licoes` antes de qualquer etapa.
- `doc-handoff` após etapa grande.
- `delivery-loop` para qualquer implementação autorizada.
- Controle do Planner Web para validação média/grande; decisão final permanece com o Planner.
