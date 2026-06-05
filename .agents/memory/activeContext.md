# Active Context

Last updated: 2026-06-05 — root fix local dossiê sem Pinecone + force flush

## Estado

- **`main`:** `84b3f7f7`; worktree segue suja fora do escopo deste fix
- **FIX LOCAL APLICADO:** `pendingForceFlush` em `utils/diagnosticLog.ts` + Pinecone removido do dossiê (`waterfall-orchestrator` + `investigation-orchestration`)
- **War Room preservado:** local browser confirmou `/api/rag` + `/api/docs-rag`
- **Dossiê preservado sem Pinecone:** local browser Scheffer confirmou `/api/cnpj` + `/api/gemini`, sem `/api/rag`/`/api/docs-rag`
- **Ainda falta:** preview/prod com Supabase para confirmar `PostCompletion>=6`

## Próximo passo

1. Fazer preview/deploy desta mudança
2. Repetir Scheffer (`04.733.767/0001-80`) em preview/prod
3. Validar no Supabase: `processMessage:finally=1`, `PostCompletion>=6`, sem `overlay=true` preso
4. Manter auditoria Sentry como trilha paralela, não bloqueante

## Ponteiros

- Incidente: `docs/handoffs/2026-06-05-prod-scheffer-stuck-compliance-consolidando.md`
- Fix local: `docs/handoffs/2026-06-05-dossier-root-fix-force-flush-pinecone.md`
- Merge validado: `docs/handoffs/2026-06-05-pr332-merge-prod-validation.md`
