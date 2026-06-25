# AGENTS.md

## Visão Geral

Senior Scout 360 é um app web React 19 + TypeScript + Vite para inteligência comercial no agronegócio.

## Estrutura do Repositório

- `App.tsx` é o orquestrador principal do app.
- `components/`, `contexts/`, `hooks/`, `services/`, `prompts/`, `utils/`, `api/` e `tests/` vivem na raiz do repo.
- Não assuma um diretório `src/` para código da aplicação neste repositório.
- `services/geminiService.ts` é a fachada pública de IA estável; módulos de orquestração internos vivem em `utils/llm/` (modelRouter, modelCatalog, experiment).

## Protocolo de Memória Persistente

A memória local do repositório é o handoff canônico entre sessões para agentes neste projeto.

## Biblioteca Central Obsidian

Este projeto é indexado pela biblioteca central Obsidian do Bruno:

`~/Documents/Senior IA/docs/obsidian`

- Project card: `docs/PROJECT-CARD.md`
- Nota central do projeto: `~/Documents/Senior IA/docs/obsidian/Projects/NOVO-APP.md`
- Contrato de ingestão: `~/Documents/Senior IA/docs/obsidian/Library/contrato-ingestao-multi-ia.md`

Codex, Claude Code, DeepSeek, Z.ai e outros agentes devem manter as fontes canônicas deste repositório atualizadas. A biblioteca central pode indexar este repo, mas não sobrescreve `HANDOFF_AI.md`, `.agents/memory/*` ou documentos de refatoração.

- No início de cada sessão, leia `.agents/memory/activeContext.md` e `.agents/memory/progress.md` antes de diagnosticar, planejar ou editar.
- Trate `.agents/memory/decisions.md` como contexto de projeto durável para decisões que devem sobreviver além da sprint atual.
- Use `HANDOFF_AI.md` como o handoff canônico de entrada rápida, depois siga qualquer documento fonte-de-verdade que ele referenciar.
- Use `docs/obsidian/00-MASTER.md` como camada de navegação visual para arquitetura + roadmap, após ler as fontes canônicas acima. Não trate como fonte de prioridade maior que `HANDOFF_AI.md`, `.agents/memory/*` ou `docs/archive/refactor-program/`.
- Antes de planejar trabalho de implementação, use `plan-work` quando disponível no ambiente global.
- Ao fechar tarefa, atualize a memória com: o que mudou, qual validação rodou, riscos residuais e o próximo passo imediato.
- Registros de decisão estão em `.agents/memory/decisions.md`; não existe `PLAN.md` separado na raiz.

## Comandos Úteis

```bash
npm run dev
npm run build
npm run test
npm run typecheck
npm run lint
```

## Restrições Conhecidas

- Handlers serverless Vercel vivem em `api/*.ts`.
- Vercel é o ambiente de runtime real para validação em produção; `npm run dev` local é apenas uma conveniência do frontend e não emula todo o comportamento serverless de produção.
- Auth neste repo é local apenas via `contexts/OperatorContext.tsx`; Clerk não está ativo em runtime.
- Nenhuma integração externa de IA padrão é necessária para este repo.
- A governança de skills deste repo está em `docs/SKILLS-GOVERNANCE.md`.
- Não assuma que qualquer conjunto específico de skills globais está disponível ou é necessário.

## Regras de Trabalho

- Leia o código atual antes de editar.
- Mantenha prompts em `prompts/`.
- Mantenha segredos fora do código frontend.
- Evite catches vazios.
- Prefira soluções tipadas em vez de `any`.
- Não reverta mudanças locais não relacionadas.
- **Guarda de merge:** NUNCA execute `gh pr merge` ou qualquer merge/squash/auto-merge de PR a menos que a mensagem do usuário contenha a palavra **MERGE** (case-insensitive). Push de branch e open/edit de PR são permitidos sem ela. Quando em dúvida, pergunte: "Confirma com MERGE se quiser mergear."

## Preferências Aprendidas do Usuário

