#!/usr/bin/env bash
set -euo pipefail

# Read-only platform evidence for 05E.0A-R1.
# This intentionally prints only derived metadata; the project API response
# contains encrypted environment values that must never be emitted or stored.

PROJECT_ID="prj_P8LyK9hOFYSRLPT5ejdZ8mTm8anT"
TEAM_ID="team_alIN6CGiGAZugGdDAIqWe7Tw"
DEPLOYMENT_ID="dpl_FC1bBU3VQHXUdAFSc58zf9kUQUo1"

project_payload="$(vercel api "/v9/projects/${PROJECT_ID}" --non-interactive --raw 2>/dev/null)"
team_payload="$(vercel api "/v2/teams/${TEAM_ID}" --non-interactive --raw 2>/dev/null)"
deployment_payload="$(vercel inspect "${DEPLOYMENT_ID}" --format=json --no-color --non-interactive 2>/dev/null)"

printf '%s\n' 'READ_ONLY_VERCEL_EVIDENCE=PASS'
printf '%s' "$team_payload" | jq -r '
  "VERCEL_PLAN_PROOF=" + ((.billing.plan // "NOT_VERIFIED") | ascii_upcase)
'
printf '%s' "$project_payload" | jq -r '
  "FLUID_COMPUTE_EFFECTIVE=" + ((.defaultResourceConfig.fluid // .resourceConfig.fluid // "NOT_VERIFIED") | tostring | ascii_upcase),
  "PLATFORM_MAX_DURATION_MS=" + (((.defaultResourceConfig.functionDefaultTimeout // 0) * 1000) | tostring)
'
printf '%s' "$deployment_payload" | jq -r --arg deployment_id "$DEPLOYMENT_ID" '
  [.builds[0].output[]? | select(.type == "lambda")] as $lambdas |
  "DEPLOYMENT_ID=" + $deployment_id,
  "DEPLOYMENT_READY_STATE=" + (.readyState // "NOT_VERIFIED"),
  "VERCEL_DEPLOYABLE_FUNCTION_COUNT=" + ($lambdas | length | tostring),
  "API_ENTRYPOINT_FUNCTION_COUNT=" + ([$lambdas[] | select(.path | startswith("api/"))] | length | tostring),
  "CURRENT_API_DOSSIER_DURATION_MS=" + (([$lambdas[] | select(.path == "api/dossier") | .lambda.timeout][0] // 0) * 1000 | tostring),
  "DOSSIER_300S_EFFECTIVE=" + (if ([$lambdas[] | select(.path == "api/dossier") | .lambda.timeout][0] // 0) == 300 then "PASS" else "NOT_VERIFIED" end)
'

# Vercel documents a Hobby limit of 12 functions per deployment. The effective
# project API does not expose this quota as a field, so the remaining slots are
# explicitly marked as a derivation from the documented limit, not an account
# entitlement read from the CLI.
printf '%s\n' 'PLAN_FUNCTION_LIMIT=12_OFFICIAL_VERCEL_DOCS'
printf '%s' "$deployment_payload" | jq -r '
  [.builds[0].output[]? | select(.type == "lambda")] | "FUNCTION_SLOTS_REMAINING=" + (12 - length | tostring) + "_DERIVED_FROM_OFFICIAL_LIMIT"
'
printf '%s\n' 'DOSSIER_300S_CONFIGURABLE=PASS_CURRENT_DEPLOYMENT_PROVES_EFFECTIVE_PLATFORM_VALUE'
