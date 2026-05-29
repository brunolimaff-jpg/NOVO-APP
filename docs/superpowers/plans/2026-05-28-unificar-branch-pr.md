# Unificação da Branch `feat/operator-tracking-supabase` — Plano de Merge

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar 21 commits em 3 commits temáticos e subir como PR única para main.

**Architecture:** Soft reset para main, reagrupar mudanças em 3 commits lógicos (tracking, diagnóstico, qualidade), push e PR via GitHub CLI.

**Tech Stack:** Git, GitHub CLI (`gh`)

---

## Pré-requisitos

- [ ] `gh` CLI autenticado (`gh auth status`)
- [ ] Working tree limpa (tudo commitado ou stash)
- [ ] 1242 testes passando
- [ ] Typecheck limpo

---

### Task 1: Criar backup de segurança

**Files:**

- None (git operation)

- [ ] **Step 1: Criar branch de backup**

```bash
git branch backup/operator-tracking-21-commits
```

- [ ] **Step 2: Confirmar que backup foi criado**

```bash
git branch | grep backup/operator-tracking-21-commits
```

Expected: `  backup/operator-tracking-21-commits`

- [ ] **Step 3: Commit**

Não commitar — backup é só referência local.

---

### Task 2: Consolidar working tree (commitar pendências)

**Files:**

- All 12 modified + 2 untracked files in working tree

- [ ] **Step 1: Verificar estado atual**

```bash
git status --short
```

- [ ] **Step 2: Adicionar arquivos de documentação e automação**

```bash
git add .agents/memory/activeContext.md \
        .agents/memory/decisions.md \
        .agents/memory/last-session-context.md \
        .agents/memory/progress.md \
        .mcp.json \
        .claude/ \
        CALIBER_LEARNINGS.md \
        HANDOFF_AI.md \
        docs/obsidian/decisions/LICOES-APRENDIDAS-CODE-REVIEW-2026-05-28.md \
        scripts/check-branch-health.sh
```

- [ ] **Step 3: Adicionar code fixes restantes**

```bash
git add components/ChatInterface.tsx \
        components/ErrorMessageCard.tsx \
        components/chat/Composer.tsx \
        features/chat/message-orchestrator.ts \
        tests-e2e/controlled-error-state.spec.ts
```

- [ ] **Step 4: Remover arquivo de rascunho**

```bash
rm -f n.md
```

- [ ] **Step 5: Commitar "docs: finaliza handoff, automações e findings da sessão"**

```bash
git commit -m "$(cat <<'EOF'
docs: finaliza handoff, automações (.claude/) e findings code-review

- 5 code-review findings aplicados (P0-P1)
- Skills: validate-gates, supabase-migration
- Agents: security-reviewer, pr-gate-runner
- Hooks: Prettier auto-format, bloqueio .env/lock, trava commits
- Script: check-branch-health.sh
- MCP: supabase, playwright, context7, github

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Validar que working tree está limpa**

```bash
git status --short
```

Expected: (vazio — nada pendente)

---

### Task 3: Soft reset e reagrupamento

**Files:**

- None (git operation — preserva arquivos, reseta commits)

- [ ] **Step 1: Soft reset para main**

Isso desfaz os 22 commits (21 originais + 1 novo) mas mantém TODAS as mudanças no staging area.

```bash
git reset --soft main
```

- [ ] **Step 2: Confirmar que mudanças estão preservadas**

```bash
git diff --staged --stat | tail -3
```

Expected: ~65 files changed, ~6500 insertions (tudo preservado no stage)

- [ ] **Step 3: Verificar que HEAD está em main**

```bash
git log --oneline -1
```

Expected: último commit de main (não é mais `6cdea53`)

---

### Task 4: Commit 1/3 — Tracking de Operadores (core feature)

**Files:**

- `services/operatorTracking.ts`
- `supabase/migrations/20260528_operator_tracking.sql`
- `contexts/OperatorContext.tsx`
- `tests/services/operatorTracking.test.ts`
- `tests/contracts/operatorTracking.contract.test.ts`
- `tests/contracts/supabaseMigrations.contract.test.ts`
- `tests/contexts/OperatorContext.test.tsx`
- `services/storage.ts`
- `tests/services/storage.test.ts`
- `App.tsx`
- `index.tsx`
- `components/MessageActionsBar.tsx`

- [ ] **Step 1: Unstage tudo**

```bash
git reset HEAD
```

- [ ] **Step 2: Stage arquivos do tracking**

```bash
git add services/operatorTracking.ts \
        supabase/migrations/20260528_operator_tracking.sql \
        contexts/OperatorContext.tsx \
        tests/services/operatorTracking.test.ts \
        tests/contracts/operatorTracking.contract.test.ts \
        tests/contracts/supabaseMigrations.contract.test.ts \
        tests/contexts/OperatorContext.test.tsx \
        services/storage.ts \
        tests/services/storage.test.ts
