# Superhuman Board - Teia CNPJ P0

Status: completed
Rollback point: `12fc6cb61f78836af6480ee191d933b86e0b7415`
Branch: `codex/cnpj-socios-todos-cnpjs`

## Project Conventions

- Package manager: npm (`package-lock.json`)
- Runtime: React 19 + TypeScript + Vite; app code is at repo root, not `src/`
- Tests: Vitest (`npm run test`, targeted `npm exec vitest run ...`)
- Lint/type/build: `npm run lint`, `npm run typecheck`, `npm run build`
- Vercel handlers: `api/*.ts`
- Prompt/parser gate: `./scripts/validate-prompts.sh`

## Intake

Problem: Teia CNPJ still renders too few CNPJs for Scheffer partners, shows invalid inferred company names such as `Cia Ltda`, and loops on superficial label fixes.

Success criteria:
- Render all valid CNPJs found for each root partner, including CNPJs without proven group link.
- Do not invent/truncate company names (`Cia Ltda` must be rejected or replaced by CNPJ fallback).
- Do not collapse `partner_other_cnpj` by CNPJ radical.
- Text parser, `/api/socio-search`, graph merge and UI evidence must preserve scope and partner ownership.
- Recent PRs from 2026-05-23/24 reviewed with findings table.

Constraints:
- Test-first for behavior changes.
- Do not revert unrelated user changes.
- Preview Scheffer `04.733.767/0001-80` is final validation.

## Task Graph

- SH-001 Map full Teia CNPJ data flow and recent PR risks - done
- SH-002 Add RED regression tests for multi-CNPJ profile extraction, invalid names and parser formats - done
- SH-003 Fix `/api/socio-search` multi-CNPJ extraction and fallback naming - done
- SH-004 Fix parser/graph merge gaps for partner-owned other CNPJs - done
- SH-005 Self code review and agent review - done
- SH-006 Requirements validation against Scheffer preview - done
- SH-007 Full project verification suite - done

## Findings Table

| ID | Source | Severity | Finding | Evidence | Status |
|---|---|---:|---|---|---|
| F-001 | Preview | P0 | Only 1-3 map nodes despite text claiming 32 CNPJs | user screenshots and Playwright smoke | confirmed |
| F-002 | Preview | P0 | Invalid company node `Cia Ltda` rendered | user screenshot | confirmed |
| F-003 | `/api/socio-search` | P0 | Page profile with many CNPJs only returns snippet/limited enriched subset | agent Ohm + code | confirmed |
| F-004 | `teiaTextParser` | P0 | Parser only accepts narrow `**Outros CNPJs:**` line format | agent Nash + code | confirmed |
| F-005 | `societaryGraph` | P1 | `buildCompanyKey` collapses all CNPJs by root radical, including partner_other_cnpj | agent Nash + code | confirmed |
| F-006 | Prompt/parser contract | P0 | Prompt allowed sampled CNPJ inventory (`10 mais relevantes`) while UI needs all parseable CNPJs | agent Boole + RED prompt test | fixed |
| F-007 | `/api/socio-search` | P1 | Official lookup name `Cia Ltda` could pass and then disappear in graph rejection | agent Boole + RED API test | fixed |
| F-008 | `/api/socio-search` + UI | P1 | Partial inventory was not visible when companies existed | agent Boole + RED API/UI tests | fixed |
| F-009 | Recent PR review | P2 | Tailwind content scan excludes `features/**/*`; possible visual-only risk for SocietaryMap classes | agent Boyle | documented |
| F-010 | Recent PR review | P2 | Feedback remote failures can be invisible to UI | agent Boyle | unrelated/documented |
| F-011 | Recent PR review | P2 | Migration/update notifications have cache/toast edge cases | agent Boyle | unrelated/documented |
| F-012 | Final review | P0 | Parser/graph still accepted invalid 14-digit CNPJ from Gemini/text | agent Maxwell | fixed |
| F-013 | Final review | P0 | `partner_other_cnpj` without confirmed partner could gain root edge | agent Maxwell | fixed |
| F-014 | Final review | P1 | Promotion to `group_link` did not consolidate later filial by radical | agent Maxwell | fixed |
| F-015 | Final review | P2 | Prompt still had residual `> 15 linhas` truncation instruction | agent Maxwell | fixed |

## Verification Notes

- RED confirmed: `CNPJ / Tipo` parser lost CNPJ before fix.
- RED confirmed: prompt contract still allowed sampled totals before fix.
- RED confirmed: API accepted official `Cia Ltda` before fix.
- RED confirmed: UI did not warn on truncated partner inventory before fix.
- Green targeted suite: `npm exec vitest run tests/api-socio-search.test.ts tests/features/dossier/societaryGraph.test.ts tests/features/dossier/SocietaryMap.test.tsx tests/features/dossier/teiaTextParser.test.ts tests/prompts/megaPrompts.test.ts` = 81 tests passed.
- Green prompt gate: `./scripts/validate-prompts.sh` = 54 tests passed.
- Green full suite: `npm run test` = 128 files, 1083 tests passed.
- Green typecheck: `npm run typecheck`.
- Green lint: `npm run lint` = 0 errors, 5 preexisting warnings.
- Green build: `npm run build` = success, existing large chunk warning.
- PR checks after push `0ba0910`: Typecheck, Tests, Dossier Golden, Build, GitGuardian, Vercel, Vercel Preview Comments and Smoke (preview) all green.
- Preview Scheffer validation after 5-minute wait: `/api/cnpj` returned `SCHEFFER & CIA LTDA`, Sapezal/MT and 6 QSA entries; `/api/socio-search` returned partner-owned CNPJs for all six partners checked.
- Browser preview validation: CNPJ `04.733.767/0001-80` completed lookup and generated dossier; `societary-map-shell` rendered with `Ver evidências (4)`, `Outro CNPJ do sócio` present, no standalone `Cia Ltda`, and no formatted root matriz/filial `04.733.767/0001-80`, `04.733.767/0023-96` or `04.733.767/0014-03` as related evidence.
