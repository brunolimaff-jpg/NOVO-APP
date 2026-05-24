# Decisions

Last updated: 2026-05-23

## 2026-05-23 — Plano de Melhorias no Dossiê (RAG + Contexto)

Decision: executar 10 melhorias no fluxo de geração de dossiê em 2 sprints, começando por passar contexto RAG, concorrentes e PORTA para todos os módulos do waterfall (A1 — base crítica). Documento completo em `docs/obsidian/decisions/MELHORIAS-DOSSIE-RAG.md`.

Reason: o waterfall de 5 módulos não recebe RAG/Pinecone, docs da Senior, concorrentes regionais nem PORTA state — contexto que só chega ao `sendMessageToGemini`. A lacuna foi descoberta ao rastrear o fluxo completo de `waterfall-orchestrator.ts` → `generateDossierModule` vs `sendMessageToGemini` → `buildExtraContext`.

Constraint: não tocar em fachadas congeladas (`geminiService.ts`, `ChatInterface.tsx`, `constants.ts`, `types.ts`). Reusar `buildExtraContext` em vez de duplicar. Temperaturas: 0.1 (factual) a 0.3 (inferência).

## 2026-04-14 - Repo-local memory v1

Decision: use repo-local Markdown files under `.agents/memory/` for persistent memory.

Reason: this is simple, inspectable, versionable, and works in Codex without requiring a database, MCP server, or global user profile state.

## 2026-04-14 - `plan-work` as default planning skill

Decision: install and prefer `plan-work` for implementation plans.

Reason: it is lightweight, Codex-oriented, and forces repo research, option analysis, Q&A, and a concrete implementation plan before edits.

## 2026-04-14 - Handoff hierarchy

Decision: `HANDOFF_AI.md` remains the canonical quick-entry handoff. `.agents/memory/*` is the short cross-session memory layer. The refactor program status remains canonical in `docs/ai-context/refactor/02-BOARD.md`, with risks in `03-OPEN-ITEMS.md` and next safe step in `06-HANDOFF.md`.

Reason: this avoids depending on chat memory while preserving the dedicated refactor board as the live source of truth.

## 2026-04-15 - Sprint 4 store strategy

Decision: Sprint 4 will introduce `stores/*` using `Context + Reducer` typed state instead of adding `zustand`.

Reason: the repo does not currently depend on `zustand`, the Sprint 4 goal is structural extraction rather than state-library rollout, and `Context + Reducer` keeps the state boundary explicit without mixing a new dependency into the dossier refactor.

## 2026-04-19 - Obsidian repo graph as versioned navigation layer

Decision: add `docs/obsidian/` as a versioned Obsidian graph layer for architecture + roadmap, with `docs/obsidian/00-MASTER.md` as the entrypoint and `scripts/obsidian/check.mjs` as the local contract check.

Reason: this gives AI-led workflows and human reviewers a durable visual map of the repo while keeping canonical live status in `HANDOFF_AI.md`, `.agents/memory/*`, and `docs/ai-context/refactor/*` instead of duplicating authority into the graph layer.

## 2026-04-22 - Defer `mcp-server/` until after the sprint program

Decision: keep `mcp-server/` explicitly out of scope for Sprints 6-8, and do not surface it as a blocker, review target, or PR scope item during the remaining refactor track unless the user reprioritizes it.

Reason: the current priority is to finish the planned structural refactor first; `mcp-server/` is not shipping now and should not contaminate the active sprint branches.

## 2026-04-22 - Senior product links source of truth

Decision: `utils/seniorLinks.ts` is the source of truth for `SENIOR_PRODUCT_URLS` and `findSeniorProductUrl`; `services/apiConfig.ts` only reexports them for backward compatibility.

Reason: product URL matching is link-fixing utility behavior, not API endpoint configuration. Keeping one map removes duplication while preserving the public `services/apiConfig.ts` contract.

## 2026-04-23 - Start Phase 2 maintainability track

Decision: close Fase 1 (Sprints 1-8) after merge of PR `#241` and open a new documentary baseline for Sprints 9-12 in `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`.

Reason: the original refactor program reached its planned structural boundaries; next work needs a new hotspot-driven track focused on maintainability without breaking stable public facades.

