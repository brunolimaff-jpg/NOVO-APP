# Handoff — Ciclo executor-Planejador (BRU-7/11/12/13/P0) + pilha de PRs

> **Atualizado:** 2026-08-06 (fim)
> **Branch ativa:** `fix/p0-supabase-security-containment` (worktree /private/tmp/p0-security-01)
> **Vault:** [Sessão 2026-08-06](https://obsidian://open?vault=bruno%20vault&file=Sess%C3%B5es%2F2026-08%2F2026-08-06T23-00-00-zcode-ciclo-executor-planejador-p0-pilha-prs)

## Estado da pilha (ordem de release do Planejador)

| PR | Estado | Branch → Base | Conteúdo |
|---|---|---|---|
| #477 | READY | fix/bru-7-client-orchestrated-closure → main | BRU-7 A + BRU-12 |
| #478 | READY | fix/bru-11-foreign-access-containment → #477 | BRU-11 Camada 1 (fail-closed) |
| #480 | DRAFT | fix/p0-supabase-security-containment → #478 | **P0 RLS containment** |
| #479 | DRAFT | chore/bru-13-quarantine-e2e-gate → #477 | BRU-13 (quarentena E2E) |

**Ordem de merge: #477 → #478 → #480 → #479.** Merge em main = deploy automático de Produção (autorização por PR com "MERGE PR #NNN COM DEPLOY AUTOMÁTICO DE PRODUÇÃO AUTORIZADO").

## Estado atual

- **P0 APROVADO** pelo Planejador (98%, 3 rodadas corretivas): isolamento RLS de dossies por operador, eventos só INSERT, RPC segura de duplicidade estrangeira, views/crm fechados, replay PG17 exit 0, gates 1629/1629.
- **GitHub Actions em incidente** (Partial System Outage) → merge train BLOQUEADO até: Actions fora de major_outage + webhooks OK + incidente monitoring/resolved + run canário iniciado (monitor ativo: `/tmp/monitor-github-status.mjs`).
- Previews #477/#478 validados (login, dossiê próprio, reload sem retomada, estrangeiro bloqueado com mensagem explícita).

## Decisões

- Merge exige MERGE explícito do Bruno (nunca auto-merge).
- Migrations P0: aplicação remota requer autorização SEPARADA após #477/#478 em main + retarget + CI.
- Hardening de feedback_events/audit_log/favorites/radar/llm/scout_diagnostics → lote separado.
- BRU-11 Camada 2 (compartilhamento) bloqueada até decisão de autorização (WHO/WHAT/HOW).

## Não fazer

- MERGE sem a palavra MERGE do Bruno
- Aplicar migrations P0 no Supabase remoto sem autorização específica
- Retarget/marcar Ready das PRs sem despacho
- Iniciar BRU-8 / BRU-6 / DeepSeek sem novo despacho
- Tocar as 67 mudanças locais pré-existentes do repo principal (fix/remove-auth-migration-gate)

## Próximo passo

1. Aguardar GitHub recuperar (monitor ativo) → avisar Bruno.
2. Com MERGE: #477 → smoke Produção → #478 → #480 → #479.
3. Reportar ao Planejador após cada merge (SHA main, deploy READY, smoke).
