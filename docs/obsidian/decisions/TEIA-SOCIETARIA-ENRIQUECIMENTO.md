---
type: decisao-registrada
area: dossie
status: implementado-em-pr
data: 2026-05-23
branch: codex/teia-societaria-tipo5
tags:
  - teia-societaria
  - mermaid
  - drill-down
  - scraping-controlado
  - evidencias
  - cache
---

# Teia Societaria — Enriquecimento Visual e de Dados

Voltar para [[DECISIONS-Index]] | [[ROADMAP-Overview]].

## Estado Atual (2026-05-23)

**Implementacao iniciada e fechada na branch `codex/teia-societaria-tipo5`.**

O mockup visual anterior em `.superpowers/brainstorm/93190-1779565087/content/polished.html` serviu como exploracao, mas a decisao final de produto mudou: producao nao usa SVG manual neste ciclo. A teia agora usa Mermaid LR dinamico, com dados auditaveis e fallback textual do dossie.

## Decisoes Travadas

### 1. Visualizacao

- Mermaid sempre em `graph LR`.
- Sem `TD/TB` para esta teia.
- Sem SVG manual em producao neste ciclo.
- O markdown/Mermaid textual gerado pelo dossie continua renderizado como fallback.

### 2. Fonte de dados

- Nivel 1: QSA do CNPJ via `lib/cnpjLookup.ts` e `services/brasilApiService.ts`.
- Nivel 2: drill-down por socio via `/api/socio-search`, sempre server-side.
- O grafo aceita apenas empresas expandidas com fonte, confianca, tipo de evidencia e contexto explicito da empresa raiz.
- `confidence: strong` sozinho nao conecta empresa.

### 3. Homonimos e evidencias

- Nao ligar empresa por nome de socio sozinho.
- A API exige match do socio + contexto do grupo (`rootCompanyName` ou `rootCnpj`).
- O grafo tambem valida `rootContext` com `rootCompanyName` ou `rootCnpj` compativel.
- Resultados fracos entram como rejeitados/degradados, nao como conexao visual.

### 4. Cache e producao

- Cache de busca societaria: 7 dias por `rootCnpj/rootCompanyName + socioName`.
- Em producao/Vercel, `/api/socio-search` exige `SUPABASE_SERVICE_ROLE_KEY`.
- Chave anon/publica do Supabase nao e aceita para esse cache server-side.
- Se o cache persistente nao estiver legivel/gravavel, a API degrada sem scraping.

### 5. Scheffer Colombia

- `Scheffer Colombia S.A.S.` deve ser preservada quando houver evidencia publica de operacao/presenca internacional conectada ao grupo.
- A classificacao continua estimada; nao altera Score PORTA.

## Arquivos Implementados

- `api/socio-search.ts` — drill-down server-side, cache persistente, rejeicao de homonimos.
- `features/dossier/societaryGraph.ts` — fonte unica do grafo e geracao Mermaid LR.
- `features/dossier/SocietaryMap.tsx` — UI com selecao de socio, evidencias e Mermaid.
- `lib/cnpjLookup.ts` — normalizacao de QSA a partir dos provedores CNPJ.
- `services/brasilApiService.ts` — exposto `qsa` no contrato de frontend.
- `components/SectionalBotMessage.tsx` e `components/MessageRow.tsx` — integracao no dossie.

## Validacoes

- `npm run typecheck`
- Recorte Vitest da feature e integracao: 53 testes
- `npm run test:dossier`
- `npm run build`
- Spec review por subagente: aprovado
- Quality review por subagente: aprovado

## Pendencias de Ambiente

1. Configurar `SUPABASE_SERVICE_ROLE_KEY` na Vercel para habilitar `/api/socio-search` em producao.
2. Validar no preview com CNPJ Scheffer `04.733.767/0001-80`.
3. Conferir visualmente: QSA, troca de socio, fontes exibidas, Scheffer Colombia, fallback textual.
