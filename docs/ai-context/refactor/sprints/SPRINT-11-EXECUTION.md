# Sprint 11 — Execução Atualizada

**Objetivo atualizado:** estabilizar o runtime local, remover o Mini CRM local por decisão de produto, limpar planos duplicados/stale e seguir a redução de complexidade em `LoadingSmart` e `WarRoom`.

**Branch principal:** branches curtas `codex/sprint-11-*` derivadas do baseline mais recente.
**Status:** concluída. Onda 0, Onda 0.5, Onda 1A, Onda 1B e Onda 1C foram mergeadas.

> Decisão de produto: o Mini CRM local não será usado. Remover `CRMDetail`, `CRMView`, `CRMPipeline`, `CRMContext` e contratos relacionados. Preservar referências ao **CRM interno Senior** em prompts, evidências, fixtures e dossiês.

---

## Onda 0 — Testes de caracterização concluída

- PR `#258` adicionou cobertura para `CRMDetail` e `WarRoom` antes da decisão de remover Mini CRM.
- A cobertura de `CRMDetail` deixa de ser requisito porque o componente foi removido na Onda 0.5.
- A cobertura de `WarRoom` segue como rede para a próxima refatoração.

## Onda 0.5 — Correções locais + remoção Mini CRM

**Status:** concluída via PR `#259`.

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

## Onda 1A — Saneamento documental sem código de runtime

**Status:** concluída na branch de trabalho.

**Objetivo:** eliminar duplicação entre planos em aberto antes de tocar nos componentes grandes.

### Mudanças

- Atualizar `02-BOARD.md` como status vivo da Sprint 11 pós-PR `#259`.
- Atualizar `03-OPEN-ITEMS.md` para refletir que `WarRoom` já tem teste de caracterização.
- Atualizar `06-HANDOFF.md`, `HANDOFF_AI.md` e `.agents/memory/*` para apontarem o próximo passo real.
- Atualizar `sprints/00-INDEX.md` e roadmap Obsidian para não manter Sprint 8/10 como sprint atual.
- Marcar menções antigas a `CRMDetail` como histórico/superseded, nunca como próximo trabalho.

### Aceite

- `CRMDetail`, `CRMProvider`, `useCRM`, `CRMView` e `CRMPipeline` aparecem em docs/memória apenas como histórico/removido.
- `LoadingSmart` e `WarRoom` aparecem como próximos alvos em PRs separados.
- Nenhum código de runtime é alterado nesta onda.

## Onda 1B — LoadingSmart

**Status:** concluída e mergeada via PR `#260`.

- Refatorar `components/LoadingSmart.tsx` preservando comportamento visual já coberto por `tests/components/LoadingSmart.test.tsx`.
- Separar modelo/timeline/render em módulos menores.
- Manter `components/LoadingSmart.tsx` como fachada de compatibilidade.
- Helper puro de timeline/progresso criado em `utils/loadingSmartViewModel.ts` com teste dedicado.
- Bruno validou a PR `#260` e liberou seguir para `WarRoom`.

## Onda 1C — WarRoom

**Status:** concluída e mergeada via PR `#261`.

- Reduzir `components/WarRoom.tsx` usando a cobertura de caracterização já criada.
- Extrair blocos visuais e tipos locais sem alterar `services/warRoomService.ts`.
- Manter props públicas: `isOpen`, `onClose`, `isDarkMode`, `defaultCompetitorTarget`.
- Avaliar hook local de sessão somente depois da extração de UI estática.
- `components/WarRoom.tsx` reduzido de `552` para `283` linhas.
- Extraídos `config`, `theme`, `types`, `WarRoomSidebar`, `WarRoomHeader`, `WarRoomEmptyState`, `WarRoomComposer`, `WarRoomMessages`, `WarRoomModelMessage` e `WarRoomSources` em `components/war-room/*`.
- Review comments do Gemini resolvidos antes do merge.
- Smoke Preview resolvido com simplificação do header de bypass em `scripts/smoke-preview.mjs`.
- Lição aprendida: o erro do check GitHub veio de excesso de header no bypass Vercel. Para smoke em Actions, não usar `x-vercel-set-bypass-cookie`; mandar somente `x-vercel-protection-bypass`.
- Gates da fatia: `tests/components/WarRoom.test.tsx`, `typecheck`, `build`, `lint -- --quiet`, `test`, `analyze:circular` e checks remotos verdes.

## Onda 3 — Tipagem e hardening final

- Eliminar `any` críticos restantes em produção que não dependiam do Mini CRM.
- Atualizar `03-OPEN-ITEMS.md`, `04-ARCHITECTURE-TARGET.md`, `HANDOFF_AI.md` e memória local.
- Rodar gates completos: `npm run test`, `npm run typecheck`, `npm run build`, `npm run lint`.
