## 2026-06-08 — Handoff final precisa apontar repo + Bruno Vault (APLICADO na PR #346)

Decision: fechar o incidente P0 em duas camadas: repo canonico (`HANDOFF_AI.md`, `.agents/memory/*`, `docs/handoffs/*`, `CALIBER_LEARNINGS.md`) e espelho navegavel no Bruno Vault (`40-HANDOFFS`, `20-SESSOES`, `30-LICOES`).

Reason: o incidente levou quase duas semanas e misturou bugs de body-read, abort, diagnostics, loading, Virtuoso e diferenca preview/producao. Sem handoff duravel, agentes futuros tendem a reabrir hipoteses ja fechadas ou validar so evento tecnico.

Contract: fechamento de P0 visual deve referenciar evidencias por path/URL, registrar licoes de "o que nao fazer" e apontar explicitamente para o Bruno Vault.

Refs: `HANDOFF_AI.md`, `docs/handoffs/2026-06-08-pr346-p0-prod-preview-final.md`, `CALIBER_LEARNINGS.md`, `Bruno Vault > 40-HANDOFFS > NOVO-APP-handoff.md`.

---

## 2026-06-08 — Bot gigante deve vencer viewport suspensa (APLICADO na PR #346)

Decision: em `MessageTimeline`, mensagem de bot acima do limiar de fallback estatico deve renderizar `messages-static-fallback` mesmo quando `shouldSuspendVirtualizedList` ainda esta true.

Reason: o E2E Scheffer mostrou bot de ~50k chars no DOM, mas invisivel quando a arvore visual ainda privilegiava estado suspenso/virtualizado. O contrato de produto e dossie visivel, nao Virtuoso tecnicamente montado.

Contract: para dossie grande, `messages-static-fallback` e o caminho de recuperacao preferido; validar `bot-message-content` visivel no `chat-main-panel`.

Refs: `components/chat/MessageTimeline.tsx`, `tests/components/chat/MessageTimeline.test.tsx`, `tests-e2e/scheffer-cnpj-blank-panel.spec.ts`.

---

## 2026-06-08 — Continuity retry precisa liquidar mesmo se abort nao resolver promise (APLICADO na PR #346)

Decision: cada tentativa de `generateContinuityQuestion` tem race local de 15s que aborta o signal encadeado e rejeita localmente, permitindo fallback deterministico.

Reason: uma execucao real de preview ficou sem `ui-finalized` porque o retry de continuity gerou request Gemini pendente apos resposta JSON truncada. Apenas abortar o fetch nao garantia que a promise do proxy liquidaria a tempo.

Contract: sugestoes finais sao opcionais; timeout nelas nunca pode impedir salvar/renderizar o dossie.

Refs: `services/gemini/auxiliary.ts`, `tests/services/geminiService.test.ts`.

---

## 2026-06-07 — `/api/gemini` deve manter timeout ate body read + parse (APLICADO localmente na PR #346)

Decision: aplicar no `services/geminiProxy.ts` o mesmo principio descoberto no `/api/link-status`: timeout total so termina depois de `response.text()` + `JSON.parse()`, nunca logo apos headers.

Reason: em producao havia request `/api/gemini` pendente em `geminiProxy.ts`; preview ja tinha protecao no `/api/link-status`, mas a chamada de IA ainda podia ficar presa na leitura do body.

Contract: logs do proxy devem expor `action`, `requestClass` e fase (`fetch` ou `body-read`) para separar chamadas de IA (`generateContent`/`chatSendMessage`) da telemetria raw (`recordDiagnostics` em `diagnosticLog.ts`).

Refs: `services/geminiProxy.ts`, `tests/services/geminiProxy.test.ts`.

---

## 2026-06-07 — Continuity question precisa receber abort real (APLICADO localmente na PR #346)

Decision: `generateContinuityQuestion` aceita `AbortSignal`; waterfall cria controller proprio de 20s e passa o signal para a chamada Gemini.

Reason: `Promise.race` encerrava a espera, mas deixava a chamada Gemini viva em background. Isso podia explicar request pendente em `geminiProxy.ts` depois do waterfall desistir.

Contract: timeout local das sugestoes finais nao derruba o waterfall; abort do usuario continua terminal.

