# Active Context

Last updated: 2026-06-03 — PR #327: Observabilidade de Painel Branco

## Boot

1. Bruno Vault: `00-MASTER.md` -> `MOC-Licoes.md` -> `10-PROJETOS/NOVO-APP.md`
2. `HANDOFF_AI.md` -> este arquivo -> `progress.md`

## Fase atual

**PR #327 aberta — socio-search decomposto + observabilidade de painel branco.** O incidente atual não foi tratado como falha de persistência: Supabase tinha dossiê final e mensagens limpas, mas a UI podia ficar visualmente branca no painel central. A branch agora adiciona detector `BlankPanel`, evento explícito no Sentry, métricas seguras no `scout_diagnostics`, índices Supabase para investigação e E2E que exige bot longo visível.

Branch atual: `refactor/socio-search-decompose` (PR #327).

### Pendencias ativas

| Item                                                             | Status                          |
| ---------------------------------------------------------------- | ------------------------------- |
| PR #327 — socio-search decomposto + rastreio tela branca          | **ABERTA**, aguardando push/CI/preview |
| Painel branco pos-dossie                                          | **RASTREIO APLICADO LOCALMENTE** — detector DOM + Sentry + Supabase |
| PR #328 — tela branca waterfall                                  | **CONTEXTO HISTORICO** — fixes de snapshot/sessao orfa ja incorporados em main |
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
- **Painel branco precisa de prova visual**: wrapper estrutural, `document.body.textContent` ou persistência Supabase não bastam. Exigir bot visível no `chat-main-panel`, texto longo, dimensões reais e sem placeholder/suspensão.
- **Sentry para anomalia não-exception**: usar `captureMessage('Scout360 blank panel detected')` com tags `area/source/reason/session_id`; não esperar exceção JS para abrir issue.
- **Sanitizer de diagnostics**: strings sensíveis continuam bloqueadas, mas métricas numéricas/booleanas seguras com nomes `body/text/content` devem ser preservadas.
- **Waterfall intacto**: verificar `git diff main -- waterfall-orchestrator.ts` apos cada rebase

## Proximo passo

1. Push da PR #327 e aguardar CI/preview remoto; não mergear sem Bruno escrever `MERGE`
2. Validar preview: se painel branco ocorrer, procurar Sentry `Scout360 blank panel detected` e Supabase `scout_diagnostics` area `BlankPanel`
3. Decompor 3 god modules restantes (P1 primeiro: documentExtractor.ts 533L)
4. Corrigir P0 withTimeout

## Ponteiros

- `HANDOFF_AI.md` (handoff canônico atualizado)
- PR #328: https://github.com/brunolimaff-jpg/NOVO-APP/pull/328 (ABERTA)
- PR #327: https://github.com/brunolimaff-jpg/NOVO-APP/pull/327 (ABERTA)
- PR #326: https://github.com/brunolimaff-jpg/NOVO-APP/pull/326 (MERGEADA)
- Vault: `2026-06-02T14-45-00-PR328-tela-branca-waterfall-fix.md`
- Commits chave: ver HANDOFF_AI.md
