# Handoff — Sessao Z.ai + H1/H3 Prompts Cleanup

> **Estado:** PR #405 aberta, MERGEABLE, 12 comentarios resolvidos. Tag `pre-prompts-cleanup` criada. Baseline `61ced7bc` (origin/main).
> **Branch:** `condescending-hoover-10c1cc`
> **PR:** [#405](https://github.com/brunolimaff-jpg/NOVO-APP/pull/405) — ADRs 0003-0005 + plano de limpeza de prompts + H1/H3 executados
> **Tag:** `pre-prompts-cleanup`
> **Worktree:** `/Users/brunolima/Documents/NOVO-APP/.claude/worktrees/condescending-hoover-10c1cc`

---

## Resumo da Sessao (29-30/Jun/2026)

| # | Tarefa | Status |
|---|--------|--------|
| 1 | Validar claims Z.ai (22 agentes, 121 verificacoes, 82% confirmadas) | ✅ |
| 2 | Commit ADRs 0003-0005 em `docs/adr/` | ✅ |
| 3 | Commit plano de limpeza de prompts em `docs/management/` | ✅ |
| 4 | H1: deletar `utils/promptLeakShield.ts` (150 linhas, arquivo orfao) | ✅ |
| 5 | H3: adicionar 2 padroes de leak-shield ao `utils/textCleaners.ts` | ✅ |
| 6 | Corrigir regex `aviso_metodologico` apos review adversarial | ✅ |
| 7 | Resolver 12 comentarios de review (CodeRabbit + Gemini Code Assist) | ✅ |
| 8 | Executar H2 (template per-socio teia-deep.ts) | ❌ |
| 9 | Executar H4 (consolidar 8x inline_citation_rule) | ❌ |

## Correcoes aplicadas

| Correcao | Origem |
|----------|--------|
| Regex `aviso_metodologico` restringida: prefixo `este modulo|este dossie|esta analise` adicionado para evitar falso positivo em relatorios com secao de metodologia | Review adversarial |
| `--force push` removido do plano (CodeRabbit Critical) | CodeRabbit |
| H1/H3 marcados como concluidos no plano | CodeRabbit |
| Acentos flexibilizados nos padroes (e/e, o/o, a/a) | Gemini Code Assist |
| ADR-0005 atualizado: 3 copias do shield -> 2 copias | CodeRabbit |

## Arquivos alterados

| Arquivo | Mudanca | Status |
|---------|---------|--------|
| `docs/adr/0003-investigation-orchestration-god-component.md` | **Novo** — ADR investigation-orchestration.ts (678 LOC, 429 linhas doc) | ✅ |
| `docs/adr/0004-client-lookup-service-god-component.md` | **Novo** — ADR clientLookupService.ts (741 LOC, 613 linhas doc) | ✅ |
| `docs/adr/0005-api-gemini-god-component.md` | **Novo** — ADR api/gemini.ts (680 LOC, 523 linhas doc) | ✅ |
| `docs/management/prompts-cleanup-plan-2026-06-29.md` | **Novo** — Plano completo de limpeza (9 fases, H1-H4) | ✅ |
| `docs/management/RESUMO_SESSAO_2026-06-29.md` | **Novo** — Resumo da sessao Z.ai + validacao de claims | ✅ |
| `utils/promptLeakShield.ts` | **Deletado** — arquivo orfao, 0 imports ativos (-150 linhas) | ✅ |
| `utils/textCleaners.ts` | **Modificado** — +2 padroes (nota_de_escopo, aviso_metodologico) | ✅ |
| `docs/adr/0001-waterfall-orchestrator-god-component.md` | **Modificado** — Atualizado com resultados da sessao Z.ai | ✅ |
| `docs/adr/0002-app-tsx-god-component.md` | **Modificado** — Atualizado com resultados da sessao Z.ai | ✅ |

**Total:** +1953 / -190 linhas, 9 arquivos

## Decisoes desta sessao

- **DI-2026-06-29-01:** Z.ai produz docs, nunca executa — toda entrega precisa de materializacao externa
- **DI-2026-06-29-02:** Principio 6 (grep de discrepancia) mantido como gate de qualidade para handoffs
- **DI-2026-06-29-03:** Regex de leak-shield requer adversarial review antes de deploy — padrao de falso positivo detectado
- **DI-2026-06-29-04:** `pre-prompts-cleanup` tag preserva ponto de reversao pre-limpeza

## Validacao Final (30/06/2026)

| Gate | Status |
|------|--------|
| Typecheck | 5 erros pre-existentes (nao relacionados) |
| Build | 17.4s, OK |
| Testes textCleaners | 6/6 passando |
| grep: imports promptLeakShield | Zero |
| grep: `GeminiProxy` | 0 ocorrencias (inalterado) |
| Review adversarial | Falso positivo corrigido |
| CodeRabbit | 1 Critical + 1 Major resolvidos |
| Gemini Code Assist | Regex com acentos flexibilizados |

## CI failures (pre-existentes desde main @ `61ced7bc`)

- Dossier Golden: MIGRATION_DEADLINE expirado
- Tests: AuthGate.test.tsx migration banner
- Typecheck: 5 erros em testes
- E2E Critical Browser: onboarding.ts login CI
- Golden Dossier Live: mesmo problema do Dossier Golden

## Licoes aprendidas

| # | Licao | Anti-padrao | Onde aplicar |
|---|-------|-------------|--------------|
| 1 | Z.ai so produz docs, nunca executa — precisa de alguem para materializar | Assumir que agente IA commitou o que produziu | Fluxo de validacao |
| 2 | Principio 6 (grep de discrepancia) pegou 2 erros no handoff Z.ai | Confiar cegamente em handoff de agente | Handoff validation |
| 3 | Review adversarial pegou falso positivo que nem Z.ai nem validacao inicial viram | Validacao em cascata (agente + adversarial) pega mais | Fluxo de validacao |
| 4 | "13 vs 8 arquivos" era contexto diferente (prompts + relacionados), nao erro | Interpretacao literal de contexto vs total de arquivos | Documentacao |
| 5 | Workflow com cache quente no Pro economiza tokens significativamente | Flash em workflow custa mais caro que Pro | Router de agentes |
| 6 | Regex de leak-shield precisa de adversarial review obrigatorio | Publicar regex sem testar contra corpus real | textCleaners.ts |

## O que NAO funcionou

1. **Falso positivo `aviso_metodologico`:** Regex original `/aviso metodol[oO]gico:/i` sem prefixo de contexto pegava relatorios com secao "Aviso Metodologico" (ex: dossie Scheffer). Diagnostico: Z.ai sugeriu o regex, validacao inicial com 22 agentes nao pegou. Solucao: prefixo `este modulo|este dossie|esta analise` adicionado apos adversarial review.

2. **Commit `e7bef823` rejeitado pelo git:** `Updates were rejected because the remote contains work that you do not have locally.` Causa: tag `pre-prompts-cleanup` criada no worktree remoto mas branch local desatualizada. Solucao: `git fetch --tags` e `git push --force` (recusado no 1o tentativa por --force).

3. **Handoff Z.ai com 7 arquivos nao commitados:** Z.ai fez levantamento de alta qualidade mas salvou tudo em ~/Downloads — nenhum arquivo foi commitado. Nao replicavel: depende de abertura manual dos arquivos.

## Pendentes para proxima sessao

| Pendencia | Risco |
|-----------|-------|
| H2: template per-socio teia-deep.ts | Medio — decisao de design pendente do Bruno |
| H4: consolidar 8x inline_citation_rule | Medio — exige hash identico, sem falso positivo |
| Fase 7: cron-email-confirmation -> createClient | Alto — refatoracao de auth |
| Fase 8: consolidar 157 .md -> <=30 | Alto — mudanca estrutural grande |
| Fase 9: self-audit 97 itens | Alto — auditoria massiva |
| Codigo stale do shield em api/gemini.ts:59-115 sem os 2 novos padroes | Medio — debito documentado no ADR-0005 |
| applyPromptLeakShield sem try/catch em 2 locais | Baixo — shield nao quebra fluxo |
| 5 CI failures pre-existentes | Medio — debito de main |

## Links

- **PR #405:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/405
- **Tag pre-prompts-cleanup:** `git show pre-prompts-cleanup` (baseline 61ced7bc)
- **Plano de limpeza:** `docs/management/prompts-cleanup-plan-2026-06-29.md`
- **Resumo sessao Z.ai:** `docs/management/RESUMO_SESSAO_2026-06-29.md`
- **ADRs:** `docs/adr/0003-investigation-orchestration-god-component.md`, `docs/adr/0004-client-lookup-service-god-component.md`, `docs/adr/0005-api-gemini-god-component.md`
- **Vault Sessao:** Bruno Vault/20-SESSOES/2026-06/2026-06-30T00-00-00-sessao-zai-h1-h3.md
- **Vault Licoes:** Bruno Vault/30-LICOES/LICOES-APRENDIDAS-ZAI-VALIDACAO-2026-06-30.md

## Proximo passo

Mergear PR #405 e iniciar Fase 7 (cron-email-confirmation -> createClient) ou H2 (template per-socio teia-deep.ts) conforme decisao do Bruno.
