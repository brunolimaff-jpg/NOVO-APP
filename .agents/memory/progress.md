# Progress

Last updated: 2026-06-18 - P0 do playbook revisado em execucao

## Timeline

### 2026-06-18 (Trava removida + inicio do P0)

- Playbook consolidado como roadmap priorizado e nao bloqueante.
- Worktree criada: `codex/p0-playbook-foundation`.
- Baseline validado: 162 arquivos e 1.501 testes verdes.
- Banner/bloqueio de senha confirmados no codigo e testes.
- Producao online; cron retornou 500 por `CRON_SECRET` ausente.
- Cron protegido localmente com dry-run por padrao; RED e GREEN registrados.
- Rotacao de API keys adiada e retirada do escopo atual por decisao do Bruno.
- Handoff duravel: `Bruno Vault/20-SESSOES/2026-06/2026-06-18T08-37-04-p0-playbook-foundation.md`.
- PR #379 aberta como draft: https://github.com/brunolimaff-jpg/NOVO-APP/pull/379; primeiro commit `73b8fb81`.
- Proximo passo: publicar a protecao e validar dry-run antes de habilitar exclusao.

### 2026-06-17 (Registro do plano bloqueante)

- **Playbook de Execucao a Prova de IA** validado e registrado como plano bloqueante.
- **16 tarefas em 5 fases:** Fundacao (T-00.1 a T-00.6), Causa-raiz (T-A.1, T-A.2), Loading declarativo (T-B.1 a T-B.4), Unificar timeout (T-C.1, T-C.2), Liquidar divida (T-D.1 a T-D.3).
- **Validacao concluida:** 4 ajustes aplicados apos revisao. Confianca 85%.
- **Fase 0 pronta para iniciar.** Proxima acao: Gate typecheck (T-00.1), Gate lint (T-00.2), Gate testes+coverage (T-00.3), Gate E2E (T-00.4), Helper timeout (T-00.5), Harness telemetria (T-00.6).
- **Nova decisao:** DI-2026-06-17-01 — Playbook como plano bloqueante. Mudancas de assunto exigem confirmacao do Bruno.
- **Arquivos atualizados:** HANDOFF_AI.md (bloco PLANO BLOQUEANTE ATIVO), activeContext.md (secao do plano), progress.md (entrada de hoje), decisions.md (DI-2026-06-17-01).

### 2026-06-16 (Sessao estendida — Sentry-Vercel + incidente de vazamento)

- **Diagnostico Sentry vazio:** env vars manuais no Vercel com `internal: true` impediam injecao de SENTRY_DSN pela integracao Marketplace. Serverless functions nunca enviavam erros ao Sentry.
- **Remocao de 8 env vars orfas:** GEMINI_API_KEY, PINECONE_API_KEY, etc. removidas do Vercel.
- **Integracao Sentry** instalada via Vercel Marketplace (org s-3j, projeto scout-360).
- **Vite define condicional:** `vite.config.ts` com define que expoe SENTRY_DSN como VITE_SENTRY_DSN apenas quando `!process.env.VITEST`. Sugestao do Gemini Code Assist aplicada no commit f8af6206.
- **Deploy producao** c6cb97d8 + f8af6206 com source maps.
- **PR #378 aberta:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/378
  - 2 commits, 1 arquivo (vite.config.ts)
  - CI: Build, Tests, Typecheck, E2E, Smoke, CodeQL, Dossier Golden — todos verdes
  - CodeRabbit, Qodo, Gemini Code Assist, Cursor Code Review respondidos
- **INCIDENTE DE VAZAMENTO:** backticks no corpo do comentario GitHub via `gh api -f body` foram expandidos pelo shell como substituicao de comandos. Tokens expostos publicamente. GITHUB_TOKEN revogado automaticamente e reautenticado. Demais tokens pendentes de rotacao manual.
- **5 novas licoes** no CALIBER_LEARNINGS (env vars internal, Vite define, Hobby log drains, Vercel CLI bug, gh api backticks)
- **3 novas decisoes:**
  - DI-2026-06-16-01: Sentry via Marketplace, nao env vars manuais
  - DI-2026-06-16-02: Vite define SENTRY_DSN condicional
  - DI-2026-06-16-03: gh api com heredoc, nunca backticks
- **PR #378 mergeada** (ce40644a, 16/06): https://github.com/brunolimaff-jpg/NOVO-APP/pull/378
  - 2 commits (c6cb97d8, f8af6206), 1 arquivo (vite.config.ts)
  - Todos os 5 bots respondidos (CodeRabbit, Qodo, Gemini Code Assist, Cursor Code Review, SonarCloud)
  - Branch `worktree-fix+sentry-vercel-integration` deletada apos merge
- **PR #377** ainda aberta: CNPJ limit fix (branch `codex/fix-cnpj-limit`)
- **Tokens pendentes de rotacao:** DeepSeek, Pinecone, Apify, Context7, Vercel Bypass

### 2026-06-16 (Sessao de consolidacao)

- HANDOFF_AI.md atualizado com secao "O que NAO funcionou" (4 abordagens falhas documentadas)
- Branch `feature/supabase-auth` confirmada como ja deletada
- Pendentes consolidadas: deadline 18/06, auditoria RLS, dossier_accesses, user_context dupes, monitoramento Sentry
- .agents/memory/ atualizado (activeContext, progress)

### 2026-06-15 (Sessao de encerramento — 3 bugs de historico apos login)

- **Bug 1 — operator_id nao restaurado no localStorage:** `storageRemove()` limpava `scout360:operator_id` no inicio do fluxo.
  - Commit: `4ca4339a` — fix: restaura operator_id no localStorage apos resolucao de auth
  - Commit: `c32db0d9` — fix: atualiza teste OperatorContext para refletir restauracao
- **Bug 2 — Race condition operator-relinked:** `window.dispatchEvent` no useEffect pai. React executa effects de pais antes de filhos.
  - Commit: `9ba0a2cc` — fix: race condition com setTimeout(0)
- **Bug 3 — RLS bloqueando authenticated:** Policy `operator_own_dossies` com `TO anon`.
  - Commit: `fe6c6f9b` — fix: RLS dossies adiciona role authenticated
  - Migration: `supabase/migrations/20260615_fix_dossies_rls_authenticated.sql`
- **Diagnostico comprovado:** Ananda (18 dossies, 80 eventos) e Wuender (47 dossies, 34 empresas) — dados intactos.
- **5 novas licoes** no CALIBER_LEARNINGS.
- **3 novas decisoes:** DI-2026-06-15-05/06/07.
