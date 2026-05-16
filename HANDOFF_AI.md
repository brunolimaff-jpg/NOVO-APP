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

> Atualizado em 2026-05-16 — PR `#254` aberto a partir de `origin/main` `df1ca1e`.

- `services/geminiService.ts` segue como fachada publica com internals em `services/gemini/*`.
- `services/warRoomService.ts` segue como fachada publica com internals em `services/war-room/*`.
- `services/exportService.ts` criado na Sprint 9 com export/email logic extraida de App.tsx.
- `features/chat/*` e `features/dossier/*` concentram os fluxos extraidos de `App.tsx`.
- Leak `features/dossier/*` → `features/chat/*` removido na Sprint 9; helpers compartilhados vivem em `utils/*`.
- Dependência circular `chatStore ↔ message-orchestrator` resolvida: `LastAction` movido para `types.ts`.
- `features/radar/*` existe como boundary oficial (stub); runtime atual ainda passa por `hooks/useRadar.ts` e `services/radarService.ts`.
- `types.ts` permanece centralizado (agora inclui `LastAction`).
- `hooks/useChat.ts` foi removido e protegido por `tests/architecture/useChatImportGuard.test.ts`.
- `VITE_PINECONE_*` no frontend e risco aceito pelo owner para app interno/fechado; reavaliar se o app virar externo.
- Docs RAG anti-alucinacao mergeado via PR `#253` (`df1ca1e`).

## Programa de refatoracao

- Fase 1 (Sprints 1–8): concluída em `main` (PR #241, `ccd2001`).
- Fase 2 (Sprints 9–12): em andamento.
  - Plano estratégico: `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
  - Especificação detalhada (com auditoria e correções): `docs/ai-context/refactor/PLANO_COMPLETO_SPRINTS.md`
  - Riscos e hotspots: `docs/ai-context/refactor/03-OPEN-ITEMS.md` (OI-050 a OI-062)

## Hotspots atuais da Fase 2

| Arquivo | Linhas (atual) | Sprint alvo |
|---|---|---|
| `App.tsx` | 622 | Sprint 9 |
| `components/CRMDetail.tsx` | 717 + `card: any` + sem testes | Sprint 11 |
| `components/LoadingSmart.tsx` | 766 | Sprint 11 |
| `components/WarRoom.tsx` | 552 + sem testes | Sprint 11 |
| `hooks/useRadar.ts` + `services/radarService.ts` | 291 + 234 (fora do boundary) | Sprint 10 |

## Entrega em curso (2026-05-16)

- Branch: `refactor/sprint-9`
- PR: `#254` (<https://github.com/brunolimaff-jpg/NOVO-APP/pull/254>)
- Commit: `d88311a`
- Escopo: App shell decoupling + governanca + fixes de review.
- Mudancas:
  - `madge`/`ts-prune` adicionados com baseline de 1 ciclo
  - OI-055 reclassificado como risco aceito
  - leak `dossier → chat` removido
  - `utils/featureFlags.ts` criado e documentado em `ARQUITETURA.md`
  - wiring de EmailModal/FollowUpModal extraido para hooks
  - export/email movido para `services/exportService.ts`
  - **Fix P1**: dependência circular `chatStore ↔ message-orchestrator` resolvida (`LastAction` → `types.ts`)
  - **Fix P1**: error handling com timeout 30s em `sendDossierEmail`
  - **Fix P2**: validação de email com regex em `useEmailModal`
  - **Fix P2**: null checks em `openDossierPrintReport`
  - **Fix P2**: `useUpdateNotification` usa `scoutDiag` em vez de `console.warn`
- Validacao local:
  - `npm run test` green (`114` arquivos, `854` testes)
  - `npm run typecheck` green
  - `npm run build` green (warning aceito OI-003)
  - `npm run lint` green com `0` erros e `160` warnings conhecidos
  - `npm run analyze:circular` registrou 1 ciclo existente
- Validacao manual local:
  - Playwright em `http://127.0.0.1:3000/`
  - tela inicial carregou, operador `Bruno QA` foi salvo, home principal abriu
  - sem `console.error` e sem `pageerror`
- Review por agente especializado: 0 P0, 2 P1 (corrigidos), 4 P2 (corrigidos), 4 P3 (backlog)

## Riscos residuais imediatos

- Ainda nao ha extractor server-side seguro de URL/PDF para Docs RAG; nao implementar sem protecao SSRF.
- `VITE_PINECONE_*` permanece por decisao operacional em app interno/fechado.
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
