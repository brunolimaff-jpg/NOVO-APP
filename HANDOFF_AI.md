# Handoff — PR #383: Fase D CI + PR Gate IA

**Atualizado:** 2026-06-19  
**Branch:** `worktree-feat+fase-d-ci-quality-gates`  
**HEAD:** `032dbf5b`  
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/383  
**Produção:** `scoutagro.vercel.app`

## Estado Atual

- **Fase D implementada:** coverage gate, performance budget, testes de timeout, E2E expandido (`critical-ux`).
- **CI rápido verde:** typecheck, vitest, coverage, build, dossier golden, smoke HTTP, CodeQL, Vercel preview.
- **E2E blocking vermelho:** `E2E Critical UX` (Docker) e `E2E Preview Vercel` — instável; não bloqueia merge após PR Gate IA.
- **Decisão nova (Bruno):** PR Gate IA substitui E2E como required check — ver DI-2026-06-19-01.
- **Design debt:** Cofre skeleton 3 seções — não bloqueia merge.
- **Sem merge** sem token **MERGE** explícito.

## PR #383 — Commits recentes

| SHA | Descrição |
|-----|-----------|
| `032dbf5b` | docs(agents): memória continual-learning E2E |
| `b0603210` | feat(ci): gate E2E Playwright no preview Vercel |
| `e8fe4534` | fix(ci): E2E com imagem Docker Playwright noble |

## PR Gate IA (nova trava)

**CI required:** typecheck, vitest, coverage, build, dossier golden, smoke HTTP.  
**NÃO required:** E2E Critical UX, E2E Preview Vercel.

**Antes do merge:**

1. Bruno: `valida preview PR 383`
2. Agente: Playwright `critical-ux` no preview Vercel → comenta evidência na PR
3. Bruno: mensagem com **MERGE**

Vault: `Bruno Vault/30-DECISOES/DECISAO-PR-GATE-IA-2026-06-19.md`

## O que funcionou

- Docker `mcr.microsoft.com/playwright:v1.59.1-noble`
- 2 jobs E2E → 1 projeto `critical-ux`
- Preview manual Bruno: 5/5 ~1,7 min
- Scheffer 1 spec no preview via `BASE_URL` passou
- Vitest/coverage/golden como rede principal

## O que NÃO funcionou

1. E2E blocking Fase D (17 testes, 2 jobs) — timeout install, cancel 15 min
2. `playwright-github-action@v1` — Ubuntu 24.04
3. CI localhost/Docker ≠ preview Vercel (modal, Supabase, serverless)
4. Workflow preview 15 min — cancelou antes de 14 testes
5. Scheffer flaky localhost; OK preview manual
6. Testing Trophy violado no topo (muitos E2E blocking)
7. Duplicação `loading-smart-recovery` vs `cofre-progressive`
8. Resolver threads sem responder — usar `gh-resolve-pr-comments`
9. AGENTS.md memória na branch errada — cherry-pick

## Playbook Fase D

| Tarefa | Status |
|--------|--------|
| T-D.1 CI coverage gate | ✅ |
| T-D.2 E2E | 🟡 → PR Gate IA (fora required) |
| T-D.3 Testes timeout | ✅ |
| T-D.4 Performance budget | ✅ |

## Próximos Passos

1. Implementer remove E2E blocking (paralelo)
2. Skill/comando `valida preview PR N`
3. PR template — seção Preview Validation IA
4. Merge #383 após PR Gate IA + validação preview + **MERGE**

## Vault

- Sessão: `Bruno Vault/20-SESSOES/2026-06/2026-06-19T19-30-00-pr383-fase-d-pr-gate-ia.md`
- Lições: `Bruno Vault/30-LICOES/LICOES-APRENDIDAS-E2E-CI-PR-GATE-2026-06-19.md`
- Decisão: `Bruno Vault/30-DECISOES/DECISAO-PR-GATE-IA-2026-06-19.md`

## Guardas

- Merge só com **MERGE** na mensagem atual
- Preview Vercel = gate UX; CI E2E localhost não substitui
- Responder thread antes de marcar resolved
