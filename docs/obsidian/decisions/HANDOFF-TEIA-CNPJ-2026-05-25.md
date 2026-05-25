---
title: "Handoff Teia CNPJ 2026-05-25"
type: handoff
status: validated-pending-merge
projeto: "NOVO-APP"
data: 2026-05-25
branch: "codex/cnpj-socios-todos-cnpjs"
pr: 285
tags:
  - handoff
  - teia-societaria
  - cnpj
  - obsidian
  - preview
---

# Handoff Teia CNPJ 2026-05-25

Voltar para [[DECISIONS-Index]] | [[LICOES-APRENDIDAS-TEIA-CNPJ-2026-05-24]] | [[SESSAO-TEIA-SOCIETARIA-2026-05-24]].

## Resumo executivo

Atualizacao 2026-05-25 17:05: o estado abaixo de bloqueio foi superado. A PR #285 (`codex/cnpj-socios-todos-cnpjs`) ficou tecnicamente validada no commit `2c9a976`: GitHub `CLEAN`, checks remotos verdes, API via proxy local da preview retornando inventario lateral nao degradado e browser local mostrando matriz preenchida sem textos inseguros.

Fonte atual de fechamento: [[FECHAMENTO-TEIA-CNPJ-PR285-2026-05-25]].

Snapshot historico anterior: PR #285 **nao estava pronta para merge** quando `/api/cnpj` encontrava 6 socios da Scheffer e `/api/socio-search` retornava 0 empresas para todos eles.

O trabalho posterior resolveu a causa de produto com CNPJ Aberto estruturado, cache versionado e limpeza visual/textual. As secoes abaixo permanecem para auditoria do caminho, nao como status atual.

## Contexto

Esta nota consolida o arquivo local `HANDOFF_TEIA_CNPJ_2026-05-25_0834.md`, que registrava o status anterior da PR #285 no commit `9d1448c`.

O handoff anterior dizia que a PR #285 estava pronta para merge. A validacao funcional seguinte mostrou que esse status estava otimista: os checks estavam verdes, mas a preview ainda nao entregava profundidade real de CNPJs por socio.

## Status anterior consolidado

No snapshot `9d1448c`, a branch `codex/cnpj-socios-todos-cnpjs` tinha corrigido pontos importantes:

- `relationshipScope` separado em `group_link`, `partner_other_cnpj` e `unconfirmed`;
- CNPJs laterais de socios sem aresta raiz forte;
- bloqueio de CNPJ invalido por digito verificador;
- rejeicao/substituicao de nome truncado como `Cia Ltda`;
- prompt e parser sem amostragem silenciosa do inventario;
- aviso de inventario parcial na UI;
- suite local e checks remotos verdes naquele momento.

Esse estado continua util como historico, mas nao e mais a verdade atual da PR.

## Regressao encontrada depois

Na preview da PR #285, usando Scheffer `04.733.767/0001-80`:

- `/api/cnpj` retornou `SCHEFFER & CIA LTDA` e 6 socios no QSA;
- `/api/socio-search` retornou 0 empresas para todos os socios;
- a resposta veio com `degraded: true`, `pagesFetched: 0`, `cacheSource: none`;
- o dossie podia exibir CNPJ inferido sem marcacao clara, criando risco de parecer oficial;
- o pior caso era CNPJ inventado ou nao confirmado aparecer como se fosse validado.

Essa regressao muda o criterio de pronto: check verde nao basta. A preview precisa mostrar profundidade real ou diagnosticar claramente a falha de busca.

## Correcoes aplicadas apos o handoff anterior

### Commit `e8b7abe` — CNPJ pendente com asterisco

- `prompts/mega/teia-deep.ts` exige:
  - CNPJ oficial sem `*`;
  - CNPJ inferido/textual/nao confirmado como `##.###.###/####-##*`;
  - nota obrigatoria: `* = hipótese a validar, não confirmado em fonte oficial`.
