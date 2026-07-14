# Handoff — Fase 3B.3C.1 (Pilot readiness alcançável no macOS)

> **Atualizado:** 2026-07-14
> **Branch:** `fix/fase-3b3c1-live-readiness-macos`
> **Baseline main:** `636c3d4e` (squash PR #430 — Fase 3B.3C)
> **Próxima etapa:** instalar DCG + hook + atestação → `check-pilot-readiness` → só então piloto real

## Estado

| Fase    | Status                         | Entrega                                              |
| ------- | ------------------------------ | ---------------------------------------------------- |
| 3B.3C   | **MERGED** `#430` → `636c3d4e` | planejado×observado + piloto preparado               |
| 3B.3C.1 | **em andamento**               | asset≠binary checksum + hook live + atestação humana |

## Correções desta fatia

1. Preflight compara SHA do **binário** (`binary_checksums_esperados`), nunca do tar.xz.
2. Hash do binário arm64 com proveniência oficial documentada.
3. Hook live verificado por `dcg_codex_hook_verifier` (DCG direto; guardian pode coexistir).
4. Trust via atestação humana fora do repo (`TRUST_DCG_HOOK`, ≤30 dias).
5. `check-pilot-readiness.rb` — somente leitura.

## Não fazer

- Instalar DCG / editar `~/.codex/hooks.json` nesta PR
- Codex real / piloto real / `AGENT_RUNTIME_*=1`
- Fase 3C / merge sem **MERGE**
