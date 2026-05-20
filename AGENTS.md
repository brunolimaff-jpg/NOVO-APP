# AGENTS.md

## Overview

Senior Scout 360 is a React 19 + TypeScript + Vite web app for commercial intelligence in agribusiness.

## Repo layout

- `App.tsx` is the main app orchestrator.
- `components/`, `contexts/`, `hooks/`, `services/`, `prompts/`, `utils/`, `api/`, and `tests/` live at the repo root.
- Do not assume a `src/` directory for application code in this repository.
- `services/geminiService.ts` is the stable public AI façade; internal orchestration modules live under `services/gemini/`.
- `hooks/useChat.ts` is legacy and must not gain new production consumers.

## Persistent memory protocol

Repo-local memory is the canonical cross-session handoff for agents in this project.

## Central Obsidian library

This project is indexed by Bruno's central Obsidian library:

`~/Documents/Senior IA/docs/obsidian`

- Project card: `docs/PROJECT-CARD.md`
- Central project note: `~/Documents/Senior IA/docs/obsidian/Projects/NOVO-APP.md`
- Ingestion contract: `~/Documents/Senior IA/docs/obsidian/Library/contrato-ingestao-multi-ia.md`

Codex, Claude Code, DeepSeek, Z.ai, and other agents must keep this repo's canonical sources current. The central library may index this repo, but it does not override `HANDOFF_AI.md`, `.agents/memory/*`, or refactor docs.

- At the start of every session, read `.agents/memory/activeContext.md` and `.agents/memory/progress.md` before diagnosing, planning, or editing.
- Treat `.agents/memory/decisions.md` as durable project context for decisions that should survive beyond the current sprint.
- Use `HANDOFF_AI.md` as the canonical quick-entry handoff, then follow any source-of-truth docs it references.
- Use `docs/obsidian/00-MASTER.md` as the visual navigation layer for architecture + roadmap after reading the canonical handoff sources above. Do not treat it as a higher-priority source than `HANDOFF_AI.md`, `.agents/memory/*`, or `docs/ai-context/refactor/*`.
- Before planning implementation work, use `plan-work` when available in the global environment.
- At task close, update memory with what changed, what validation ran, residual risks, and the immediate next step.
- Do not treat root `PLAN.md` as canonical unless one of the memory files or handoff docs explicitly references it.

## Useful commands

```bash
npm run dev
npm run build
npm run test
npm run typecheck
npm run lint
```

## Known constraints

- Vercel serverless handlers live in `api/*.ts`.
- Vercel is the real runtime environment for production validation; local `npm run dev` is only a frontend convenience and does not emulate all production serverless behavior.
- Auth in this repo is local-only via `contexts/OperatorContext.tsx`; Clerk is not active in runtime.
- No standard external AI integration is required for this repo.
- Skill governance for this repo lives in `docs/SKILLS-GOVERNANCE.md`.
- Do not assume any specific global skill set is available or required.

## Working rules

- Read the current code before editing.
- Keep prompts in `prompts/`.
- Keep secrets out of frontend code.
- Avoid empty catches.
- Prefer typed solutions over `any`.
- Do not revert unrelated local changes.


<claude-mem-context>
# Memory Context

# [NOVO-APP] recent context, 2026-05-16 7:00pm GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,299t read) | 3,007,685t work | 99% savings

