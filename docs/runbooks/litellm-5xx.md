# Runbook: LiteLLM 5xx Errors

## Sintomas
- API `/api/dossier` retorna `502`/`503`/`504` com `error.code: GATEWAY_TIMEOUT` ou `GATEWAY_UNAVAILABLE`
- Logs `[DossierAPI]` mostram `stage: gateway` + `errorCode: GATEWAY_TIMEOUT`

## Diagnóstico Rápido
1. `curl -I https://litellm.homolog.seniorlabs.io/health` — deve responder 200
2. Verificar `LITELLM_BASE_URL` e `LITELLM_API_KEY` no Vercel Preview
3. Checar logs do gateway: `console.warn('[DossierAPI]', { errorCode: 'GATEWAY_TIMEOUT' })`

## Ações
| Erro | Ação |
|------|------|
| `GATEWAY_TIMEOUT` (180s) | Aumentar `LITELLM_REQUEST_TIMEOUT_MS` ou reduzir tamanho do prompt |
| `GATEWAY_UNAVAILABLE` (503) | Verificar status LiteLLM homolog; fallback automático para Gemini se configurado |
| `GATEWAY_ABORTED` (499) | Cliente cancelou; não retry |

## Contatos
- LiteLLM homolog: #infra-litellm (Slack)
- On-call: @platform-team

## Rollback
Desabilitar LiteLLM: `LITELLM_API_KEY=""` no Vercel → fallback para `api/gemini.ts` legacy.
