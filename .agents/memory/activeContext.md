# Active Context

Last updated: 2026-07-30 — correção de privacidade da Draft PR #466 em validação

## Estado

- PR #465 mergeada em `main`: `bd98c829`.
- PR #466 `OPEN/DRAFT`: https://github.com/brunolimaff-jpg/NOVO-APP/pull/466
- Branch `codex/secure-cross-operator-dossier-reuse`; head inicial `c82f6833`.
- RPCs exigem Auth confirmado `@senior.com.br`, e-mail igual ao perfil e `operator_id`; somente `authenticated` executa.
- Descoberta é fail-closed e só expõe raiz estrangeira com exatamente um relatório canônico marcado por `scorePorta`.
- Cópia estrangeira contém duas mensagens por allowlist; conversa privada e chaves desconhecidas não são copiadas.
- Teste PG com A/B/C/X/U/M comprova privacidade, autorização, raiz e conflito parcial direcionado.
- Gates: 152/152 direcionados; PG17 e replay 24/24 PASS; 14 erros Typecheck idênticos à `main`; 0 falha nova; lint/build/diff PASS.

## Guardrails

- Manter a PR Draft; merge somente com `MERGE` explícito.
- Não aplicar migration, smoke pago ou escrita manual em Produção/Preview/Vercel.
- Não alterar `shared_dossiers` nem PR #456.

## Ponteiros

- `HANDOFF_AI.md`
- A referência portátil do Bruno Vault está centralizada no handoff.