Refs: `services/gemini/auxiliary.ts`, `features/dossier/waterfall-orchestrator.ts`, `tests/services/geminiService.test.ts`.

---

## 2026-06-07 — Finalizer do waterfall nao pode impedir ErrorMessageCard (APLICADO localmente na PR #346)

Decision: no `processMessage:catch`, tratar `activeGenerationRef` vazio como "finalizer ja limpou", nao como mismatch. So pular tratamento quando existir outro bot ativo diferente.

Reason: o E2E controlled-error-state falhava porque `finalizeWaterfallUI` limpava `activeGenerationRef`; o erro voltava ao `processMessage`, que pulava o card por mismatch `undefined`.

Contract: falha controlada de `/api/gemini` deve remover loading e renderizar `error-message-card`, mantendo input utilizavel.

Refs: `features/chat/message-orchestrator.ts`, `tests/features/chat/message-orchestrator.test.ts`, `tests-e2e/controlled-error-state.spec.ts`.

---

## 2026-06-07 — Labels modulares precisam de identidade canonica sem trocar texto visivel (APLICADO localmente na PR #346)

Decision: normalizar chaves (`statusKey`) dos labels modulares para categorias canonicas, preservando o texto exibido na UI. `Verificando pressoes e compliance...` passa a ser `compliance`.

Reason: o timer global andava, mas o timer da etapa podia parecer atrasado quando backend/UI usavam labels equivalentes com chaves diferentes.

Contract: `LoadingStageTimer` registra `stage-start` e `stage-complete` para comparar stage de backend, stage ativo e duracao por chave canonica.

Refs: `utils/loadingStatus.ts`, `components/LoadingSmart.tsx`, `tests/utils/loadingSmartViewModel.test.ts`, `tests/components/LoadingSmart.test.tsx`.

---

## 2026-06-06 — AbortSignal.timeout cobre apenas conexao; usar AbortController + body read timeout separado (APLICADO na PR #346)

Decision: substituir `AbortSignal.timeout(25_000)` em `fetch('/api/link-status')` por `AbortController` explicito com timeout total de 30s, combinado com timeout dedicado de leitura do body (15s) via `response.text()` + `JSON.parse()`.

Reason: `AbortSignal.timeout()` no `fetch()` cobre apenas a fase de conexao (TCP handshake + TLS + response headers). `response.json()` le todo o body apos os headers — e essa leitura nao tem timeout proprio. Se o servidor envia headers rapido mas o corpo demora, o fetch nao aborta e `response.json()` fica bloqueada indefinidamente. O waterfall inteiro trava entre `pos-porta-reconciliation` e `pre-continuity-question`.

Contract: `validate-inline-sources` e modulo opcional. Timeout no body read deve retornar fallback seguro (array vazio de fontes) sem abortar o waterfall. Usar `response.text()` em vez de `response.json()` porque `.text()` permite inspecao + parse manual com timeout dedicado.

Refs: PR #346, `features/dossier/waterfall-orchestrator.ts`, `tests/features/validate-inline-sources-freeze-diag.test.ts`.

---

## 2026-06-06 — FreezeDiag como telemetria temporaria para diagnostico de freeze (APLICADO na PR #346)

Decision: adicionar marcos FreezeDiag (fase + timestamp) em pontos estrategicos do `waterfall-orchestrator.ts` para medir timing entre fases do waterfall.

Reason: sem a instrumentacao, nao era possivel identificar onde exatamente o waterfall congelava. Os 18 marcos cobrem desde o inicio do `processMessage` ate o `finally`, permitindo analise pos-mortem de gargalos de tempo.

Contract: FreezeDiag e telemetria temporaria para investigacao. Decidir antes do merge se mantem (como diagnostico permanente) ou remove (para nao poluir logs).

Refs: PR #346, `features/dossier/waterfall-orchestrator.ts`.

---

## 2026-06-05 — Static fallback: parent flex-col + child flex-1 (APLICADO na PR #342)

Decision: o container outer de MessageTimeline deve ser `flex-col` (nao `display:block`) e o filho static-fallback deve usar `flex-1` (nao `h-full`).