## 2026-04-23 - Freeze public facades for Sprints 9-12

Decision: keep `services/geminiService.ts`, `services/warRoomService.ts`, `components/ChatInterface.tsx`, `constants.ts`, `prompts/megaPrompts.ts`, and `types.ts` as stable public contracts throughout Fase 2.

Reason: limiting API churn reduces integration risk and allows incremental refactors focused on internal coupling and code ownership boundaries.

## 2026-04-28 - `api/cnpj.ts` must be validated in serverless runtime

Decision: validate the CNPJ proxy flow with `vercel dev` or a deployed serverless environment, not with plain `vite`.

Reason: in this repo the frontend dev server does not proxy `/api/cnpj`, so `npm run dev` can return the app HTML for that path and create a false "consulta indisponivel" diagnosis unrelated to the proxy handler itself.

## 2026-04-28 - Localhost CNPJ flow should fail loudly, not generically

Decision: when `localhost` receives the app HTML instead of JSON for `/api/cnpj`, surface an explicit local-proxy guidance message in logs and UI instead of treating it as generic service downtime.

Reason: the recurring symptom was a misleading "Servico de consulta indisponivel" message. Distinguishing "missing local proxy/runtime" from true provider failure reduces wasted debugging on preview/Vercel and external APIs.

## 2026-05-05 - Repo sem skills locais ativas

Decision: remover as skills operacionais versionadas em `.agents/skills/` do repo e mante-las apenas no ambiente global do usuario em `~/.agents/skills/`, preservando apenas `.agents/skills/archive/` como referencia historica.

Reason: separar o ambiente operacional do conteudo versionado reduz acoplamento com o repositorio, tira essas skills do escopo do GitHub e preserva as licoes aprendidas ja documentadas.

## 2026-05-16 - Pinecone frontend env aceito para app interno

Decision: manter `VITE_PINECONE_API_KEY` e `VITE_PINECONE_INDEX_HOST` no frontend durante a Sprint 9.

Reason: o owner confirmou que o app e interno/fechado e aceitou o risco operacional. OI-055 passa a ser risco aceito e deve ser reavaliado se o app virar externo.

## 2026-05-16 - LastAction movido para types.ts

Decision: mover tipo `LastAction` de `features/chat/message-orchestrator.ts` para `types.ts` para eliminar dependencia circular com `stores/chatStore.tsx`.

Reason: `chatStore` importa `LastAction` de `message-orchestrator`, e `message-orchestrator` importa `useMaybeChatStore` de `chatStore`, criando ciclo detectavel por `madge`. Mover o tipo compartilhado para `types.ts` segue o padrao do repo onde `types.ts` e a fonte centralizada de contratos.

## 2026-05-16 - Review com agente especializado antes de PR

Decision: toda PR da Sprint 9+ deve passar por review com agente `reviewer` antes do commit final.

Reason: a review encontrou 2 P1 e 4 P2 que teriam ido para a PR sem deteccao. O custo de rodar o reviewer e baixo comparado ao risco de merge com issues de seguranca ou arquiteturais.

## 2026-05-16 - Onda 0+1 antes da Sprint 10

Decision: executar uma ponte curta `refactor/wave-0-1-cleanup` antes de abrir a Sprint 10.

Reason: a PR `#254` ja estava mergeada em `main`, mas os docs/memorias ainda tratavam Sprint 9 como aberta. A mesma investigacao encontrou dois ajustes pequenos e seguros para fazer antes do Radar: corrigir o hold parcial de PORTA e trocar logs cliente sensiveis por `scoutDiag`. Escopos maiores (`Radar`, componentes grandes, PWA, performance) ficam fora desta onda para preservar revisao pequena.

## 2026-05-16 - Sprint 10 preserva facades Radar

Decision: mover o runtime do Radar para `features/radar/*`, mas manter `hooks/useRadar.ts` e `services/radarService.ts` como facades de compatibilidade nesta PR.

Reason: a Sprint 10 e uma mudanca de boundary, nao redesign funcional. Preservar os caminhos publicos reduz risco para consumidores existentes, enquanto `tests/architecture/radarBoundaryImportGuard.test.ts` impede novos imports de producao pelos caminhos legados.

## 2026-05-19 - Mini CRM local removido

