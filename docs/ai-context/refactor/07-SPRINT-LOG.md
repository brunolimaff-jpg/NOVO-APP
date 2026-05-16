# Sprint Log

## 2026-04-11 - Bootstrap documental

- Fase: pre-execucao
- Objetivo: criar a documentacao canonica do programa de refatoracao antes do Sprint 1
- Decisoes:
  - `docs/ai-context/refactor/` virou a fonte de verdade do programa
  - `02-BOARD.md` e o unico lugar para status vivo
  - `services/apiConfig.ts` nao entra em divisao estrutural
  - `types.ts` permanece centralizado salvo gatilho de ROI
- Checks registrados:
  - `npm run test` verde
  - `npm run typecheck` verde
  - `npm run build` verde
- Riscos residuais:
  - warnings aceitos no baseline ainda existem
  - hotspots principais continuam intocados no runtime
- Proximo passo:
  - iniciar Sprint 1 e congelar fronteiras de `App.tsx`, `services/geminiService.ts` e `hooks/useChat.ts`

## 2026-04-11 - Sprint 1 auth cleanup

- Fase: execution
- Sprint: 1 (`done`)
- Objetivo: remover Clerk/auth sem alterar a ordem do roadmap e manter apenas perfil local obrigatorio do operador
- Decisoes:
  - `OperatorContext` substitui `AuthContext`
  - nome do operador continua obrigatorio, salvo localmente, sem login/senha
  - `operatorId` permanece estavel por dispositivo para preservar rastreabilidade remota
  - dashboard, miniCRM, integrity check e war room nao dependem mais de papel admin
  - payload remoto manteve `userId` e `userName` por compatibilidade
- Mudancas concluídas:
  - `index.tsx` migrado para `OperatorProvider`
  - `App.tsx`, `ChatInterface.tsx` e dependencias de UI migradas para `useOperator`
  - `utils/featureAccess.ts` simplificado para flags de ambiente
  - `@clerk/react` removido
  - arquivos mortos de auth removidos do runtime
  - testes atualizados para o novo gate local e para acesso a dashboard sem admin
- Checks registrados:
  - `npm run test` verde (`85` arquivos, `703` testes)
  - `npm run typecheck` verde
  - `npm run build` verde
  - `npm run lint` vermelho por backlog antigo do repo (`37` erros, `217` warnings)
- Riscos residuais:
  - warning de `SessionsSidebar.test.tsx` continua aberto
  - warning de chunking envolvendo `utils/idbStorage.ts` continua aberto
- Proximo passo:
  - iniciar Sprint 2 com extracao interna da camada Gemini mantendo fachada estavel

## 2026-04-11 - Sprint 2 extracao gemini

- Fase: execution
- Sprint: 2 (`done`)
- Objetivo: decompor a orquestracao interna de IA sem quebrar a API publica de `services/geminiService.ts`
- Decisoes:
  - manter `services/geminiService.ts` como fachada de compatibilidade
  - mover parser PORTA, sources, recovery, status e sanitizacao para `services/gemini/*`
  - proteger `hooks/useChat.ts` com guardrail estrutural contra novos imports de producao
  - manter validacao manual em Vercel como gate de runtime real
- Mudancas concluidas:
  - extracao do pipeline interno de investigacao/chat para modulos coesos em `services/gemini/`
  - testes atualizados para o novo arranjo interno sem alterar contrato publico
  - docs de arquitetura e handoff atualizadas para refletir fachada estavel + modulos internos
  - PR `#209` mergeado em `main` (`ef30b5d3b932a9358b25ad5ec284dbb35f992109`)
- Checks registrados:
  - `npm run test` verde na rodada final da sprint
  - `npm run typecheck` verde na rodada final da sprint
  - `npm run build` verde na rodada final da sprint
  - `npm run lint` segue vermelho por backlog historico do repo
- Riscos residuais:
  - backlog de lint continua fora do escopo da sprint
  - hotspots `App.tsx` e `components/ChatInterface.tsx` ainda concentram fluxo de chat
- Proximo passo:
  - iniciar Sprint 3 (extrair chat de `App.tsx` para `features/chat/*`) sem alterar comportamento funcional

## 2026-04-14 - Sprint 3 corte 1 loading

- Fase: execution
- Sprint: 3 (`active`)
- Objetivo: iniciar a extracao conservadora do fluxo de chat criando `features/chat/` sem tocar no dossie modular ou no contrato publico da UI
- Decisoes:
  - primeiro corte fica limitado ao estado/progresso de loading do chat
  - `App.tsx` continua como fachada de orquestracao e ainda concentra envio, retry, dossie e PORTA
  - `features/` entra no guardrail contra novos imports de `hooks/useChat.ts`
- Mudancas concluidas:
  - criado `features/chat/loading-progress.ts` com `useChatLoadingProgress`
  - removido de `App.tsx` o estado local de loading/progresso e as transicoes correspondentes
  - `tsconfig.json` passou a incluir `features/**/*`
  - adicionados testes de caracterizacao para o hook de loading
- Checks registrados:
  - `npm run test` verde (`90` arquivos, `734` testes)
  - `npm run typecheck` verde
  - `npm run build` verde
- Riscos residuais:
  - checklist manual em preview Vercel ainda pendente
  - `App.tsx` continua hotspot ate os proximos cortes da Sprint 3 e Sprint 4
  - warning de chunking envolvendo `utils/idbStorage.ts` continua aberto como OI-003
