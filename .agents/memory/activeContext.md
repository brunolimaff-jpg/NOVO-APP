# Active Context

Last updated: 2026-08-15 18:25 — BRU-109 A+C + BRU-117 entregues · PR #483 closure candidate · aguardando validação manual do Bruno

## Estado

- **Branch:** `feat/v6-shadow-prep` · **HEAD remoto:** `b23c98e2` (docs) — código Gold `cc93e876` (BRU-117) sobre `4a497126` (BRU-109 A+C) sobre `0200e9b3` (ARCH-E)
- **PR #483 DRAFT** (OPEN, MERGEABLE, não mergeada): BRU-109 (ARCH A-E + DECISÕES A+C) e BRU-117 (BRU-76 + precondição Golden + opção B) entregues
- **CI:** 11/11 SUCCESS no `cc93e876` · Preview Smoke SUCCESS (mesmo SHA) · CodeQL/GitGuardian/Analyze PASS
- **Golden Dossier Live:** fail = **timeout de job (20 min)**, não assertion — precondição PASSou (onboarding E2E funcionou via vínculo); runtime real iniciou mas o relatório não renderizou no limite do Playwright (240s). **Decisão do Bruno: pular o gate, validar manualmente.**
- **Full suite 2197/2197** · Gold 923/923 · typecheck/lint/build/no-gemini OK
- **Telemetria do compact estruturada** (`compact-error.ts`): errorClass + responseChars + finishReason + hasObjectBoundary, sem texto livre; eventos compact-* críticos — qualquer queda futura deixa rastro no Supabase
- **Leak shield canônico** (`utils/leakShieldPolicy.ts`): serverless agora bloqueia contexto_cadastral/nota_de_escopo/aviso_metodologico (RED→GREEN); JSON-safe preservado; PORTA sem regressão

## Próximo passo (Bruno — validação manual)

1. Rodar o dossiê Scheffer no preview do SHA `b23c98e2` (manual).
2. Se gold_pass (verifier 0, contract PASS, artifact PASS, zero Mermaid error): iniciar revisão formal da PR com o Planejador → READY FOR MERGE (Bruno decide com `MERGE`).
3. Se cair: telemetria nova do compact mostra a causa no `scout_diagnostics` — diagnosticar com evidência.

## Não fazer

- Merge #483 sem token `MERGE` do Bruno · Produção · Supabase write/migrations
- Retry do compact (congelado pelo Planejador) · mudança de modelo/provider/prompt
- Mover status dos BRU no Linear (executor só passa status)

## Vault

- Sessão: [[2026-08-15T18-25-34-bru109-bru117-gold-stabilization-closure-candidate]]
- Lições novas (ci): diagnóstico E2E com trace.zip · teto de 20 min de job com rodadas reais
- CALIBER_LEARNINGS atualizado (4 entradas: trace E2E, teto job, telemetria compact, leak shield canônico)