Decision: remover completamente o Mini CRM local do app (`CRMProvider`, `CRMView`, `CRMDetail`, `CRMPipeline`, contratos, tipos e testes dedicados) e retirar `CRMDetail` da trilha de refatoracao da Sprint 11.

Reason: o owner confirmou que o Mini CRM nao e usado e nao sera usado. Remover a feature reduz superficie de manutencao e elimina um hotspot grande sem investir em refatoracao de algo sem valor de produto.

Constraint: preservar referencias ao CRM interno Senior em prompts, evidencias, fixtures e dossies, pois elas representam fonte comercial de inteligencia e nao a feature Mini CRM local.

## 2026-05-19 - Vite dev deve proxiar rotas serverless usadas pelo app

Decision: centralizar as rotas de proxy local em `config/localDevApiProxy.ts` e incluir `/api/open-web-search`, `/api/link-status`, `/api/extract-content`, `/api/rag` e `/api/docs-rag` alem das rotas ja existentes.

Reason: o Vercel e o runtime real, mas `npm run dev` precisa evitar falsos 404 para rotas serverless usadas pelo frontend e pelo fluxo de investigacao.

## 2026-05-20 - AdminDash removido por decisão de produto

Decision: remover completamente o AdminDash (`components/AdminDash.tsx`, `hooks/useAdminMetrics.ts`, testes dedicados) e a prop `onOpenAdminDash` de `ChatInterface`, `ChatShell` e `App.tsx`.

Reason: o painel administrativo nao era usado e nao tinha valor de produto. Remover reduz superficie de manutencao e simplifica o header (o botao de admin foi substituido pelo breadcrumb).

Constraint: o estado `activeView` e a logica de `isAdminOpen` foram removidos de `App.tsx`.

## 2026-05-20 - UX Redesign Phase 1 priorizado sobre Design System

Decision: executar melhorias incrementais de UX (AdminDash removal, breadcrumb, sidebar, error feedback) em vez do Design System completo (Sprints 17-20).

Reason: o owner avaliou que um Design System formal nao se justifica para app interno. Melhorias incrementais de usabilidade tem ROI mais alto e custo mais baixo.

Constraint: o escopo foi limitado a 4 itens (AdminDash, breadcrumb, sidebar, error feedback). Simplificar a tela inicial (EmptyStateHome) e unificar loading foram rejeitados pelo owner.

## 2026-05-22 - allowRawHtml=false como padrão seguro

Decision: alterar `components/MarkdownRenderer.tsx` para `securityLevel: 'strict'` e `allowRawHtml` default `false`. Links HTML de resultados de pesquisa (`<a href>`) sao convertidos para markdown `[text](url)` via regex no `processedContent`, e citacoes `[url]` geram markdown links em vez de HTML.

Reason: prevencao de XSS. Em vez de reabilitar `rehypeRaw` (que permitiria HTML arbitrario), o conteudo pre-processado normaliza HTML conhecido para markdown puro. Isso mantem a seguranca sem quebrar links de pesquisa.

Constraint: se `rehypeRaw` for reintroduzido no futuro, deve vir com `allowedElements` e `disallowedTagsMode: 'escape'` explicitos.

## 2026-05-22 - clientLookupService: match parcial não inclui dados CRM

Decision: em `services/clientLookupService.ts`, quando `matchType !== 'exact'`, `formatarParaPrompt()` nao inclui dados detalhados de CRM (modulos, gaps). Retorna apenas um alerta instruindo o modelo a tratar a empresa como PROSPECT.

Reason: empresas similares (ex: "Pampa" vs "Pampafoods") causavam alucinacao do Gemini, que usava dados de modulos/gaps de uma empresa na resposta sobre outra. Omitir dados CRM em match parcial elimina a fonte de confusao.

## 2026-05-22 - setSecurityHeaders com guard de compatibilidade

Decision: `api/_security-headers.ts` usa `typeof res.setHeader !== 'function'` como guard antes de aplicar security headers, em vez de lancar erro ou exigir mock completo em testes.

Reason: testes Vitest que chamam handlers serverless sem mock completo do objeto `res` nao quebram. O guard e silencioso — se `setHeader` nao existe, os headers simplesmente nao sao aplicados. Isso e aceitavel porque seguranca header e uma preocupacao de runtime Vercel, nao de teste unitario.

