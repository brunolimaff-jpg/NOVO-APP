# Decisions

Last updated: 2026-05-19

## 2026-04-14 - Repo-local memory v1

Decision: use repo-local Markdown files under `.agents/memory/` for persistent memory.

Reason: this is simple, inspectable, versionable, and works in Codex without requiring a database, MCP server, or global user profile state.

## 2026-04-14 - `plan-work` as default planning skill

Decision: install and prefer `plan-work` for implementation plans.

Reason: it is lightweight, Codex-oriented, and forces repo research, option analysis, Q&A, and a concrete implementation plan before edits.

## 2026-04-14 - Handoff hierarchy

Decision: `HANDOFF_AI.md` remains the canonical quick-entry handoff. `.agents/memory/*` is the short cross-session memory layer. The refactor program status remains canonical in `docs/ai-context/refactor/02-BOARD.md`, with risks in `03-OPEN-ITEMS.md` and next safe step in `06-HANDOFF.md`.

Reason: this avoids depending on chat memory while preserving the dedicated refactor board as the live source of truth.

## 2026-04-15 - Sprint 4 store strategy

Decision: Sprint 4 will introduce `stores/*` using `Context + Reducer` typed state instead of adding `zustand`.

Reason: the repo does not currently depend on `zustand`, the Sprint 4 goal is structural extraction rather than state-library rollout, and `Context + Reducer` keeps the state boundary explicit without mixing a new dependency into the dossier refactor.

## 2026-04-19 - Obsidian repo graph as versioned navigation layer

Decision: add `docs/obsidian/` as a versioned Obsidian graph layer for architecture + roadmap, with `docs/obsidian/00-MASTER.md` as the entrypoint and `scripts/obsidian/check.mjs` as the local contract check.

Reason: this gives AI-led workflows and human reviewers a durable visual map of the repo while keeping canonical live status in `HANDOFF_AI.md`, `.agents/memory/*`, and `docs/ai-context/refactor/*` instead of duplicating authority into the graph layer.

## 2026-04-22 - Defer `mcp-server/` until after the sprint program

Decision: keep `mcp-server/` explicitly out of scope for Sprints 6-8, and do not surface it as a blocker, review target, or PR scope item during the remaining refactor track unless the user reprioritizes it.

Reason: the current priority is to finish the planned structural refactor first; `mcp-server/` is not shipping now and should not contaminate the active sprint branches.

## 2026-04-22 - Senior product links source of truth

Decision: `utils/seniorLinks.ts` is the source of truth for `SENIOR_PRODUCT_URLS` and `findSeniorProductUrl`; `services/apiConfig.ts` only reexports them for backward compatibility.

Reason: product URL matching is link-fixing utility behavior, not API endpoint configuration. Keeping one map removes duplication while preserving the public `services/apiConfig.ts` contract.

## 2026-04-23 - Start Phase 2 maintainability track

Decision: close Fase 1 (Sprints 1-8) after merge of PR `#241` and open a new documentary baseline for Sprints 9-12 in `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`.

Reason: the original refactor program reached its planned structural boundaries; next work needs a new hotspot-driven track focused on maintainability without breaking stable public facades.

## 2026-04-23 - Freeze public facades for Sprints 9-12

Decision: keep `services/geminiService.ts`, `services/warRoomService.ts`, `components/ChatInterface.tsx`, `constants.ts`, `prompts/megaPrompts.ts`, and `types.ts` as stable public contracts throughout Fase 2.

Reason: limiting API churn reduces integration risk and allows incremental refactors focused on internal coupling and code ownership boundaries.

## 2026-04-28 - `api/cnpj.ts` must be validated in serverless runtime

Decision: validate the CNPJ proxy flow with `vercel dev` or a deployed serverless environment, not with plain `vite`.

Reason: in this repo the frontend dev server does not proxy `/api/cnpj`, so `npm run dev` can return the app HTML for that path and create a false "consulta indisponivel" diagnosis unrelated to the proxy handler itself.

## 2026-04-28 - Localhost CNPJ flow should fail loudly, not generically

Decision: when `localhost` receives the app HTML instead of JSON for `/api/cnpj`, surface an explicit local-proxy guidance message in logs and UI instead of treating it as generic service downtime.

Reason: the recurring symptom was a misleading "Serviço de consulta indisponível" message. Distinguishing "missing local proxy/runtime" from true provider failure reduces wasted debugging on preview/Vercel and external APIs.

## 2026-05-05 - Repo sem skills locais ativas