- Proximo passo:
  - revisar/mergear o PR de loading e seguir para o corte de sessao/save remoto em `features/chat/session-controller.ts`

## 2026-04-14 - Sprint 3 corte 2A session controller move

- Fase: execution
- Sprint: 3 (`active`)
- Objetivo: mover a implementacao do ciclo de vida de sessao para `features/chat/session-controller.ts` sem alterar ainda os imports do `App.tsx` nem o save remoto
- Decisoes:
  - este corte fica limitado a uma movimentacao mecanica do hook de sessao
  - `hooks/useSessionManager.ts` permanece como fachada temporaria para compatibilidade
  - `App.tsx` continua intacto neste PR para reduzir risco e facilitar review
- Mudancas concluidas:
  - criado `features/chat/session-controller.ts` com a implementacao de `useSessionManager`
  - `hooks/useSessionManager.ts` virou re-export tipado da feature
  - cobertura movida para `tests/features/chat/session-controller.test.ts`
- Checks registrados:
  - `npm run test` verde (`90` arquivos, `734` testes)
  - `npm run typecheck` verde
  - `npm run build` verde
- Riscos residuais:
  - este corte ainda nao prova a integracao via import direto do `App.tsx`
  - save remoto continua em `App.tsx` ate o PR 2C
  - checklist manual em preview Vercel continua pendente para o pacote integrado de sessao
- Proximo passo:
  - abrir/revisar o PR 2A e depois seguir para o PR 2B, trocando o import do `App.tsx` para `features/chat/session-controller`

## 2026-04-14 - Sprint 3 corte 2B App import swap

- Fase: execution
- Sprint: 3 (`active`)
- Objetivo: trocar o consumo do `App.tsx` para importar `useSessionManager` diretamente de `features/chat/session-controller`
- Decisoes:
  - este corte fica limitado a mudar a borda de import do `App.tsx`
  - os testes de `App` passam a mockar o modulo da feature, nao mais a fachada em `hooks/useSessionManager`
  - save remoto continua em `App.tsx` e fica para o PR 2C
- Mudancas concluidas:
  - `App.tsx` passou a importar `useSessionManager` de `features/chat/session-controller`
  - `tests/App.layout.test.tsx` e `tests/App.loadingVariant.test.tsx` foram ajustados para mockar a feature diretamente
- Checks registrados:
  - testes focados de `App`, session controller e guardrail verdes
  - `npm run test` verde (`90` arquivos, `736` testes)
  - `npm run typecheck` verde
  - `npm run build` verde
- Riscos residuais:
  - este corte ainda nao extrai save remoto nem reduz o estado remoto do `App.tsx`
  - checklist manual em preview Vercel continua pendente para o pacote integrado de sessao
- Proximo passo:
  - abrir/revisar o PR 2B e seguir para o PR 2C, movendo save remoto para `features/chat/session-controller`

## 2026-04-14 - Sprint 3 corte 2C session remote save

- Fase: execution
- Sprint: 3 (`active`)
- Objetivo: mover o estado e a acao de save remoto de sessao para `features/chat/session-controller`
- Decisoes:
  - este corte fica limitado ao save remoto; o fluxo de mensagem permanece no `App.tsx`
  - o modulo da feature passa a exportar `useSessionRemoteSave` alem de `useSessionManager`
  - o contrato visual continua igual: `onSaveRemote`, `isSavingRemote` e `remoteSaveStatus`
- Mudancas concluidas:
  - criado `useSessionRemoteSave` em `features/chat/session-controller.ts`
  - `App.tsx` passou a consumir o save remoto a partir da feature
  - `tests/features/chat/session-controller.test.ts` ganhou cobertura para sucesso, erro e ausencia de sessao
  - mocks de `App` foram ajustados para incluir `useSessionRemoteSave`
- Checks registrados:
  - testes focados de remote save, session controller, `App` e guardrail verdes
  - `npm run test` verde (`90` arquivos, `739` testes)
  - `npm run typecheck` verde
  - `npm run build` verde
- Riscos residuais:
  - checklist manual em preview Vercel ainda precisa validar o pacote completo de sessao
  - warning de chunking envolvendo `utils/idbStorage.ts` continua aberto como OI-003
- Proximo passo:
  - abrir/revisar o PR 2C, validar manualmente o pacote de sessao e depois seguir para feedback actions

## 2026-04-14 - Sprint 3 corte 3 feedback actions

- Fase: execution
- Sprint: 3 (`active`)
- Objetivo: mover os handlers de feedback do `App.tsx` para `features/chat/feedback-actions.ts`
- Decisoes:
  - este corte fica limitado a feedback da mensagem, feedback por secao, report de erro e toggle de fontes
  - o payload remoto de `sendFeedbackRemote` permanece com `userId: operatorId` e `userName`
  - o fluxo de envio padrao continua no `App.tsx` e fica como ultimo corte da sprint
- Mudancas concluidas:
  - criado `features/chat/feedback-actions.ts` com `useChatFeedbackActions`
  - `App.tsx` passou a consumir os handlers de feedback a partir da feature
  - `tests/features/chat/feedback-actions.test.ts` cobre toggle local, envio remoto, section feedback, toggle de fontes e report de erro
  - mocks de `App` foram ajustados para incluir `useChatFeedbackActions`
- Checks registrados:
  - testes focados de feedback actions, `App` e guardrail verdes
  - `npm run test` verde (`91` arquivos, `745` testes)
  - `npm run typecheck` verde
  - `npm run build` verde