```

- [ ] **Step 3: Commitar**

```bash
git commit -m "$(cat <<'EOF'
feat: tracking de operadores via Supabase (sessões + eventos)

- Migration SQL com RLS policies (INSERT+UPDATE, sem SELECT/DELETE)
- operatorTracking.ts: initSessionTracking, touchOperatorSession, ff()
- OperatorContext: startOperatorSession, endOperatorSession, heartbeat
- storage.ts: findUserByEmail com fallback email_normalized
- 2 contratos (operatorTracking, supabaseMigrations) + unit tests
- sanitizePayload camelCase → snake_case
- Reentry guard: sessionStorage para evitar sessão duplicada no F5

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Commit 2/3 — Diagnóstico de Ciclo de Vida

**Files:**

- `utils/diagnosticLog.ts`
- `utils/serverDiagnostics.ts`
- `api/gemini.ts`
- `utils/renderStateClassifier.ts`
- `features/chat/message-orchestrator.ts`
- `features/dossier/waterfall-orchestrator.ts`
- `features/chat/ChatErrorBoundary.tsx`
- `components/LoadingSmart.tsx`
- `components/MessageRow.tsx`
- `components/chat/MessageTimeline.tsx`
- `features/chat/loading-progress.ts`

- [ ] **Step 1: Stage arquivos de diagnóstico**

```bash
git add utils/diagnosticLog.ts \
        utils/serverDiagnostics.ts \
        api/gemini.ts \
        utils/renderStateClassifier.ts \
        features/chat/message-orchestrator.ts \
        features/dossier/waterfall-orchestrator.ts \
        features/chat/ChatErrorBoundary.tsx \
        components/LoadingSmart.tsx \
        components/MessageRow.tsx \
        components/chat/MessageTimeline.tsx \
        features/chat/loading-progress.ts \
        features/chat/session-controller.ts
```

- [ ] **Step 2: Commitar**

```bash
git commit -m "$(cat <<'EOF'
feat: diagnóstico persistente do ciclo de vida do dossiê

- diagnosticLog.ts (+547 linhas): visibility tracking, heartbeat 30s,
  per-module deadline, server-side watermark, Virtuoso instrumentation
- serverDiagnostics.ts: AbortSignal.timeout(10s) no fetch Supabase
- api/gemini.ts: withTimeout com AbortController, generateContent 120s
- renderStateClassifier.ts: classifyPanelState simplificado
- waterfall-orchestrator.ts: finally try/catch cache deletion
- ChatErrorBoundary.tsx: boundary para erro interceptado
- setupVisibilityTracking retorna cleanup function
- catch() em void promises, useRef para timeouts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Commit 3/3 — Qualidade e Automação

**Files:**

- `.claude/` (skills, agents, settings.json)
- `.mcp.json`
- `scripts/check-branch-health.sh`
- `scripts/ensure-playwright.sh`
- `tests-e2e/` (5 specs)
- `tests/contracts/renderState.contract.test.tsx`
- `docs/contracts/`
- `docs/superpowers/`
- `docs/obsidian/`
- `.agents/memory/`
- `CALIBER_LEARNINGS.md`
- `HANDOFF_AI.md`
- `CLAUDE.md`
- `package.json`
- `.gitignore`
- `components/ChatInterface.tsx`
- `components/ErrorMessageCard.tsx`
- `components/chat/Composer.tsx`
- `components/chat/ChatShell.tsx`
- `components/SessionsSidebar.tsx`
- `components/ExportDropdown.tsx`
- `App.tsx`

- [ ] **Step 1: Stage tudo que sobrou**

```bash
git add -A
```

- [ ] **Step 2: Commitar**

```bash
git commit -m "$(cat <<'EOF'
feat: qualidade anti-regressão + automações Claude Code + docs

