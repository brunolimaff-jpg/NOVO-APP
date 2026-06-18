# NOVO-APP (Senior Scout 360) - CODEX.md

## Identidade

Senior Scout 360 e uma plataforma de inteligencia comercial para o agronegocio. Stack principal: React 19, TypeScript, Vite, Vercel, Supabase, Gemini e Pinecone.

## Inicio de sessao

1. Leia `AGENTS.md`.
2. Leia `HANDOFF_AI.md`.
3. Leia `.agents/memory/activeContext.md` e `.agents/memory/progress.md`.
4. Preserve mudancas locais que nao pertencem a tarefa.

## Comandos essenciais

```bash
npm run build
npm run typecheck
npm run lint
npm test
npm run validate:preview
```

## Regras

1. Codigo da aplicacao vive na raiz; nao assumir `src/`.
2. Prompts ficam em `prompts/` e segredos nunca vao para o frontend.
3. `services/geminiService.ts` permanece como fachada publica de IA.
4. `hooks/useChat.ts` e legado e nao recebe novos consumidores de producao.
5. Evitar `any`, catches vazios e mudancas sem teste.
6. Testar Preview Vercel para regressao de UI, rede e performance.
7. Subagentes podem planejar, revisar e validar em paralelo sem bloquear o agente principal. Antes de commitar, o agente principal incorpora os achados ja disponiveis e confirma que nao ha edicoes concorrentes no mesmo arquivo.
8. Nunca fazer merge sem `MERGE` explicito do Bruno.
9. Usar branches `codex/<objetivo>` e manter uma mudanca fechavel por PR.
10. Handoff canonico: `HANDOFF_AI.md`, `.agents/memory/*` e Bruno Vault.

## Documentacao

- `ARQUITETURA.md`: arquitetura do produto.
- `CALIBER_LEARNINGS.md`: licoes e anti-padroes.
- `docs/SKILLS-GOVERNANCE.md`: governanca de skills.
- `docs/archive/refactor-program/`: programa de refatoracao arquivado.
- `docs/obsidian/00-MASTER.md`: navegacao visual.