- Riscos residuais:
  - ainda falta o ultimo corte da Sprint 3 para o envio padrao/message orchestration
  - warning de chunking envolvendo `utils/idbStorage.ts` continua aberto como OI-003
- Proximo passo:
  - abrir/revisar o PR do corte 3, validar manualmente o fluxo de feedback e depois concluir a sprint com `features/chat/message-orchestrator.ts`

## 2026-04-14 - Sprint 3 corte final message orchestrator

- Fase: execution
- Sprint: 3 (`active`)
- Objetivo: extrair o envio padrao do chat para `features/chat/message-orchestrator.ts` mantendo o waterfall/dossie no `App.tsx`
- Decisoes:
  - `features/chat/message-helpers.ts` concentra `pickCompanyLabel`, `isAbortLikeError` e a garantia de sugestoes de continuidade para reuso no corte final
  - `App.tsx` continua dono do waterfall modular, do wrapper de Deep Dive e dos helpers exportados de PORTA
  - o novo hook `useChatMessageOrchestrator` passa a ser dono do envio padrao, placeholder thinking, retry do ultimo envio, tratamento de abort/erro e log remoto de investigacao
  - a deteccao de `Dossie completo` ficou tolerante a strings mojibake ja presentes no repo para preservar o comportamento atual
- Mudancas concluidas:
  - criado `features/chat/message-orchestrator.ts`
  - criado `features/chat/message-helpers.ts`
  - `App.tsx` passou a consumir `useChatMessageOrchestrator` e a delegar o branch padrao do envio
  - `tests/features/chat/message-orchestrator.test.ts` cobre criacao de sessao, follow-up, placeholder, abort, erro, retry, delegacao ao waterfall, deep dive e log remoto
  - `App.tsx` caiu para `1521` linhas (`-302` vs baseline da Sprint 3 em `1823`)
- Checks registrados:
  - regressions focados verdes: `App.loadingVariant`, `App.portaRecovery`, `components/ChatInterface`, `useChatImportGuard`
  - `npm run test` verde (`92` arquivos, `754` testes)
  - `npm run typecheck` verde
  - `npm run build` verde
- Riscos residuais:
  - falta a validacao manual integrada da sprint antes de marcar Sprint 3 como `done`
  - warning de chunking envolvendo `utils/idbStorage.ts` continua aberto como OI-003
  - warning conhecido de `SessionsSidebar.test.tsx` continua sem relacao com este corte
- Proximo passo:
  - abrir/revisar o PR final da Sprint 3, rodar a validacao manual integrada e, se estiver tudo ok, marcar a sprint como concluida

## 2026-04-14 - Sprint 3 corte final review fix patch

- Fase: execution
- Sprint: 3 (`active`)
- Objetivo: fechar a review da PR `#221` sem reabrir o design do corte final
- Decisoes:
  - manter `features/chat/message-orchestrator.ts` como boundary do envio padrao
  - remover helpers duplicados do `App.tsx` e consolidar `features/chat/message-helpers.ts` como dono unico dos utilitarios de parsing/abort/continuidade
  - corrigir encoding real em `App.tsx` em vez de manter workarounds de mojibake
  - trocar `sessions` por `sessionsRef.current` no orchestrator para reduzir churn do callback
- Mudancas concluidas:
  - `App.tsx` normalizado para UTF-8 canonico sem BOM
  - regexes, prompts, labels e mensagens de erro restaurados para texto legivel/canonico
  - `features/chat/message-orchestrator.ts` passou a detectar `Dossie completo` via texto normalizado
  - `tests/App.portaRecovery.test.ts` passou a importar `ensureContinuitySuggestions` da feature helper
- Checks registrados:
  - regressions focados verdes: `tests/features/chat/message-orchestrator.test.ts`, `tests/App.loadingVariant.test.tsx`, `tests/App.portaRecovery.test.ts`, `tests/components/ChatInterface.test.tsx`, `tests/architecture/useChatImportGuard.test.ts`
  - `npm run test` verde (`92` arquivos, `754` testes)
  - `npm run typecheck` verde
  - `npm run build` verde
- Riscos residuais:
  - falta o merge da PR `#221`
  - falta a validacao manual final da Sprint 3 apos o patch de review
  - warning de chunking envolvendo `utils/idbStorage.ts` continua aberto como OI-003
  - warning conhecido de `SessionsSidebar.test.tsx` continua sem relacao com este corte
- Proximo passo:
  - revisar/mergear a PR `#221`, rodar a validacao manual final da Sprint 3 e, se estiver tudo ok, marcar a sprint como concluida

## 2026-04-15 - Pos-merge sync apos PRs `#221` e `#222`

- Fase: execution
- Sprint: 3 (`active`)
- Objetivo: sincronizar as fontes canonicas com o estado real de `main` sem marcar a Sprint 3 como `done` antes da validacao manual integrada
- Decisoes:
  - manter Sprint 3 como `active` mesmo com os PRs `#221` e `#222` mergeados, porque o checklist manual integrado ainda nao foi concluido
  - adotar `npm run test:dossier` como fast-check do fluxo canonico de dossie
  - registrar o checkpoint manual de feedback como reportado pelo usuario em `2026-04-15`, mas nao tratar isso como fechamento suficiente do sprint
- Mudancas concluidas:
  - `02-BOARD.md`, `03-OPEN-ITEMS.md`, `06-HANDOFF.md`, `HANDOFF_AI.md` e `.agents/memory/*` sincronizados com o estado pos-merge
  - referencias a PR `#221` e PR `#222` atualizadas nas fontes canonicas
  - proximo passo seguro alinhado para validacao manual integrada da Sprint 3 e planejamento da Sprint 4
