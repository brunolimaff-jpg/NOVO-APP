---
grok_wiki: true
page_id: "page-teia-societaria"
title: "Teia societária"
repository: "local/NOVO-APP"
branch: "default"
generated_at: "2026-06-08T23:39:43.629Z"
source_files:
  - "features/dossier/societaryGraph.ts"
  - "features/dossier/teiaTextParser.ts"
  - "features/dossier/SocietaryMap.tsx"
  - "features/dossier/SocietaryMatrix.tsx"
  - "services/socio-search/types.ts"
  - "tests/features/dossier/societaryGraph.test.ts"
  - "tests/features/dossier/teiaTextParser.test.ts"
---

---
title: "Teia societária"
description: "Modelo de grafo societário, parse de texto, escopos `group_link` e `partner_other_cnpj`, matriz visual e validação de empresas laterais."
---

A Teia societária é montada no runtime do dossiê por `components/SectionalBotMessage.tsx`, que detecta seções de teia no markdown, extrai CNPJs estruturados com `parseTeiaText`, renderiza `SocietaryMap` quando há `cnpj` da empresa-alvo e delega o drill-down por sócio para `POST /api/socio-search`.

## Superfície de execução

```text
Mensagem do dossiê
  -> SectionalBotMessage
     -> parseTeiaText(cleanText)
     -> SocietaryMap(cnpj, empresaAlvo, geminiCnpjs)
        -> fetchCompanyByCnpj(cnpj) para QSA da raiz
        -> POST /api/socio-search por sócio, em lotes de 5
        -> buildSocietaryGraph(...)
        -> SocietaryMatrix(...)
```

`SocietaryMap` não depende de Mermaid para a experiência atual. A visualização principal é a matriz `SocietaryMatrix`, com métricas, filtros por categoria/sócio, colunas de sócios e painel de evidências. O helper `buildSocietaryMermaid` ainda existe como gerador de grafo textual para testes e tooling, mas o markdown gerado pelo modelo tem blocos Mermaid e tabela mestre removidos da seção onde o componente interativo entra.

<Note>
CNPJs laterais não são prova de grupo econômico. A regra central do domínio é: fonte oficial confirma `socio -> CNPJ`; só mesmo radical de CNPJ ou evidência independente confirma `CNPJ -> grupo`.
</Note>

## Contrato de escopos

| Escopo | Entrada típica | Efeito no grafo | Efeito na UI |
| --- | --- | --- | --- |
| `group_link` | Mesmo radical de CNPJ ou evidência independente conectando empresa à raiz/grupo | Pode criar `Root -> company`; `rootLinked: true`; exige `rootContext` confirmado | Aparece como empresa do grupo; evidência mostra `Escopo: Empresa do grupo` |
| `partner_other_cnpj` | QSA, CNPJ Aberto, Receita ou fonte societária confirma que o sócio aparece no CNPJ, sem prova de grupo | Cria somente vínculo `partner -> company`; `rootLinked: false`; exige sócio confirmado | Aparece na matriz como linha conectada ao sócio; evidência mostra `Escopo: Sócio admin` |
| `unconfirmed` | CNPJ textual com `*`, CNPJ não validado oficialmente ou inferência pendente | Não cria aresta de raiz; usa `validationStatus: pending` quando aplicável | Mantém `rawCnpjLabel` com `*`; evidência mostra `Escopo: Validação pendente` |

### Campos de empresa

```ts
type SocietaryRelationshipScope = 'group_link' | 'partner_other_cnpj' | 'unconfirmed';

interface SocietaryCompanyInput {
  name: string;
  cnpj?: string | null;
  rawCnpjLabel?: string;
  partnerName: string;
  confidence?: 'official' | 'strong' | 'medium' | 'weak';
  evidenceType?: 'qsa' | 'registry' | 'web' | 'trade' | 'institutional';
  relationshipScope?: SocietaryRelationshipScope;
  validationStatus?: 'official' | 'pending' | 'rejected';
  rootContext?: boolean;
  rootCompanyName?: string;
  rootCnpj?: string | null;
}
```

