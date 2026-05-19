# Sprint 11 — Execução Atualizada

**Objetivo atualizado:** estabilizar o runtime local, remover o Mini CRM local por decisão de produto e seguir a redução de complexidade em `LoadingSmart` e `WarRoom`.

**Branch principal:** `refactor/sprint-11` ou branch de trabalho equivalente derivada de `main` após Sprint 10.
**Status:** Onda 0 concluída/mergeada; Onda 0.5 em execução.

> Decisão de produto: o Mini CRM local não será usado. Remover `CRMDetail`, `CRMView`, `CRMPipeline`, `CRMContext` e contratos relacionados. Preservar referências ao **CRM interno Senior** em prompts, evidências, fixtures e dossiês.

---

## Onda 0 — Testes de caracterização concluída

- PR `#258` adicionou cobertura para `CRMDetail` e `WarRoom` antes da decisão de remover Mini CRM.
- A cobertura de `CRMDetail` deixa de ser requisito porque o componente foi removido na Onda 0.5.
- A cobertura de `WarRoom` segue como rede para a próxima refatoração.

## Onda 0.5 — Correções locais + remoção Mini CRM

**Risco:** médio, porque remove uma feature inteira e simplifica contratos globais.

### Mudanças

- Completar proxy local Vite para rotas serverless usadas pelo app, incluindo `/api/open-web-search`, `/api/link-status`, `/api/extract-content`, `/api/rag` e `/api/docs-rag`.
- Criar guardrail de teste para a lista de proxies locais.
- Remover Mini CRM local do runtime:
  - `CRMProvider`/`useCRM`;
  - `CRMView`, `CRMDetail`, `CRMPipeline`;
  - botões e props `onSaveToCRM`, `onOpenKanban`, `canAccessMiniCRM`;
  - tipos locais `CRMCard`, `CRMStage`, `DealHealth`, `CRMPipelineProps`;
  - testes dedicados ao Mini CRM.
- Remover Revenue Intelligence local acoplada ao Mini CRM (`RevenueIntelligence`, `revenueService` e testes), sem alterar evidências comerciais do CRM interno Senior.
- Atualizar docs/memória para impedir que futuras sessões reintroduzam a refatoração de `CRMDetail`.

### Aceite

- `rg "CRMDetail|CRMProvider|useCRM|CRMView|CRMPipeline|miniCRM|canAccessMiniCRM|onSaveToCRM|onOpenKanban"` não retorna ocorrências em código/testes ativos.
- `npm run typecheck` verde.
- Testes focados de loading/proxy/chat/sidebar verdes.
- `/api/open-web-search` não retorna `404` no dev server local.

## Onda 1 — LoadingSmart

- Refatorar `components/LoadingSmart.tsx` preservando comportamento visual já coberto por `tests/components/LoadingSmart.test.tsx`.
- Separar modelo/timeline/render em módulos menores.
- Manter `components/LoadingSmart.tsx` como fachada de compatibilidade.

## Onda 2 — WarRoom

- Reduzir `components/WarRoom.tsx` usando a cobertura de caracterização já criada.
- Extrair blocos visuais e tipos locais sem alterar `services/warRoomService.ts`.

## Onda 3 — Tipagem e hardening final

- Eliminar `any` críticos restantes em produção que não dependiam do Mini CRM.
- Atualizar `03-OPEN-ITEMS.md`, `04-ARCHITECTURE-TARGET.md`, `HANDOFF_AI.md` e memória local.
- Rodar gates completos: `npm run test`, `npm run typecheck`, `npm run build`, `npm run lint`.
