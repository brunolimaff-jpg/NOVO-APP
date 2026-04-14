# Mapa Arquitetural — Senior Scout 360

> **Repositório**: https://github.com/brunolimaff-jpg/NOVO-APP
> **IMPORTANTE**: Este documento é uma referência. Sempre leia os arquivos reais do repositório antes de propor mudanças — o código evolui a cada sprint.

---

## Arquivos Raiz — Config & Infraestrutura

| Arquivo | Função | Status |
|---------|--------|--------|
| `index.html` | Entry point HTML do Vite | Estável |
| `index.tsx` | Bootstrap React: OperatorProvider + ErrorBoundary + mount DOM | Estável |
| `App.tsx` (~45KB) | **GOD COMPONENT** — roteamento, views, modais, estado global | ⚠️ Dissolução em andamento |
| `types.ts` | Contratos TypeScript centrais: ChatSession, Message, DossieSection, RadarConfig, CRMLead | Estável |
| `constants.ts` (~52KB) | **MAIOR ARQUIVO** — mega-prompts do Gemini por área + configs estáticas | ⚠️ Precisa ser quebrado por domínio |
| `vite.config.ts` | Configuração Vite: aliases de path, PWA plugin, proxy para API | Estável |
| `vercel.json` | Rewrite rules para SPA + rota /api/* para serverless functions | Estável |
| `tsconfig.json` | TypeScript strict mode ativado | Estável |
| `tailwind.config.js` | Tema customizado Senior (cores, fontes, breakpoints) | Estável |
| `eslint.config.js` | Regras ESLint para React + TypeScript | Estável |
| `.env.example` | Variáveis: GEMINI_API_KEY, VITE_BACKEND_URL, VITE_LOOKUP_URL, modelos `VITE_*` | Referência |
| `index.css` | Reset CSS + variáveis de tema global | Estável |
| `mobile-responsive.css` (~9KB) | Breakpoints e ajustes mobile separados | ⚠️ Débito — migrar para Tailwind nativo |
| `metadata.json` | Metadados PWA: versão, nome, descrição | Estável |

---

## components/ — Camada de UI

### Operador & Sessão
- `GreetingWelcomeScreen.tsx` — Gate inicial para nome local obrigatório do operador
- `UserMenu.tsx` — Dropdown do operador: avatar, nome, settings e troca/limpeza de perfil local
- `SettingsDrawer.tsx` — Preferências do operador e edicao do nome local

### Chat & Mensagens (Core do Produto)
| Componente | Função | Tamanho |
|------------|--------|---------|
| `ChatInterface.tsx` | Hub central: input do usuário, lista de mensagens, triggers para dossiê | ~27KB |
| `MessageRow.tsx` | Renderiza mensagem individual (user/bot) com suporte a streaming | Médio |
| `MessageActionsBar.tsx` | Ações por mensagem: copiar, exportar, follow-up, criar lead CRM | Médio |
| `MarkdownRenderer.tsx` | Renderiza markdown rico das respostas do Gemini | ~15KB |
| `SectionalBotMessage.tsx` | Mensagens bot com seções colapsáveis por área (Fiscal/TI/RH/Supply) | Médio |
| `GhostMessageBlock.tsx` | Skeleton/placeholder animado durante streaming (pending state) | Pequeno |
| `SmartOptions.tsx` | Sugestões de perguntas inteligentes pós-dossiê | Pequeno |

### Dossiê & Inteligência
- `InvestigationDashboard.tsx` — Dashboard principal: agrega seções por área investigativa
- `DeepDiveTopics.tsx` — Tópicos para aprofundamento por área (links rápidos)
- `RevenueIntelligence.tsx` (~14KB) — Painel: estimativas de faturamento, sazonalidade, potencial de venda
- `ScorePorta.tsx` — Score PORTA: qualificação preditiva do prospect
- `ClienteSeniorScore.tsx` — Score de fit com portfólio Senior (ERP, GATEC, HCM)

### Radar (Monitoramento Proativo)
- `RadarPanel.tsx` (~17KB) — Lista de empresas monitoradas, status, alertas pendentes
- `RadarBell.tsx` — Ícone de sino com badge de notificações
- `RadarSettings.tsx` (~11KB) — Configurações: frequência, tópicos de interesse, empresas

### CRM Interno
- `CRMPipeline.tsx` (~11KB) — Kanban: Prospecção → Qualificação → Proposta → Fechado
- `CRMDetail.tsx` (~35KB) — **MAIOR COMPONENTE** — detalhe completo de um lead com dossiê linkado

### UX / Navegação / Sistema
| Componente | Função | Tamanho |
|------------|--------|---------|
| `SessionsSidebar.tsx` | Sidebar de histórico de sessões, busca, agrupamento por data | ~14KB |
| `HeaderSessionSearch.tsx` | Busca no header para filtrar sessões | Pequeno |
| `SettingsDrawer.tsx` | Drawer de configurações: modelo AI, idioma, preferências | ~13KB |
| `ModeToggle.tsx` | Toggle entre modos (Copiloto / War Room) | Pequeno |
| `WarRoom.tsx` | Modo "sala de guerra": visão 360° com múltiplas abas | ~28KB |
| `EmptyStateHome.tsx` | Estado inicial sem sessão ativa | ~13KB |
| `LoadingSmart.tsx` | Loading sofisticado: mensagens dinâmicas, animações por fase | ~27KB |
| `ModeAwareLoading.tsx` | Adapter de loading por modo atual | Pequeno |
| `StatusIndicator.tsx` | Status da conexão Gemini: online/offline/rate limit | Pequeno |

### Modais & Ações
- `FollowUpModal.tsx` (~8.5KB) — Planejar follow-up: data, canal, contexto sugerido pela IA
- `EmailModal.tsx` — Gerar e-mail personalizado de prospecção baseado no dossiê
- `ConfirmPopover.tsx` — Popover genérico de confirmação
- `FeedbackSection.tsx` — Feedback do vendedor sobre qualidade do dossiê

### Error Handling & PWA
- `ErrorBoundary.tsx` — Class component que captura erros de renderização
- `ErrorMessageCard.tsx` — Card de erro inline (429, timeout, etc.)
- `SuspenseWithError.tsx` — Wrapper React.Suspense + ErrorBoundary
- `SystemHealthCheck.tsx` (~15KB) — Diagnóstico completo de saúde do sistema
- `InstallPrompt.tsx` — Banner de instalação PWA
- `ToastContainer.tsx` — Container global de notificações toast

---

## hooks/ — Lógica de Negócio

| Hook | Função | Criticidade |
|------|--------|-------------|
| `useChat.ts` (~26KB) | **LEGADO** — mantido por compatibilidade, sem consumidores de produção; protegido por teste estrutural contra novos imports | Baixa |
| `useAppInitialization.ts` | Init do app: carrega sessões locais, hidrata preferências do operador e detecta PWA | Alta |
| `useSessionManager.ts` | CRUD de sessões: criar, renomear, deletar, carregar | Alta |
| `useSessionStorage.ts` | Abstração sobre localStorage com serialização/deserialização tipada | Média |
| `useRadar.ts` (~9KB) | Lógica do Radar: polling de alertas, estado de empresas, notificações | Média |
| `usePWA.ts` | Detecta se está rodando como PWA, captura beforeinstallprompt | Baixa |
| `useOffline.ts` | Monitora navigator.onLine, emite estado de conectividade | Média |
| `useTheme.ts` | Dark/light mode via localStorage + classe CSS | Baixa |
| `useToast.ts` | API de toast: showToast(message, type) com auto-dismiss | Baixa |
| `useClickBypass.ts` | Evita propagação de cliques em overlays/modais | Baixa |

---

## services/ — Serviços de Domínio e Integração

| Serviço | Função |
|---------|--------|
| `services/geminiService.ts` | Fachada pública estável da camada Gemini |
| `services/gemini/` | Decomposição interna da orquestração Gemini: investigação, PORTA, fontes, sanitização, status e recovery |
| `services/ragService.ts` | Chamada ao RAG interno e RAG de documentação |
| `services/sessionRemoteStore.ts` | Persistência remota de sessões |
| `services/feedbackRemoteStore.ts` | Persistência remota de feedback |

## api/ — Serverless Functions (Vercel)

Proxy seguro entre frontend e APIs externas. A `GEMINI_API_KEY` fica **APENAS** no servidor. Recebem chamadas da camada de services e encaminham ao Gemini com autenticação server-side.

---

## Diretórios de Suporte

| Diretório | Função |
|-----------|--------|
| `contexts/` | React Contexts: operador local, modo, CRM e estados compartilhados |
| `services/` | Wrappers das APIs externas, fachada Gemini e integrações |
| `utils/` | Funções utilitárias puras: formatação, parsing de markdown, sanitização |
| `config/` | Configurações centralizadas de ambiente e feature flags |
| `prompts/` | Prompts do Gemini versionados separados |
| `docs/` | Documentação técnica interna |
| `tests/` | Testes unitários/integração com Vitest |
| `scripts/` | Scripts de automação: build, deploy, geração de código |
| `public/` | Assets estáticos: ícones PWA, favicon, manifest.json |

---

## Documentação Interna

| Arquivo | Conteúdo |
|---------|----------|
| `README.md` | Setup local, variáveis de ambiente, visão geral |
| `ARQUITETURA.md` | Diagrama de arquitetura, decisões técnicas, roadmap |
| `CLAUDE.md` | Instruções para AI agents + Board Room de desenvolvimento |
| `AGENTS.md` | Configuração dos agentes AI: regras, escopo de atuação |
| `HANDOFF_AI.md` | Handoff para troca de contexto entre sessões de AI coding |
| `PLAN.md` | Plano de execução do sprint atual |

---

## Débitos Técnicos Mapeados

### P0 — Críticos
- `App.tsx` (~45KB) — god component com roteamento, estado global e lógica misturados. Dissolução em andamento.
- `constants.ts` (~52KB) — mistura prompts de IA + configurações de UI + constantes de negócio em um único arquivo.
- `services/geminiService.ts` foi estabilizado como fachada; nova lógica interna deve entrar em `services/gemini/`, não de volta na fachada.

### P1 — Altos
- CI sem `tsc --noEmit` como gate de merge (erros rastreados manualmente em .txt)
- `CRMDetail.tsx` (~35KB) — componente monolítico
- Arquivos legados na raiz: `old_appcore.tsx`, `old.tsx`, `build_err.txt`, `build_err_2.txt`, `ts_errors.txt`
- `hooks/useChat.ts` permanece como legado; imports de produção novos são proibidos.

### P2 — Médios
- `mobile-responsive.css` separado (deveria usar Tailwind nativo)
- Scripts `fix*.cjs` e `extract*.cjs` na raiz (devem ir para scripts/ ou .gitignore)
- `WarRoom.tsx` (~28KB) e `LoadingSmart.tsx` (~27KB) — candidatos a decomposição

### Regra geral
Componentes acima de 15KB são candidatos obrigatórios à análise de decomposição.