- `features/dossier/teiaTextParser.ts` preserva CNPJ com `*` como:
  - `relationshipScope: unconfirmed`;
  - `validationStatus: pending`;
  - `rawCnpjLabel` com o asterisco;
  - `confidence: weak`.
- `features/dossier/societaryGraph.ts` renderiza pendentes:
  - com classe Mermaid `evidence` e borda tracejada;
  - sem badge `oficial`;
  - sem promocao para `group_link`;
  - sem aresta forte `Root -> CNPJ`.
- `features/dossier/SocietaryMap.tsx` mostra o CNPJ com `*` no painel de evidencias e exibe `Escopo: Validação pendente`.
- `/api/socio-search` diferencia falha de busca de ausencia de resultado com:
  - `searchFailureCount`;
  - `searchNoResultCount`.

### Commit `b01ec45` — DuckDuckGo-only

Bruno decidiu remover Brave do runtime.

- `utils/documentExtractor.ts` passou a usar somente DuckDuckGo Lite.
- `/api/open-web-search` passou a retornar `OpenWebSearch/DuckDuckGo` ou `OpenWebSearch/DdgDegraded`.
- `BRAVE_SEARCH_API_KEY` e chamadas para `api.search.brave.com` deixaram de ser usadas pelo codigo, mesmo que a env continue cadastrada na Vercel.
- Os testes de `/api/open-web-search` agora garantem que a busca continua em DuckDuckGo mesmo com `BRAVE_SEARCH_API_KEY` definida.

## Contrato atual da Teia CNPJ

| Caso | Como deve aparecer | Como deve se comportar |
|---|---|---|
| CNPJ oficial/validado | `##.###.###/####-##` | Pode ter evidencia forte conforme fonte/QSA |
| CNPJ inferido ou textual sem validacao oficial | `##.###.###/####-##*` | `unconfirmed`, `pending`, fraco, Mermaid tracejado |
| CNPJ invalido sem `*` | Nao aparece | Parser/API/grafo rejeitam |
| CNPJ lateral do socio confirmado | `partner_other_cnpj` | Aresta `Socio -> CNPJ`, sem aresta raiz |
| Grupo economico comprovado | `group_link` | Pode ter aresta `Root -> CNPJ` |

Regra central: CNPJ com `*` pode virar linha de dossie, mas nao prova grupo, controle, QSA, nem relacao oficial.

## Validacao local atual

Executado em 2026-05-25:

```bash
npm exec vitest run tests/api-open-web-search.test.ts tests/api-socio-search.test.ts tests/features/dossier/SocietaryMap.test.tsx tests/features/dossier/teiaTextParser.test.ts tests/features/dossier/societaryGraph.test.ts tests/prompts/megaPrompts.test.ts
./scripts/validate-prompts.sh
npm run typecheck
npm run build
```

Resultado:

- Recorte Vitest: 91 testes verdes;
- `validate-prompts.sh`: 56 testes verdes;
- `typecheck`: verde;
- `build`: verde, com warning conhecido de chunk grande do Mermaid.

## Estado operacional

- PR #285: continua aberta em `codex/cnpj-socios-todos-cnpjs`.
- O arquivo solto `HANDOFF_TEIA_CNPJ_2026-05-25_0834.md` foi consolidado nesta nota e nao deve ser usado como fonte atual.
- `BRAVE_SEARCH_API_KEY` pode continuar cadastrada na Vercel, mas o runtime nao usa mais Brave.
- `SUPABASE_SERVICE_ROLE_KEY` ainda precisa ser configurada para Preview geral ou especificamente para `codex/cnpj-socios-todos-cnpjs` para cache persistente de `/api/socio-search`.
- Checks remotos do commit `d743c77` passaram: Typecheck, Tests, Dossier Golden, Build, GitGuardian, Vercel, Vercel Preview Comments e Smoke Preview.
- `gh pr view 285` em 2026-05-25 mostrou `mergeStateStatus: CLEAN`, mas isso nao representa prontidao funcional.
- Comentarios da PR lidos em 2026-05-25:
  - nao ha `reviewThreads` inline abertas;
  - review do Gemini Code Assist: `COMMENTED`, sem feedback acionavel;
  - comentario da Vercel e apenas informativo;
  - dois comentarios anteriores de validacao do owner ficaram obsoletos, pois diziam que a preview estava pronta.

