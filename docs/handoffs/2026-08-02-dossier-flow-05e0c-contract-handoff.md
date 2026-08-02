# Handoff — DOSSIER-FLOW 05E.0C comprovado localmente

## Modo escolhido: compact-pr

Motivo: etapa de branch/PR com migration local, prova de concorrência e decisão
de arquitetura; nenhuma publicação foi autorizada.

## Objetivo da próxima sessão

Enviar o resultado ao Planner Web e aguardar um cartão explícito para retomar
05E.0B com integração server-owned. Não conectar o runtime por conta própria e
não aplicar a migration fora do banco descartável.

## Estado atual

- Worktree: `/private/tmp/novo-app-dossier-flow-05a`
- Branch: `codex/dossier-flow-server-owned-05a`
- Source head: `a65f425b579ae429d9dd3823b0721a1a1d7d52bf`
- Contrato 05E.0C: `CHECKPOINT_CONTRACT_LOCALLY_PROVEN`.
- Runtime/readiness: `NOT_PROVEN`.
- Remoto: sem migration, provider, Preview, Produção, commit, push ou merge.

## Entregas

- Migration única com duas tabelas e oito RPCs de attempt/checkpoint/resume.
- Prova SQL funcional e runner com dois replays PG 17.10 e conexões
  concorrentes independentes.
- Atualização dos contratos Vitest para a cadeia de 25 migrations.
- Gates Node 24 e build Vercel local com `nodejs24.x`/`maxDuration=300`.

## Validação

`npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`,
`npm run test:contracts` (136/136), `npm test` (1.668/1.668) e o runner
PostgreSQL local passaram. Lint mantém 61 avisos sem erro; isso não é blocker
novo, mas deve ser acompanhado.

## Pendências e riscos

| Pendência | Risco |
| --- | --- |
| Adjudicação Planner para integração 05E.0B | Alto |
| Provar ownership único entre endpoint, worker, retry e conclusão | Alto |
| Replay/migration no ambiente remoto autorizado | Alto |
| Smoke autenticado Preview e provider real | Alto |
| Cutover frontend e validação de UX/intenção | Alto |

## Skills para retomar

- `.agents/skills/licoes/SKILL.md` antes de cada etapa.
- `doc-handoff` após nova etapa grande.
- `supabase-migration` apenas com cartão e escopo remoto explícitos.
- `validate-gates`/testes Node 24 antes de qualquer decisão de publicação.

## Artefatos

- Checkpoint: `docs/checkpoints/2026-08-02-dossier-flow-05e0c-contract-proven.md`
- Pacote canônico: `docs/checkpoints/2026-08-02-dossier-flow-05e0c-contract-canonical-package.md`
- Migration: `supabase/migrations/20260802111500_dossier_checkpoint_attempt_contract.sql`
- Prova: `scripts/proofs/dossier-checkpoint-contract/run-local-proof.sh`
- Evidência: `/tmp/dossier-flow-05e0c-proof.pGMvJY`
- Vault: `/Users/brunolima/Documents/bruno vault/Sessões/2026-08/2026-08-02T12-15-00-dossier-flow-05e0c-contract-proven.md`
