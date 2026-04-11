# Handoff Tecnico - Carga Inicial para IA

Use este documento como contexto inicial para qualquer novo chat sobre este repositorio.

---

Voce esta atuando no projeto **Senior Scout 360**, em `/Users/brunolima/Documents/NOVO-APP`.

## 1) Objetivo do produto
Aplicacao web de inteligencia comercial (PT-BR) para prospeccao e investigacao de empresas do agro, com:
- chat com IA (Gemini),
- RAG (Pinecone),
- persistencia local/remota de sessoes,
- exportacao de dossiers,
- mini CRM.

Nao ha mais autenticacao Clerk no produto. O operador informa apenas um nome local, persistido no dispositivo.

## 2) Stack principal
- Frontend: React 19 + TypeScript + Vite + Tailwind
- Testes: Vitest + Testing Library
- IA: Gemini (`@google/genai`)
- RAG: Pinecone
- Persistencia local: IndexedDB (`idb-keyval`) + fallback localStorage
- Persistencia remota / integracoes operacionais: Google Apps Script
- Runtime de producao: Vercel (`api/*.ts` como serverless handlers)

## 3) Arquitetura atual
- `index.tsx`
  - bootstrap React
  - `ErrorBoundary`
  - `OperatorProvider`, `ModeProvider`, `CRMProvider`
- `App.tsx`
  - orquestrador principal da experiencia
  - sessoes, mensagens, loading, score, exportacao, sync local/remoto e troca de views
- `components/ChatInterface.tsx`
  - shell principal de UI do chat
- `services/geminiService.ts`
  - fachada publica estavel para a camada Gemini
  - a implementacao interna foi decomposta em `services/gemini/`
- `services/gemini/`
  - `investigation-orchestration.ts`: pipeline principal
  - `porta.ts`: parsing de markers PORTA
  - `sources.ts`, `sanitization.ts`, `status.ts`, `recovery.ts`, `runtime.ts`, `auxiliary.ts`, `config.ts`, `contracts.ts`
- `hooks/useChat.ts`
  - legado
  - nao deve ganhar novos consumidores de producao

## 4) Fluxo de mensagem
1. Usuario envia mensagem pela UI.
2. `App.tsx` registra a mensagem e cria o placeholder da resposta.
3. `services/geminiService.ts` delega para a orquestracao interna:
   - guardrails e sanitizacao,
   - lookup/benchmark,
   - RAG interno e docs,
   - chamada Gemini via proxy,
   - parsing de status, PORTA e fontes.
4. A resposta atualiza texto final, score, fontes e sugestoes.
5. A sessao persiste localmente e pode ser sincronizada remotamente.

## 5) Servicos criticos
- `services/geminiService.ts`: contrato publico da conversa
- `services/gemini/*`: modulos internos da orquestracao Gemini
- `services/ragService.ts`: chamadas para `/api/rag` e `/api/docs-rag`
- `services/sessionRemoteStore.ts`: persistencia remota de sessoes
- `services/feedbackRemoteStore.ts`: envio de feedback
- `services/apiConfig.ts`: URLs e configuracoes de integracao

## 6) Validacao correta
- O ambiente real de verificacao manual e a Vercel, nao `npm run dev`.
- Use testes locais para regressao automatizada (`npm run test`, `npm run typecheck`, `npm run build`).
- Para checagem manual, prefira preview deployment ou producao na Vercel.

## 7) Limitacoes e dividas importantes
- `App.tsx` continua grande e com alto acoplamento.
- `hooks/useChat.ts` e legado e agora possui guardrail arquitetural.
- Parte da documentacao historica ainda pode estar atrasada; sempre conferir o codigo antes de assumir comportamento.
- Fluxos completos dependem de variaveis externas de Gemini, Pinecone e Apps Script.

## 8) Regras de trabalho
- Fazer mudancas pequenas e seguras.
- Ler o codigo real antes de editar.
- Preservar contratos publicos sempre que a sprint pedir compatibilidade.
- Separar claramente regressao nova de ruido legado.
- Nao reverter alteracoes locais nao relacionadas.

## 9) Entregavel esperado
Retornar sempre:
1. diagnostico objetivo,
2. implementacao executada,
3. arquivos afetados,
4. validacao executada,
5. riscos residuais,
6. proximo passo seguro.
