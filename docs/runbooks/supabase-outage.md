# Runbook: Supabase Outage

## Sintomas
- `/api/dossier` falha com `502 INTERNAL_ERROR` (RPC indisponível)
- Auth falha: `/auth/v1/token` timeout
- Dashboard Supabase inacessível

## Diagnóstico
1. `status.supabase.com` — incidentes ativos?
2. `curl -I https://xlvsrnbynpawgfapowec.supabase.co/rest/v1/` — 200 = API up
3. Logs Vercel: `[DossierAPI] request:failed stage=ownership/lease errorCode=INTERNAL_ERROR`

## Ações
| Componente | Mitigação |
|------------|-----------|
| Auth | Usuários logados mantêm sessão (JWT válido por 1h); novos logins falham |
| Dossiê (generate/chat) | Indisponível — requer RPCs `dossier_runs` |
| Radar/Busca | Indisponível — requer `extract_cache`, `dossies` |

## Contatos
- Supabase Support: dashboard → Support
- On-call: @platform-team

## Rollback
Não há fallback automático. Aguardar recuperação Supabase.