- Checks registrados:
  - baseline automatizado continua verde em `main` (`npm run test:dossier`, `npm run test`, `npm run typecheck`, `npm run build`)
- Riscos residuais:
  - a Sprint 3 ainda nao pode ser marcada como `done` sem a rodada manual integrada em runtime real
  - warning de chunking envolvendo `utils/idbStorage.ts` continua aberto como OI-003
  - backlog historico de `npm run lint` continua fora do gate
- Proximo passo:
  - rodar a validacao manual integrada da Sprint 3 e, se passar, marcar o sprint como concluido antes de abrir Sprint 4

## 2026-04-15 - Fechamento da Sprint 3 e abertura da Sprint 4

- Fase: execution
- Sprint: 3 (`done`) -> 4 (`active`)
- Objetivo: fechar operacionalmente a Sprint 3 apos a validacao manual integrada e abrir a Sprint 4 com sequenciamento em ondas
- Decisoes:
  - a validacao manual integrada da Sprint 3 foi aceita como concluida em runtime real em `2026-04-15`
  - Sprint 4 passa a rodar em ondas curtas com PR e validacao proprios
  - Onda 1 move a logica de dossie para `features/dossier/*` sem redesenhar o estado
  - Onda 2 introduz `stores/*` com `Context + Reducer` tipado e error boundaries por feature
- Mudancas concluidas:
  - `02-BOARD.md`, `03-OPEN-ITEMS.md`, `06-HANDOFF.md`, `HANDOFF_AI.md` e `.agents/memory/*` sincronizados para refletir Sprint 3 `done`
  - proximo passo seguro alinhado para a Onda 1 da Sprint 4
- Checks registrados:
  - validacao manual integrada da Sprint 3: green em `2026-04-15`
  - `npm run test:dossier`: green em `2026-04-15`
  - `npm run test`: green em `2026-04-15` (`93` arquivos, `755` testes)
  - `npm run typecheck`: green em `2026-04-15`
  - `npm run build`: green em `2026-04-15`
- Riscos residuais:
  - `App.tsx` e `services/geminiService.ts` continuam hotspots durante a Onda 1 da Sprint 4
  - `stores/*` e error boundaries ainda nao entraram; seguem como risco aberto ate a Onda 2
  - backlog historico de `npm run lint` continua fora do gate
- Proximo passo:
  - abrir a Onda 1 da Sprint 4 em branch/PR proprios, extrair `features/dossier/*` e validar com `npm run test:dossier`, `npm run test`, `npm run typecheck` e `npm run build`

## 2026-04-15 - Sprint 4 Onda 1 dossier runtime extraction

- Fase: execution
- Sprint: 4 (`active`)
- Objetivo: tirar o runtime de dossie/waterfall do `App.tsx` e mover a regra de negocio para `features/dossier/*` sem redesenhar o estado ainda
- Decisoes:
  - `features/dossier/waterfall-orchestrator.ts` passa a ser o novo dono de `runMegaPromptWaterfall`
  - `features/dossier/benchmark-stage.ts` encapsula benchmark isolado, timeout e falha opcional, preservando abort como erro terminal
  - `features/dossier/porta-reconciliation.ts` concentra retries por dimensao ausente, reconciliacao PORTA, fallback tecnico e integrity hold
  - `App.tsx` fica apenas como wiring do runner de dossie nesta onda; `stores/*` e boundaries ficam para a Onda 2
- Mudancas concluidas:
  - criado `features/dossier/waterfall-orchestrator.ts`
  - criado `features/dossier/benchmark-stage.ts`
  - criado `features/dossier/porta-reconciliation.ts`
  - `App.tsx` passou a instanciar `useDossierWaterfallOrchestrator` e caiu para `815` linhas
  - `tests/App.portaRecovery.test.ts` foi migrado para `tests/features/dossier/porta-reconciliation.test.ts`
  - criado `tests/features/dossier/benchmark-stage.test.ts`
  - preservados `ChatInterfaceProps`, `services/geminiService.ts` e o contrato de `RunMegaPromptWaterfallArgs`
- Validacoes manuais descritas para runtime real:
  - gerar um `Dossie completo` de ponta a ponta e conferir score PORTA + secoes finais
  - validar follow-up apos dossie completo
  - validar retry/recuperacao sem perder a mensagem final
  - validar exportacao, sugestoes de continuidade e persistencia remota sem regressao funcional
- Checks registrados:
  - `npm run test:dossier` verde
  - `npm run test` verde
  - `npm run typecheck` verde
  - `npm run build` verde
- Riscos residuais:
  - Onda 2 ainda precisa consolidar estado compartilhado em `stores/*`
  - error boundaries por feature ainda nao existem
  - warning de chunking envolvendo `utils/idbStorage.ts` continua aberto como OI-003
- Proximo passo:
  - mergear a Onda 1 em `main` e, depois, seguir para a Onda 2 (`stores/*` + error boundaries)

## 2026-04-16 - Sync canonico apos merge da Onda 1

- Fase: execution
- Sprint: 4 (`active`)
- Objetivo: sincronizar board/handoff/memory com o estado real de `main` apos o merge da Onda 1
- Decisoes:
  - tratar `7e110b91c7a2bd62a33158aab1f47035d9f2f97e` (`#227`) como novo baseline canonico do programa
  - apontar a Onda 2 como proximo trabalho ativo em vez de manter referencias de PR/review da Onda 1
  - manter o escopo manual da Onda 1 apenas como referencia de runtime, nao como item ainda pendente de merge
