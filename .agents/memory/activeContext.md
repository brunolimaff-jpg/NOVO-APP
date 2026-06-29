# Active Context

Last updated: 2026-06-30 — Sessão Z.ai + H1/H3 concluída, PR #405 aberta

## Estado Atual

- **Branch atual:** `condescending-hoover-10c1cc` (worktree)
- **PR aberta:** [#405](https://github.com/brunolimaff-jpg/NOVO-APP/pull/405) — MERGEABLE
- **Baseline:** `origin/main` @ `61ced7bc`
- **Tag:** `pre-prompts-cleanup`
- **Plano maior:** Plano de Profissionalização V3 (~80% concluído)

## O que foi entregue

- Z.ai validado (22 agentes, 121 verificações, 82% claims confirmadas)
- ADRs 0003-0005 commitados em `docs/adr/`
- Plano de limpeza de prompts em `docs/management/`
- H1: `utils/promptLeakShield.ts` deletado (órfão, -150 LOC)
- H3: 2 padrões de leak-shield (`nota_de_escopo`, `aviso_metodologico`)
- 12 comentários de bots resolvidos
- 5 silent failures documentados (todos pré-existentes)
- Handoff completo em `HANDOFF_AI.md`

## Decisões ativas

- DI-2026-06-29-01: Z.ai produz docs, nunca executa
- DI-2026-06-29-02: Princípio 6 como gate de handoff
- DI-2026-06-29-03: Regex de shield requer adversarial review
- DI-2026-06-29-04: `pre-prompts-cleanup` como reversão

## Próximos passos

- Merge PR #405 (aguardando "MERGE" do Bruno)
- H4: consolidar 8× inline_citation_rule (médio risco)
- Fase 7: cron-email-confirmation → createClient
- Fase 8: consolidar 157 .md → ≤30
- Fase 9: self-audit 97 itens

## Atenção

- 5 CI failures = débito fe6c6f9 (mesmo em main)
- Cópia stale do shield em `api/gemini.ts:59-115` sem 2 novos padrões
- `applyPromptLeakShield` sem try/catch em 2 locais