## 2026-05-22 - Pinecone exclusivamente via serverless

Decision: remover `VITE_PINECONE_API_KEY` e `VITE_PINECONE_INDEX_HOST` de `index.tsx` (`OPTIONAL_ENV_VARS`) e do bundle frontend. Pinecone e usado exclusivamente em `api/rag.ts` e `api/docs-rag.ts`.

Reason: variaveis `VITE_*` sao inlineadas no bundle frontend no build, expondo chaves de API no navegador. Como o Pinecone ja era acessado apenas via serverless functions, esta mudanca remove o risco sem perda funcional. A decisao anterior de 2026-05-16 (Pinecone frontend env aceito para app interno) fica sobrescrita.

## 2026-05-19 - Modelo canônico enxuto para planos em aberto

Decision: manter `02-BOARD.md` como status vivo, `03-OPEN-ITEMS.md` como fila de riscos/OIs, `sprints/SPRINT-11-EXECUTION.md` como plano executavel da Sprint 11, e tratar `docs/obsidian/*` como navegacao visual, nao fonte de verdade.

Reason: apos a PR `#259`, havia duplicacao entre handoffs, board, indice de sprints e roadmap Obsidian, com referencias antigas a Sprint 8/10 e `CRMDetail`. O modelo enxuto reduz retrabalho e impede que agentes escolham um plano stale como proximo passo.

## 2026-05-23 - Version bump 0.0.0 -> 1.0.0 para trigger PWA auto-update

Decision: alterar `package.json` version de `0.0.0` para `1.0.0` como gatilho para o service worker detectar nova versao e oferecer atualizacao via `vite-plugin-pwa`.

Reason: a versao `0.0.0` era um placeholder de desenvolvimento. A migracao Supabase e as melhorias pos-migracao (cadastro restrito, email recovery, sync manual, feedback remoto) representam um marco funcional que justifica a promocao para `1.0.0`. Alem disso, usuarios existentes precisam ser notificados para atualizar o app e comecar a usar a nova camada de persistencia. O `vite-plugin-pwa` compara o `version.json` servido pelo deploy com o armazenado no `localStorage`; qualquer mudanca de string version dispara o update flow.

Constraint: a versao e semantica apenas para este efeito. Nao ha processo formal de versionamento semantico. Reavaliar quando houver processo de release.

## 2026-05-23 - Bug fix update notification: fallback removido, persistencia adiada

Decision: remover o fallback `|| versionData.version` em `hooks/useUpdateNotification.ts`. No primeiro acesso (sem `current_app_version` no localStorage), salvar a versao sem notificar. A versao so e persistida em `updateNow()` quando o usuario clica em "atualizar agora".

Reason: o fallback causava um falso positivo: quando nao havia `current_app_version` (primeiro acesso ou localStorage limpo), `versionData.version` era interpretado como versao "nova" em relacao a `undefined`, disparando notificacao indevida. Adiar a persistencia para `updateNow()` garante que, se o usuario snoozar a notificacao e ela expirar, o check subsequente encontre `storedVersion` vazio novamente e re-exiba a notificacao, em vez de achar que o usuario ja esta atualizado.

## 2026-05-23 - Migration notice como modal one-time com prioridade

Decision: criar `components/MigrationNoticeModal.tsx` como modal one-time para usuarios legados, renderizado com prioridade sobre `UpdateNotificationModal`. Flag `scout360:supabase_migration_seen` no localStorage controla a exibicao unica.

Reason: usuarios que ja usavam o app antes da migracao Supabase precisam saber que (1) dados antigos continuam no navegador, nao migraveis, e (2) novos dossies serao salvos no banco. Exibir o aviso uma unica vez evita friccao recorrente. Oferecer exportacao do historico via `exportSessionsAsJSON()` da ao usuario controle sobre seus dados legados.

Options considered:
- A: Banner no header — menos intrusivo, mas facil de ignorar; informacao critica seria perdida
- B: Modal one-time (escolhido) — forcado a ver, mas so uma vez; equilibrio entre comunicacao e friccao
- C: Toast notification — muito facil de ignorar, informacao importante se perde

