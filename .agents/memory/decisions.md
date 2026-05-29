# Decisions

Last updated: 2026-05-28 23:55 (todos os code-review findings aplicados)

## 2026-05-28 - data-testid com espaco e P0 (APLICADO)

Decisao: `data-testid="send-message-button chat-send-button"` em Composer.tsx trocado para valor unico `"send-message-button"`.

Razao: Playwright usa `querySelector('[data-testid="..."]')` internamente. Um valor com espaco vira dois seletores CSS encadeados (filho), nao um unico atributo match.

Refs: `components/chat/Composer.tsx`, commit `6cdea53`.

## 2026-05-28 - useCallback deps array inclui operatorId e email (APLICADO)

Decisao: operatorId e email adicionados ao array de dependencias do `useCallback` em `message-orchestrator.ts`.

Razao: variaveis usadas dentro do callback mas ausentes do deps array causam stale closure. Se stale, eventos de tracking sao perdidos silenciosamente.

Refs: `features/chat/message-orchestrator.ts`, commit `6cdea53`.

## 2026-05-28 - E2E controlled-error-state com data-testid no ErrorMessageCard (APLICADO)

Decisao: adicionado `data-testid="error-message-card"` no ErrorMessageCard. Teste E2E ajustado para verificar estado de erro controlado via este testid, em vez de esperar propagacao para ErrorBoundary.

Razao: erros 500 de API sao capturados internamente por try/catch no processMessage, nunca propagados para ChatErrorBoundary. O teste deve verificar o estado de erro real que o usuario ve: o card de erro.

Refs: `tests-e2e/controlled-error-state.spec.ts`, `components/ErrorMessageCard.tsx`, commit `6cdea53`.

## 2026-05-28 - classifyPanelState com hasDossierContent/hasError dinamico (APLICADO)

Decisao: hasDossierContent e hasError em ChatInterface.tsx agora computados dinamicamente de safeMessages e currentSession.resumoDossie, nao mais fixos como false.

Razao: parametros fixos false tornavam a branch 'error' do classifier codigo morto no unico call site de producao.

Refs: `components/ChatInterface.tsx`, commit `6cdea53`.

## 2026-05-28 - findUserByEmail email_normalized confirmado (APLICADO - SEM ACAO)

Decisao: coluna `email_normalized` existe no Supabase (migration ja aplicada). Nenhuma acao necessaria em `services/storage.ts`.

Razao: o code-review apontou risco de migration ordering, mas ao verificar no banco confirmou-se que a coluna esta presente. Fallback desnecessario.

Refs: `services/storage.ts`.

## 2026-05-28 - finally com try/catch para operacoes de cleanup secundarias (APLICADO)

Decisao: operacao de cleanup no finally do waterfall (`deleteWaterfallFoundationCache`) usa try/catch com scoutDiag.warn.

Refs: `features/dossier/waterfall-orchestrator.ts`, commit `9137a3c`.

## 2026-05-28 - void promise sempre com .catch() quando caller nao faz await (APLICADO)

Decisao: fire-and-forget intencional sempre usa `void ... .catch(() => {})`.

Refs: `contexts/OperatorContext.tsx`, commit `3cd37ce`.

## 2026-05-28 - AbortController em withTimeout para timeout previsivel (APLICADO)

Decisao: `withTimeout` refatorado para usar `AbortController` em vez de `Promise.race` puro.

Refs: `api/gemini.ts`, commit `d0f1980`.

## 2026-05-28 - AbortSignal.timeout() para fetch Supabase (APLICADO)

Decisao: `AbortSignal.timeout(10000)` nativo do fetch em `serverDiagnostics.ts`.

Refs: `utils/serverDiagnostics.ts`, commit `d2a3a13`.

## 2026-05-28 - setupVisibilityTracking retorna cleanup (APLICADO)

Decisao: retorna funcao de cleanup que remove event listeners.

Refs: `utils/diagnosticLog.ts`, commit `7700cfd`.

## 2026-05-28 - Toast para feedback visual em bloqueio Deep Dive (APLICADO)

Decisao: exibir toast informativo em vez de silencio em bloqueio de acesso.

Refs: `App.tsx`, commit `15379b0`.

