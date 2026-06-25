# Benchmark de Modelos LiteLLM — PR #386

**Preview:** branch `feat/litellm-experiment`
**Data:** 2026-06-21
**Teste:** R3 — waterfall completo (sem stubs)

## Resultados

| #   | Modelo                | Variant | Status | Tempo         | Erro                              | Notas                                               |
| --- | --------------------- | ------- | ------ | ------------- | --------------------------------- | --------------------------------------------------- |
| 1   | DeepSeek V4 Pro       | H       | ❌     | 8.0min        | 504 Vercel timeout                | ~30s/modulo, estoura 60s Hobby                      |
| 2   | Grok 4.1 Fast         | E       | ❌     | ~5min timeout | bot-message-content nunca aparece | Mesmo erro com waterfall original                   |
| 3   | Grok 4 Fast Reasoning | F       | ❌     | ~5min timeout | bot-message-content nunca aparece | Mesmo erro. Waterfall original restaurado nao ajuda |
| 4   | DeepSeek V3.2         | D       | ⏳     | —             | —                                 | Aguardando diagnostico env vars                     |
| 5   | Grok 4.20 Reasoning   | G       | ⏳     | —             | —                                 | Aguardando diagnostico env vars                     |

## Observacoes

- **DeepSeek V4 Pro** inviavel para Vercel Hobby (limite 60s por funcao, modelo consome ~30s/modulo)
- **Grok 4.1 Fast + Grok 4 Fast Reasoning** compartilham mesmo sintoma: `bot-message-content` nunca aparece. Sugere problema comum (possivelmente env vars nao injetadas)
- **Descoberta critica**: Network traces mostram que `/api/open-web-search` e `/api/llm-experiment` NAO estao sendo chamados durante o waterfall. LiteLLM pode nao estar ativando.
- Env vars `VITE_LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH` e `LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH` recriadas como `"true"` — aguardando novo deploy.

## Conclusao

Nenhum modelo passou. Hipoteses:

1. **(Mais provavel) LiteLLM nao esta ativando** — env vars nao injetadas corretamente no build Vercel branch-specific. Preview pode estar rodando com `LLM_PROVIDER=gemini` padrao sem saber.
2. **(Possivel) Grok models** tem problema de compatibilidade com o chat SDK ou format de resposta.
3. **(Descartado) Modelo muito lento** — so se aplica ao DeepSeek V4 Pro. Grok models falham antes do timeout.

**Proximo passo:** Validar se env vars do preview estao sendo injetadas. Se sim, smoke autenticado em `/api/gemini` com Grok antes de waterfall.
