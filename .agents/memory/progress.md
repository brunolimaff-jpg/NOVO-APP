# Progress

Last updated: 2026-05-16

## Completed

- Sprints 1-8 concluida e mergeadas em `main`.
- Sprint 8 mergeada via PR `#241` em `origin/main` (`ccd2001518367961637b1a9488c2319aa83d0a21`).
- `services/war-room/*` ativo com fachada publica preservada.
- `features/radar/*` criado como boundary oficial inicial (stub).
- Kickoff documental da Fase 2 concluido:
  - criado `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
  - sincronizados `00-README.md`, `01-MASTER-PLAN.md`, `02-BOARD.md`, `03-OPEN-ITEMS.md`, `06-HANDOFF.md`, `07-SPRINT-LOG.md`
  - sincronizados `HANDOFF_AI.md`, `.agents/memory/*` e roadmap Obsidian
- PR `#243` (`fix/cnpj-proxy-fallback`) validada localmente em `2026-04-28`:
  - checkout sincronizado para `f059ff28e284accb0c2ca68c834b4992f9cfdcdd`
  - `vercel dev` ligado ao projeto `scoutagro`
  - `GET /api/cnpj?cnpj=04252011000110` retornou `200`
  - `GET /api/cnpj?cnpj=11111111111111` retornou `400`
  - `GET /api/comex?cnpj=04252011000110` retornou `200`
  - `npm exec vitest run tests/services/brasilApiService.test.ts` green
  - `npm exec vitest run tests/components/EmptyStateHome.test.tsx` green
- PR `#243` recebeu uma segunda rodada de diagnostico em `2026-04-28`:
  - logs estruturados adicionados ao cliente (`services/brasilApiService.ts`) e ao handler (`api/cnpj.ts`)
  - erros HTTP agora preservam `error/detail` do serverless no cliente
  - o caso `localhost` sem proxy agora gera orientacao explicita em UI e teste dedicado
  - `npm exec vitest run tests/services/brasilApiService.test.ts tests/components/EmptyStateHome.test.tsx` green (`16` testes)
  - `npm run typecheck` green
- Confirmado que `vite` puro nao e ambiente valido para diagnosticar `api/cnpj.ts` neste repo, porque `/api/cnpj` nao tem proxy de desenvolvimento e pode responder com o HTML da app.
- Skills operacionais locais removidas de `.agents/skills/` e migradas para `~/.agents/skills/` em `2026-05-05`.
- `.agents/skills/archive/` preservado no repo como camada de licoes aprendidas e referencia historica.
- `AGENTS.md`, `CLAUDE.md`, `HANDOFF_AI.md`, `docs/SKILLS-GOVERNANCE.md` e `skills-lock.json` alinhados para o novo modelo sem skills locais ativas e sem integracao externa obrigatoria.
- PR antiga `#252` (`codex/waves-1-2-3`) foi fechada sem merge em `2026-05-16`.
- Branch `codex/docs-rag-anti-hallucination` implementou uma PR pequena de anti-alucinacao do Docs RAG:
  - `api/docs-rag.ts` elevou score minimo para `0.60`
  - contextos vazios/fracos agora retornam sinal explicito de ausencia de documentacao
  - matches sem texto indexado nao sao promovidos a evidencia textual
  - `tests/api-docs-rag.test.ts` adiciona cobertura dedicada do endpoint
  - `utils/webVerification.ts` recebeu limpeza minima de lint preexistente para gate verde

## In progress

- Publicacao da PR `codex/docs-rag-anti-hallucination`.
- Preparacao da Sprint 9 (App shell decoupling + governanca).

## Blockers

- Nenhum bloqueio tecnico imediato.
- Risco residual conhecido fora do escopo da PR `#243`: `components/CRMDetail.tsx` ainda depende de chamada direta para `BrasilAPI`.
- Risco residual de governanca: documentos historicos em `docs/archive/environment-curation-2026-04/` continuam citando o modelo antigo de skills locais por valor historico.
- Risco residual fora do escopo da PR Docs RAG: ainda nao ha extractor server-side seguro de URL/PDF; qualquer implementacao futura precisa tratar SSRF antes de buscar URLs remotas.

## Validation history

### Sprint 8 (done, merged)

- focused War Room/Radar suites: green em `2026-04-23`
- `npm run test`: green (`102` arquivos, `785` testes)
- `npm run typecheck`: green
- `npm run build`: green (warning aceito em `utils/idbStorage.ts`)
- `npm run lint`: green (`0` erros, warnings em backlog)
- validacao manual preview/Vercel: aceita em `2026-04-23`

### Baseline warnings still open

- OI-003: chunk warning em `utils/idbStorage.ts`
- OI-004: warning `SessionsSidebar` em teste
- OI-005: backlog de lint warnings

## Important refs

- `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/06-HANDOFF.md`
- `HANDOFF_AI.md`

## Next checkpoint

- Abrir Sprint 9 mantendo APIs publicas congeladas e sem incluir `mcp-server/`.
- Se o bug de CNPJ persistir apos o push desta rodada, coletar no preview a linha `🦅 [Scout360][CnpjLookup]` no console do browser e o par `request:start/request:error` de `api/cnpj.ts` na Vercel antes de mexer nos provedores.
- Se desejado, fazer uma segunda passada para limpar referencias historicas antigas em `docs/archive/environment-curation-2026-04/` sem perder o contexto de licoes aprendidas.

## Incremental update (2026-05-05)

- `services/geminiProxy.ts`: adicionada `sanitizeProxyErrorBody` para reduzir payload de erro e detectar HTML/Checkpoint em 403.
- Resultado esperado: o usuário não recebe blob HTML gigante na UI, apenas erro curto e rastreável.
- Validação: `npm run typecheck` green.

## Incremental update (2026-05-16)

- `api/docs-rag.ts`: adicionados `DOCS_RAG_SCORE_MIN = 0.60` e sinal explicito `SEM DOCUMENTAÇÃO ENCONTRADA`.
- `tests/api-docs-rag.test.ts`: 8 testes novos cobrindo metodo, validacao, score minimo, contexto textual, URL-only e namespace invalido.
- `utils/webVerification.ts`: removida atribuicao inutil que fazia `npm run lint` falhar no baseline.
- Validacao:
  - `npm exec vitest run tests/api-docs-rag.test.ts tests/services/ragService.test.ts` green (`12` testes)
  - `npm run typecheck` green
  - `npm run test` green (`111` arquivos, `844` testes)
  - `npm run build` green (warning aceito de chunking em `utils/idbStorage.ts`)
  - `npm run lint` green com warnings conhecidos (`0` erros)