- Comunicação com o Bruno em pt-BR (chat, PRs e handoff).
- Investigar causa raiz com evidência (código + telemetria ordenada) antes de corrigir; evitar planos só com hipóteses soltas, mitigação de sintoma sem contrato, ou watchdog sem fechar a cadeia causal.
- Cruzar relato com Supabase (`operator_events`, `scout_diagnostics`, `user_context`) e, em regressões de loading/overlay em produção, também Sentry e logs Vercel; não fechar diagnóstico só com snapshot instantâneo de health-check.
- Entregas grandes: implementar em fases, validar por fase (`validator`), e fechar com doc-handoff (`HANDOFF_AI.md`, `CALIBER_LEARNINGS.md`, Bruno Vault, `.agents/memory/*`) listando pendências para análise posterior.
- Auditoria externa ou review em lote: reconciliar achados com `origin/main` e PRs mergeadas recentes antes de implementar P0; evita retrabalho em branches superseded.
- Subagentes no modelo da sessão (Composer); não sugerir troca de modelo no chat.
- PR focada: escopo único na PR canônica existente; WIP amplo em branch/PR separada; validar pelo diff líquido contra `main` — não abrir PR paralela sem checar overlap.
- Responder cada thread de review com a tratativa antes de marcar resolvida (`gh-resolve-pr-comments`); `scripts/resolve-pr-threads.py` usa GraphQL `addPullRequestReviewThreadReply` — REST `/replies` retorna 404; rodar `unset GITHUB_TOKEN` antes do `gh` para usar keyring renovado.
- Antes de trocar modelo LiteLLM: validar separadamente se a **pesquisa** (QSA, socio-search, teia, CRM) funcionou vs qualidade/redação do relatório do modelo.
- Uso real e validação UX no preview Vercel (desktop padrão; mobile/375px só se escopo pedir); respostas de review e validação citam comportamento no preview, não localhost do CI.
- Pipeline PR Gate (skills `review-branch`, `pr-gate-runner`, `gh-resolve-pr-comments`): plano → gates locais → PR → CI → PR Gate IA no preview; merge só com token **MERGE** na mensagem.
- Bruno autoriza correção de hooks globais (ex. `checkpoint-proativo.sh`) quando bloqueiam `StrReplace`/edições — pedir ou usar liberação explícita antes de alterar.

## Fatos Aprendidos do Workspace

- Travamento/freeze waterfall ou consolidação: priorizar `scout_diagnostics` e `operator_events`; inline-validation — budget agregado deve exceder N × latência `/api/link-status` (hard-cap degradado retorna `[]`); Sentry costuma não capturar freeze de main thread.
- LoadingSmart pós-waterfall: `health-check` no flush imediato pode registrar `overlay=true` com `domBodyLen` baixo (H-U3); critério de recuperação do overlay é evento `PostCompletion` em `scout_diagnostics`, não só o health-check.
- CNPJ no browser: `fetchCompanyByCnpj` via `/api/cnpj`; não usar `lib/cnpjLookup` com fetch direto à BrasilAPI no cliente (CORS no preview/prod Vercel).
- Contrato de loading/timeline/blank panel: ver `docs/obsidian/pages/` (playbook-status) e `CALIBER_LEARNINGS.md` para lições de loading/blank panel. Bug P1 conhecido (PR #386): expandir "ver relatório completo" após waterfall deixa painel vazio. Safety nets DOM (`App.tsx`, `finalizeWaterfallUI.ts`): não remover até 7 dias Cofre estável em produção + métricas `scout_diagnostics`; causa `display:none` permanece unknown (CALIBER T-A.1).
- Handoff e memória canônica: `HANDOFF_AI.md`, `.agents/memory/*` e `CALIBER_LEARNINGS.md` prevalecem sobre vault Obsidian para implementação; sessões grandes também registram lições no Bruno Vault.
- Branch com checkpoint WIP no histórico pode inflar a aba Files da PR no GitHub; o que entra em `main` é o diff líquido contra `main`, não a lista bruta de commits intermediários.
- Policy pós-auditoria §9 (fluxo dossiê): sem novo `useState` loading, sem `catch {}`, sem RAF sem cleanup; persist flush usa toast+retry+`scoutDiag` (DI-2026-06-19-02 Opção B, sem cache read-only).
- LiteLLM: preview exige `VITE_LLM_*` espelhando `LLM_*`, sessão Supabase Auth (guest → 401; client email local vs server Supabase Auth — mismatch impede rodar), allowlist email real; Grok 4.1 Fast validado; V4 Flash lento/timeout; `groundingSources: 0` esperado (sem Google Search grounding); auth 401/403 sem fallback Gemini (só pós-auth); waterfall pode registrar `fallback_used=true` (LiteLLM→Gemini); persistência `20260620_llm_experiment.sql` via `api/llm-experiment.ts` (service role, RLS `deny_anon_all`); `llm_experiment_runs` vazio = gate não passou; produção `LLM_PROVIDER=gemini`.
- Vercel Hobby: limite 12 serverless functions — consolidar handlers em `api/`; `api/_llm-client.ts` usa fetch nativo (SDK `openai` removido do bundle serverless).
- E2E: `critical-ux` usa stubs Gemini; LiteLLM live = `tests-e2e/litellm-live-parallel.spec.ts` (timeout 150s, 3 workers); `installCNPJStub` sem QSA invalida validação de teia — pesquisa Scheffer live = `tests-e2e/scheffer-research-validation.spec.ts` (R1/R2/R3, sem stub CNPJ, workers=1); Scheffer/Cofre — helper inicia nova investigação com dossiê salvo, stop via "Interromper"; vitest+coverage bloqueiam merge no CI; E2E critical-ux não blocking — gate = PR Gate IA no preview.
- PR #385 mergeada (Ondas 1–3 estabilização pós-auditoria); PR #386 `feat/litellm-experiment` — adapter LiteLLM com fallback Gemini pós-auth; merge bloqueado até validar fallback real + bug P1 painel expand + critério `llm_experiment_runs`.
