# Handoff — incidente visual mitigado, monitoramento ativo

- **Branch histórica da investigação:** `codex/pr346-p0-handoff-docs`
- **PR de mitigação:** [#347](https://github.com/brunolimaff-jpg/NOVO-APP/pull/347) — merge `f3f08890` em `main`
- **RAF safety net e LoadingStuckProbes:** [#349](https://github.com/brunolimaff-jpg/NOVO-APP/pull/349) — merge `cbffab54` em `main`
- **Estado atual do código:** mergeado em `main`
- **Branch desta atualização documental:** `docs/wiki-auditoria-final`
- **PR documental:** [#350](https://github.com/brunolimaff-jpg/NOVO-APP/pull/350)
- **Status:** INCIDENTE MITIGADO — MONITORAMENTO
- **Causa raiz:** não identificada
- **Correção funcional pendente:** não
- **Reabrir investigação:** somente mediante gatilho objetivo

---

## Entrada rápida para próximo agente

1. Este arquivo (resumo executivo e gatilhos de reabertura)
2. [README.md](README.md) — navegação para Wiki e documentação
3. [docs/wiki/README.md](docs/wiki/README.md) — Wiki técnica com 28 páginas
4. `.agents/memory/activeContext.md` — estado detalhado
5. `.agents/memory/decisions.md` — decisões arquiteturais ativas
6. `CALIBER_LEARNINGS.md` — lições registradas

---

## Conclusão da auditoria

Uma auditoria estrutural e uma validação adversarial foram executadas com navegação paralela por 7 exploradores independentes cobrindo:

- Wiki e drift documental;
- estado global e ciclo de loading;
- orquestração assíncrona;
- renderização e geometria da interface;
- observabilidade e safety nets;
- testes e contratos;
- riscos transversais.

A primeira passagem encontrou hipóteses que pareciam graves. A validação adversarial reconstruiu as cadeias alcançáveis e refutou os principais falsos positivos.

### O que foi feito

#### PR #347 — Safety net + instrumentação

- **Recovery** `static-fallback-display-recovery` em `MessageTimeline.tsx`: detecta `computedStyle.display === 'none'` no `messages-static-fallback` e força correção com `setProperty('display', 'block', 'important')`
- **Testes TDD:** 3 testes (recupera display, idempotente, não executa quando inativo)
- **Instrumentação:** `debugStaticFallbackDisplay` + `traceFullAncestorChain` em `layoutTraceTelemetry.ts`

#### PR #349 — RAF safety net + LoadingStuckProbes

- **RAF safety net** no `processMessage:finally` que força `setIsLoading(false)` após paint
- **LoadingStuckProbes** em 0/100/500/1000/3000/10000ms após `ui-finalize-post-render`

### Sessões analisadas na investigação

| Sessão ID | Resultado |
|-----------|-----------|
| `ac5890b0` | OK após recovery (previousDisplay "none" → afterResetDisplay "block") |
| `9595fc30` | OK direto (bug não manifestou) |
| `2bfe06a1` | OK direto (bug não manifestou) |
| `f0c9dd91` | Travado (diagnósticos truncados no Supabase) |

### Hipóteses descartadas

- Browser computa `display:none` em flex colapsado — REFUTADA por reprodução mínima local
- `deleteCachedContent` causa o problema — DESCARTADA
- Request pendente bloqueia render — DESCARTADA
- RAF extra em `setIsLoading` — DESCARTADA
- Falha do Composer — DESCARTADA

### Causa raiz: Não identificada

Origem do `display:none` indeterminada. MutationObserver não capturou mutação de style. Hipóteses abertas: elemento recriado já com display none, CSS computada via Vercel runtime, timing React vs `finalizeWaterfallUI`, layout zerado antes do primeiro RAF.

---

## Achados refutados pela validação adversarial

- `handleStopGeneration` não deixaria `isLoading=true`: o cleanup no bloco `if (isLoading)` é independente da presença de `activeBotId` — sempre executa;
- não existe janela alcançável entre overlay hero e viewport suspenso: ambos usam exatamente o mesmo gate (`shouldSuspendHeroMessageTimeline` ≡ `shouldShowHeroLoadingOverlay`) e mudam no mesmo render;
- `dossier:completed` não afeta sessão deletada: não existem listeners atuais do evento no código;
- o timer de 600ms em `finalizeWaterfallUI` é somente diagnóstico, read-only e null-safe — não altera estado funcional;
- os AbortControllers do message-orchestrator e do waterfall-orchestrator são conectados via `createLinkedTimeoutSignal` — abortar o pai propaga para o filho;
- o RAF defensivo não encerra geração válida prematuramente: o callback roda após o finally e verifica `isCurrentGeneration()` antes de agir.

---

## Dívidas não prioritárias

- `showEmptyStateFallback` em `ChatInterface.tsx` é código logicamente inalcançável — P3;
- `setTimeout` sem cleanup em `utils/printExport.ts:26` — P3;
- evento `dossier:completed` sem listeners atuais — código residual;
- Wiki originalmente sem SHA exato da geração.

---

## Terminologia dos mecanismos

- `finalizeWaterfallUI`: **mecanismo primário de finalização**
- `WaterfallGuard`: **guard de concorrência**
- `overlay-stuck-after-loading`: **recovery visual**
- post-waterfall watchdog: **watchdog**
- blank-panel checks: **watchdog com recovery**
- RAF safety net: **recovery defensivo**
- `static-fallback-display-recovery`: **recovery visual**
- session recovery via ref: **fallback de estado**
- probes e snapshots: **telemetria**

---

## Gatilhos de reabertura

Reabrir a investigação apenas se ocorrer pelo menos uma destas condições:

1. `static-fallback-display-recovery` em mais de 5% das sessões;
2. painel branco persistindo após o evento de recovery (display:none não resolvido);
3. três ou mais checks consecutivos de `blank-panel` na mesma sessão;
4. composer desabilitado após a finalização (`domComposerDisabled: true` após `ui-finalize-post-render`);
5. ausência de `PostCompletion` após waterfall concluído;
6. nova sessão travada posterior à PR #347 (commit `f3f08890` ou superior);
7. recovery causando atraso visual perceptível (>500ms entre montagem e display block);
8. reincidência comprovada em produção com `sessionId` e `runId`.

---

## Dados obrigatórios para reabertura

- `sessionId`
- `waterfallRunId`
- build SHA
- ambiente e hostname
- navegador e versão
- PostCompletion (todos os 6 timings)
- LayoutTrace (cadeia completa de ancestrais)
- BlankPanelDebug (7 razões de painel branco)
- DOM snapshot (`ui-finalize-state` e `ui-finalize-post-render`)
- eventos do recovery (`static-fallback-display-recovery`)
- logs do Supabase (`scout_diagnostics`)
- logs do Vercel
- horário aproximado da ocorrência

---

## Risco residual

Os mecanismos de recovery são defensivos. Removê-los sem causa raiz identificada é arriscado. Manter até avaliação de incidência em produção.

---

## Próximo passo

**Não atuar até reincidência.** Monitorar produção. Se nova sessão travada for encontrada, coletar os dados listados acima.

---

## Prompt de retomada

```
▎ Retome a sessão no NOVO-APP a partir de main.
▎ Incidente visual display:none: MITIGADO, raiz ABERTA.
▎ Recovery static-fallback-display-recovery em MessageTimeline.tsx
▎ com 3 testes TDD e instrumentação traceFullAncestorChain.
▎ Wiki técnica versionada em docs/wiki/ (28 páginas).
▎ Validação adversarial concluída — 6 falsos positivos removidos.
▎ Causa raiz do display:none NÃO IDENTIFICADA.
▎ Status atual: MONITORAMENTO.
▎ Não implementar correção funcional sem reincidência ou evidência objetiva.
▎ Gatilhos de reabertura neste arquivo.
```