## Validacao funcional que falhou em 2026-05-25

**Horario:** 2026-05-25 09:30 -04
**Preview:** `https://scoutagro-git-codex-cnpj-soci-4d3068-brunolimaff-3629s-projects.vercel.app`
**CNPJ testado:** `04.733.767/0001-80` (`04733767000180`)

### Resultado de `/api/cnpj`

Funcionou:

- status `200`;
- `companyName: SCHEFFER & CIA LTDA`;
- `city: Sapezal`;
- `state: MT`;
- `qsaCount: 6`;
- socios retornados:
  - `GILLIARD ANTONIO SCHEFFER`;
  - `ELIZEU ZULMAR MAGGI SCHEFFER`;
  - `GUILHERME MOGNON SCHEFFER`;
  - `GISLAYNE RAFAELA SCHEFFER`;
  - `SCHEFFER PARTICIPACOES S/A`;
  - `CAROLINA MOGNON SCHEFFER`.

Conclusao: a base inicial/QSA esta disponivel. O problema nao e a consulta do CNPJ raiz.

### Resultado de `/api/open-web-search`

Falhou em profundidade:

```json
{
  "status": 200,
  "source": "OpenWebSearch/DdgDegraded",
  "degraded": true,
  "contentLength": 0,
  "providerStatus": [
    {
      "provider": "duckduckgo",
      "ok": false,
      "reason": "empty_result"
    }
  ],
  "detail": "Nenhum resultado público capturado."
}
```

Conclusao: remover Brave resolveu a dependencia/erro 402, mas DuckDuckGo-only nao esta trazendo resultado publico na preview.

### Resultado de `/api/socio-search`

Falhou para todos os 6 socios:

| Socio | Status | Empresas | Degraded | Pages fetched | Cache | Falhas de busca |
|---|---:|---:|---|---:|---|---:|
| `GILLIARD ANTONIO SCHEFFER` | 200 | 0 | true | 0 | memory | 6 |
| `ELIZEU ZULMAR MAGGI SCHEFFER` | 200 | 0 | true | 0 | memory | 6 |
| `GUILHERME MOGNON SCHEFFER` | 200 | 0 | true | 0 | memory | 6 |
| `GISLAYNE RAFAELA SCHEFFER` | 200 | 0 | true | 0 | memory | 6 |
| `SCHEFFER PARTICIPACOES S/A` | 200 | 0 | true | 0 | memory | 6 |
| `CAROLINA MOGNON SCHEFFER` | 200 | 0 | true | 0 | memory | 6 |

Diagnostico comum:

```json
{
  "pagesFetched": 0,
  "cacheSource": "memory",
  "rejectedCount": 0,
  "searchFailureCount": 6
}
```

Conclusao: a API agora diagnostica melhor a falha, mas ainda nao resolve a profundidade. Ela retorna HTTP 200 degradado, sem empresa, sem pagina extraida e sem CNPJ lateral.

## O que ja foi tentado e nao resolveu

