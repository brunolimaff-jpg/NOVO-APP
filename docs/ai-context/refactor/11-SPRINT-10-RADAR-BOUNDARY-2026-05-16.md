# Sprint 10 — Radar Boundary Runtime

## Summary

Sprint 10 move o runtime do Radar para `features/radar/*` sem alterar comportamento funcional e sem quebrar os imports públicos existentes. Esta PR é uma fatia conservadora: fecha OI-054 para hook/service, mantém facades antigas e instala guardrail para impedir regressão.

## Estado confirmado

- Base limpa: `origin/main@66591f1`, após merge da PR `#256`.
- Branch: `codex/sprint-10-radar-boundary`.
- PR: `#257` — <https://github.com/brunolimaff-jpg/NOVO-APP/pull/257>.
- Preview Vercel: <https://scoutagro-git-codex-sprint-10-143bdc-brunolimaff-3629s-projects.vercel.app>.
- Workspace principal original continua com mudanças não commitadas em `refactor/code-quality`; Sprint 10 roda em worktree limpa.
- `types.ts` permanece fonte central dos contratos Radar.

## Escopo desta PR

| Bloco | Ação | Arquivos |
|---|---|---|
| Runtime | Mover hook para a feature | `features/radar/useRadar.ts` |
| Runtime | Mover service para a feature | `features/radar/service.ts` |
| Compat | Manter facade antiga do hook | `hooks/useRadar.ts` |
| Compat | Manter facade antiga do service | `services/radarService.ts` |
| Barrel | Exportar hook, service, tipos e constantes | `features/radar/index.ts` |
| App | Importar Radar pelo boundary | `App.tsx` |
| Guardrail | Bloquear novos imports legados em produção | `tests/architecture/radarBoundaryImportGuard.test.ts` |
| Docs | Atualizar handoff, board, arquitetura e memória | `HANDOFF_AI.md`, `.agents/memory/*`, `docs/ai-context/refactor/*` |
| Review | Resolver comentarios Gemini Code Assist | `features/radar/useRadar.ts`, `tests/hooks/useRadar.test.ts` |

## Fora de escopo

- Mover `components/RadarBell.tsx`, `components/RadarPanel.tsx` ou `components/RadarSettings.tsx`.
- Deletar `hooks/useRadar.ts` ou `services/radarService.ts`.
- Redesign do Radar.
- Mudanças em `/api/radar-scan`.
- Sweep global de `any`, `catch {}` ou `console.*`.
- Refactor de `LoadingSmart` ou `WarRoom` (Mini CRM/`CRMDetail` removido na Onda 0.5).

## Contrato de continuidade

- Novo código de produção deve importar de `features/radar`.
- Imports existentes pelos caminhos antigos continuam funcionando por compatibilidade.
- `tests/services/radarService.test.ts` continua validando a facade antiga.
- `tests/hooks/useRadar.test.ts` passa a validar o hook real via `features/radar`.
- `tests/architecture/radarBoundaryImportGuard.test.ts` impede novos imports de produção pelos caminhos legados.

## Test plan

Focados:

```bash
npm exec vitest run tests/hooks/useRadar.test.ts tests/services/radarService.test.ts tests/architecture/radarBoundaryImportGuard.test.ts
npm exec vitest run tests/components/chat/ChatPanels.test.tsx tests/components/EmptyStateHome.test.tsx
npm exec vitest run tests/App.layout.test.tsx tests/App.loadingVariant.test.tsx
```

Gates:

```bash
npm run typecheck
npm run test
npm run build
npm run lint
npm run analyze:circular
```

## Validação executada

- `npm exec vitest run tests/hooks/useRadar.test.ts tests/services/radarService.test.ts tests/App.layout.test.tsx tests/App.loadingVariant.test.tsx` green (`40` testes).
- Review comments do Gemini Code Assist resolvidos: manual `forceScan` com auto-scan desligado + `scoutDiag.error` para falhas.
- `npm exec vitest run tests/hooks/useRadar.test.ts tests/services/radarService.test.ts tests/architecture/radarBoundaryImportGuard.test.ts` green (`35` testes).
- `npm exec vitest run tests/components/chat/ChatPanels.test.tsx tests/components/EmptyStateHome.test.tsx` green (`11` testes).
- `npm exec vitest run tests/App.layout.test.tsx tests/App.loadingVariant.test.tsx` green (`7` testes).
- `npm run typecheck` green.
- `npm run test` green (`115` arquivos, `851` testes).
- `npm run build` green, com warnings aceitos OI-003/OI-057.
- `npm run lint` green com `0` erros e `147` warnings conhecidos.
- `npm run analyze:circular` green, sem ciclos.
- Checks remotos da PR `#257` green: AI Config Quality Score, Typecheck, Build, Tests, Dossier Golden, GitGuardian, Vercel e Vercel Preview Comments.

## Validação manual mínima

1. Abrir preview Vercel da PR.
2. Configurar Radar.
3. Forçar varredura.
4. Abrir painel e configurações.
5. Marcar alerta como lido.
6. Confirmar que Chat/Home seguem recebendo contexto do Radar.

## Próxima sequência

Depois desta PR:

1. Validar preview manualmente.
2. Mergear Sprint 10.
3. Iniciar Sprint 11 com testes de caracterização antes de mexer em `LoadingSmart` e `WarRoom`; Mini CRM/`CRMDetail` foi removido.
