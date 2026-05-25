---
title: "Handoff Teia CNPJ 2026-05-25"
type: handoff
status: active
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
- Checks remotos do commit `b01ec45` passaram: Typecheck, Tests, Dossier Golden, Build, GitGuardian, Vercel, Vercel Preview Comments e Smoke Preview.
- A validacao funcional da preview deve ser refeita apos o deploy do commit DuckDuckGo-only.

## Proximos passos

1. Aguardar checks remotos apos o commit documental desta nota.
2. Revalidar preview Scheffer `04.733.767/0001-80`:
   - 6 socios em `/api/cnpj`;
   - `/api/socio-search` usando DuckDuckGo-only;
   - CNPJ sem validacao oficial com `*`;
   - Mermaid com no tracejado para `unconfirmed`;
   - nenhum CNPJ inventado sem `*` como oficial.
3. Configurar `SUPABASE_SERVICE_ROLE_KEY` na Vercel Preview para cache persistente.
4. So considerar a PR pronta quando a preview confirmar comportamento de negocio, nao apenas checks verdes.
