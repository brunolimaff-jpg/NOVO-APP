# Active Context

Last updated: 2026-06-21 — PR #386 gate resolvido, LiteLLM validado, DeepSeek lento

## Prioridade Atual

**PR #386 — validar alternativas ao Gemini via LiteLLM**

- Branch: `feat/litellm-experiment`
- HEAD local: `42e154d3` (3 commits: fix das 3 camadas de auth)
- PR: https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
- Preview testado: `scoutagro-bmgpi1o2e-brunolimaff-3629s-projects.vercel.app`
- Vault: `/Users/brunolima/Documents/Bruno Vault/20-SESSOES/2026-06/2026-06-21T12-34-00-pr386-gate-aberto-litellm-ok.md`

## O que foi resolvido

### Gate LiteLLM — 3 camadas de bypass preview local auth

- **Cliente** (`experimentGate.ts`): `previewLocalAuth` bypass com `LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH=true`
- **Servidor** (`_experiment-auth.ts`): aceita `x-experiment-operator-email` header
- **Proxy** (`geminiProxy.ts`): `setPreviewOperatorEmail()` module-level var
- Gate abriu com: `authMode=preview_local`, `operatorEmail=bruno.ferreira@senior.com.br`
- 0 erros 401/403 em todo o fluxo

### Validacao real DeepSeek V4 Flash

- LiteLLM chamado: `provider=litellm`, `fallback_used=false`
- Modelo: `huawei/deepseek-v4-flash`
- Resultado: 2/6 modulos, 4 timeouts. 62-119s/modulo — **muito lento para producao**

## Proximo Passo

Testar `oracle/xai.grok-4.20-0309-reasoning`:

1. Adicionar ao `modelCatalog.ts`
2. Atualizar env vars preview
3. Deploy + smoke + waterfall Scheffer

## Bloqueios Ativos

- **Gemini 429 credits depleted** — ainda sem solucao. LiteLLM como unico provider viavel no preview.
- **DeepSeek V4 Flash inviavel** — 4/6 modulos timeout, 62-119s por modulo.

## Regras Criticas

- **NAO mergear** PR #386 — experimental
- **NAO adicionar n8n** — fora de escopo
- **NAO liberar bypass em producao** — so preview

## Merge Guard

NAO mergear. PR #386 e experimental. Token MERGE nao se aplica.