| Tentativa | O que melhorou | Por que nao resolveu ainda |
|---|---|---|
| Separar `group_link`, `partner_other_cnpj` e `unconfirmed` | Evitou tratar CNPJ lateral como grupo economico | Nao cria fonte de dados; se a busca vem vazia, o inventario continua vazio |
| Bloquear CNPJ invalido por digito verificador | Reduziu risco de CNPJ inventado oficial | Nao aumenta cobertura de pesquisa por socio |
| Permitir CNPJ hipotetico com `*` | Atende regra do Bruno: pode virar linha, mas marcado | So funciona quando existe fonte textual; a preview nao esta encontrando texto |
| Mermaid tracejado para `unconfirmed` | Visualmente separa hipotese de oficial | Nao aparece se `/api/socio-search` nao encontra nada |
| Rejeitar `Cia Ltda` e nomes sem identidade real | Evita lixo visual no mapa | Corrige qualidade do dado encontrado, nao a ausencia de dado |
| Remover Brave e usar DuckDuckGo-only | Removeu dependencia do `BRAVE_SEARCH_API_KEY` e o erro Brave 402 | DuckDuckGo Lite retorna `empty_result` na preview para as queries testadas |
| Diagnosticar `searchFailureCount` vs `searchNoResultCount` | Ficou claro que e falha/degradacao de busca, nao ausencia confirmada | Diagnostico nao e dado; o produto continua sem profundidade |
| Checks remotos e Smoke Preview | Garante build/test/deploy basico | Smoke atual nao falha quando o resultado societario vem vazio |
| Validacoes unitarias de parser/grafo/API | Protegem contratos locais e anti-alucinacao | Testes mockados nao provam que o provedor publico entrega resultados reais |

## Decisao de merge historica

**Status:** superada pelo fechamento de 2026-05-25 17:05.

**Decisao naquele momento:** nao mergear a PR #285 naquele estado.

**Racional:** a PR esta tecnicamente mergeavel pelo GitHub, mas falha no comportamento de negocio principal: entregar profundidade de pesquisa de CNPJs dos socios. Fazer merge agora consolidaria uma tela que parece correta em contrato, mas continua vazia na preview real.

**Criterio minimo definido naquele momento para liberar merge:**

1. `/api/cnpj` continua retornando os 6 socios da Scheffer.
2. `/api/socio-search` retorna CNPJs laterais nao vazios para ao menos parte relevante dos socios, ou explica com diagnostico forte por que nao ha fonte.
3. CNPJ inferido aparece somente com `*`, `validationStatus: pending`, `relationshipScope: unconfirmed`.
4. CNPJ sem `*` e sem validacao oficial nao aparece como oficial.
5. Smoke de preview passa a validar resultado de negocio, nao apenas HTTP 200.

## Registro da sessao de 2026-05-25

### Branch e PR

- Branch: `codex/cnpj-socios-todos-cnpjs`
- PR: `#285`
- Base: `main`
- Commit validado antes desta baixa documental: `d743c77`
- Estado GitHub antes da baixa: `mergeStateStatus: CLEAN`
- Estado de produto: **bloqueado**

### Comentarios e reviews lidos

- `gh pr view 285 --json ...`
- GraphQL `reviewThreads(first:100)`:
  - resultado: `[]`;
  - nao havia thread inline para resolver.
- Comentario Vercel:
  - informativo;
  - preview atual: `https://scoutagro-git-codex-cnpj-soci-4d3068-brunolimaff-3629s-projects.vercel.app`.
- Comentarios antigos do owner:
  - classificacao: `ja-enderecado naquele momento, agora obsoleto`;
  - risco: documentavam preview como validada, mas a validacao atual contradiz.
- Review Gemini Code Assist:
  - estado `COMMENTED`;
  - sem comentario acionavel.

### Arquivos lidos

- `AGENTS.md` — regras do repo, memoria local e handoff.
- `.agents/memory/activeContext.md` — status vivo da branch e pendencias.
- `.agents/memory/progress.md` — historico da PR #285 e status antigo de preview.
- `.agents/memory/decisions.md` — decisoes persistentes.
- `HANDOFF_AI.md` — fonte canonica de entrada rapida.
- `api/socio-search.ts` — contrato real da rota (`POST`) e diagnosticos.
- `api/open-web-search.ts` — contrato real da rota (`POST`) e DuckDuckGo-only.
- `docs/obsidian/decisions/HANDOFF-TEIA-CNPJ-2026-05-25.md` — handoff consolidado.
- `docs/obsidian/decisions/LICOES-APRENDIDAS-TEIA-CNPJ-2026-05-24.md` — prevencao de regressao.

