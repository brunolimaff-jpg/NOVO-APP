# Plano: 7 AI Actions para Nimbalyst baseadas em Padroes Reais de Producao

## Contexto

Bruno pediu "quais actions posso montar?" apos colar 4 sessoes de log diagnostico de producao do Senior Scout 360 (empresa Scheffer, CNPJ 04733767000180).

3 sessoes de exploracao profunda de codigo identificaram **7 padroes recorrentes de falha em producao**. Cada acao abaixo ataca um desses padroes.

## Arquivo alvo

`/Users/brunolima/Documents/NOVO-APP/nimbalyst-local/ai-actions.md`

## Formato

```
## Nome da Acao
model: claude-code:modelo
[opcional: launch, foreground, autoSubmit]

Prompt em portugues...
```

## As 7 Acoes

### ACAO 1: Diagnosticar Fontes Nao Verificadas no Dossie

**Categoria:** A (Diagnostico de Producao)
**Padrao:** Grounding Failure (100% dos modulos) — `groundingSources: 0`, `verificationStatus: 'unverified'`
**Modelo:** haiku (triagem rapida)
**Prioridade:** 1 (mais alta)

Causa tecnica em `api/gemini.ts:488-494` (fallback desliga grounding quando chamada primaria falha) e `services/gemini/sources.ts` (`normalizeGroundingSources` retorna array vazio).

Impacto para Bruno: dossie sem fontes verificadas = vendedor leva informacao sem credibilidade para reuniao com cliente.

### ACAO 2: Diagnosticar Dados Incompletos no Mapa Societario

**Categoria:** A (Diagnostico de Producao)
**Padrao:** CNPJ AbortError Cascades — 5 CNPJs abortam simultaneamente ~224ms
**Modelo:** sonnet (analise de causa)
**Prioridade:** 2

Causa em `features/dossier/SocietaryMap.tsx:457`: `fetchCompanyByCnpj(cnpj)` SEM passar `AbortSignal`. Enriquecimento CNAE falha silenciosamente.

Impacto para Bruno: mapa societario com dados incompletos — vendedor ve menos informacao que o disponivel.

### ACAO 3: Diagnosticar Dossie Grande com Renderizacao Diferente

**Categoria:** A (Diagnostico de Producao)
**Padrao:** Static Fallback para Dossies Grandes (>4000 chars)
**Modelo:** haiku (triagem rapida)
**Prioridade:** 3

Logica em `hooks/useStaticTimelineFallback.ts`: dossies acima de 4000 chars (ex: Scheffer ~28k) ativam rendering estatico proativo.

Impacto para Bruno: dossies muito grandes usam modo de rendering diferente — se quebrar, vendedor ve painel em branco.

### ACAO 4: Auditar Falhas Silenciosas no Codigo

**Categoria:** B (Auditoria de Saude de Codigo)
**Padrao:** Catch vazio/silencioso — erros engolidos sem log
**Modelo:** sonnet (auditoria), `launch: new-session`
**Prioridade:** 4

Locais conhecidos: `utils/diagnosticLog.ts:105,228,191`, `features/dossier/waterfall-orchestrator.ts:306`.

Impacto para Bruno: catch silencioso = erro acontece mas ninguem descobre. Bruno ve tela congelada ou dado faltando sem mensagem de erro.

### ACAO 5: Verificar Alarmes de Loading Travado

**Categoria:** B (Auditoria de Saude de Codigo)
**Padrao:** `activeGenerationRef` deletado antes dos probes lerem (`scheduleLoadingStuckProbes`)
**Modelo:** sonnet
**Prioridade:** 5

Bug conhecido (PR #376, 2026-06-15): `features/chat/message-orchestrator.ts:789-790` deletava ref antes dos probes (linha 792). Safety net ficou desarmada por 6 dias — Sentry nunca alertava loading travado.

Impacto para Bruno: sem probes funcionais, loading travado nao e detectado. Vendedor ve tela congelada sem recuperacao. O Sentry parece ok mas nao alerta.

### ACAO 6: Analisar Score PORTA do Dossie

**Categoria:** C (Analise de Pipeline Waterfall)
**Padrao:** Dimensao "O" (Operacao) faltando no primeiro passe, requer retry
**Modelo:** sonnet
**Prioridade:** 6

Logica em `features/dossier/porta-reconciliation.ts:136`: detecta dimensoes faltantes e retenta modulos especificos.

Impacto para Bruno: PORTA incompleto = analise comercial menos precisa. Se a reconciliacao falha, o score fica parcial.

### ACAO 7: Pre-Validador Waterfall

**Categoria:** D (Pre-Deploy Checks)
**Padrao:** Multiplos padroes — gate antes de merge
**Modelo:** sonnet, `foreground: true` (resultado na mesma sessao)
**Prioridade:** 7

Checklist combinado dos 6 padroes acima + verificacoes de regressao conhecidas.

Impacto para Bruno: antes de autorizar deploy, valida que nenhum dos padroes conhecidos esta ativo. Evita regressao.

## Estrategia de Execucao

1. **Acoes 1, 3 (haiku):** podem rodar em paralelo — sao triagem rapida, nao dependem uma da outra
2. **Acoes 2, 5, 6 (sonnet):** podem rodar em paralelo — analise de causas diferentes
3. **Acao 4 (sonnet + new-session):** roda em sessao separada porque e varredura pesada de codigo
4. **Acao 7 (sonnet + foreground):** roda por ultimo, consolida resultados das anteriores

## Riscos e Mitigacoes

| Risco                                                   | Mitigacao                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Acao 4 pode ser lenta (varre muitos arquivos)           | Rodar em new-session para nao bloquear Bruno                       |
| Acao 2 precisa de diagnostico real para analisar        | Se nao houver log recente, reportar que nao ha dados               |
| Acao 6 depende de waterfall ter rodado                  | Se nao houver resultado, reportar que nao ha dados                 |
| Acoes podem sugerir correcao que Bruno nao pode validar | Seguir formato do copiloto-core: diagnostico + dados + confianca % |

## Metricas de Sucesso

1. Bruno consegue rodar cada acao sem precisar de ajuda tecnica
2. Prompt da acao e auto-contido (nao requer contexto externo)
3. Resultado da acao termina com recomendacao acionavel em portugues claro
4. Cada acao referencia arquivos especificos por caminho absoluto
