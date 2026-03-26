# CLAUDE.md — Senior Scout 360

Guia de referência rápida para assistentes de IA trabalhando neste repositório.

## Visão geral do projeto

**🦅 Senior Scout 360** é uma SPA de inteligência comercial para agronegócio, desenvolvida em React 19 + TypeScript + Vite. A interface é em português (pt-BR). O produto combina chat com IA (Gemini), RAG (Pinecone), mini-CRM kanban e geração de dossiês.

- **Deploy:** Vercel (`scoutagro.vercel.app`)
- **Modelo de IA:** `gemini-3.1-pro-preview` (configurável via env)
- **Auth:** Clerk (atualmente desativado — `TEMPORARILY_DISABLE_CLERK = true`)

---

## Comandos essenciais

```bash
npm run dev        # Dev server em http://localhost:3000
npm run build      # Build de produção
npm run test       # Roda testes (Vitest, todos os 37 passam sem chaves)
npm run lint       # ESLint — ATENÇÃO: falhará (ver seção de problemas conhecidos)
npm run typecheck  # tsc --noEmit — ATENÇÃO: falhará por causa de old.tsx
npm run format     # Prettier
```

---

## Variáveis de ambiente

Copie `.env.example` para `.env`. As variáveis críticas:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Sim (para auth) | Bloqueia a UI sem chave válida |
| `GEMINI_API_KEY` | Sim | Motor de IA principal |
| `PINECONE_API_KEY` | Sim | RAG / busca vetorial |
| `PINECONE_DOCS_KEY` | Não | Chave alternativa para docs RAG |
| `VITE_ROUTER_MODEL` | Não | Override do modelo de roteamento |
| `VITE_TACTICAL_MODEL` | Não | Override do modelo tático |

> **Atenção:** `GEMINI_API_KEY` ainda é exposta no frontend (dívida técnica conhecida). Em produção o ideal é mover para serverless.

---

## Estrutura do projeto

```
/
├── App.tsx                 # Orquestrador central de estado (chat, sessão, CRM, export)
├── index.tsx               # Bootstrap + providers globais
├── types.ts                # Tipos TypeScript centrais (Message, ChatSession, CRMCard…)
├── constants.ts            # APP_NAME, MODE_LABELS e prompts do sistema
│
├── components/             # UI pura — um arquivo por componente
│   ├── ChatInterface.tsx   # Entrada/saída de mensagens
│   ├── MessageRow.tsx      # Renderização de cada mensagem
│   ├── SessionsSidebar.tsx # Histórico de sessões
│   ├── CRMPipeline.tsx     # Kanban (lazy loaded)
│   ├── CRMDetail.tsx       # Detalhe de card CRM (lazy loaded)
│   ├── WarRoom.tsx         # Sala de guerra / investigação
│   ├── ScorePorta.tsx      # Score estruturado de oportunidade
│   └── ...                 # Demais componentes de UI
│
├── contexts/
│   ├── AuthContext.tsx     # Auth (Clerk + guest mode)
│   ├── ModeContext.tsx     # Modo operacional (chat / pesquisa profunda / etc.)
│   └── CRMContext.tsx      # Estado global do CRM
│
├── hooks/
│   ├── useSessionStorage.ts # IDB (primário) + localStorage (fallback)
│   ├── useChat.ts          # Lógica de chat
│   ├── useTheme.ts         # Dark/light mode
│   ├── useOffline.ts       # Status de rede
│   └── useToast.ts         # Notificações
│
├── services/
│   ├── geminiService.ts    # Motor principal de IA (stream, RAG, prompt guard)
│   ├── ragService.ts       # Cliente para funções serverless de RAG
│   ├── apiConfig.ts        # URLs base (BACKEND_URL, LOOKUP_URL)
│   ├── clientLookupService.ts  # Lookup e benchmark de clientes
│   ├── competitorService.ts    # Análise de concorrentes
│   ├── sessionRemoteStore.ts   # Sessões remotas (Apps Script)
│   ├── feedbackRemoteStore.ts  # Envio de feedback
│   ├── portaStateService.ts    # Estado de oportunidade (PORTA)
│   └── warRoomService.ts       # Serviço de investigação
│
├── api/                    # Serverless functions (Vercel) — não rodam localmente
│   ├── rag.ts              # Embedding + busca vetorial (dados internos)
│   ├── docs-rag.ts         # Embedding + busca vetorial (documentação)
│   ├── gemini.ts           # Proxy para Gemini API
│   └── link-status.ts      # Validação de links de fonte
│
├── prompts/
│   └── megaPrompts.ts      # Prompts longos de dossiê e análise
│
├── config/
│   └── models.ts           # Configuração dos modelos de IA
│
├── utils/                  # Helpers puros (sem efeitos colaterais)
├── tests/                  # Vitest — espelha estrutura de src
│   ├── components/
│   ├── contexts/
│   ├── services/
│   ├── utils/
│   └── setup.ts
│
└── docs/                   # Documentação auxiliar
    ├── CHECKLIST-PRODUCAO.md
    ├── GUIA-INICIANTE.md
    └── SEGURANCA-API.md
```

