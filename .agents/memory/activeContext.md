# Active Context

**Last updated:** 2026-06-25 — Auditoria P0 + Validacao Cruzada + Config Caveman

## STATUS ATUAL: PRE-FASE 0 — Plano de correcao P0 aprovado + Caveman ajustado

PR #386 (Pipeline Hibrido LiteLLM) merged na main. PR #387 (teste code review) fechada. Auditoria externa analisada e validada contra codigo real — 5 divergencias encontradas (auditor usou base errada). Plano de execucao revisado e aprovado pelo reviewer. Caveman: nivel ajustado full→lite + regra de proximos passos no CLAUDE.md.

## P0 Bug confirmado: UI congela apos waterfall

Dossie 83KB gerado com sucesso mas UI fica congelada em loading permanentemente. Causa: render sincrono de markdown bloqueia main thread, `tryDispatchCofreReady` nunca dispara, `generationKind` preso em 'dossier'.

## HEAD

- Branch: `feat/litellm-experiment`
- Merge PR #386: `6aa22339` na main
- PR #387: FECHADA (era duplicata de teste)
- Working tree: 18 arquivos nao commitados

## Arquivos de auditoria (externos)

- `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/RELATORIO_AUDITORIA_NOVO_APP.md` (88KB)
- `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/INCIDENTE_P0_UI_PRESA.md` (52KB)
- `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/TESTE_PREVIEW_P0.md` (38KB)
- `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/p0-evidence/` (6 screenshots + console)

## Proximos passos (Fase 0)

| #   | Prioridade | Tarefa                                             |
| --- | ---------- | -------------------------------------------------- |
| 1   | P0         | Fase 0: 11 testes failing-first (zero codigo prod) |
| 2   | P0         | Fase 0.5: 4 patches cirurgicos (5 arquivos)        |
| 3   | P0         | Fase 1: Blindagem — corrigir P0-2 a P0-6           |
| 4   | P1         | Fase 2: Extracao responsabilidades baixo risco     |
| 5   | P1         | Fase 3: Quebra god components                      |