Reason: o outer container recebia altura via `flex-1` (flex-basis:0%). O filho usava `h-full` (height:100%). Como o pai tinha altura calculada de 0px (flex-basis:0%), `height:100%` do filho = 0px. O browser colapsava o elemento com `display:none`. Isso fazia a timeline ficar vazia e o overlay permanecer preso.

Contract: filhos de flex container com `flex-1` devem usar `flex-1` para herdar altura real, nunca `h-full`. `absolute inset-0` tambem deve ser evitado nesses contextos; preferir `h-full w-full`.

Refs: PR #342, `components/MessageTimeline.tsx`.

---

## 2026-06-06 — Validate Inline Sources e modulo opcional do waterfall (APLICADO na PR #346)

Decision: timeout ou falha no `validate-inline-sources` nao deve abortar o waterfall. Retornar array vazio de fontes como fallback seguro.

Reason: validacao de fontes inline e um enriquecimento, nao uma etapa critica para o dossie. Se a API `/api/link-status` esta lenta ou indisponivel, o waterfall deve continuar com as outras etapas (continuity-question, output consolidation). Bloquear o waterfall inteiro por causa de um modulo opcional seria perda de dados maior que rodar sem fontes validadas.

Contract: todo modulo opcional que faz fetch externo deve ter timeout proprio + fallback que nao quebra o pipeline. `validate-inline-sources` retorna `ValidatedSource[]` (pode ser vazio) em vez de `throw`.

Refs: PR #346, `features/dossier/waterfall-orchestrator.ts`.

---

## 2026-06-08 — Safety net display:none como airbag contra origem desconhecida (APLICADO)

Decision: adicionar useEffect em `MessageTimeline` que detecta `display:none` no `messages-static-fallback` e forca recovery com `el.style.setProperty('display', 'block', 'important')`.

Reason: a tela branca no preview mostrou `messages-static-fallback` com `display:none`, `width=0`, `height=0` mesmo com waterfall concluido e overlay removido. Nenhuma origem JS foi encontrada. A hipotese de "browser computa display:none em flex colapsado" foi REFUTADA por reproducao minima. A origem permanece nao identificada. A safety net funciona como airbag.

Contract: safety net e mecanismo defensivo, nao fluxo primario. Avaliar em sprint futura se mantem ou remove. Nao substitui investigacao de causa raiz.

Refs: `components/chat/MessageTimeline.tsx`, `tests/components/chat/MessageTimeline.test.tsx`.

---

## 2026-06-08 — traceFullAncestorChain como diagnostico de layout preferido (APLICADO)

Decision: usar `traceFullAncestorChain` em vez de `findFirstZeroDimensionAncestor` para diagnosticos de elementos ocultos.

Reason: `findFirstZeroDimensionAncestor` retorna apenas um no. `traceFullAncestorChain` captura TODOS os ancestrais com computedStyle completo (display, width, height, visibility), permitindo identificar exatamente onde display:none ou dimensao zero aparece.

Contract: gera 5 entradas por waterfall. Em producao estavel, filtrar para executar so quando display:none for detectado.

Refs: `utils/layoutTraceTelemetry.ts`, `components/chat/MessageTimeline.tsx`.

---

## 2026-06-08 — Resolucao de comentarios PR #347 concluida (APLICADO)

Decision: 7 comentarios acionaveis do CodeRabbit resolvidos: paths absolutos substituidos, fallback DOMException, Controller.abort(), tipo estrutural, no-useless-assignment corrigido.

Reason: revisao apontou problemas reais de qualidade. Nenhum blocker, mas todos enderecados para manter padrao.

Refs: PR #347, commit `638112bc`.

---

## 2026-06-08 — Hipotese "display:none em flex colapsado" REFUTADA (APLICADO)

Decision: documentar que a hipotese foi testada e refutada via reproducao minima local.

Reason: agentes futuros podem reabrir a mesma hipotese. A reproducao minima provou que `getComputedStyle(el).display` permanece `block`/`flex` mesmo com `flex-basis:0%` + `min-h-0`.

Contract: se display:none reincidir, investigar: (1) Vercel runtime injection, (2) race condition com React hydration, (3) CSS injection de terceiros.

Refs: `components/chat/MessageTimeline.tsx`, `utils/layoutTraceTelemetry.ts`.
