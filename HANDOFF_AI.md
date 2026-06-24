# Handoff — PR #386 LiteLLM experiment (EM VERIFICAÇÃO — Fix Virtuoso deployado)

**Atualizado:** 2026-06-24 00:40 UTC (sessão contínua)
**Branch:** `feat/litellm-experiment`
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
**Estado:** **EM VERIFICAÇÃO** — Fix Virtuoso deployado (SHA: `3d42cf03`), waterfall Scheffer rodando

---

## Diagnóstico Real (2026-06-24)

### Causa raiz do painel vazio: Virtuoso, NÃO fallback_used

**Diagnóstico anterior REFUTADO:** A entrada no CALIBER_LEARNINGS ("fallback_used: true bloqueia UI") estava ERRADA. NENHUM filtro de `fallback_used` existe no frontend. O bug real:

1. `computeItemKey={(_, message) => message.id}` em `MessageTimeline.tsx:540` faz Virtuoso reutilizar item quando `message.text` muda de `''` para 27K chars (mesmo ID)
2. Bot-message-content renderiza mas fica invisível (`height: 0`), detectado via `commit:invisible-bot-content` em `MessageRow.tsx:193`
3. `dispatchCofreRenderReady` depende de `bot-message-content` visível no DOM → nunca dispara
4. Cofre dissolve apenas por `absolute-max` (320s)

### callLiteLLM sempre lança exceção

Todos os dossiês "LiteLLM" foram na verdade gerados pelo Gemini (fallback). O `catch` em `api/gemini.ts:392` captura o erro mas só logava `error.message` sem stack.

---

## O que esta sessão fez

### Investigação (Phases A-C)
- **SCOPE+TRACE:** Mapeados 24 arquivos, 6.435 linhas, 17 env vars, critical path de 13 passos
- **DIAGNOSE:** Encontrado `commit:invisible-bot-content` no console do preview — texto 21.829 chars, width 1353px, mas height=0
- **ADVERSARIAL REVIEW:** 3 personas (Saboteur, New Hire, Security Auditor). Veredict: **BLOCK**. 5 CRITICAL findings:
  - S-1+N-2 [CRITICAL]: Virtuoso `computeItemKey` por ID + Cofre 320s = UI presa
  - S-2 [CRITICAL]: catch do LiteLLM sem stack trace/Sentry
  - N-1+S-4 [CRITICAL]: 19 runs órfãs + fire-and-forget finalize
  - N-2 [CRITICAL]: CALIBER_LEARNINGS com diagnóstico falso
  - N-3 [CRITICAL]: waterfall_logs parados desde 30/maio

### Correções (Phase D)
- **Fix #1 (P0):** `computeItemKey` inclui `isThinking` para forçar re-render → commit `3d42cf03`
- **Fix #2 (P0):** `console.error` detalhado no catch do callLiteLLM → commit `5912a03b`
- **Fix #3 (P1):** `Sentry.captureException` no catch do finalizeExperimentRun → commit `72a140c0`
- **Fix #4 (P1):** CALIBER_LEARNINGS corrigido com diagnóstico real

### Skills Instaladas
- `.claude/skills/focused-fix/SKILL.md` — Protocolo 5 fases (Iron Law: zero fixes antes do diagnóstico)
- `.claude/skills/adversarial-reviewer/SKILL.md` — 3 personas hostis, cross-promotion, verdict
- `.claude/skills/rag-architect/SKILL.md` — Avaliação quantitativa de qualidade

---

## Estado atual (00:40 UTC)

- **Preview ativo:** https://scoutagro-qqpyt1k76-brunolimaff-3629s-projects.vercel.app (SHA `3d42cf03`)
- **Waterfall Scheffer:** Rodando agora com Virtuoso fix — aguardando resultado
- **Console:** Zero erros de `commit:invisible-bot-content` até o momento

---

## Pendências

1. **Verificar waterfall:** Aguardar ~200s para ver se dossiê aparece na UI
2. **Deploy do fix Sentry:** SHA `72a140c0` ainda em fila (deployment `egrf38abw` queued)
3. **Limpar 19 runs órfãs:** SQL direto ou reconciliação automática
4. **Investigar waterfall_logs:** Por que pararam em 30/maio
5. **Investigar callLiteLLM:** Com o novo console.error, capturar erro real e decidir: consertar LiteLLM ou aceitar fallback Gemini como padrão?

## Próximo passo

Se waterfall Scheffer renderizar dossiê → atualizar PR #386, rodar gates, preparar merge.
Se não renderizar → investigar se há segundo bug além do Virtuoso key.

▎**Prompt de retomada:**
"Retomar verificação PR #386: Virtuoso fix (computeItemKey com isThinking) deployado no preview qqpyt1k76. Waterfall Scheffer iniciado. Verificar se dossiê renderizou (sem commit:invisible-bot-content), checar Supabase llm_experiment_runs, e decidir próximos passos."