Constraint: se o usuario fechar o modal sem exportar o historico, nao ha como re-exibir a menos que a flag seja removida manualmente do localStorage. Aceitavel porque o dado legado nao e perdido — continua no navegador ate que o storage IDB seja limpo.

## 2026-05-22 - Supabase como camada de persistencia primaria

Decision: migrar armazenamento persistente de IndexedDB/localStorage para Supabase, mantendo IDB como cache offline. Arquitetura offline-first: browser -> Supabase (anon key + RLS por operator_id).

Reason: dados de operadores (dossies, radar alerts, configuracoes) precisam sobreviver a limpeza de cache do navegador e serem acessiveis de qualquer dispositivo. Supabase oferece schema SQL, RLS por linha, tempo real e planos gratuitos que cobrem o volume atual. A escolha de conexao direta (sem serverless API layer) reduz latencia e custo de operacao.

Options considered:
- A: Supabase direto do browser (escolhido) — menor latencia, sem custo de serverless, sem camada extra
- B: Serverless functions como proxy — maior seguranca percebida, mas adiciona latencia e custo Vercel
- C: Firebase Firestore — alternativa valida, mas exigiria outro provider alem do Supabase para SQL queries

## 2026-05-22 - Auth postergada, UUID local como operator_id

Decision: manter autenticacao local-only por enquanto. `operator_id` continua sendo UUID gerado no browser e armazenado em IDB. O campo `email` foi adicionado ao registro para identificacao do operador.

Reason: Supabase Auth adicionaria complexidade de fluxo de login, recovery de senha e gerenciamento de sessao que nao sao necessarios para o uso atual (app interno, operadores conhecidos). O RLS usa `operator_id` como chave de isolamento, que e tao seguro quanto o UUID local. Quando autenticacao for necessaria, a migracao e direta: substituir o UUID local pelo `auth.uid()` do Supabase.

Constraint: esta decisao deve ser reavaliada se o app virar externo ou se houver necessidade de auditoria de acesso por operador.

## 2026-05-22 - Offline-first com sync queue

Decision: escritas vao primeiro para IndexedDB (instantaneas) e depois sincronizam com Supabase em background via `services/syncQueue.ts`. Leituras usam stale-while-revalidate: IDB primeiro, Supabase em background, atualiza cache.

Reason: garantir que o app funcione sem conexao com a internet (offline-first). Vendedores podem estar em campo com conectividade intermitente. A sync queue com retry (backoff exponencial 3s/9s/27s) e dead-letter queue garante que nenhuma operacao seja perdida.

Constraint: se a fila IDB crescer muito (milhares de operacoes pendentes), pode afetar performance. O dead-letter queue trata falhas irrecoveraveis sem travar o fluxo.

## 2026-05-22 - Supabase direto sem serverless API layer

Decision: o browser conecta-se diretamente ao Supabase via anon key, sem passar por serverless functions do Vercel como proxy.

Reason: adicionar uma camada serverless entre browser e Supabase aumenta latencia, dobra o custo de execucao (Vercel + Supabase) e nao adiciona seguranca real porque o RLS do Supabase ja isola dados por operator_id. A anon key e restrita por RLS e grants especificos. Esta abordagem e a mais simples, mais rapida e mais barata.

Options considered:
- A: Conexao direta (escolhida) — simples, rapida, barata
- B: Serverless proxy (rejeitada) — mais complexa, mais cara, sem ganho real de seguranca
- C: Hibrido (algumas operacoes diretas, outras via serverless) — complexidade desnecessaria

Constraint: se no futuro houver necessidade de logica de servidor (webhooks, validacao complexa, agendamento), uma API layer Vercel pode ser adicionada seletivamente sem quebrar o modelo existente.

## 2026-05-22 - Botao Dossie removido

Decision: remover completamente o botao "Dossie de investigacao" e toda a fiação associada de 14 arquivos (ChatShell, Composer, Settings, ChatPanels, App, types, GREETING_CONFIG, contracts, ChatInterface, MessageTimeline, EmptyStateHome, SessionsSidebar, ReceitaService, testes).