Decision: remover as skills operacionais versionadas em `.agents/skills/` do repo e mantê-las apenas no ambiente global do usuário em `~/.agents/skills/`, preservando apenas `.agents/skills/archive/` como referência histórica.

Reason: separar o ambiente operacional do conteúdo versionado reduz acoplamento com o repositório, tira essas skills do escopo do GitHub e preserva as lições aprendidas já documentadas.

## 2026-05-16 - Pinecone frontend env aceito para app interno

Decision: manter `VITE_PINECONE_API_KEY` e `VITE_PINECONE_INDEX_HOST` no frontend durante a Sprint 9.

Reason: o owner confirmou que o app é interno/fechado e aceitou o risco operacional. OI-055 passa a ser risco aceito e deve ser reavaliado se o app virar externo.

## 2026-05-16 - LastAction movido para types.ts

Decision: mover tipo `LastAction` de `features/chat/message-orchestrator.ts` para `types.ts` para eliminar dependência circular com `stores/chatStore.tsx`.

Reason: `chatStore` importa `LastAction` de `message-orchestrator`, e `message-orchestrator` importa `useMaybeChatStore` de `chatStore`, criando ciclo detectável por `madge`. Mover o tipo compartilhado para `types.ts` segue o padrão do repo onde `types.ts` é a fonte centralizada de contratos.

## 2026-05-16 - Review com agente especializado antes de PR

Decision: toda PR da Sprint 9+ deve passar por review com agente `reviewer` antes do commit final.

Reason: a review encontrou 2 P1 e 4 P2 que teriam ido para a PR sem detecção. O custo de rodar o reviewer é baixo comparado ao risco de merge com issues de segurança ou arquiteturais.

## 2026-05-16 - Onda 0+1 antes da Sprint 10

Decision: executar uma ponte curta `refactor/wave-0-1-cleanup` antes de abrir a Sprint 10.

Reason: a PR `#254` já estava mergeada em `main`, mas os docs/memórias ainda tratavam Sprint 9 como aberta. A mesma investigação encontrou dois ajustes pequenos e seguros para fazer antes do Radar: corrigir o hold parcial de PORTA e trocar logs cliente sensíveis por `scoutDiag`. Escopos maiores (`Radar`, componentes grandes, PWA, performance) ficam fora desta onda para preservar revisão pequena.

## 2026-05-16 - Sprint 10 preserva facades Radar

Decision: mover o runtime do Radar para `features/radar/*`, mas manter `hooks/useRadar.ts` e `services/radarService.ts` como facades de compatibilidade nesta PR.

Reason: a Sprint 10 é uma mudança de boundary, não redesign funcional. Preservar os caminhos públicos reduz risco para consumidores existentes, enquanto `tests/architecture/radarBoundaryImportGuard.test.ts` impede novos imports de produção pelos caminhos legados.

## 2026-05-19 - Mini CRM local removido

Decision: remover completamente o Mini CRM local do app (`CRMProvider`, `CRMView`, `CRMDetail`, `CRMPipeline`, contratos, tipos e testes dedicados) e retirar `CRMDetail` da trilha de refatoração da Sprint 11.

Reason: o owner confirmou que o Mini CRM não é usado e não será usado. Remover a feature reduz superfície de manutenção e elimina um hotspot grande sem investir em refatoração de algo sem valor de produto.

Constraint: preservar referências ao CRM interno Senior em prompts, evidências, fixtures e dossiês, pois elas representam fonte comercial de inteligência e não a feature Mini CRM local.

## 2026-05-19 - Vite dev deve proxiar rotas serverless usadas pelo app

Decision: centralizar as rotas de proxy local em `config/localDevApiProxy.ts` e incluir `/api/open-web-search`, `/api/link-status`, `/api/extract-content`, `/api/rag` e `/api/docs-rag` além das rotas já existentes.

Reason: o Vercel é o runtime real, mas `npm run dev` precisa evitar falsos 404 para rotas serverless usadas pelo frontend e pelo fluxo de investigação.

## 2026-05-19 - Modelo canônico enxuto para planos em aberto

Decision: manter `02-BOARD.md` como status vivo, `03-OPEN-ITEMS.md` como fila de riscos/OIs, `sprints/SPRINT-11-EXECUTION.md` como plano executável da Sprint 11, e tratar `docs/obsidian/*` como navegação visual, não fonte de verdade.

Reason: após a PR `#259`, havia duplicação entre handoffs, board, índice de sprints e roadmap Obsidian, com referências antigas a Sprint 8/10 e `CRMDetail`. O modelo enxuto reduz retrabalho e impede que agentes escolham um plano stale como próximo passo.
