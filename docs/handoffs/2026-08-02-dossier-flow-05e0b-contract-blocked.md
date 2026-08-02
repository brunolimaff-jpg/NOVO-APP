# Handoff — DOSSIER-FLOW 05E.0B bloqueado por contrato

## Modo escolhido: compact-pr

Motivo: etapa de validação de branch/PR com decisão arquitetural e bloqueador
de persistência que precisa sobreviver à próxima sessão.

## Objetivo da próxima sessão

Retomar somente após o Planner emitir cartão explícito para
`DOSSIER-FLOW-05E.0C-CHECKPOINT-CONTRACT-01`. O objetivo é provar localmente o
contrato de banco de attempt, checkpoint, fencing e resume; não implementar
runtime em memória.

## Estado atual

- Worktree: `/private/tmp/novo-app-dossier-flow-05a`
- Branch: `codex/dossier-flow-server-owned-05a`
- `SOURCE_HEAD`: `a65f425b579ae429d9dd3823b0721a1a1d7d52bf`
- Gate Zero: PASS, `api/dossier.js` construído com 300s.
- Veredito 05E.0B: `BLOCKED_BY_EXISTING_DATABASE_CONTRACT`.
- Runtime server-owned e cutover frontend: não iniciados.

## O que foi alterado nesta etapa

- `api/dossier.ts`: duração passou para o formato estático reconhecido pelo
  build: `export const config = { runtime: 'nodejs', maxDuration: 300 }`.
- Checkpoint, pacote canônico e este handoff foram adicionados.

## O que não foi feito

Não houve nova função, pipeline duplicado, migration/RPC/RLS/grant, provider
real, Supabase remoto, Preview, deploy, commit, push, Produção ou merge.

## Bloqueador comprovado

O schema versionado de `dossier_runs` não tem identidade persistente de
tentativa, etapa confirmada, digest/payload de checkpoint ou versão do
pipeline. A RPC atômica atual cobre somente conclusão terminal sob lease.
Sem uma migration/RPC nova, não é possível provar checkpoint/resume, retry
durável ou rejeição de escrita de tentativa obsoleta.

## Validação

- Gate Zero e inspeção do artefato Vercel local: PASS.
- Implementação runtime, testes médios, suíte global e validação Node 24.x:
  **NAO VALIDADO** por interrupção segura.
- Node usado no build local: 26.5.0; o Planner exige repetir o gate com Node
  24.x no próximo cartão e bloquear divergência.

## Skills para a próxima sessão

- `.agents/skills/licoes/SKILL.md` antes de qualquer etapa.
- `doc-handoff` após a etapa.
- `supabase-migration`/governança de RLS somente se o Planner autorizar o
  cartão 05E.0C.

## Artefatos

- Checkpoint: `docs/checkpoints/2026-08-02-dossier-flow-05e0b-contract-blocked.md`
- Pacote: `docs/checkpoints/2026-08-02-dossier-flow-05e0b-contract-canonical-package.md`
- Artefato local Vercel: `/tmp/novo-app-vercel-build-05e0b-r2.y58UC8`
- Decisão do Planner: `FINAL_DECISION=BLOCKED_BY_EXISTING_DATABASE_CONTRACT`
