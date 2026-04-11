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
- Sprint: 1 (`active`)
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
  - guardrail contra novos consumidores de `hooks/useChat.ts` ainda nao foi criado
  - warning de `SessionsSidebar.test.tsx` continua aberto
  - warning de chunking envolvendo `utils/idbStorage.ts` continua aberto
- Proximo passo:
  - fechar o guardrail de `hooks/useChat.ts` e registrar as fronteiras congeladas da Sprint 1
