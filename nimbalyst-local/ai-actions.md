# AI Action Prompts

This file lists reusable prompts that show up in the **Actions** dropdown in the AI composer.
Each `## Heading` is one action; everything beneath it (until the next `##`) is the prompt that gets inserted into the draft when you pick the action.

Actions can also launch a brand-new sibling session in the current workstream
instead of prefilling the current input.

Recognized keys: `launch` (same-session | new-session), `model`
(provider:variant), `foreground` (true/false), `autoSubmit` (true/false),
`worktree` (true/false). `launch: same-session` is the default; omit the
block entirely to keep current behavior.

## Review Changed Files

/review changed files in this session and call out regression risk in the affected modules.

## Plan Implementation

Look at the active issue (linked above) and the open editor.

Produce a structured plan that:

- breaks the work into 3-5 phases
- identifies the files I'll need to touch
- flags any cross-cutting concerns I should think about before writing code

When you're done, ask me which phase to start with.

## Plan in Fresh Opus Session

launch: new-session
model: claude-code:opus
foreground: true
autoSubmit: true

Open a fresh sibling planning session.
Look at the originating session for context, then produce a clean implementation plan in 3-5 phases.
Call out the riskiest unknowns before suggesting code changes.

## Worktree Implementation Draft

launch: new-session
foreground: true
autoSubmit: false
worktree: true

Open a sibling coding session in a git worktree.
Use the originating session and current editor state for context.
Draft the first implementation message I should send there, including the files to inspect first and the first validation step.

## Draft Release Notes

/release-notes from merged work since the last tag, formatted as a user-facing changelog.

## Inspect Current Editor

Read the file that's currently open and tell me what you'd change. Be specific:

- 3 concrete improvements
- 1 thing that's already good and shouldn't change

---

# Waterfall Diagnostics

## Diagnosticar Logs do Waterfall

launch: new-session
foreground: true
autoSubmit: false

Analise os logs de diagnóstico do Senior Scout 360 que colei no chat.

Produza um relatório estruturado com:

1. **Saúde do Waterfall** — status de cada fase (lookup → foundation → módulos → benchmark → PORTA → continuity → save)
2. **Grounding** — quantos módulos tiveram fontes? (groundingSources: 0 = alerta)
3. **Warnings** — liste cada ⚠ com causa provável e severidade (P0/P1/P2)
4. **Performance** — durações por módulo, gargalos (módulo >30s = crítico)
5. **Erros** — AbortError, JSON parse failure, fetch failures
6. **Veredito** — saudável / atenção / crítico, com próximos passos

Contexto dos arquivos relevantes:

- `services/gemini/investigation-orchestration.ts` — orquestração dos módulos
- `features/dossier/waterfall-orchestrator.ts` — pipeline waterfall completo
- `features/dossier/porta-reconciliation.ts` — reconciliação PORTA
- `services/gemini/auxiliary.ts` — continuity questions (bypass ativo desde a1862e13)
- `components/chat/MessageTimeline.tsx` — renderização (static fallback >4000 chars)
- `utils/layoutTraceTelemetry.ts` — telemetria de layout

## Investigar Grounding Zerado

launch: new-session
model: claude-code:sonnet
foreground: true
autoSubmit: false

Investigue por que os módulos do waterfall estão retornando `groundingSources: 0` consistentemente.

**Sintoma:** Todos os módulos logam "grounding sem fontes; marcando como unverified".

**Causa provável identificada:** O foundation cache é criado COM tools `[{googleSearch: {}}]` em `foundation-cache.ts:69`, mas quando usado no `generateContent`, o servidor `api/gemini.ts:278` descarta as tools se `cachedContent` está definido. Sem tools, o Gemini não aciona Google Search.

**Hipóteses a verificar:**

1. O arquivo `api/gemini.ts` (linhas 273-291) — confirmar se o handler `generateContent` ignora tools quando cachedContent existe
2. `services/gemini/investigation-orchestration.ts` (linhas 586-597) — o caminho com cache NÃO envia tools. Isso é intencional ou bug?
3. `services/gemini/foundation-cache.ts` (linhas 63-70) — o cache é criado com tools. A API Gemini honra tools de cache referenciado?
4. Verificar se o modelo `gemini-3-flash-preview` está respondendo sem grounding mesmo com tools

**Arquivos-chave:**

- `api/gemini.ts:273-291`
- `services/gemini/investigation-orchestration.ts:586-626`
- `services/gemini/foundation-cache.ts:63-70`
- `services/gemini/sources.ts:3-71`

**Lições aprendidas relevantes:** CALIBER_LEARNINGS.md — "Search Grounding nunca cachear", "catch vazio em chamadas Gemini", "XML delimiters reduzem alucinação"