Qualidade:
- 3 specs E2E (blank panel, error state, loading recovery)
- 6 smoke tests (shell, greeting, data-testids, session, investigation)
- 2 contratos (renderState, supabaseMigrations)
- renderStateClassifier + EmptyStateFallback condicional
- scripts/ensure-playwright.sh (Chromium auto-install)

Automações (.claude/):
- Skills: validate-gates, supabase-migration
- Agents: security-reviewer, pr-gate-runner
- Hooks: Prettier auto-format, bloqueio .env/lock, trava commits
- MCP: supabase, playwright, context7, github
- check-branch-health.sh: trava acúmulo >8 commits

Docs:
- CLAUDE.md: +3 regras (trava commits, push diário, checkpoint)
- HANDOFF_AI.md + .agents/memory/* atualizados
- CALIBER_LEARNINGS.md + Obsidian lessons learned

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Validar

- [ ] **Step 1: Rodar typecheck**

```bash
npm run typecheck
```

Expected: sem erros

- [ ] **Step 2: Rodar testes**

```bash
npm test
```

Expected: 1242+ testes, 0 falhas

- [ ] **Step 3: Rodar contratos**

```bash
npm run test:contracts
```

Expected: todos passando

- [ ] **Step 4: Verificar log limpo**

```bash
git log main..HEAD --oneline
```

Expected: 3 commits (tracking, diagnóstico, qualidade)

---

### Task 8: Push e PR

- [ ] **Step 1: Push da branch**

```bash
git push origin feat/operator-tracking-supabase --force-with-lease
```

**Nota:** `--force-with-lease` necessário porque reescrevemos o histórico com soft reset. O `--force-with-lease` é seguro — só força se o remote não tiver commits novos de outra pessoa.

⚠️ **Confirme com o usuário antes de executar este passo.**

- [ ] **Step 2: Criar PR**

```bash
gh pr create \
  --title "feat: tracking de operadores Supabase + diagnóstico ciclo de vida + qualidade anti-regressão" \
  --body "$(cat <<'EOF'
## O que entrega

### 1. Tracking de Operadores (Supabase)
- Sessões e eventos persistidos com RLS policies (INSERT+UPDATE)
- `operatorTracking.ts`: initSessionTracking, touchOperatorSession, heartbeat
- `sanitizePayload` camelCase → snake_case
- Reentry guard: sessionStorage evita sessão duplicada no F5
- 2 contratos + unit tests

### 2. Diagnóstico de Ciclo de Vida do Dossiê
- Visibility tracking (visibilitychange, pagehide, freeze)
- Heartbeat 30s + per-module deadline + server-side watermark
- Timeouts: AbortController, AbortSignal.timeout
- Virtuoso instrumentation
- Cleanup functions: setupVisibilityTracking, useRef para timeouts
- Void promises sempre com .catch()

### 3. Qualidade Anti-Regressão
- 3 specs E2E (blank panel, error state, loading recovery)
- 6 smoke tests (shell, greeting, data-testids, session, investigation)
- 2 contratos (renderState, supabaseMigrations)
- `scripts/ensure-playwright.sh` (Chromium auto-install)
- `check-branch-health.sh`: trava acúmulo >8 commits sem PR

### 4. Automações Claude Code
- Skills: validate-gates, supabase-migration
- Agents: security-reviewer, pr-gate-runner
- Hooks: Prettier, bloqueio .env/lock, trava commits
- MCP: supabase, playwright, context7, github

## Números
- 65 arquivos, +6.461 / -598
- 1242 testes, 142 test files
- 4 rodadas de code review, 22 findings resolvidos
- Typecheck limpo

## Riscos documentados
- RLS com USING(true) — sem auth.uid() disponível (app interno)
- Promise.race sem abort do signal no waterfall-orchestrator
- FK session_id TEXT vs integer

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Confirmar PR criada**

```bash
gh pr view
```

Expected: PR aberta, URL visível, CI pendente

---

## Rollback

Se algo der errado no soft reset (Task 3):

```bash
# Voltar ao estado original com os 22 commits
git checkout feat/operator-tracking-supabase
git reset --hard backup/operator-tracking-21-commits
```

A branch de backup garante que nada se perde.
