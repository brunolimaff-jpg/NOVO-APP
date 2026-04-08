# Playwright MCP no Senior Scout 360

Este guia padroniza o uso do **Playwright MCP** no Senior Scout 360 para automação de navegador assistida por IA.

## Objetivo

No Scout, o Playwright MCP será usado para:

- abrir a interface real do produto no navegador;
- reproduzir bugs visuais e de fluxo;
- validar regressões rápidas de UI;
- navegar no caminho crítico do chat sem depender de inspeção manual.

Nesta primeira etapa, o MCP **não faz parte do runtime do produto**. Ele é uma ferramenta externa de desenvolvimento e QA.

---

## Pré-requisitos

- Node.js 20+
- npm 10+
- dependências do projeto instaladas com `npm install`
- variáveis mínimas de ambiente configuradas em `.env`

O projeto já usa Playwright localmente e já possui `playwright.config.ts` configurado para subir o app com `npm run dev` em `http://localhost:3000`.

---

## Configuração MCP genérica

Exemplo mínimo para clientes MCP compatíveis:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

### Variante headless e isolada

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless", "--isolated"]
    }
  }
}
```

---

## Modos recomendados

### Modo de depuração manual

Use quando quiser ver o navegador rodando:

- headed
- profile persistente
- útil para investigar bugs de fluxo

### Modo de smoke reprodutível

Use quando quiser comportamento mais previsível:

- `--headless`
- `--isolated`
- útil para automação repetível por agentes

---

## Como usar no Scout

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar ambiente

```bash
cp .env.example .env
```

Preencha ao menos as variáveis exigidas pelo fluxo do projeto.

### 3. Subir o app

```bash
npm run dev
```

### 4. Conectar o cliente MCP

Use a configuração genérica de Playwright MCP no cliente de IA que você estiver usando.

### 5. Abrir o Scout

Peça ao agente para abrir:

```text
http://localhost:3000
```

---

## Fluxos alvo da primeira etapa

O agente deve conseguir operar pelo menos estes caminhos:

1. tela de saudação inicial;
2. entrada do nome do usuário;
3. home de investigação;
4. preenchimento de empresa, cidade e UF;
5. abertura da shell do chat;
6. interação com input, envio e parada de geração.

---

## O que validar nesta fase

Nesta etapa inicial, valide principalmente a **casca funcional da interface**:

- carregamento da página;
- campos presentes;
- botões clicáveis;
- transições básicas entre telas;
- shell do chat visível;
- estados de loading e retry.

### Não validar ainda

Evite usar como critério principal nesta fase:

- qualidade semântica da resposta do Gemini;
- conteúdo detalhado do dossiê;
- benchmarking completo;
- fluxos pesados que dependem de múltiplos serviços externos.

---

## Limitações conhecidas

- parte do fluxo do Scout depende de IA, backend e conectividade;
- se o `.env` estiver incompleto, alguns caminhos podem degradar;
- smoke tests iniciais devem focar em estrutura e navegação, não em inteligência de negócio profunda.

---

## Checklist de sucesso

Considere o setup correto quando for possível:

- abrir `http://localhost:3000`;
- preencher o nome no onboarding;
- sair da tela de saudação;
- preencher o formulário inicial de investigação;
- abrir a shell principal do chat;
- interagir com o campo de mensagem;
- visualizar botão de envio e, quando aplicável, botão de parada.

---

## Arquivos relacionados no projeto

- `package.json`
- `playwright.config.ts`
- `tests-e2e/`
- `components/GreetingWelcomeScreen.tsx`
- `components/EmptyStateHome.tsx`
- `components/ChatInterface.tsx`

---

## Próximo passo após esta fundação

Depois que a base estiver estável:

1. ampliar smoke tests;
2. cobrir sidebar, settings e exportações;
3. usar o Playwright MCP como ferramenta padrão de investigação guiada por IA.
