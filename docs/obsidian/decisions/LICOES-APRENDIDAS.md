---
type: licoes-aprendidas
area: processo
data: 2026-05-23
sessao: teia-societaria-tipo5
tags:
  - licao
  - worktree
  - retrabalho
  - commit
  - gate
  - agente
---

# Lições Aprendidas — Worktree sem Commit = Retrabalho

Voltar para [[DECISIONS-Index]].

## Contexto

Sessão de implementação da Teia Societária Tipo 5 (PR #279). O fluxo envolveu:

1. Brainstorming (planner + ideator + reviewer) para revisar o plano
2. Quick wins (Bloco A) aplicados no worktree
3. Implementer trabalhou no worktree `codex/teia-societaria-tipo5`
4. Merge da branch no `feat/migration-notice-supabase`
5. Usuário testou em `localhost:3000` — Módulo 1b não executou

## Linha do Tempo do Retrabalho

| Etapa | O que aconteceu | Problema |
|-------|----------------|----------|
| Implementer | Trabalhou no worktree, declarou "all steps complete", typecheck verde, 903 testes | Não commitou as alterações |
| Merge | `git merge codex/teia-societaria-tipo5` trouxe 3 commits originais da PR | 12 arquivos do implementer não vieram |
| Teste | Usuário rodou `localhost:3000`, dossiê sem profundidade | Código simplesmente não existia |
| Debug | Ciclo extra de diagnóstico para descobrir que era ausência de arquivo, não bug | ~15min perdidos |
| Cópia manual | `cp` de 12 arquivos do worktree para a branch atual | ~10min |
| Ajustes | Import paths quebrados (`tests/api/` → `tests/`), tipo `temperature` ausente em `DossierModuleOptions` | ~5min |

**Custo total do retrabalho: ~30min + quebra de confiança no agente.**

## Causa Raiz

O agente implementer trabalhou em worktree isolado (`isolation: "worktree"`) e **não foi instruído a commitar**. O protocolo de conclusão do agente verificou typecheck e testes, mas não verificou `git status --porcelain`. As alterações ficaram como uncommitted changes no worktree, invisíveis para o merge.

## Arquivos Afetados

### Criados (não existiam na branch após merge)
- `prompts/mega/teia-identity.ts` (142 linhas)
- `prompts/mega/teia-deep.ts` (206 linhas)
- `docs/obsidian/decisions/DOSSIE-SCHEFFER-PROFUNDIDADE-TEIA.md`

### Modificados (versão da PR #279 veio sem as alterações do implementer)
- `features/dossier/waterfall-orchestrator.ts` — `runTeiaSocietariaOrchestration`
- `prompts/mega/specialist-prompts.ts` — regra CNPJ
- `prompts/megaPrompts.ts` — exports `PROMPT_TEIA_IDENTITY_MODULE` e `PROMPT_TEIA_DEEP_MODULE`
- `features/dossier/societaryGraph.ts` — badge "operação" → "oficial"
- `features/dossier/SocietaryMap.tsx` — `normalizeCnpj` + cache fix
- `api/socio-search.ts` — cache probe placeholder bug
- `services/gemini/investigation-orchestration.ts` — suporte a `temperature`
- `services/gemini/contracts.ts` — campo `temperature?: number`
- `docs/obsidian/decisions/TEIA-SOCIETARIA-ENRIQUECIMENTO.md` — decisão revisada
- `tests/features/dossier/waterfall-orchestrator.test.ts`
- `tests/App.dossierGolden.test.tsx`
- `tests/prompts/megaPrompts.test.ts`

## Correção

1. Cópia manual dos 12 arquivos do worktree
2. Ajuste de path do `tests/api-socio-search.test.ts` (movido de `tests/api/` para `tests/`)
3. Adição do campo `temperature?: number` em `DossierModuleOptions` (`services/gemini/contracts.ts`)
4. Typecheck e testes revalidados (903 passando)

## Prevenção — Novo Gate

### Gate #1: Commit obrigatório pós-agente

Ao receber resultado de agente que usou worktree, verificar:

```bash
git -C <worktree-path> status --porcelain
```

Se NÃO vazio → o agente não commitou. Solicitar commit ou commitar manualmente.

### Gate #2: Instrução explícita no prompt do agente

Todo prompt de agente com `isolation: "worktree"` deve incluir:

> Ao finalizar todas as alterações, faça commit com `git add -A && git commit -m "..."`. Rode `git status --porcelain` para confirmar que não há arquivos pendentes.

### Gate #3: Verificação pós-merge

Após merge de branch onde agente trabalhou, verificar:

```bash
# Confirma que arquivos esperados existem
ls <arquivos-criados-esperados>

# Confirma que funções esperadas existem
grep -r "<funcao-esperada>" <arquivos-modificados-esperados>
```

## Registro

Esta lição foi registrada em:
- `.agents/memory/decisions.md` — entrada `2026-05-23 — Lição Aprendida`
- `docs/obsidian/decisions/LICOES-APRENDIDAS.md` (este documento)
- `docs/obsidian/decisions/LATEST-DECISIONS.md` — feed automático

## Ações Derivadas

- [ ] Atualizar regra global em `~/.claude/rules/` com gate de commit pós-worktree
- [ ] Revisar prompts de agentes existentes para incluir instrução de commit
- [ ] Adicionar verificação no hook `SessionEnd` para detectar worktrees com uncommitted changes
