# Radar Feature Boundary

`features/radar/` is the canonical architectural boundary for Radar runtime work.

Runtime ownership lives here as of Sprint 10:

- `features/radar/useRadar.ts` owns client state, persistence, and scan orchestration.
- `features/radar/service.ts` owns the frontend `/api/radar-scan` service contract.
- `features/radar/types.ts` reexports the stable contracts and constants from root `types.ts`.
- `features/radar/index.ts` is the public feature barrel for new production imports.

Compatibility facades remain intentionally available:

- `hooks/useRadar.ts`
- `services/radarService.ts`

Those facades preserve existing public imports while new production code imports Radar through `features/radar`. The guardrail lives in `tests/architecture/radarBoundaryImportGuard.test.ts`.

Still out of this runtime slice:

1. Moving `components/RadarPanel.tsx`, `components/RadarSettings.tsx`, and `components/RadarBell.tsx`.
2. Deleting the compatibility facades.
3. Splitting `types.ts`; it remains the source of truth until there is clear ROI.