## 2026-05-28 - useRef para setTimeout cleanup no unmount (APLICADO)

Decisao: todo setTimeout armazena timerId em useRef com cleanup no useEffect return.

Refs: `App.tsx` (exportStatus timeout), commit `15379b0`.

## 2026-05-28 - RLS policies INSERT+UPDATE separados (APLICADO)

Refs: `supabase/migrations/20260528_operator_tracking.sql`, commit `a2ed317`.

## 2026-05-28 - sanitizePayload com camelCase detection (APLICADO)

Refs: `utils/serverDiagnostics.ts`, commit `a2ed317`.

## 2026-05-28 - initSessionTracking async com fire-and-forget no caller (APLICADO)

Refs: `services/operatorTracking.ts`, commit `718ff20`.

## 2026-05-28 - F5/refresh reentry guard (APLICADO)

Refs: `services/operatorTracking.ts`, commit `718ff20`.

## 2026-05-28 - .claude/ versionado como infra de automacao (APLICADO)

Decisao: Criar `.claude/` com settings.json (hooks PreToolUse/PostToolUse), skills (validate-gates, supabase-migration), agents (security-reviewer, pr-gate-runner) e `.mcp.json` (supabase, playwright, context7, github). Tudo versionado no repo.

Razao: Automacao ad-hoc sem versionamento morre na primeira build. Hooks Prettier garantem formatacao consistente sem etapa extra. PreToolUse bloqueia .env/lock e trava commits acima de 8.

Refs: `.claude/settings.json`, `.claude/skills/`, `.claude/agents/`

## 2026-05-28 - Trava de acumulo de commits: max 7, alerta 5, bloqueio 8 (APLICADO)

Decisao: `scripts/check-branch-health.sh` implementa 3 faixas: 0-5 silencioso, 6-7 warning com checklist, 8+ bloqueia commit. CLAUDE.md regras 10-12: max 7 commits locais sem push/PR, push diario obrigatorio, checkpoint a cada 5 commits.

Razao: 21+ commits locais criam PR impossivel de revisar (diff gigante) e aumentam conflito com main.

Refs: `scripts/check-branch-health.sh`, `CLAUDE.md` linhas 43-48

## 2026-05-28 - Code review max-effort com 9 angulos paralelos (DOCUMENTADO)

Decisao: Rodar `/code-review --max` com 9 angulos de analise em paralelo (seguranca, react, gemini, e2e, tipos, perf, sql, UX, automacao). Priorizar findings por criticidade (P0 > P1 > P2) e concordancia entre angulos.

Razao: Revisao linear tem menor taxa de deteccao. Angulos com foco especifico encontram issues que revisao geral perde.

Refs: Resultados completos na sessao vault `20-SESSOES/2026-05/2026-05-28T23-59-00-automacoes-claude-code-trava-commits.md`

## 2026-05-28 - Plano de merge com rollback obrigatorio (DOCUMENTADO)

Decisao: Antes de qualquer soft reset ou rebase, criar branch de backup (`backup/operator-tracking-21-commits`) para permitir `git reset --hard` se algo der errado.

Razao: Soft reset sem rollback e aposta. Se algo der errado, todo o trabalho dos 21 commits se perde.

Refs: `docs/superpowers/plans/2026-05-28-unificar-branch-pr.md`

## 2026-05-28 - withTimeout + AbortSignal P0 — documentado para correcao (DOCUMENTADO, NAO CORRIGIDO)

Decisao: P0 documentado em `30-DECISOES/ACHADO-P0-WITHTIMEOUT-ABORTSIGNAL-2026-05-28.md`. withTimeout cria AbortController mas nao propaga signal para chat.sendMessage (api/gemini.ts:416) nem para sendFunctionResponses (api/gemini.ts:491). Corrigir antes de fechar PR #309.

Razao: Chamada real roda sem limite de tempo mesmo com timeout de 120s configurado.

Refs: `api/gemini.ts`, `30-DECISOES/ACHADO-P0-WITHTIMEOUT-ABORTSIGNAL-2026-05-28.md`

---

### Decisoes anteriores (preservadas)

[... decisoes de sessoes anteriores ...]