`relationshipScope` ausente cai como `group_link`, mas o builder rejeita esse caso se `rootContext`, `rootCompanyName` e `rootCnpj` não sustentarem o vínculo com a raiz.

## Parse de texto da teia

`parseTeiaText(markdown)` extrai empresas de tabelas markdown que contenham colunas de CNPJ ou razão social. Ele reconhece colunas como `CNPJ`, `Razão Social`, `Sócio`, `Relação na Teia`, `Escopo`, `Uso Comercial`, `Fonte` e `Confiança`.

Regras importantes:

| Caso no texto | Resultado |
| --- | --- |
| Tabela mestre com `GRUPO_CONFIRMADO`, `Empresa do Grupo Econômico`, `matriz`, `filial` ou `mesmo CNPJ raiz` | `relationshipScope: group_link`, `rootContext: true` |
| Linha fora de “Outros CNPJs” com “Outro CNPJ”, “CNPJ lateral”, “grupo não confirmado”, “sem prova” ou “validar em reunião” | `relationshipScope: partner_other_cnpj`, `rootContext: false` |
| CNPJ com asterisco | `rawCnpjLabel`, `validationStatus: pending`, `relationshipScope: unconfirmed` |
| CNPJ inválido sem asterisco | Linha ignorada com warning |
| Seção ou tabela textual “Outros CNPJs” | Ignorada; laterais devem vir da busca estruturada |
| Bloco `**Sócio N:**` com `Empresas do Grupo Econômico` ou `Empresas Relacionadas` | Associa empresas já extraídas ao sócio textual |

Essa separação impede que uma resposta textual do modelo promova uma lateral para empresa do grupo. O prompt da teia ainda pode mencionar “Outros CNPJs” como contexto narrativo, mas o componente visual não usa essa seção como fonte primária.

## Busca societária estruturada

`POST /api/socio-search` é a rota serverless que alimenta os CNPJs laterais e vínculos de grupo por sócio.

| Propriedade | Valor |
| --- | --- |
| Runtime | `nodejs` |
| Método aceito | `POST` |
| Duração máxima | `60s` |
| Deadline interno de busca | `45_000ms` |
| Limite de empresas | `60` |
| Limite de páginas abertas | `4` |
| Limite de lookups oficiais por execução | `5` |
| Timeout de lookup CNPJ | `3_500ms` |
| Cache key version | `v7-structured-lateral-cnpj` |
| TTL de cache | 7 dias |

<RequestExample>

```json
{
  "socioName": "Guilherme M. Scheffer",
  "rootCompanyName": "Scheffer & Cia Ltda",
  "rootCnpj": "04733767000180",
  "trace": true
}
```

</RequestExample>

<ResponseExample>

```json
{
  "companies": [
    {
      "name": "Fazenda Independente LTDA",
      "cnpj": "12345678000195",
      "partnerName": "Guilherme M. Scheffer",
      "sourceTitle": "CNPJ Aberto",
      "sourceUrl": "https://...",
      "snippet": "Guilherme M. Scheffer consta no QSA oficial.",
      "confidence": "strong",
      "evidenceType": "qsa",
      "relationshipScope": "partner_other_cnpj",
      "validationStatus": "official",
      "rootContext": false,
      "rootCompanyName": "Scheffer & Cia Ltda",
      "rootCnpj": "04733767000180",
      "sourceProvider": "cnpj_aberto",
      "claimType": "socio_participation",
      "rootRelationStatus": "not_supported",
      "operationalThesisAllowed": false
    }
  ],
  "rejected": [],
  "degraded": false,
  "cached": false,
  "diagnostics": {
    "queriesRun": ["cnpjaberto.com/companies_by_owner"],
    "pagesFetched": 0,
    "cacheSource": "none",
    "rejectedCount": 0,
    "cnpjsEnriched": 1,
    "totalCnpjsFound": 1
  }
}
```

</ResponseExample>

A rota tenta fontes estruturadas primeiro quando o sócio é pessoa física: `cnpjaberto.com/companies_by_owner`, depois `consultasocio.com/direct`, depois buscas web montadas por `buildQueries`. Quando um CNPJ encontrado não passa por lookup oficial dentro do limite, ele pode voltar como `unconfirmed` com `rawCnpjLabel` terminado em `*`.