## Auditar Validação de CNPJ no Waterfall

launch: new-session
model: claude-code:sonnet
foreground: true
autoSubmit: false

Audite a validação de CNPJ no waterfall-orchestrator.ts que gera warnings "X de X CNPJs citados nao foram confirmados".

**Sintoma:** 100% dos CNPJs citados pelo LLM falham na validação. Warning é funcionalmente um noise generator.

**Causa provável identificada:** `buildTeiaResearchContext()` (linhas 141-224) só inclui o CNPJ raiz no conjunto "conhecido". Os CNPJs dos sócios (QSA) estão disponíveis em `CnpjPartner.document` mas são DELIBERADAMENTE OMITIDOS nas linhas 160-163 — só name, role, source são incluídos.

**Tarefas:**

1. Confirmar que `CnpjPartner.document` existe e contém CNPJs válidos dos sócios
2. Avaliar se devemos incluir CNPJs do QSA no `knownCnpjs` (implicações de privacidade?)
3. Alternativa: reduzir threshold de 30% ou mudar de warning para info quando a proporção de falsos positivos for >80%
4. Verificar a detecção de entidades internacionais (6 regexes nas linhas 444-496)

**Arquivos-chave:**

- `features/dossier/waterfall-orchestrator.ts:141-224` (buildTeiaResearchContext)
- `features/dossier/waterfall-orchestrator.ts:418-504` (validateTeiaCnpjsOutput)
- `lib/cnpjLookup.ts:10-15` (CnpjPartner type)

**Lições aprendidas relevantes:** CALIBER_LEARNINGS.md — "cnpjDigits guard aceita CPF (11 digitos)", "Validar CNPJ antes de chamadas IA"

## Verificar Deploy de Correções (AbortError + ContinuityQuestion)

launch: new-session
foreground: true
autoSubmit: false

Verifique se duas correções críticas já estão no deploy de produção (scoutagro.vercel.app):

**Fix 1 — AbortError em CNPJs paralelos:**

- Commit: `a1862e13` (PR #352, 2026-06-09)
- Commit complementar: `14f26d7f` (2026-06-14)
- O que mudou: `SocietaryMap.tsx` não passa mais `controller.signal` para `fetchCompanyByCnpj`. Cache CNPJ não propaga AbortSignal do chamador.
- Como verificar: Logs de produção ainda mostram "signal is aborted without reason"? Se sim, deploy não tem o fix.

**Fix 2 — ContinuityQuestion bypass:**

- Commit: `a1862e13` (PR #352, 2026-06-09)
- O que mudou: `auxiliary.ts` foi reduzido de 746 para 50 linhas. Gemini foi bypassado; fallback `ensureContinuitySuggestions()` (23 templates) usado diretamente.
- Como verificar: Logs ainda mostram "Falha ao parsear array de perguntas" / "fallback premium acionado"? Se sim, deploy não tem o bypass.

**Tarefas:**

1. `git log origin/main --oneline -10` — confirmar que a1862e13 e 14f26d7f estão em origin/main
2. Verificar no Vercel dashboard qual commit está em produção
3. Se fixes não estão em produção, fazer deploy

## Health Check do Waterfall (Sentry + Logs)

launch: new-session
foreground: true
autoSubmit: false

Faça um health check rápido do waterfall do Senior Scout 360 usando Sentry e logs recentes.

**Verificações:**

1. **Sentry:** buscar issues novas nas últimas 24h com `search_issues` — filtrar por `waterfall`, `AbortError`, `grounding`
2. **Métricas dos logs:** waterfall completou? (`waterfallEndStatus: 'completed'`). Geração bloqueada? (`blockedCount > 0`). Cache usado? (`hasCacheName: true`)
3. **Grounding health:** `groundingSources > 0` em pelo menos 1 módulo? Se todos são 0, alerta P0.
4. **Performance:** algum módulo >45s? (timeout do benchmark é 20s, módulos opcionais têm timeout próprio)
5. **Static fallback:** dossiês grandes (>4000 chars) estão renderizando corretamente? Verificar `static-fallback-rendered` + `LayoutTrace/static-fallback-mount`

**Thresholds de alerta:**

- 🟢 Saudável: waterfall completed, grounding >0, sem AbortError, sem blocked
- 🟡 Atenção: 1-2 módulos sem grounding, PORTA retry acionado, static fallback ativo
- 🔴 Crítico: waterfall blocked, todos grounding 0, AbortError em cascata, JSON parse falha

**Ferramentas:** Sentry MCP (`search_issues`, `search_events`), Vercel CLI (`vercel logs`)