- Mudancas concluidas:
  - `.agents/memory/*`, `HANDOFF_AI.md`, `02-BOARD.md` e `06-HANDOFF.md` ajustados para o estado pos-`#227`
  - branch de trabalho aberto para a Onda 2: `codex/sprint4-wave2-stores-boundaries`
- Checks registrados:
  - baseline local sincronizado com `main` antes da abertura da Onda 2
- Riscos residuais:
  - `stores/*` e error boundaries ainda nao entraram; `App.tsx` segue hotspot ate o fechamento da Onda 2
  - backlog historico de `npm run lint` continua fora do gate
- Proximo passo:
  - implementar a Onda 2 com `stores/*` e boundaries de feature, depois validar e sincronizar novamente as fontes canonicas

## 2026-04-16 - Sprint 4 Onda 2 stores and feature boundaries

- Fase: review
- Sprint: 4 (`active`)
- Objetivo: tirar de `App.tsx` o estado compartilhado de sessao/loading/export, introduzir `stores/*` e adicionar boundaries locais para chat e dossie
- Decisoes:
  - `stores/chatStore.tsx` concentra sessao, mensagens, loading, `lastQuery`, `investigationLogged` e refs operacionais
  - `stores/dossierStore.tsx` concentra `exportStatus`, `exportError`, `pdfReportContent`, `isSavingRemote` e `remoteSaveStatus`
  - `App.tsx` passa a consumir `useChatStore()` e `useDossierStore()` sem alterar `ChatInterfaceProps`
  - `features/chat/ChatErrorBoundary.tsx` protege o shell do chat
  - `features/dossier/DossierErrorBoundary.tsx` protege o subtree de dossie e o overlay hero
  - `components/ErrorBoundary.tsx` reutiliza `utils/errorBoundaryAudit.ts` para auditoria/persistencia compartilhadas
- Mudancas concluidas:
  - criados `stores/chatStore.tsx` e `stores/dossierStore.tsx`
  - `index.tsx` e `App.tsx` atualizados para wiring de providers/stores
  - `features/chat/session-controller.ts`, `features/chat/feedback-actions.ts`, `features/chat/message-orchestrator.ts` e `features/dossier/waterfall-orchestrator.ts` passaram a consumir stores/contexto opcional em vez de setter bags do `App`
  - criados `features/chat/ChatErrorBoundary.tsx`, `features/dossier/DossierErrorBoundary.tsx` e `utils/errorBoundaryAudit.ts`
  - `components/MessageRow.tsx` passou a envolver o subtree de dossie com boundary local
  - adicionados testes de store e boundaries
- Checks registrados:
  - `npm run test:dossier` verde em `2026-04-16`
  - `npm run test` verde em `2026-04-16`
  - `npm run typecheck` verde em `2026-04-16`
  - `npm run build` verde em `2026-04-16`
- Riscos residuais:
  - a Onda 2 ainda nao foi mergeada em `main`; falta PR/review e rodada manual em preview/Vercel
  - `npm run lint` continua fora do gate por backlog historico
  - build segue emitindo o warning de chunking envolvendo `utils/idbStorage.ts` (OI-003)
- Proximo passo:
  - abrir/revisar a PR da Onda 2, rodar a validacao manual em runtime real e, apos merge, sincronizar novamente as fontes canonicas antes da Sprint 5

## 2026-04-20 - Fechamento da Sprint 5 e apontamento da Sprint 6

- Fase: planning
- Sprint: 5 (`done`) -> 6 (`planned`)
- Objetivo: reconciliar as fontes canonicas com o estado real de `main` apos a PR `#229` e mover o proximo passo oficial para a Sprint 6
- Decisoes:
  - aceitar a confirmacao do operador e o uso continuo sem reclamacoes como evidencia suficiente de validacao manual da Sprint 5
  - tratar a Sprint 5 como encerrada em `main` apos o merge da PR `#229`
  - apontar a Sprint 6 como proximo foco oficial, sem marcar a sprint como iniciada antes da abertura de branch propria
- Mudancas concluidas:
  - `02-BOARD.md`, `03-OPEN-ITEMS.md`, `06-HANDOFF.md`, `HANDOFF_AI.md` e `.agents/memory/*` sincronizados para refletir Sprint 5 `done`
  - itens stale de `03-OPEN-ITEMS.md` atualizados para o estado pos-Sprint 4 / pos-Sprint 5
  - proximo passo seguro alinhado para a abertura da Sprint 6 em `prompts/megaPrompts.ts`
- Checks registrados:
  - nenhuma rodada automatizada nova foi necessaria para esta reconciliacao documental
  - Sprint 5 ja tinha gate automatizado green em `2026-04-17` com `npm run test`, `npm run typecheck` e `npm run build`
  - validacao manual da Sprint 5 aceita em `2026-04-20` com base na confirmacao do operador e no uso continuo sem reclamacoes
- Riscos residuais:
  - `prompts/megaPrompts.ts` segue monolitico e com debt de tipagem/encoding ate a Sprint 6
  - `npm run lint` continua fora do gate por backlog historico
  - warning de chunking envolvendo `utils/idbStorage.ts` continua aberto como OI-003
- Proximo passo:
  - abrir a Sprint 6 em branch propria a partir do `main`, modularizar `prompts/megaPrompts.ts` em `prompts/mega/*`, preservar markers `[[PORTA_*]]` e remover `@ts-nocheck`