### Arquivos modificados nesta baixa

- `HANDOFF_AI.md` — naquele snapshot foi corrigido de "PR #285 validada" para "PR #285 bloqueada por falha funcional"; status superado no fechamento das 17:05.
- `.agents/memory/activeContext.md` — atualizado com preview falha, decisao de nao mergear e next step.
- `.agents/memory/progress.md` — adicionado override detalhado do status antigo de preview.
- `.agents/memory/decisions.md` — registrada decisao duravel de gate funcional antes de merge.
- `docs/obsidian/decisions/HANDOFF-TEIA-CNPJ-2026-05-25.md` — esta nota virou o handoff principal da investigacao.
- `docs/obsidian/decisions/LICOES-APRENDIDAS-TEIA-CNPJ-2026-05-24.md` — adicionadas licoes 13-17 e secao de nao resolvidos.

### Comandos uteis para continuar

```bash
gh pr view 285 --json number,title,url,headRefName,baseRefName,mergeStateStatus,reviewDecision,comments,reviews,files,statusCheckRollup
```

```bash
gh api graphql -f owner='brunolimaff-jpg' -f repo='NOVO-APP' -F number=285 -f query='query($owner:String!,$repo:String!,$number:Int!){ repository(owner:$owner,name:$repo){ pullRequest(number:$number){ reviewThreads(first:100){ nodes{ id isResolved path line comments(first:20){ nodes{ id body author{login} url createdAt outdated diffHunk } } } } } } }'
```

```bash
npm exec vitest run tests/api-open-web-search.test.ts tests/api-socio-search.test.ts tests/features/dossier/SocietaryMap.test.tsx tests/features/dossier/teiaTextParser.test.ts tests/features/dossier/societaryGraph.test.ts tests/prompts/megaPrompts.test.ts
./scripts/validate-prompts.sh
npm run typecheck
npm run build
npm run docs:obsidian:check
```

### Payload de validacao manual da preview

Use `POST`, nao `GET`, para as duas rotas abaixo:

```json
{
  "query": "GUILHERME MOGNON SCHEFFER CNPJ"
}
```

```json
{
  "socioName": "GUILHERME MOGNON SCHEFFER",
  "rootCnpj": "04733767000180",
  "rootCompanyName": "SCHEFFER & CIA LTDA"
}
```

Headers quando a preview estiver protegida:

```text
x-vercel-protection-bypass: <VERCEL_AUTOMATION_BYPASS_SECRET>
content-type: application/json
```

### Perguntas abertas

- DuckDuckGo Lite esta retornando vazio por bloqueio, mudanca de HTML, query ruim, User-Agent ou limitacao do runtime Vercel?
- Vale manter DuckDuckGo como unico provedor se ele nao entrega inventario societario em preview?
- Qual fonte confiavel deve alimentar pesquisa por socio quando nao houver cache persistente?
- O smoke de preview deve falhar com `searchFailureCount > 0` ou apenas quando todos os socios voltarem `companies: 0`?
- `SUPABASE_SERVICE_ROLE_KEY` de Preview sera geral ou restrita a branch `codex/cnpj-socios-todos-cnpjs`?

## Proximos passos atuais

1. Subir a documentacao de fechamento na PR #285.
2. Mergear PR #285 depois dos checks.
3. Validar PR #286 contra o estado pos-merge.
4. Configurar `SUPABASE_SERVICE_ROLE_KEY` na Vercel Preview para cache persistente.
5. Atualizar smoke de preview para falhar quando todos os 6 socios retornarem `companies: 0` ou payload degradado sem inventario util.
6. Planejar a reestruturacao da Teia CNPJ como boundary de dominio.
