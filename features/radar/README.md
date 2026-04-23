# Radar Feature Boundary

`features/radar/` is the canonical architectural boundary for future Radar work.

Current runtime ownership still lives in the existing modules:

- `hooks/useRadar.ts` for client state, persistence, and orchestration
- `services/radarService.ts` for the frontend service contract
- `components/RadarPanel.tsx`, `components/RadarSettings.tsx`, and `components/RadarBell.tsx` for UI delivery

This stub exists to close OI-044 by giving Radar an explicit destination before any new product work pushes more Radar behavior into `App.tsx`.

Near-term migration targets:

1. Move Radar-specific request/response shaping and orchestration behind this boundary.
2. Reexport stable feature contracts from here while `types.ts` remains the source of truth.
3. Shift UI-facing composition out of `App.tsx` and into dedicated Radar feature entrypoints when the next Radar slice is approved.