## 2026-04-22 - Fechamento da Sprint 6 e apontamento da Sprint 7

- Fase: execution
- Sprint: 6 (`done`) -> 7 (`planned`)
- Objetivo: reconciliar as fontes canonicas com o estado real de `main` apos o merge da PR `#236` e mover o proximo passo oficial para a Sprint 7
- Decisoes:
  - tratar a Sprint 6 como encerrada apos o merge da PR `#236` em `main`
  - aceitar o gate tecnico ja registrado na PR `#236` como suficiente para o fechamento, sem rerodar checks so para a reconciliacao documental
  - registrar que Deep Dive nao exigiu validacao manual dedicada neste ciclo, porque o fluxo esta atualmente oculto na superficie ativa do produto
  - manter `mcp-server/` fora do escopo ate depois das Sprints 6-8
- Mudancas concluidas:
  - `02-BOARD.md`, `03-OPEN-ITEMS.md`, `06-HANDOFF.md`, `HANDOFF_AI.md` e `.agents/memory/*` sincronizados para refletir Sprint 6 `done`
  - proximo passo seguro alinhado para a abertura da Sprint 7 a partir do `main`
- Checks registrados:
  - PR `#236` mergeada em `main`
  - `npm run typecheck`: green em `2026-04-22`
  - `tests/prompts/megaPrompts.test.ts`: green em `2026-04-22`
  - `tests/features/dossier/waterfall-orchestrator.test.ts`: green em `2026-04-22`
  - `npm run test:dossier`: green em `2026-04-22`
  - `npm run build`: green em `2026-04-22`
  - `npm run test:e2e:smoke`: green em `2026-04-22`
- Riscos residuais:
  - `npm run lint` continua fora do gate por backlog historico
  - warnings aceitos em `03-OPEN-ITEMS.md` seguem abertos
  - `mcp-server/` continua local-only e fora do programa atual
- Proximo passo:
  - abrir a Sprint 7 a partir do `main`, priorizando a extracao de `market-intelligence.ts` de `constants.ts`, depois validar imports/consumidores, remover `hooks/useChat.ts` e fazer hardening leve em `services/apiConfig.ts`

## 2026-04-22 - Sprint 7 constantes, legado e higiene

- Fase: validation
- Sprint: 7 (`validation`)
- Objetivo: reduzir o hotspot `constants.ts`, remover o legado morto `hooks/useChat.ts` e endurecer `services/apiConfig.ts` sem mudar comportamento do produto
- Decisoes:
  - manter `constants.ts` como facade publica de constantes/prompts principais
  - mover apenas os blocos internos de inteligencia de mercado para `constants/market-intelligence.ts`
  - remover `hooks/useChat.ts` e transformar o guardrail em bloqueio de import + ausencia do arquivo
  - consolidar `SENIOR_PRODUCT_URLS` e `findSeniorProductUrl` em `utils/seniorLinks.ts`, reexportando por `services/apiConfig.ts` para compatibilidade
  - manter `types.ts`, `services/geminiService.ts` e `mcp-server/` fora do escopo
- Mudancas concluidas:
  - criado `constants/market-intelligence.ts`
  - `constants.ts` preserva `APP_NAME`, `APP_VERSION`, `ChatMode`, `DEFAULT_MODE`, `MODE_LABELS`, `BASE_SYSTEM_PROMPT` e `OPERACAO_PROMPT`
  - removidos `hooks/useChat.ts` e `tests/hooks/useChat.test.ts`
  - criado `tests/utils/sessionTitleHeuristics.test.ts`
  - atualizado `tests/architecture/useChatImportGuard.test.ts`
  - `services/apiConfig.ts` passou a usar env fallback tipado com referencias estaticas `import.meta.env.VITE_*` e a reexportar links Senior de `utils/seniorLinks.ts`
  - feedback do Gemini enderecado: `mcp-server/src/index.ts` removido do diff da PR
- Checks registrados:
  - focused Sprint 7 suite verde em `2026-04-22`
  - `npm run test:dossier` verde em `2026-04-22`
  - `npm run test` verde em `2026-04-22` (`102` arquivos, `785` testes)
  - `npm run typecheck` verde em `2026-04-22`
  - `npm run build` verde em `2026-04-22`
  - `npm run lint` verde em `2026-04-22` com `0` erros e `182` warnings
  - `npm run docs:obsidian:check` verde em `2026-04-22`
- Riscos residuais:
  - no fechamento tecnico de `2026-04-22`, a validacao manual final em Vercel ainda nao havia sido registrada; o aceite entrou em `2026-04-23` no bloco abaixo
  - `npm run lint` ainda tem backlog de warnings, incluindo ruido do `mcp-server/` diferido
  - warning de chunking envolvendo `utils/idbStorage.ts` continua aberto como OI-003
- Proximo passo:
  - historico do dia `2026-04-22`: seguir para merge da PR da Sprint 7 sem incluir `mcp-server/`, registrar a validacao manual em Vercel e so entao marcar a Sprint 7 como `done`

## 2026-04-23 - Fechamento da Sprint 7 e apontamento da Sprint 8

- Fase: planning
- Sprint: 7 (`done`) -> 8 (`planned`)
- Objetivo: reconciliar as fontes canonicas com o estado real de `main` apos o merge da PR `#239` e mover o proximo passo oficial para a Sprint 8
- Decisoes:
  - tratar a Sprint 7 como encerrada apos o merge da PR `#239` em `main`
  - aceitar a confirmacao do operador como validacao manual final da Sprint 7 em `2026-04-23`
  - manter warnings residuais `OI-003`, `OI-004` e `OI-005` abertos, sem misturar cleanup transversal neste closeout
  - manter `mcp-server/` explicitamente fora do escopo
