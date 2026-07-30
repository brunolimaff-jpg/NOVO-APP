# Active Context

Last updated: 2026-07-30 — correção final da Draft PR #466 validada localmente

## Estado

- PR #465 mergeada em `main`: `bd98c829`.
- PR #466 `OPEN/DRAFT`: https://github.com/brunolimaff-jpg/NOVO-APP/pull/466
- Branch `codex/secure-cross-operator-dossier-reuse`; base anterior `6c4884ed`.
- RPCs exigem Auth confirmado `@senior.com.br`, e-mail igual ao perfil e `operator_id`; somente `authenticated` executa.
- Descoberta expõe raiz/cópia própria e reutilização canonicaliza cópia estrangeira diretamente para a raiz.
- Teste PG com A/B/C/X/U/M comprova autorização e linhagem; concorrência limitada às barreiras advisory lock + índice único.
- Gates: 65/65 direcionados, PG17 PASS, replay 24/24, build/lint/diff PASS, zero regressão vs `main`.

## Guardrails

- Manter a PR Draft; merge somente com `MERGE` explícito.
- Não aplicar migration, smoke pago ou escrita manual em Produção/Preview/Vercel.
- Não alterar `shared_dossiers` nem PR #456.

## Ponteiros

- `HANDOFF_AI.md`
- Vault: `/Users/brunolima/Documents/bruno vault/04 - Histórico ChatGPT/Sessões Anteriores/2026-07/2026-07-30T15-51-32-pr466-reutilizacao-segura-dossies.md`
