---
grok_wiki: false
page_id: 'page-arquitetura-llm-providers'
title: 'Arquitetura de Provedores LLM (Fase 5)'
description: 'Evolucao de Gemini-only para pipeline hibrido com LiteLLM proxy, Bedrock (Sonnet) e DeepSeek. Roteamento, custos, timeouts e bgs conhecidos.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-24T23:59:00.000Z'
source_files:
  - 'utils/llm/modelRouter.ts'
  - 'utils/llm/modelCatalog.ts'
  - 'utils/llm/groundingHybrid.ts'
  - 'utils/llm/types.ts'
  - 'api/_llm-client.ts'
  - 'api/gemini.ts'
  - 'features/dossier/waterfall-orchestrator.ts'
  - 'CALIBER_LEARNINGS.md'
  - 'ARQUITETURA.md'
---

# Arquitetura de Provedores LLM (Fase 5)

## Visao Geral

O Senior Scout 360 nasceu com **Gemini como unico provedor de IA**. A Fase 5 (junho/2026) migrou para um **pipeline hibrido** com 3 provedores, onde o Gemini foi eliminado como provider principal e substituido por Claude Sonnet 4.6 + DeepSeek V3.2 via proxy LiteLLM e Bedrock.

**Por que a mudanca:**

- **Qualidade:** Sonnet 4.6 gera 1.6x mais caracteres que Gemini com fontes mais ricas (11 URLs vs 6)
- **Custo:** DeepSeek V3.2 custa 88% menos que Gemini por dossie ($0.06 vs $0.50)
- **Redundancia:** 3 provedores diferentes eliminam dependencia unica de API

---

## Diagrama de Fluxo

```
Browser (React)
    |
    v
api/*.ts (Vercel Serverless)
    |
    v
LiteLLM Proxy (DEV / HOMOLOG)
    |
    +---> Bedrock (Claude Sonnet 4.6)
    |         Modulos criticos: Operacao, Caminho de Venda
    |
    +---> Bedrock (DeepSeek V3.2)
    |         Modulos operacionais: Teia, Tech Stack, Riscos, etc.
    |
    +---> DeepSeek API direta (api.deepseek.com)
              Provider economico para exploracao/prototipagem
```

**Nota:** Gemini foi eliminado como provider principal (commit `322b3d7f`). O fallback Gemini (`respondWithGeminiFallback`) foi removido. `isFallbackEnabled = false` hardcoded em `_llm-client.ts:79`.

---

## Roteamento de Modulos

O roteamento e feito pelo `HYBRID_MODEL_MAP` em `utils/llm/modelRouter.ts`:

| Modulo            | Modelo            | Provider |
| ----------------- | ----------------- | -------- |
| operacao          | Claude Sonnet 4.6 | Bedrock  |
| caminho-venda     | Claude Sonnet 4.6 | Bedrock  |
| teia-societaria   | DeepSeek V3.2     | Bedrock  |
| tech-stack        | DeepSeek V3.2     | Bedrock  |
| riscos-compliance | DeepSeek V3.2     | Bedrock  |
| radar-expansao    | DeepSeek V3.2     | Bedrock  |
| rh-sindicatos     | DeepSeek V3.2     | Bedrock  |
| decisores         | DeepSeek V3.2     | Bedrock  |

Modulos sem entrada no mapa usam Gemini como fallback (caso residual).

---

## Configuracao via Env Vars

| Variavel                         | Descricao                            | Default  |
| -------------------------------- | ------------------------------------ | -------- |
| `VITE_HYBRID_PIPELINE_ENABLED`   | Ativa pipeline hibrido               | `false`  |
| `VITE_LLM_PROVIDER`              | Provedor (`litellm` ou `gemini`)     | `gemini` |
| `VITE_LITELLM_CLIENT_TIMEOUT_MS` | Timeout cliente em ms                | `120000` |
| `MAX_LITELLM_REQUEST_TIMEOUT_MS` | Timeout maximo servidor em ms        | `180000` |
| `LITELLM_BASE_URL`               | URL do proxy LiteLLM                 | ``       |
| `VITE_LLM_ALLOWLIST`             | Allowlist de emails para experimento | ``       |
| `VITE_WATERFALL_TIER`            | Tier de waterfall (proposto)         | `padrao` |

---

## Timeouts

| Camada            | Valor                                   | Arquivo                             |
| ----------------- | --------------------------------------- | ----------------------------------- |
| Cliente (env var) | `VITE_LITELLM_CLIENT_TIMEOUT_MS=120000` | waterfall-orchestrator, geminiProxy |
| Servidor (cap)    | `MAX_LITELLM_REQUEST_TIMEOUT_MS=180000` | `api/_llm-client.ts:7`              |
| Efetivo           | `Math.min(120000, 180000) = 120s`       |                                     |
| Waterfall         | SEM HARD CAP                            | waterfall-orchestrator (removido)   |

**Licao critica:** O bug real da PR #386 era `MAX_LITELLM_REQUEST_TIMEOUT_MS=38000` (38s) que anulava qualquer configuracao de timeout do cliente. Tabbit descobriu em 5 minutos apos 7 dias de debug. ([[DI-2026-06-24-26]])

---

## Versao Atual: Pipeline Hibrido

**2 waterwalls validados em producao:**

- 1o: 47.573 chars, 6/6 modulos, $0.135, 317s
- 2o: 51.043 chars, 6/6 modulos, $0.137, 373s

**HYBRID_MODEL_MAP confirmado:**

- Sonnet 4.6: Operacao (69-72s), Caminho de Venda
- DeepSeek V3.2: Demais modulos (8-49s)

---

## Rollout Gradual

O experimento LiteLLM opera com **allowlist de operadores**:

- Define-se `VITE_LLM_ALLOWLIST` com emails separados por virgula
- Apenas operadores na allowlist tem o experimento ativo
- Sem allowlist, o experimento fica em `off` por seguranca
- O auth server-side (`_experiment-auth.ts`) e authoritative; o client-side e apenas gate visual

---

## Bugs Conhecidos

### Bug P0: groundingSources=0 com Foundation Cache

Quando o foundation cache do Gemini esta ativo, `groundingSources` retorna 0 mesmo quando fontes foram usadas. O cache descarta as tools de grounding. [[33-grounding-cache-bug-p0]]

### Bug "Ver Relatorio Completo" nao expande

Botao "Ver relatorio completo (+3 secoes)" no SectionalBotMessage nao expande ao clicar. Bug pre-existente, nao causado pela Fase 5. Causa provavel: `useDeferredValue` introduzido no commit `eea8783c`. ([[DI-2026-06-24-31]])

### Vercel Live Feedback Bloqueia Cliques

Widget Vercel Toolbar (`<vercel-live-feedback>`) com `z-index: 2147483647` criava overlay invisivel que capturava todos os eventos de mouse. Resolvido: desativado no painel Vercel. ([[DI-2026-06-24-30]])

---

## Referencias

- [[DI-2026-06-24-27]]: Zero Gemini implementado
- [[DI-2026-06-24-28]]: VITE_LITELLM_CLIENT_TIMEOUT_MS como env var unica
- [[DI-2026-06-24-29]]: Hard-cap 330s removido
- [[DI-2026-06-24-26]]: 38s timeout era o bug real
- [[32-hybrid-model-map]]: HYBRID_MODEL_MAP detalhado
- [[33-grounding-cache-bug-p0]]: Bug P0 de grounding cache
- `CALIBER_LEARNINGS.md` secao "ARQUITETURA FINAL"