- Mudancas concluidas:
  - `02-BOARD.md`, `03-OPEN-ITEMS.md`, `06-HANDOFF.md`, `HANDOFF_AI.md` e `.agents/memory/*` sincronizados para refletir Sprint 7 `done`
  - camada `docs/obsidian/` sincronizada para apontar Sprint 8 como proximo passo oficial
  - rastreabilidade da PR `#239` atualizada para registrar a validacao manual aceita
- Checks registrados:
  - PR `#239` mergeada em `main` em `2026-04-23`
  - validacao manual da Sprint 7 aceita em `2026-04-23`
  - `npm run docs:obsidian:check`: green em `2026-04-23`
- Riscos residuais:
  - warning de chunking envolvendo `utils/idbStorage.ts` continua aberto como OI-003
  - warning de `SessionsSidebar.test.tsx` continua aberto como OI-004
  - `npm run lint` continua com backlog de warnings como OI-005
  - `mcp-server/` continua local-only e fora do programa atual
- Proximo passo:
  - abrir a Sprint 8 a partir do `main`, modularizando `services/warRoomService.ts` em `services/war-room/` e consolidando a documentacao final

## 2026-04-23 - Sprint 8 War Room modularization + Radar stub

- Fase: execution
- Sprint: 8 (`active`)
- Objetivo: decompor internamente `services/warRoomService.ts` sem quebrar a facade publica, remover parser duplicado do `components/WarRoom.tsx` e criar o boundary inicial de `features/radar/`
- Decisoes:
  - `services/warRoomService.ts` permanece como facade publica estavel
  - a nova implementacao interna do War Room fica concentrada em `services/war-room/*`
  - o parser compartilhado vive em `services/war-room/intent.ts` e pode ser consumido por `components/WarRoom.tsx` e pelos testes
  - `types.ts` continua como fonte de verdade do Radar; `features/radar/types.ts` apenas reexporta contratos
  - `mcp-server/` continua fora do escopo da sprint
- Mudancas concluidas:
  - criado `services/war-room/contracts.ts`, `config.ts`, `history.ts`, `intent.ts`, `retrieval.ts`, `prompting.ts`, `sources.ts` e `query.ts`
  - `services/warRoomService.ts` virou facade fina com reexports do contrato publico e de `queryWarRoom`
  - `components/WarRoom.tsx` deixou de manter regex/regras locais para alvo/intencao
  - `tests/components/warRoomTargetExtract.test.ts` passou a importar o helper compartilhado
  - criado `features/radar/README.md`, `features/radar/types.ts` e `features/radar/index.ts`
- Checks registrados:
  - focused suites de War Room + Radar verdes em `2026-04-23`
  - `npm run test` verde (`102` arquivos, `785` testes)
  - `npm run typecheck` verde
  - `npm run build` verde
  - `npm run lint` verde com `0` erros e `180` warnings
- Riscos residuais:
  - PR `#241` ainda esta aberta em draft e nao foi mergeada em `main`
  - o runtime real do Radar ainda nao foi movido para dentro de `features/radar/`
- Proximo passo:
  - concluir o review final da PR `#241` e mergear a Sprint 8 sem ampliar o escopo

## 2026-04-23 - Fechamento documental da Sprint 8

- Fase: execution
- Sprint: 8 (`active`, validada e documentada; aguardando merge)
- Objetivo: reconciliar as fontes canonicas com o estado real da branch apos a validacao manual aceita e o enderecamento do review da PR `#241`
- Decisoes:
  - registrar a validacao manual da Sprint 8 como aceita em `2026-04-23`
  - manter a Sprint 8 como `active` no board ate o merge da PR `#241`, em vez de marcar `done` antecipadamente
  - tratar `features/radar/` como boundary oficial resolvendo o OI-044 sem mover o runtime do Radar nesta sprint
- Mudancas concluidas:
  - `.agents/memory/*`, `HANDOFF_AI.md`, `02-BOARD.md`, `03-OPEN-ITEMS.md` e `06-HANDOFF.md` sincronizados com a branch `codex/sprint8-war-room-radar-boundary`
  - referencias stale da branch antiga removidas da memoria/handoff
  - PR `#241` registrada como aberta em draft, mergeable e com validacao manual ja aceita
- Checks registrados:
  - validacao manual da Sprint 8 aceita em `2026-04-23`
  - focused post-review rerun verde com `tests/services/warRoomService.test.ts`, `tests/services/warRoomCanary.test.ts` e `tests/components/warRoomTargetExtract.test.ts`
  - `npm run typecheck` verde apos os fixes de review em `2026-04-23`
- Riscos residuais:
  - a Sprint 8 ainda depende do merge da PR `#241` para fechar em `main`
  - o runtime do Radar segue fora de `features/radar/` por decisao de escopo
- Proximo passo:
  - concluir o review final da PR `#241`, tirar de draft quando apropriado e mergear sem ampliar a sprint

## 2026-04-23 - Fechamento efetivo da Sprint 8 em `main`

- Fase: closeout
- Sprint: 8 (`done`)
- Objetivo: reconciliar as fontes canonicas apos o merge da PR `#241` e fechar a Fase 1 (Sprints 1-8)
- Decisoes:
  - tratar a Sprint 8 como `done` em `main` apos o merge de `#241`
  - manter `features/radar/*` como boundary oficial, sem mover runtime nesta etapa
  - abrir a fase seguinte como trilha dedicada de manutenibilidade (Sprints 9-12)
