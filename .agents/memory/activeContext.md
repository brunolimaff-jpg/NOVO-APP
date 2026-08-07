# Active Context

Last updated: 2026-07-14 — Fase 3B.3C.1 live readiness macOS

## Estado

- **main:** `636c3d4e` (PR #430 MERGED — 3B.3C)
- **Branch:** `fix/fase-3b3c1-live-readiness-macos`
- **Foco:** asset≠binary DCG checksum; hook live + atestação humana; check-pilot-readiness
- **Não fazer:** instalar DCG, editar ~/.codex/hooks.json, Codex/piloto real, MERGE

## Contagens

- observation 45 · runtime-safety 42 · dcg-live-readiness 24
## P0 + pilha (2026-08-06 fim) — AGUARDANDO GITHUB RECUPERAR + MERGE

- P0-SUPABASE-SECURITY-CONTAINMENT APROVADO (98%) — PR #480 Draft (head 939926a5, base #478). Vault: Sessões/2026-08/2026-08-06T23-00-00.
- Pilha: #477 READY → #478 READY → #480 DRAFT (P0) → #479 DRAFT (BRU-13). Ordem: 477→478→480→479.
- BLOQUEIO: GitHub Actions em incidente — merge train pausado (critérios: major_outage off, webhooks OK, monitoring/resolved, canário iniciado). Monitor /tmp/monitor-github-status.mjs ativo.
- Migrations P0: aplicação remota exige autorização separada após #477/#478 em main.
