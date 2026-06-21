# Handoff — PR #386 LiteLLM preview: gate aberto, LiteLLM funcionando, DeepSeek lento

**Atualizado:** 2026-06-21 — validacao DeepSeek V4 Flash: gate OK, modelo lento (62-119s/modulo)
**Producao:** `scoutagro.vercel.app` — `LLM_PROVIDER=gemini` (sem mudanca)
**Branch:** `feat/litellm-experiment` | **HEAD local:** `42e154d3` (3 commits novos)
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
**Preview testado:** `scoutagro-bmgpi1o2e-brunolimaff-3629s-projects.vercel.app`
**Vault:** `/Users/brunolima/Documents/Bruno Vault/20-SESSOES/2026-06/2026-06-21T12-34-00-pr386-gate-aberto-litellm-ok.md`

## Estado Atual

| Item                          | Status                                                   |
| ----------------------------- | -------------------------------------------------------- |
| Fase 1-2 (gate fix 3 camadas) | OK — 3 commits, 8 arquivos alterados                     |
| Fase 3 (testes)               | OK — 4 novos testes para preview local auth              |
| Fase 4-5 (env + redeploy)     | OK — env vars configuradas, preview deploy `42e154d3`    |
| **Fase 6 (validacao)**        | **Gate ABERTO** — LiteLLM chamado, `fallback_used=false` |
| DeepSeek V4 Flash             | 2/6 modulos concluidos — 4 timeouts (62-119s/modulo)     |
| Erros auth                    | 0 — nenhum 401/403                                       |
| MERGE                         | **BLOQUEADO** — NAO mergear; PR e experimental           |

## Bloqueios Resolvidos

### Bloqueio 1 (RESOLVIDO): Gate server-side `no_supabase_session`

- Solucao em 3 camadas:
  - **Cliente** (`experimentGate.ts`): bypass `previewLocalAuth` com `LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH=true`
  - **Servidor** (`_experiment-auth.ts`): aceita `x-experiment-operator-email` header em preview
  - **Proxy** (`geminiProxy.ts`): `setPreviewOperatorEmail()` module-level var propaga email
- `authMode=preview_local` com `operatorEmail=bruno.ferreira@senior.com.br` — gate abriu

### Bloqueio 2 (PENDENTE): Gemini API 429 credits depleted

- Ainda sem solucao. LiteLLM roda sem fallback Gemini.
- Preview depende exclusivamente de modelos LiteLLM.

## Resultados DeepSeek V4 Flash (Shellfer 04.733.767/0001-80)

| Modulo           | Status    | Tempo |
| ---------------- | --------- | ----- |
| 1. Identificacao | Concluido | 62s   |
| 2. Fiscais       | Timeout   | 119s  |
| 3. Societario    | Timeout   | 119s  |
| 4. Comercial     | Concluido | 84s   |
| 5. Financeiro    | Timeout   | 119s  |
| 6. Risco         | Timeout   | 119s  |

DeepSeek V4 Flash e muito lento para uso em producao comercial (>60s/modulo). 4/6 modulos timeoutaram (limite 120s). Mesmo modulos concluidos levaram 62-84s — inviavel para experiencia do usuario.

## Proximo Passo

Testar `oracle/xai.grok-4.20-0309-reasoning`:

1. Adicionar modelo ao `modelCatalog.ts`
2. Atualizar env vars do preview
3. Novo deploy
4. Smoke autenticado + waterfall Scheffer

Se Grok tambem for lento, experimento LiteLLM pode ser encerrado com relatorio: "modelos alternativos nao competitivos com Gemini em velocidade."

## Regras Criticas

- **NAO fazer merge** — PR experimental, nunca mergear em main
- **NAO adicionar n8n** — fora de escopo
- **NAO liberar bypass auth local em producao** — `LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH` so para preview

## Prompt de Retomada

PR #386 feat/litellm-experiment, HEAD 42e154d3. Gate LiteLLM resolvido em 3 camadas (cliente previewLocalAuth + server x-experiment-operator-email + proxy setPreviewOperatorEmail). Validacao real com DeepSeek V4 Flash no preview: gate abriu, 0 erros auth, mas modelo muito lento (62-119s/modulo, 4/6 timeouts). Proximo: testar oracle/xai.grok-4.20-0309-reasoning. Gemini 429 ainda sem solucao. Nao mergear.