---

## Fluxo de mensagem (visão geral)

```
ChatInterface.onSendMessage
  → App.handleSendMessage
    → App.processMessage
      → geminiService.sendMessageToGemini
          ├── scanInput (promptGuard)
          ├── analyzeUserIntent
          ├── clientLookup + benchmark + concorrentes
          ├── ragService (RAG interno + docs)
          ├── Gemini stream
          └── parse de marcadores (STATUS / PORTA / SCORE)
      → App atualiza sessão + mensagem
          ├── texto final, fontes, sugestões
          └── metadados (score, ghostReason, etc.)
```

---

## Persistência

| Camada | Mecanismo | Chave |
|---|---|---|
| Sessões locais | IndexedDB (primário) | `scout360_sessions_v2` |
| Sessões locais | localStorage (fallback) | `scout360_sessions_v1` |
| CRM | localStorage + IDB por card | `scout360_crm_cards_v1` |
| Sessões remotas | Google Apps Script | via `sessionRemoteStore` |

---

## Convenções de código

- **TypeScript estrito** — sem `any` implícito; tipos centrais em `types.ts`
- **Componentes React** com `.tsx`, serviços e utils com `.ts`
- **Aliases de path:** `@/` e `~/` apontam para a raiz do projeto
- **Imports:** organize por grupos (React → libs externas → internos)
- **Português no domínio:** nomes de variáveis de negócio podem ser em pt-BR (ex.: `dossiê`, `porta`, `score`)
- **Sem `console.log`** em código de produção — use `useToast` para feedback ao usuário
- **Componentes CRM** são lazy-loaded (`React.lazy`) para reduzir bundle inicial

---

## Problemas conhecidos (pré-existentes)

1. **ESLint falha:** O projeto usa `.eslintrc.cjs` (formato legado) mas tem ESLint v10 instalado. `npm run lint` não funciona. Não tente corrigir a menos que seja explicitamente solicitado.

2. **`old.tsx`** na raiz: arquivo minificado de backup de `App.tsx`. Não está excluído do `tsconfig.json`, causando milhares de erros no `npm run typecheck`. Ignore erros vindos deste arquivo.

3. **Clerk desativado:** `TEMPORARILY_DISABLE_CLERK = true` em `AuthContext.tsx`. O app roda em guest mode. Não reative sem instrução explícita.

4. **Chave Gemini no frontend:** dívida técnica conhecida — mover para serverless é o objetivo, mas não altere sem instrução.

5. **Funções `api/*.ts`** não rodam com `npm run dev` — são serverless Vercel. Só funcionam em produção ou com `vercel dev`.

---

## Testes

- Framework: **Vitest** com jsdom
- Localização: `tests/` (espelha a estrutura dos módulos)
- Setup: `tests/setup.ts`
- **Não requerem chaves de API** — todos os serviços externos são mockados
- Rodar: `npm run test` (37 testes, todos devem passar)

---

## Deploy

- Plataforma: **Vercel**
- Configuração: `vercel.json` — todas as rotas `/api/*` vão para as serverless functions; demais rotas → `index.html`
- PWA: configurado via `vite-plugin-pwa` (ícones em `public/icons/`)
- Variáveis de ambiente de produção: configuradas no dashboard da Vercel

---

## Arquivos para ignorar ao fazer refactoring

- `old.tsx`, `old_appcore.tsx`, `old_appcore.tsx.fixed`, `old_appcore_utf8.tsx` — backups, não editar
- `head_appcore.txt`, `build_err.txt`, `build_err_2.txt`, `ts_errors.txt`, `tsc_output.txt` — logs temporários
- `Links documentação/*.csv` — arquivos de carga de links para ingestão RAG; não incluir em commits de feature sem solicitação explícita
- `Levantamento -*.mp4`, `imaculada_transcript.txt`, `imaculada_behavior_analysis.md` — artefatos de reunião/transcrição, fora do escopo de produto
- `scripts/analyze_*video.py`, `scripts/ingestSimpleFarmSeed.ts` — scripts ad hoc de ingestão/análise; tratar como não relacionados por padrão

---

## Documentação complementar

- `ARQUITETURA.md` — arquitetura técnica detalhada e dívida técnica
- `AGENTS.md` — instruções específicas para Cursor Cloud
- `docs/CHECKLIST-PRODUCAO.md` — checklist de go-live
- `docs/SEGURANCA-API.md` — diretrizes de segurança
- `docs/GUIA-INICIANTE.md` — onboarding