<Warning>
Mesmo com HTTP 200, `degraded: true`, `companies: []`, `searchFailureCount` alto ou `truncated: true` são sinais de validação incompleta. Para regressões de teia, valide o conteúdo renderizado e o painel de evidências, não apenas o status da rota.
</Warning>

## Builder do grafo

`buildSocietaryGraph(input, geminiCnpjs?)` normaliza sócios, valida empresas, deduplica CNPJs e devolve:

```ts
interface SocietaryGraph {
  root: { id: 'root'; name: string; cnpj?: string };
  partners: SocietaryPartner[];
  companies: SocietaryCompany[];
  rejectedCompanies: RejectedSocietaryCompany[];
  rootBranchCount: number;
}
```

### Rejeições

O builder rejeita entradas quando:

| Condição | Razão operacional |
| --- | --- |
| `partnerName` não encontra sócio conhecido | Evita conectar empresa a pessoa não confirmada |
| `partner_other_cnpj` sem sócio confirmado | Lateral não pode virar nó solto |
| `unconfirmed` sem sócio nem `rootContext` | Pendência sem contexto não deve aparecer |
| CNPJ matematicamente inválido | Evita inventário falso |
| Nome sem identidade real, como `Cia Ltda` | Evita empresas truncadas |
| CNPJ da própria raiz ou filial da raiz | Não renderiza matriz/filial da empresa-alvo como empresa relacionada |
| `group_link` sem contexto da raiz | Evita homônimo tratado como grupo |
| Evidência fraca ou sem fonte | Evita promover inferência visual |

### Deduplicação e promoção

O builder usa CNPJ normalizado e radical de CNPJ para consolidar matriz/filiais em um único registro, mantendo `branchCnpjs` e `branchCount`. Em `partner_other_cnpj`, a consolidação de filiais não cria aresta da raiz; ela apenas agrupa estabelecimentos do mesmo CNPJ-base no registro lateral.

Quando o mesmo CNPJ chega primeiro como lateral e depois com prova forte de grupo, a evidência mais forte promove o registro para `group_link`, atualiza `rootLinked` e preserva `branchCnpjs`.

## Matriz visual

`SocietaryMatrix` recebe o grafo consolidado e renderiza a superfície principal da teia.

| Área | Comportamento |
| --- | --- |
| Métricas | `Matrizes`, `Filiais`, `Em comum`, `Próprias` |
| Filtros | `Todos`, categorias com contagem positiva e um botão por sócio usando o primeiro nome |
| Colunas | `Empresa`, `CNPJ`, `CNAE` e uma coluna por sócio |
| Laterais | Marcador tracejado na célula do sócio; sem coluna “Relação” e sem texto “CNPJs laterais” |
| Pendentes | `rawCnpjLabel` com `*` e escopo “Validação pendente” no painel de evidências |
| Inativos | Entram como referência rejeitada e aparecem em aviso, fora do inventário principal |
| CNAE | Enriquecido depois do render por `fetchCompanyByCnpj`, via proxy, sem chamada direta do browser à BrasilAPI |

Testids úteis para validação automatizada:

| Testid | Uso |
| --- | --- |
| `societary-map-shell` | Shell completo do mapa |
| `societary-summary-metrics` | Linha de métricas |
| `summary-metric-matrizes` | Total visível de linhas principais |
| `summary-metric-filiais` | Total de filiais consolidadas |
| `summary-metric-em-comum` | Empresas conectadas a 2+ sócios pessoa física |
| `summary-metric-proprias` | Empresas conectadas a um sócio pessoa física |
| `societary-evidence-toggle` | Abre/recolhe evidências |
| `societary-evidence-list` | Lista nome, CNPJ, sócio/admin, escopo, tipo, fonte e snippet |
| `branch-premium-badge` | Badge `Matriz · N filial/filiais` |

## Fallbacks e neutralidade de fonte

A arquitetura é portável por shape de dados. A matriz e o grafo consomem `SocietaryCompanyInput`; a origem pode ser API estruturada, cache persistente, parser textual ou outro provider que emita os mesmos campos.

