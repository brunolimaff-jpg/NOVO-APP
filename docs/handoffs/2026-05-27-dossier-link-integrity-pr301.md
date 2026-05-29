# Handoff — Integridade de links + PR #301

**Data:** 2026-05-27  
**Branch:** `fix/dossier-link-integrity-fontes`  
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/301  
**Plano (somente leitura):** `.cursor/plans/fix_links_urgência_367c96e6.plan.md`

---

## Goal of next session

1. **Commit + push** das mudanças locais de UX do waterfall (preview inline, overlay hero) — ainda **não commitadas**.
2. **Smoke** no preview Vercel da PR (Scheffer `04.733.767/0001-80`): dossiê completo, LoadingSmart não “trava” visualmente, rodapé `## 📚 Fontes`, painel 📚.
3. Opcional: investigar **`open-web-search` degradado** em produção/preview (Brave/env) — logs: `Nenhum resultado encontrado` para queries `"SCHEFFER & CIA LTDA"`.
4. **MERGE** só com token **`MERGE`** na mensagem do usuário.

---

## State of play

### Feito (commits na PR, CI verde)

| Commit    | Resumo                                                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2c6e40b` | Pipeline integridade: `dossierLinkIntegrity`, footer Fontes, `buildAuditableSources` (`consulted_not_cited`), prompts `[[n]](URL)`, waterfall pool/fallback `continue` |
| `a7d56ff` | Review Gemini (regex decimal, headings `#+`, `normalizeSourceUrl` no pool); fix `MessageActionsBar.test` → label `Fontes (N)`                                          |
| `b3af760` | Tela branca Scheffer: `coerceGroundingSources`, hero só sem texto >200 chars, `setIsLoading(false)` ao trocar sessão, Virtuoso não suspende com mensagens              |

**CI PR #301 (último push remoto):** Typecheck, Tests, Build, Dossier Golden, Smoke preview, Vercel — **SUCCESS**.

**Review:** 5 threads Gemini respondidas e resolvidas em `a7d56ff`.

### Feito localmente (NÃO commitado)

| Arquivo                                                 | Mudança                                                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/dossier/waterfall-orchestrator.ts`            | `flushWaterfallPreview` (>200 chars → `updateSessionById` + `inline`); etapas Teia no LoadingSmart; `AbortSignal.timeout(25s)` em `/api/link-status` |
| `App.tsx`                                               | `showFullscreenLoadingSmart` — esconde overlay hero quando já há stream parcial                                                                      |
| `components/ChatInterface.tsx`                          | `hasSubstantiveMessages` inclui thinking com texto >200                                                                                              |
| `features/chat/message-orchestrator.ts`                 | `completeLoadingProgress()` após `runMegaPromptWaterfall`                                                                                            |
| `tests/features/dossier/waterfall-orchestrator.test.ts` | `updateSessionById` ≥2 chamadas (preview + final)                                                                                                    |

### Produção vs PR

- Usuário testou **`scoutagro.vercel.app`** (main) — ainda log antigo: `interrompendo novas tentativas do módulo` → **main não tem a PR**.
- Comportamento observado: LoadingSmart em tela cheia enquanto módulos rodam (~3–8 min); `groundingSources: 0` em todos os módulos por fallback degradado.
- Log `content loaded` = extensão Gemini no browser, não do app.

---

## Open decisions

| #   | Decisão                     | Opções                                                            |
| --- | --------------------------- | ----------------------------------------------------------------- |
| 1   | Commitar/push UX waterfall? | Sim → 1 commit na PR; Não → descartar diff local                  |
| 2   | MERGE PR #301               | Só com **MERGE** explícito do usuário                             |
| 3   | `open-web-search` em Vercel | Auditar env Brave/API/rate limit; não hardcode URL por CNPJ       |
| 4   | Dossiês antigos em cache    | Footer/strip na render; regenerar investigação para pool completo |

---

## Skills to use

| Situação                 | Skill / agente                                                              |
| ------------------------ | --------------------------------------------------------------------------- |
| Smoke preview / Scheffer | Chrome DevTools MCP ou skill `chrome-devtools`                              |
| CI / testes pós-push     | `validator`, `npm test`, `npm run typecheck`                                |
| Comentários PR           | `gh-resolve-pr-comments` (`.claude/skills/gh-resolve-pr-comments/SKILL.md`) |
| Env busca web Vercel     | `vercel-cli` + `deployments-cicd`; revisar `api/open-web-search.ts`         |
| Encerrar sessão vault    | `doc-handoff` + atualizar Bruno Vault `20-SESSOES` se lição nova            |

---

## Artifacts (referências — não duplicar)

| Tipo                       | Path / URL                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| PR                         | https://github.com/brunolimaff-jpg/NOVO-APP/pull/301                                                                       |
| Handoff curto repo         | `HANDOFF_AI.md`                                                                                                            |
| Plano integridade links    | `.cursor/plans/fix_links_urgência_367c96e6.plan.md`                                                                        |
| Pipeline fontes            | `utils/dossierFinalize.ts`, `utils/dossierLinkIntegrity.ts`, `utils/dossierSourcesFooter.ts`, `utils/dossierSourcePool.ts` |
| Waterfall                  | `features/dossier/waterfall-orchestrator.ts`                                                                               |
| Fallback web               | `services/gemini/investigation-orchestration.ts` (~L171 `continue` em degraded)                                            |
| UI fontes                  | `components/MessageRow.tsx`, `components/MarkdownRenderer.tsx`                                                             |
| Loading overlay            | `App.tsx` (L~548 `showFullscreenLoadingSmart`), `components/LoadingSmart.tsx`                                              |
| Testes novos               | `tests/utils/dossierLinkIntegrity.test.ts`, `dossierSourcesFooter.test.ts`, `auditableSources-consulted.test.ts`           |
| Handoff PR #300 (mergeada) | `docs/handoffs/2026-05-26-dossier-sync-pr300.md`                                                                           |
| Vault ponteiro             | `docs/OBSIDIAN_VAULT.md`                                                                                                   |

---

## Comandos rápidos

```bash
git checkout fix/dossier-link-integrity-fontes
npm run typecheck
npm test -- tests/features/dossier/waterfall-orchestrator.test.ts tests/utils/dossierLinkIntegrity.test.ts
gh pr checks 301
gh pr view 301 --web
```

---

## Riscos residuais

- Pool vazio se Brave/API falhar → aviso no dossiê, sem links inventados (by design).
- Waterfall longo: mesmo com preview inline, usuário pode achar lento — etapas Teia agora atualizam label.
- `finalizeDossierMarkdown` + `validateInlineSourcesForPromotion` no fim do waterfall: timeout 25s adicionado localmente (não no remote ainda).