### May 16, 2026
26218 5:05p 🔵 Status da branch refactor/wave-0-1-cleanup e diff com origin/main
26237 " 🔵 Identificação de usos das funções de extração e busca web
26196 " 🔵 Arquivo de estratégia de teste arquivado não encontrado
26212 " 🔵 Implementação da API Open Web Search
26232 " 🔵 Proxy para API Gemini e Ferramenta de Busca Web
26252 " 🔵 Orquestração de Investigação para Dossiês e Gemini
26270 " 🔵 Testes para a API Open Web Search
26264 " 🔵 Análise do arquivo .agents/memory/activeContext.md
26293 " 🔵 Análise do arquivo .agents/memory/progress.md
26309 " 🔵 Análise do arquivo .agents/memory/decisions.md
26325 " 🔵 Verificação de diff em arquivos relacionados à busca web
26286 " 🔵 Endpoint da API Open Web Search: Lógica de Requisição e Resposta
26304 " 🔵 Uso da ferramenta Open Web Search em diferentes módulos
26320 " 🔵 Orquestração de Investigação: Detalhes de Busca e Processamento
26344 " 🔵 Análise do código da API de busca web (open-web-search.ts)
26358 " 🔵 Análise do código do serviço Gemini Proxy (services/geminiProxy.ts)
26379 " 🔵 Análise do código de orquestração de investigação (services/gemini/investigation-orchestration.ts)
26399 " 🔵 Análise do módulo de extração de documentos (utils/documentExtractor.ts)
26417 " 🔵 Análise dos testes da API de busca web (tests/api-open-web-search.test.ts)
26445 " 🔵 Verificação de dependências em package.json e package-lock.json
26456 " 🔵 Análise do código da API Gemini (api/gemini.ts)
26478 " 🔵 Rastreamento da integração da ferramenta Open Web Search
26508 5:06p 🔵 Análise do módulo de logging (utils/diagnosticLog.ts)
26524 " 🔵 Análise dos testes da API Gemini (tests/api-gemini.test.ts)
26545 " 🔵 Análise dos testes de integração da API Gemini (tests/gemini-integration.test.ts)
26561 " 🔵 Configuração de Runtime e Duração Máxima das APIs Vercel
26580 " 🔵 Execução de testes unitários e de integração
26594 " 🔵 Análise da configuração do Vercel e do package.json
26603 " 🔵 Histórico de commits recentes para APIs e utilitários relacionados
26617 " 🔵 Análise de diferenças de código em relação à branch principal
26632 " 🔵 Resultados da execução dos testes unitários e de integração
26647 " 🔵 Verificação da instalação da CLI do Vercel
26672 " 🔵 Verificação de erros de tipagem com TypeScript
26692 " 🔵 Início do processo de build de produção com Vite
26715 " 🔵 Análise de commit e diferenças de branch
26747 " 🔵 Conclusão do processo de build de produção com Vite
26778 " 🔵 Conclusão do build do Vite com avisos de otimização
26793 " 🔵 Início do servidor de desenvolvimento local com Vercel
26819 " 🔵 Erro ao iniciar o servidor de desenvolvimento com Vercel
26839 " 🔵 Interrupção do processo do Vercel Dev
26867 5:07p 🔵 Análise do código de orquestração de investigação Gemini
26886 " 🔵 Análise da API de Open Web Search
26908 " 🔵 Análise da função de busca web com DuckDuckGo Lite
26929 " 🔵 Análise da função de execução da ferramenta Open Web Search
26951 " 🔵 Análise do módulo de geração de dossiê especializado
S305 Configurar e verificar variável de ambiente para bypass da Vercel (May 16 at 5:12 PM)
S306 Configurar e testar bypass de automação Vercel (May 16 at 5:14 PM)
S307 Validação de API Vercel com bypass de proteção (May 16 at 5:15 PM)
S308 Finalizar a PR #255 com resolução de comentários e smoke test (May 16 at 5:16 PM)
S313 Registrar e comunicar bug visual de renderização do ícone de exclusão. (May 16 at 5:23 PM)
S318 Atualizar plano de execução e registrar progresso (May 16 at 5:25 PM)
S325 Monitorar e resumir o status do Pull Request #257 e suas verificações. (May 16 at 5:35 PM)
S323 Próxima tarefa em aberto e status da Sprint 9 (May 16 at 6:01 PM)
S324 Atualizar o status da Pull Request e verificar a sincronia da branch após o push. (May 16 at 6:16 PM)
32826 6:55p 🔵 Contexto Ativo do Repositório NOVO-APP
32828 " 🔵 Progresso do Repositório NOVO-APP
32833 " 🔵 Documento de Handoff Técnico do Repositório NOVO-APP
32847 6:56p 🔵 Decisões Arquiteturais e de Desenvolvimento do Repositório NOVO-APP
S326 Definir rota de agentes para limpeza de repositório `/Users/brunolima/Documents/NOVO-APP` (May 16 at 6:56 PM)
32838 " ⚖️ Estratégia para Limpeza de Repositório Poluído

Access 3008k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
