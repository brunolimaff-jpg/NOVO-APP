# Progress

## 2026-07-14 — Fase 3B.3C.1 (live readiness macOS)

- Branch `fix/fase-3b3c1-live-readiness-macos` @ `636c3d4e`
- Separa `asset_checksums_esperados` × `binary_checksums_esperados` (arm64 binário com proveniência)
- Verificador live de hook + atestação humana fora do repo
- `check-pilot-readiness.rb` somente leitura
- Sem instalar DCG / sem alterar hooks / sem Codex ou piloto real

## 2026-07-14 — PR #430 MERGED (Fase 3B.3C)

- Squash `636c3d4e6fe2b369f7e7644242e79b7edb8781d1`
## 2026-08-06 (noite) — ZCode: P0-SUPABASE-SECURITY-CONTAINMENT EXECUTADO (code-only)

- Despacho formal do Planejador executado no SHA 131b8f20 (branch local fix/p0-supabase-security-containment, worktree /private/tmp/p0-security-01).
- 2 migrations novas: isolamento de dossies por profiles.operator_id do auth.uid() (SELECT/INSERT/UPDATE com WITH CHECK anti-takeover, revoga DELETE auth + ALL anon) + isolamento de operator_events/operator_sessions + revoga grants anon de 13 tabelas + sequence + 6 views + auto_close_stale_sessions() só service_role (inclui PUBLIC).
- Teste RLS (scripts/test_p0_security_containment.sql): 4 identidades (anon, A, B, service_role) — TODOS OS ASSERTS PASSARAM em PostgreSQL 16.14 local (banco descartável p0_security_test). Migrations aplicadas 2× (idempotência).
- Gates: typecheck 0, lint 0 erros, test 1624/1624, contracts 144/144 (atualizados 24→26 migrations), build OK, no-gemini PASS, focados BRU-11 23/23. E2E: 9 históricas (baseline).
- Decisão local: descoberta de duplicidade estrangeira NÃO mantida (fail-closed; Camada 2 redesenhará). Commit local b5b88284 — SEM PUSH.
- LIMPEZA: revertidas alterações não autorizadas do Open Design no repo principal (SectionalBotMessage, SessionsSidebar, SocietaryMatrix + RECON/) — trabalho real segue em /Users/brunolima/Documents/NOVO-APP-design (branch codex/scout-design-lab).
- Retorno postado ao Planejador (21:3xZ). Aguardando auditoria.
## 2026-08-06 (madrugada) — ZCode: P0 RODADA CORRETIVA CONCLUÍDA (CHANGES_REQUIRED atendido)

- Auditoria P0 → CHANGES_REQUIRED (99%): 3 critérios + evidências. Corrigido:
  1) Views de métricas: REVOKE de anon E authenticated (só service_role) — cross-operator eliminado (antes: 91 operadores/586 empresas visíveis).
  2) Replay integral: scripts/replay_p0_full.sql aplica as 27 migrations em PG17.10 limpo (porta 5433) — exit 0, zero erros; fixtures com operator_ids reais da trigger handle_new_user.
  3) Descoberta estrangeira preservada: migration 20260806220200 cria RPC check_existing_dossier_for_cnpj (boolean, SECURITY DEFINER, search_path fixo) + findExistingDossier usa sinal sintético → modal #478 preservado.
  4) Bônus: auto_close_stale_sessions() reescrita qualificada (public.operator_sessions) — versão baseline quebrava com search_path fixo.
- Commits locais: b5b88284 + d79884eb (sem push). Gates: test 1626/1626, contracts 144/144 (27 migrations), build, no-gemini, focados 30/30.
- Retorno postado com git show + logs + conteúdo das migrations (artefatos completos). Aguardando re-auditoria.
## 2026-08-06 (fim) — ZCode: P0 APROVADO (98%) após 3 rodadas corretivas

- P0-SUPABASE-SECURITY-CONTAINMENT CODE-ONLY APROVADO pelo Planejador (98%): AUDIT_RESULT=APPROVED, P0_CODE_ONLY_STATE=APPROVED, P0_LOCAL_HEAD=939926a5, READY_FOR_CONTROLLED_PUBLICATION=YES.
- 5 commits locais na branch fix/p0-supabase-security-containment (b5b88284→d79884eb→442f34c3→18d107f2→939926a5), SEM PUSH.
- Conteúdo final: 3 migrations (isolamento dossies por profiles.operator_id; eventos só INSERT + sessões SELECT/INSERT/UPDATE + anon revogado + auto_close_stale_sessions qualificada + views service_role only; RPC check_existing_dossier_for_cnpj booleana com auth.uid/perfil/14 dígitos/estrangeiro) + cliente com flag ownLookupsHealthy + replay PG17 27 migrations exit 0 + gates 1629/1629, contracts 144/144.
- Próximo passo: autorização literal do Bruno p/ push + Draft PR empilhada sobre fix/bru-11-foreign-access-containment (formato definido na auditoria). SEM merge/deploy/migration remota.
- Ordem de release: #477 → #478 → P0_RLS_CONTAINMENT → #479.
## 2026-08-06 (fim) — ZCode: P0 PUBLICADO (PR #480 Draft) + PILHA COMPLETA

- Autorização do Bruno: push + Draft PR empilhada. Push OK (head 939926a5) + PR #480 Draft (base fix/bru-11-foreign-access-containment, sobre a #478).
- PILHA FINAL: #477 READY (BRU-7+BRU-12 → main) → #478 READY (BRU-11 L1 → #477) → #480 DRAFT (P0 RLS → #478) → #479 DRAFT (BRU-13 → #477). Ordem de release: 477→478→480→479.
- Aguardando: GitHub Actions recuperar (incidente) + MERGE autorizado do Bruno por PR (com deploy automático Produção) + autorização separada p/ aplicar migrations P0 remoto.
- CI da #480 rodando no head 939926a5 (determinístico, sem E2E).
