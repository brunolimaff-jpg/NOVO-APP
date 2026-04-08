# Configuração de Fetch MCP — 🦅 Senior Scout 360

Este guia detalha como operacionalizar o **Fetch MCP** no Scout para aprofundamento factual de investigações.

## O que é o Fetch MCP

O **Fetch MCP** é um servidor que segue o protocolo [Model Context Protocol (MCP)](https://modelcontextprotocol.io), permitindo que agentes de IA extraiam conteúdo textual limpo de URLs públicas de forma eficiente e padronizada.

## Por que ele faz sentido no Scout

O Scout é uma ferramenta de **inteligência comercial**. Muitas vezes, uma busca no Google ou DuckDuckGo (camada de descoberta) retorna apenas snippets curtos. O Fetch permite que a IA "leia" a página inteira (como o "Sobre Nós", "Governança" ou "Relatórios") para encontrar sinais comerciais profundos que não aparecem no resumo da busca.

## O que ele resolve agora

- **Profundidade factual**: Aumenta a qualidade dos dossiês com dados extraídos direto da fonte primária (sites oficiais).
- **Desacoplamento**: O Scout não precisa de um scraper complexo interno; ele delega essa "visão" para o agente via MCP.
- **Limpeza de ruído**: Diferente de um fetch comum, o servidor Fetch MCP costuma retornar Markdown limpo, facilitando o processamento pela IA.

## O que ele não resolve

- **Acesso autenticado**: Não foi feito para passar por logins complexos (para isso, use o Playwright MCP).
- **Persistência/RAG**: Ele apenas "lê" a página no momento; ele não guarda esses dados em um banco vetorial automaticamente.
- **Busca**: Ele exige uma URL; ele não "descobre" o que pesquisar sozinho.

## Pré-requisitos

- Um cliente compatível com MCP (como Claude Desktop, Cursor ou similar).
- Node.js instalado no ambiente.

## Configuração MCP (Genérica)

Recomendamos o uso do pacote oficial da comunidade MCP: `@modelcontextprotocol/server-fetch`.

Para configurar no seu cliente, use o arquivo de exemplo disponível em:
[`docs/mcp/fetch.generic.example.json`](./mcp/fetch.generic.example.json)

### Comando básico:
```bash
npx -y @modelcontextprotocol/server-fetch
```

## Como usar no Scout

Ao interagir com o Scout como agente:

1. Use a ferramenta `open-web-search` (interna) para **descobrir** URLs relevantes sobre o prospect.
2. Identifique URLs de alta relevância (ex: `dominio.com.br/sobre`).
3. Use a ferramenta `fetch` (via MCP) para **extrair** o conteúdo integral e detalhar o dossiê.

## Diferença entre busca e aprofundamento

| Camada | Ferramenta | Papel |
|---|---|---|
| **Busca (Discovery)** | `api/open-web-search.ts` | Encontrar candidatos, notícias rápidas e snippets. |
| **Aprofundamento (Fetch)** | Fetch MCP | Abrir a página completa para extração factual densa. |

## Limitações

- **Anti-bot**: Alguns sites bloqueiam `npx fetch`. Nesses casos, o Scout deve sinalizar a impossibilidade ou tentar o Playwright MCP.
- **Tamanho do Contexto**: Evite dar "fetch" em páginas gigantescas sem necessidade; foque no que é útil para o Score PORTA.

## Checklist operacional

- [ ] Node.js instalado?
- [ ] Configuração adicionada ao `mcpSettings.json`?
- [ ] Conexão com o servidor Fetch MCP ativa?
- [ ] Protocolo de pesquisa profunda (`docs/FETCH-RESEARCH-FLOW.md`) lido?

## Próximos passos

Se você precisa de mais do que apenas texto (ex: clicar em botões, rolar páginas infinitas ou tirar prints), consulte o guia do **Playwright MCP** em [`docs/MCP-PLAYWRIGHT-SETUP.md`](./docs/MCP-PLAYWRIGHT-SETUP.md).
