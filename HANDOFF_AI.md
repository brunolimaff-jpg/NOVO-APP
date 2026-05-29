# Handoff — NOVO-APP — 29/05/2026 (PR #316 — 7 commits, 95% travando)

## ⚠️ URGENTE: Waterfall travando em 95% (REPRODUZIDO 2x)

O LoadingSmart trava em 95% e não sai. **95% é intencional** (`MAX_PROGRESS_PERCENT = 95` em `utils/loadingSmartViewModel.ts:5`). O overlay só some quando `isLoading` vira `false` — ou seja, o **waterfall NÃO está completando**.

### Como debugar (sem depender do console do Chrome)

A tabela `waterfall_logs` no Supabase (`vmqfcaoirjcfucvlnpig`) tem o rastreio de cada execução:

```sql
SELECT event, module_name, status, elapsed_ms, detail, created_at
FROM waterfall_logs
WHERE session_id = '<ID da sessão>'
ORDER BY created_at;
```

**Interpretação:**

- Se tem `waterfall:start` mas nenhum `module:end` → travou no primeiro módulo (Teia Societaria - Identidade)
- Se o último `module:end` tem `status = 'failed'` → aquele módulo quebrou, veja `detail->>'error'`
- Se tem `module:start` sem `module:end` correspondente → aquele módulo está pendurado (timeout? Gemini não respondeu?)
- Se tem `waterfall:end` → completou normalmente
- Se tem `waterfall:error` com `detail->>'step' = 'saveDossier'` → falha no Supabase (409 Conflict?)

### Erros já observados (usuário reportou)

1. **409 Conflict** — Possível conflito no `saveDossier` (Supabase unique constraint?). Hoje capturado via `waterfallTrace.error({ step: 'saveDossier', error })`.
2. **500 /api/gemini** — `{"error":{"code":"500","id":"2XX6SGWJB5dxuBQBQgac7TmA8cey922I","message":"Internal Server Error"}}`. Capturado via `moduleEnd(name, elapsed, false, errMsg)`.

### Hipóteses para o travamento

1. **Timeout do Gemini**: Algum módulo chama `generateDossierModule` e o Gemini nunca responde. O `AbortSignal` do waterfall tem timeout, mas o `withAbortSignal` no orchestrator pode não estar propagando corretamente.
2. **Erro 500 em loop**: Se o módulo falha mas o waterfall tenta de novo sem backoff, pode ficar preso.
3. **P0 conhecido**: `withTimeout AbortSignal` em `api/gemini.ts:416, :491` — documentado, nunca corrigido. Pode ser a causa raiz.

## Estado atual

- **Branch:** `fix/dossier-share-bar-event` (7 commits, PR #316 aberta)
- **Branch base:** `main` (`0b38ebe`)
- **Stashes:** `feat/crm-supabase-migration` (stash@{3}, stash@{4}, stash@{5})

## PR #316 — fix/dossier-share-bar-event (7 commits)

| #   | Commit    | O quê                                                            |
| --- | --------- | ---------------------------------------------------------------- |
| 1   | `f6776b6` | dispatchEvent fora do try-catch + listener estável               |
| 2   | `8bed1ab` | Code review feedback                                             |
| 3   | `9042bd2` | `api/dossie.ts` — página pública serverless                      |
| 4   | `5178742` | safeUrl XSS fix                                                  |
| 5   | `69f97f0` | **Consolidação 13→11 funções + SUPABASE_URL + 4 P0 code review** |
| 6   | `3af5c97` | **Rastreio waterfall no Supabase** (`waterfall_logs`)            |
| 7   | `c2be5b6` | **error_detail no trace** (moduleEnd + saveDossier)              |

## O que foi resolvido nesta sessão

1. **Limite 12 funções Vercel:** 13→11. Deletou `pulse-news.ts` (não usada) + consolidou `docs-rag.ts` em `rag.ts`.
2. **SUPABASE_URL:** Adicionada nos 3 ambientes Vercel.
3. **4 bugs P0:** copyTimerRef compartilhado, XSS em groundingSources, `<pre>` quebrando parágrafos, isDocsMode sem fallback URL.
4. **Rastreio waterfall:** Tabela `waterfall_logs` + `waterfallTrace` per-module. Agora é possível debugar travamentos sem console.
5. **Error detail:** Falhas de módulo e saveDossier agora incluem a mensagem do erro no trace.

## Como o link de compartilhamento funciona

```
Usuário clica "Copiar link"
  → storage.shareDossier(dossierId)
    → Gera UUID token (crypto.randomUUID())
    → Insere em shared_dossiers: { access_token, dossier_id, operator_id, expires_at: +7d }
    → Retorna token
  → URL = window.location.origin + '/dossie/' + token
  → Ex: https://scoutagro.vercel.app/dossie/550e8400-e29b-41d4-a716-446655440000

Visitante abre o link:
  → Vercel rewrite: /dossie/(.*) → /api/dossie?token=$1
  → api/dossie.ts busca token no Supabase → acha dossier_id
  → Busca conteúdo em dossies → renderiza HTML com score, mensagens, fontes
  → Incrementa view_count (fire-and-forget)
```

## Env vars no Vercel

| Variável                    | Ambientes                        |
| --------------------------- | -------------------------------- |
| `SUPABASE_URL`              | Production, Preview, Development |
| `VITE_SUPABASE_URL`         | Production, Preview              |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview              |

## Validação

| Gate           | Resultado |
| -------------- | --------- |
| TypeScript     | 0 erros   |
| Testes         | 1257/1257 |
| Contratos      | 45/45     |
| Deploy preview | Ready     |
| Funções Vercel | 11/12     |

## Lições aprendidas (6 nesta sessão)

1. **Consolidação serverless**: handler unificado precisa de URL-based detection como fallback do body parameter
2. **VITE\_ prefixo**: serverless functions leem `process.env` — vars sem `VITE_` precisam ser configuradas separadamente
3. **Code review multi-angulo**: 6 angles paralelos encontraram 4 P0 que 1257 testes não pegaram
4. **Waterfall sem rastreio = cegueira**: `waterfall_logs` no Supabase resolve (fire-and-forget não bloqueia)
5. **95% = LoadingSmart, não deploy**: `MAX_PROGRESS_PERCENT = 95` é intencional — overlay só some com `isLoading = false`
6. **Gates contínuos**: `validate:ci` após cada commit evita regressão

## Próximos passos

1. **DEBUGAR TRAVAMENTO 95%**: Rodar query no Supabase em `waterfall_logs` filtrando pela session_id da execução travada. Identificar qual módulo não completou.
2. Merge PR #316 após resolver travamento
3. Implementar `dossier_access_logs`
4. Retomar `feat/crm-supabase-migration` (3 stashes)
5. P1s code review: view_count atômico, escapeHtml/safeUrl shared

## Riscos técnicos

1. **P0 withTimeout AbortSignal** (`api/gemini.ts:416, :491`) — provável causa do travamento
2. Race condition view_count (`api/dossie.ts:214`)
3. Duplicação escapeHtml/safeUrl/renderMarkdown
4. 12 findings code review não corrigidos
