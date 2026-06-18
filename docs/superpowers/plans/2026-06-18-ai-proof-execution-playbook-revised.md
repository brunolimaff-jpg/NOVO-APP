# Playbook de Execucao a Prova de IA - Plano Revisado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Track every task with RED, GREEN and SAFE evidence.

**Goal:** Endurecer os gates, loading, persistencia, timeouts e telemetria do Senior Scout 360 sem permitir conclusoes sem prova executavel.

**Architecture:** O roadmap e priorizado, mas nao bloqueia mudancas de assunto. Incidentes operacionais entram por prioridade; cada dominio tem contrato, teste e rollout proprios. PRs dependentes aguardam merge ou usam base empilhada.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Playwright, Vercel e Supabase.

---

## Premissas

- Executar em worktree limpa e preservar a `main` local.
- Aprovacao humana e registrada, mas nao exigida pela branch protection.
- Nenhum merge sem `MERGE` explicito.
- Preview Vercel e obrigatorio para loading, timeline, rede e performance.
- Rotacao de chaves esta fora do escopo atual por decisao do Bruno.

## P0 - Operacional

- [x] Verificar banner e bloqueio de senha: contrato existe para antes e depois de `2026-06-18T23:59:59-03:00`.
- [x] Verificar cron em producao: endpoint existe, mas retornava `CRON_SECRET not configured`.
- [x] Tornar o cron dry-run por padrao; exclusao exige `CRON_DELETE_ENABLED=true`.
- [x] Publicar no Preview, configurar `CRON_SECRET` somente na branch e validar dry-run autenticado: HTTP 200, zero candidatos e zero exclusoes.
- [x] Tornar o hook global de conclusao consultivo (`decision: null`) e validar seu contrato minimo.
- [ ] Apos `MERGE` explicito, configurar `CRON_SECRET` em producao e repetir o dry-run.
- [ ] Habilitar exclusao em producao somente apos revisar candidatos e autorizar o rollout.

## Fase 0 - Fundacao

- [ ] Alinhar workflows ao Node 24 configurado no projeto.
- [x] Manter Typecheck como check obrigatorio ja existente.
- [ ] Corrigir os erros atuais de lint, ignorar artefatos e criar baseline de avisos/disables.
- [ ] Ativar coverage com thresholds iniciais: lines 75, functions 74, branches 60, statements 72.
- [ ] Criar guard testado contra `.only`, `.skip`, `xit` e `xdescribe`.
- [ ] Executar quatro regressões E2E criticas, incluindo Scheffer, em desktop e viewport 375x812.
- [ ] Criar primitivas tipadas de timeout/abort; migracoes ficam para a Fase C.
- [ ] Reutilizar `scoutDiag` com harness somente de testes e guard contra catches vazios.

## Fases A-D

- [ ] **A - Causas-raiz:** diagnosticar o filho real invisivel do painel, persistir dossie mesmo com geracao divergente e remover mascaramento de contagem.
- [ ] **B - Loading declarativo:** estado unico `pending|active|completed|skipped|failed`, consolidacao separada e emissor unico de transicoes.
- [ ] **C - Timeout/abort:** inventariar e migrar por semantica; preservar races legitimas; travar budgets de 8 fontes, 5s total e 3s body.
- [ ] **D - Divida:** decidir telemetria temporaria, tipar MetricsDashboard, revisar flags e remover codigo morto.

## Validacao

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run docs:obsidian:check
```

Mudancas visuais exigem Playwright desktop + 375px contra Preview Vercel. A causa-raiz do painel branco exige 10 execucoes consecutivas sem retry, `pageerror` ou painel vazio.
