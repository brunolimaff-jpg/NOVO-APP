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
