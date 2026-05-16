# Handoff Tecnico - Fonte Canonica

Use este arquivo como ponto de entrada rapido para qualquer nova IA trabalhando neste repositorio.

## Ordem de leitura

1. `AGENTS.md`
2. `.agents/memory/activeContext.md`
3. `.agents/memory/progress.md`
4. `.agents/memory/decisions.md`
5. `docs/SKILLS-GOVERNANCE.md`
6. `docs/ai-context/refactor/00-README.md`
7. `docs/ai-context/refactor/01-MASTER-PLAN.md`
8. `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
9. `docs/ai-context/refactor/02-BOARD.md`
10. `docs/ai-context/refactor/03-OPEN-ITEMS.md`
11. `docs/ai-context/refactor/06-HANDOFF.md`
12. `docs/obsidian/00-MASTER.md` para navegacao visual (nao substitui as fontes canonicas acima)

## Contexto minimo estavel

- Projeto: **Senior Scout 360**
- Stack: React 19 + TypeScript + Vite + Tailwind + Gemini + Pinecone
- Auth: local-only via `contexts/OperatorContext.tsx`
- Runtime real para validacao manual: Vercel
- Integracao externa padrao de IA: nenhuma obrigatoria no repo

## Estado arquitetural (baseline atual)

> Atualizado em 2026-05-16 — branch local `codex/docs-rag-anti-hallucination` a partir de `origin/main` `b2c67db`.

- `services/geminiService.ts` segue como fachada publica com internals em `services/gemini/*`.
- `services/warRoomService.ts` segue como fachada publica com internals em `services/war-room/*`.
- `features/chat/*` e `features/dossier/*` concentram os fluxos extraidos de `App.tsx`.
- **Leak ativo:** `features/dossier/*` importa internos de `features/chat/*` (4 imports em `waterfall-orchestrator`, `porta-reconciliation`, `benchmark-stage`) — resolver em Sprint 9.
- `features/radar/*` existe como boundary oficial (stub); runtime atual ainda passa por `hooks/useRadar.ts` e `services/radarService.ts`.
- `types.ts` permanece centralizado.
- `hooks/useChat.ts` foi removido e protegido por `tests/architecture/useChatImportGuard.test.ts`.
- **Risco latente:** `VITE_PINECONE_API_KEY` referenciado em `index.tsx` — pode vazar no bundle Vite se preenchido em `.env` — resolver em Sprint 9.
- Docs RAG anti-alucinacao em PR pequena: `api/docs-rag.ts` agora sinaliza ausencia de documentacao forte/textual em vez de devolver contexto vazio ou URL-only como evidencia.
- PR aberta: `#253` <https://github.com/brunolimaff-jpg/NOVO-APP/pull/253>, commit `df2f232`, checks remotos verdes e `mergeStateStatus: CLEAN`.

## Programa de refatoracao

- Fase 1 (Sprints 1–8): concluída em `main` (PR #241, `ccd2001`).
- Fase 2 (Sprints 9–12): em andamento.
  - Plano estratégico: `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
  - Especificação detalhada (com auditoria e correções): `docs/ai-context/refactor/PLANO_COMPLETO_SPRINTS.md`
  - Riscos e hotspots: `docs/ai-context/refactor/03-OPEN-ITEMS.md` (OI-050 a OI-062)

## Hotspots atuais da Fase 2

| Arquivo | Linhas (atual) | Sprint alvo |
|---|---|---|
| `App.tsx` | 772, 46 imports | Sprint 9 |
| `components/CRMDetail.tsx` | 717 + `card: any` + sem testes | Sprint 11 |
| `components/LoadingSmart.tsx` | 766 | Sprint 11 |
| `components/WarRoom.tsx` | 552 + sem testes | Sprint 11 |
| `hooks/useRadar.ts` + `services/radarService.ts` | 291 + 234 (fora do boundary) | Sprint 10 |

## Entrega em curso (2026-05-16)

- Branch: `codex/docs-rag-anti-hallucination`
- Escopo: anti-alucinacao do `api/docs-rag.ts` sem extractor de URL/PDF e sem lazy-loading de prompts.
- Mudancas:
  - score minimo Docs RAG `0.60`
  - sinal explicito `SEM DOCUMENTAÇÃO ENCONTRADA`
  - matches sem texto indexado nao sao promovidos a evidencia textual
  - cobertura nova em `tests/api-docs-rag.test.ts`
  - limpeza minima de lint em `utils/webVerification.ts`
- Validacao local:
  - `npm exec vitest run tests/api-docs-rag.test.ts tests/services/ragService.test.ts`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
  - `npm run lint`
- Validacao manual em Vercel preview autenticada pelo Chrome:
  - CNPJ `04.733.767/0001-80` validou como `SCHEFFER & CIA LTDA`, `Sapezal/MT`.
  - Dossie real completou com score `73/100`, `Cliente Senior confirmado`, grupo `GRUPO SCHEFFER`, `74` modulos.

## Riscos residuais imediatos

- Ainda nao ha extractor server-side seguro de URL/PDF para Docs RAG; nao implementar sem protecao SSRF.
- `VITE_PINECONE_API_KEY` em `index.tsx` segue pendente.
- Warnings de lint e build seguem como backlog aceito, embora `npm run lint` agora saia com `0` erros.

## Governance de Handoff

Ao encerrar cada sprint, atualizar este arquivo com:
- Estado arquitetural atualizado (números corretos de hotspots).
- Decisões pendentes ou débito intencional aceito.
- Próximo passo seguro para a sprint seguinte.

## Regras de continuidade

- Preservar APIs publicas congeladas:
  - `services/geminiService.ts`
  - `services/warRoomService.ts`
  - `components/ChatInterface.tsx`
  - `constants.ts`
  - `prompts/megaPrompts.ts`
  - `types.ts`
- Nao incluir `mcp-server/` no escopo sem repriorizacao explicita.
- Em qualquer sprint, bloquear promocao com gate vermelho (`test`, `typecheck`, `build`, `lint`).