Reason: a feature nao era utilizada e nenhum operador reportou falta. Manter o codigo morto aumenta superficie de manutencao e confunde novos desenvolvedores. A remocao foi segura porque o fluxo nunca foi ativado na UI principal — era um botao acessorio no chat que nao disparava nenhum servico core.

Constraint: se no futuro houver demanda por funcionalidade similar, deve ser implementada como feature nova, nao reativando o codigo removido.

## 2026-05-23 - Teia Societaria: SVG customizado para mockup, React+dagre+framer-motion para implementacao

Decision: mockup visual da teia societaria sera em SVG customizado (bezier curves + JS vanilla sem dependencias), e a implementacao real usara React component + dagre (6KB) + framer-motion.

Reason: SVG vanilla permite iteracao rapida de design sem configuracao de bundler. Para producao, dagre e a mesma biblioteca de layout dirigido que o Mermaid usa internamente (elimina dependencia extra), e framer-motion fornece as animacoes spring necessarias sem implementar from scratch.

Options considered:
- Mermaid estatico (atual) — nao interativo, sem drill-down
- react-flow (~50KB) — muito pesado para este uso especifico
- cytoscape (~30KB) — overkill, foco em grafos complexos
- SVG customizado para mockup + dagre para producao (escolhido) — equilibrio entre velocidade de prototipagem e qualidade de producao

## 2026-05-23 - Teia Societaria: fonte de dados sem percentual exato de participacao

Decision: usar classificacao por faixa (controlador/minoritario) em vez de percentual exato. Deducao via qualificacao do QSA (socio-administrador, titular, etc.) + numero de socios.

Reason: BrasilAPI nao retorna percentual de participacao. Nenhuma API publica/gratuita oferece esse dado. Tentativas de deducao via capital social sao imprecisas (holdings com capital social nao refletem participacao real). A faixa (controlador = 50%+, minoritario < 50%) ja e suficiente para inteligencia comercial.

Constraint: o componente deve sempre declarar "CLASSIFICACAO ESTIMADA" no tooltip/hover.

## 2026-05-23 - Teia Societaria: design final com multi-expansao e conexoes compartilhadas

Decision: o componente permite expandir varios socios simultaneamente. Empresas aparecem inline na linha do socio clicado. Linhas verdes pontilhadas com animacao pulse conectam socios que compartilham a mesma empresa. Badges verdes mostram contagem de socios compartilhados.

Reason: multi-expansao e superior a single-select porque permite comparacao visual entre socios. Empresas inline evitam desorientacao (centralizacao fazia o usuario perder referencia de qual socio expandiu). Linhas pulse e badges resolvem o problema de "quem compartilha o que" sem exigir hover em cada conexao.

Constraint: em casos com muitos socios (10+), pode ser necessario limitar expansoes simultaneas ou adicionar scroll virtual.

## 2026-05-23 - Teia Societaria: dados mockados ate QSA ser exposto

Decision: os mockus HTML usam dados hardcoded do grupo Scheffer (6 socios, ~18 empresas). Dados reais serao integrados quando `lib/cnpjLookup.ts` expuser QSA e `api/cnpj.ts` propagar os dados.

Reason: a interface da BrasilAPI ja retorna `qsa[]`, mas o pipeline de dados do app nao expoe esse campo para o frontend. Implementar em paralelo ao componente e mais eficiente que mockar retroativamente.

Constraint: `lib/cnpjLookup.ts` e API route sao alteracoes controladas — verificar testes antes e depois da modificacao.

## 2026-05-22 - Sync manual em vez de automatico

Decision: adicionar botao de sync manual no header (`ManualSyncButton.tsx`) com feedback visual real (+N enviados, Baixados N) em vez de sync automatico silencioso. O badge SyncIndicator tambem mudou de "limpar notificacao" para "forcar sync".

Reason: operadores precisam de visibilidade do estado da sincronizacao. Sync automatico silencioso gera incerteza ("meus dados estao salvos?"). O botao manual com contagem fornece feedback tangivel. O evento `scout:sync-complete` permite que hooks recarreguem dados apos sync, garantindo consistencia da UI.

Constraint: sync automatico em background continua rodando (sync queue processa offline operations). O botao manual e um complemento, nao substituicao. Se no futuro o sync for confiavel a ponto de ser invisivel, o botao pode ser ocultado, nao removido.
