# Guia Iniciante (vibe coding) — 🦅 Senior Scout 360

Se você está começando agora, este é o caminho mais simples para rodar e entender o projeto.

## 1) O que você precisa instalar

- Node.js 20+
- npm 10+

## 2) Rodar localmente (passo a passo)

1. Abra a pasta do projeto.
2. Instale dependências:

```bash
npm install
```

3. Copie o arquivo de ambiente:

```bash
cp .env.example .env
```

4. Preencha no `.env`:
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - `GEMINI_API_KEY`
   - `PINECONE_API_KEY`

5. Inicie:

```bash
npm run dev
```

6. Abra `http://localhost:3000`.

---

## 3) Estrutura mental do projeto (simples)

- `App.tsx`: controla o fluxo principal do app.
- `components/`: telas e componentes visuais.
- `services/`: integrações com IA, RAG e backend.
- `api/`: funções serverless (um "mini backend").
- `contexts/`: estados globais (usuário, modo, CRM).

---

## 4) Erros comuns e solução rápida

## "tsc not found"

Rode:

```bash
npm install
```

## "Missing GEMINI_API_KEY"

Revise seu `.env` e confirme se a variável está preenchida.

## "Não funciona em produção"

Confira se as variáveis de ambiente foram configuradas também no deploy (Vercel/host).

---

## 5) Próximos passos recomendados (sem complicar)

1. Rodar o app local.
2. Entender fluxo de chat em `App.tsx`.
3. Ler `services/geminiService.ts` (motor da IA).
4. Ler `docs/SEGURANCA-API.md` para evitar vazamento de chave.

---

## 6) Automação com Playwright MCP

O projeto possui uma base inicial para automação de navegador assistida por IA.

### Rodar smoke tests E2E

```bash
npm run test:e2e:smoke
```

### Abrir modo visual dos smoke tests

```bash
npm run test:e2e:smoke:ui
```

### Subir o servidor MCP do Playwright

```bash
npm run mcp:playwright
```

### Variante headless e isolada

```bash
npm run mcp:playwright:headless
```

Para configuração do cliente MCP, consulte:

- `docs/MCP-PLAYWRIGHT-SETUP.md`
- `docs/mcp/playwright.generic.example.json`
