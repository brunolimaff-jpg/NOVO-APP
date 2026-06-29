# Plano: AI Actions para Diagnóstico de Produção (CONCLUÍDO)

## Contexto

Bruno colou 4 sessões de logs de diagnóstico do Senior Scout 360 em produção (todas da empresa Scheffer, CNPJ 04733767000180) e pediu: **"quais actions posso montar?"**.

O arquivo `nimbalyst-local/ai-actions.md` já existia com 6 ações básicas. Foram adicionadas 5 novas ações derivadas de padrões reais de produção.

## O que foi implementado

5 novas AI Actions adicionadas ao `nimbalyst-local/ai-actions.md`, todas usando `launch: new-session` (sessão isolada), `foreground: true`.

### Action 1: Diagnosticar Logs do Waterfall

- **Tipo:** Diagnóstico rápido
- **Modelo:** default (herdado)
- **O que faz:** Cola logs de produção → relatório estruturado em 6 seções (saúde, grounding, warnings, performance, erros, veredito)

### Action 2: Investigar Grounding Zerado

- **Tipo:** Debug profundo
- **Modelo:** claude-code:sonnet
- **Causa raiz identificada:** `api/gemini.ts:278` descarta `tools` quando `cachedContent` está definido
- **Arquivos-chave:** `api/gemini.ts:273-291`, `investigation-orchestration.ts:586-626`, `foundation-cache.ts:63-70`, `sources.ts:3-71`

### Action 3: Auditar Validação de CNPJ no Waterfall

- **Tipo:** Debug profundo
- **Modelo:** claude-code:sonnet
- **Causa raiz identificada:** `buildTeiaResearchContext()` só inclui CNPJ raiz; QSA CNPJs omitidos
- **Arquivos-chave:** `waterfall-orchestrator.ts:141-224`, `waterfall-orchestrator.ts:418-504`

### Action 4: Verificar Deploy de Correções

- **Tipo:** Monitoramento
- **Modelo:** default (herdado)
- **Verifica:** Se commits `a1862e13` e `14f26d7f` (AbortError + ContinuityQuestion bypass) estão em produção

### Action 5: Health Check do Waterfall (Sentry + Logs)

- **Tipo:** Monitoramento
- **Modelo:** default (herdado)
- **Verifica:** 5 dimensões (Sentry issues, métricas waterfall, grounding health, performance, static fallback)
- **Thresholds:** 🟢 Saudável / 🟡 Atenção / 🔴 Crítico

## Padrões de produção mapeados (background da análise)

| Padrão                               | Severidade   | Status                    |
| ------------------------------------ | ------------ | ------------------------- |
| Grounding 100% zerado                | P0           | Bug ativo                 |
| CNPJ validação 100% falsos positivos | P1           | Design issue              |
| AbortError CNPJ                      | Já corrigido | `a1862e13` + `14f26d7f`   |
| ContinuityQuestion JSON truncado     | Já corrigido | Bypass `a1862e13`         |
| Static fallback dossiês grandes      | Por design   | >4000 chars               |
| PORTA dimension gaps                 | Por design   | Reconciliação em 3 níveis |

## Arquivos modificados

| Arquivo                         | Mudança                                         |
| ------------------------------- | ----------------------------------------------- |
| `nimbalyst-local/ai-actions.md` | +5 novas ações na seção "Waterfall Diagnostics" |

## Verificação

- `npm run typecheck` — N/A (arquivo .md)
- `npm test` — N/A
- Validar manualmente: abrir dropdown de Actions no Nimbalyst e verificar se as 5 novas ações aparecem

## Status

✅ Implementado e commitado (`e47be1b8`). Aguardando push.