- Mudancas concluidas:
  - baseline do board atualizada para `origin/main@ccd2001518367961637b1a9488c2319aa83d0a21`
  - handoff e open-items movidos para contexto pos-Sprint 8
  - backlog de hotspots organizado para a nova fase
- Checks registrados:
  - Sprint 8 ja estava com gates tecnicos e validacao manual aceitos antes do merge
- Riscos residuais:
  - warnings operacionais OI-003, OI-004 e OI-005 seguem abertos
- Proximo passo:
  - abrir Sprint 9 com foco em desacoplamento do app shell

## 2026-04-23 - Kickoff documental da Fase 2 (Manutenibilidade)

- Fase: planning
- Sprint: 9 (`planned`)
- Objetivo: criar o documento inicial da nova trilha e sincronizar o pacote canonico de refactor
- Decisoes:
  - novo plano base fica em `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
  - APIs publicas permanecem congeladas durante as Sprints 9-12
  - `mcp-server/` continua fora do escopo da trilha
- Mudancas concluidas:
  - criado `08-PHASE2-MAINTAINABILITY-PLAN.md`
  - atualizados `00-README.md`, `01-MASTER-PLAN.md`, `02-BOARD.md`, `03-OPEN-ITEMS.md` e `06-HANDOFF.md`
  - trilha refletida em handoff/memory/roadmap para continuidade entre sessoes
- Checks registrados:
  - censo de hotspots e dominios confirmado (`components 51`, `features 13`, `hooks 11`, `services 35`, `stores 2`, `utils 32`, `tests 114`)
- Riscos residuais:
  - execucao da Sprint 9 ainda nao iniciada
- Proximo passo:
  - abrir o trabalho de implementacao da Sprint 9 com escopo fechado e gates completos

## 2026-05-16 - Onda 0+1 cleanup pós-Sprint 9

- Fase: cleanup
- Branch: `refactor/wave-0-1-cleanup`
- Base: `origin/main@922a403`
- Objetivo: reconciliar o estado pós-merge da PR `#254` e aplicar uma correção técnica pequena antes da Sprint 10.
- Contexto confirmado:
  - PR `#254` mergeada em `main` em 2026-05-16
  - head da branch: `19485dc`
  - merge commit: `922a403`
  - docs/memória ainda tratavam Sprint 9 como review/aguardando merge
- Decisões:
  - executar Onda 0 e Onda 1 juntas
  - usar worktree limpa para não misturar mudanças locais de `refactor/code-quality`
  - manter Radar boundary, componentes grandes, PWA e performance fora desta PR
- Escopo técnico:
  - corrigir `portaIntegrityHold` para não tratar falha parcial como hold de integridade
  - migrar logs cliente sensíveis para `scoutDiag`
- Próximo passo:
  - abrir PR da Onda 0+1
  - depois do merge, iniciar Sprint 10
- Checks registrados:
  - testes focados de PORTA: green (`15` testes)
  - testes focados de logs/extraction: green (`20` testes)
  - `npm run typecheck`: green
  - `npm run test`: green (`114` arquivos, `846` testes)
  - `npm run build`: green, com warnings aceitos de chunking
  - `npm run lint`: green com `0` erros e `150` warnings conhecidos
  - `npm run analyze:circular`: green, sem ciclos

## 2026-05-16 - PR #255 ajuste pós-validação: open-web-search

- Fase: validação de preview
- Branch: `refactor/wave-0-1-cleanup`
- PR: `#255`
- Problema observado:
  - validação manual em preview mostrou `Failed to load resource: /api/open-web-search 500`;
  - o fluxo funcional concluiu, mas o erro HTTP real não poderia ser tratado como aceitável.
- Causa raiz confirmada em logs Vercel:
  - `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/utils/diagnosticLog' imported from /var/task/api/open-web-search.js`;
  - a função serverless quebrava antes do `try/catch` do handler.
- Correções:
  - imports serverless ESM com `.js` em `api/open-web-search.ts`, `api/extract-content.ts` e `utils/documentExtractor.ts`;
  - schema de `/api/open-web-search` passou a aceitar `{ url }` sem `query`;
  - adicionado teste para URL sem query e request vazio.
- Checks registrados:
  - `npm exec vitest run tests/api-open-web-search.test.ts tests/services/investigation-orchestration.test.ts tests/services/geminiProxy.test.ts tests/extraction.test.ts`: green (`16` testes)
  - review comments do Gemini Code Assist em `clientLookupService` e `extractContentService` resolvidos trocando `catch (...: any)` por `unknown`
  - `npm exec vitest run tests/services/clientLookupService.test.ts tests/extraction.test.ts tests/api-open-web-search.test.ts`: green (`27` testes)
  - `npm run typecheck`: green
  - `npm run build`: green
  - `vercel build --yes`: green
  - checks remotos da PR: AI Config, Typecheck, Build, Tests, Dossier Golden, GitGuardian e Vercel green
  - smoke com Vercel Protection Bypass:
    - query real em `/api/open-web-search`: `200`, `OpenWebSearch/Brave`, `degraded: false`, `5` fontes
    - somente `url`: `200`, `OpenWebSearch/URL`
    - `{}`: `400` esperado
    - logs Vercel `500` nos 15 minutos pós-fix: sem ocorrências
