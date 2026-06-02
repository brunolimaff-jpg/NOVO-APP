# Active Context

Last updated: 2026-06-02 — PR #328: Tela Branca Pos-Waterfall (causas raiz corrigidas localmente, aguardando novo CI remoto)

## Boot

1. Bruno Vault: `00-MASTER.md` -> `MOC-Licoes.md` -> `10-PROJETOS/NOVO-APP.md`
2. `HANDOFF_AI.md` -> este arquivo -> `progress.md`

## Fase atual

**PR #328 aberta — correcao de tela branca pos-waterfall.** Causa raiz primaria corrigida localmente: `setSessions` agora sincroniza `sessionsRef.current` imediatamente, `updateSessionById` retorna a sessao atualizada, e o waterfall usa esse snapshot em vez de depender de side effect dentro de updater React. Fallback sessionsRef fica como airbag. Segunda causa identificada no preview: disparo inicial duplicado criava uma sessao orfa antes do re-render de `currentSessionId`; `pendingInitialSendRef` agora impede essa duplicacao.

Branch atual: `fix/waterfall-session-persist-race-condition` (PR #328).

### Pendencias ativas

| Item                                                             | Status                          |
| ---------------------------------------------------------------- | ------------------------------- |
| PR #328 — tela branca waterfall                                  | **ABERTA**, aguardando novo CI remoto/preview |
| sessionToPersist null — causa raiz primaria                      | **CORRIGIDA LOCALMENTE**, monitorar diagnostics |
| Sessao orfa por disparo inicial duplicado                        | **CORRIGIDA LOCALMENTE**, validar preview |
| PR #327 — socio-search decomposto                                | **ABERTA**, mergeavel           |
| P0 withTimeout (api/gemini.ts:416, :491)                         | **NAO CORRIGIDO** — documentado |
| 3 god modules restantes (docExtractor P1, textCleaners P2, etc.) | Pendente                        |
| Branch `feat/crm-supabase-migration` stashed                     | Nao decidido                    |
| Supabase extract_cache TTL sem cleanup automatico                | Pendente                        |

## Decisoes tecnicas ativas

- **Barrel export**: decompor god module em pasta com `index.ts` re-exportando tudo. Zero breaking changes.
- **`storageGet()`**: helper tipado para localStorage
- **`await + {error}`**: padrao de erro Supabase — sem `try/catch`, sem `fire-and-forget`
- **Rename `idbStorage.ts` -> `localStorage.ts`**
- **sessionsRef fallback (airbag)**: quando `updateSessionById` perde a sessao (React batching), usar `sessionsRef.current` como fallback sincrono. sessionsRef sync em render-phase (nao useEffect).
- **Merge funcional em setSessions**: `setSessions(() => data)` substitui estado anterior. Usar `prev => merge(data, prev)` para preservar sessions existentes.
- **Snapshot sincrono para updateSessionById**: helpers que atualizam sessao critica devem retornar a sessao resultante; nao depender de side effects em callback de `setState`.
- **Trava de envio inicial pendente**: primeira investigacao deve reaproveitar sessao pendente se uma segunda chamada chegar antes do re-render aplicar `currentSessionId`.
- **CI E2E critico obrigatorio**: `E2E Critical Browser` roda painel branco, erro controlado e loading com Gemini stubado.
- **Waterfall intacto**: verificar `git diff main -- waterfall-orchestrator.ts` apos cada rebase

## Proximo passo

1. Validar novo CI remoto da PR #328 e confirmar preview sem sessao orfa; se houver disparo duplicado, esperar log `envio inicial duplicado bloqueado`
2. Fechar PR #327 (socio-search decomposto)
3. Decompor 3 god modules restantes (P1 primeiro: documentExtractor.ts 533L)
4. Corrigir P0 withTimeout

## Ponteiros

- `HANDOFF_AI.md` (handoff canônico atualizado)
- PR #328: https://github.com/brunolimaff-jpg/NOVO-APP/pull/328 (ABERTA)
- PR #327: https://github.com/brunolimaff-jpg/NOVO-APP/pull/327 (ABERTA)
- PR #326: https://github.com/brunolimaff-jpg/NOVO-APP/pull/326 (MERGEADA)
- Vault: `2026-06-02T14-45-00-PR328-tela-branca-waterfall-fix.md`
- Commits chave: ver HANDOFF_AI.md