| Fonte | Papel |
| --- | --- |
| QSA raiz via `fetchCompanyByCnpj` | Descobre sócios oficiais da empresa-alvo |
| `/api/socio-search` | Descobre empresas por sócio e preserva escopo semântico |
| `geminiCnpjs` vindo de `parseTeiaText` | Fallback visual quando QSA oficial está ausente ou complemento para tabela mestre |
| Cache em memória/Supabase | Evita scraping repetido, versionado por mudança semântica |

<Info>
Ao adicionar uma fonte nova, emita `relationshipScope`, `rootContext`, `sourceTitle`, `sourceUrl`, `snippet`, `confidence` e `evidenceType`. Não acople a UI a um provider específico nem use texto livre como contrato de domínio.
</Info>

## Modos de falha

| Sintoma | Verificação |
| --- | --- |
| Mapa não aparece | Confirme que a mensagem tem seção com “teia societária” ou “mapa de poder societário” e que `cnpj` existe |
| Shell aparece sem empresas | Veja se a raiz retornou QSA; se não houver QSA nem `geminiCnpjs`, o estado esperado é “QSA ainda nao disponivel” |
| Lateral aparece como grupo | Inspecione `relationshipScope`, `rootContext`, `rootRelationStatus` e `operationalThesisAllowed`; cache antigo exige nova versão de chave |
| Todas as buscas retornam vazio | Cheque `diagnostics.searchNoResultCount`, `searchFailureCount`, `queriesRun`, `degraded` e `trace.providers` |
| CNPJs textuais não entram na matriz | Se vieram de seção “Outros CNPJs”, é intencional; laterais devem vir de busca estruturada |
| Empresa baixada não aparece como linha | Verifique `rejected`; baixadas/inativas ficam fora do inventário principal |
| CNAE não aparece imediatamente | Enriquecimento é assíncrono e adiado para idle time; a matriz pode renderizar antes da coluna completar |

## Validação recomendada

Para mudança em parser, grafo, API ou matriz:

```bash
npm exec vitest run tests/api-socio-search.test.ts tests/features/dossier/SocietaryMap.test.tsx tests/features/dossier/teiaTextParser.test.ts tests/features/dossier/societaryGraph.test.ts
npm run typecheck
```

Se a mudança tocar prompts de teia ou saída textual do dossiê:

```bash
npm run validate:prompts
```

Para mudança de UX ou regressão de inventário societário, a validação mínima deve abrir a teia, aguardar o drill-down terminar e verificar `societary-evidence-list` com pelo menos um caso de `partner_other_cnpj` sem `Escopo: Empresa do grupo`.

## Related pages

<CardGroup>
  <Card title="Busca societária" href="/socio-search-reference">
    Contrato da rota `POST /api/socio-search`, cache, deadline, provedores, resposta estruturada e diagnósticos.
  </Card>
  <Card title="Gerar dossiê por CNPJ" href="/gerar-dossie-cnpj">
    Fluxo que cria o dossiê, fornece o `cnpj` da raiz e ativa a renderização da teia no relatório.
  </Card>
  <Card title="Prompts de investigação" href="/prompts-reference">
    Regras de saída textual da teia, tabela mestre, escopos e gate `validate:prompts`.
  </Card>
  <Card title="Contratos de UI" href="/ui-contracts-reference">
    Testids, estados renderizados e validação visual esperada para componentes críticos.
  </Card>
  <Card title="Testes e gates" href="/testes-gates">
    Comandos Vitest, Playwright, typecheck e critérios de validação por tipo de mudança.
  </Card>
</CardGroup>

## Related pages

- page-socio-search-reference
- page-gerar-dossie-cnpj


## Source files

- `features/dossier/societaryGraph.ts`
- `features/dossier/teiaTextParser.ts`
- `features/dossier/SocietaryMap.tsx`
- `features/dossier/SocietaryMatrix.tsx`
- `services/socio-search/types.ts`
- `tests/features/dossier/societaryGraph.test.ts`
- `tests/features/dossier/teiaTextParser.test.ts`
