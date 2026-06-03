# Handoff — PR #330 — Painel branco pós-waterfall (Scheffer)

**Data:** 2026-06-03  
**Status:** Validado por Bruno no preview Vercel (pós `bda08162`)  
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/330  
**Branch:** `fix/blank-panel-static-fallback-post-waterfall`

---

## Resumo executivo

Regressão após #329: waterfall completa (~2 min), telemetria mostra bot com ~30k caracteres, mas painel central podia ficar branco (Virtuoso + dossiê grande + métrica `expectedBotCharsMax` ignorando preview `isThinking`).

**Solução (#330):** contagem correta de chars do bot; fallback timeline estática **proativo** (≥ 4.000 chars ao fim do loading hero); detecção reativa com primeiro delay **750 ms**; E2E Scheffer com stubs e operador sem PII.

---

## Achados (Supabase `scout_diagnostics`)

**Projeto:** `vmqfcaoirjcfucvlnpig`  
**Sessão:** `eac8d331-dc3c-4f79-b438-31afe1130e94`  
**Preview:** `scoutagro-git-fix-blank-panel-61a9e6-…vercel.app`

| UTC | Área | Evento |
|-----|------|--------|
| 20:04:13 | GeminiProxy | HTTP 500 `/api/gemini` |
| 20:04:18 | ModularDossier | Bordas de Controle falhou (opcional, 500) |
| 20:04:58 | ModularDossier | PORTA dim **T** ausente → retry |
| 20:05:25 | WaterfallLifecycle | `completed`, texto ~29.590 chars |
| 20:05:25 | health-check-final | `domHasLoadingOverlay: true` + bot OK |
| 20:05:27 | ChatInterface | `proactive-static-fallback-large-dossier` |
| 20:05:27 | Virtuoso | mount 0×0 → static-fallback → unmount |
| 20:05:27+ | CnpjLookup | abort `signal is aborted without reason` (sócios) |

7d: **sem** `blank-panel-detected`.

---

## Sentry

7d sem errors/logs no projeto `scout-360` para este fluxo → usar **`scout_diagnostics`** como fonte primária.

---

## Fora do escopo #330

Timer etapa 0s; SocietaryMap deps `cnaeMap`; `withTimeout` gemini; E2E no CI.

---

## Vault

- `Bruno Vault/20-SESSOES/2026-06/2026-06-03T20-30-00-NOVO-APP-PR330-blank-panel-validado.md`
- `Bruno Vault/30-LICOES/LICOES-BLANK-PANEL-PR330-2026-06-03.md`
- `Bruno Vault/40-HANDOFFS/NOVO-APP-handoff.md`
