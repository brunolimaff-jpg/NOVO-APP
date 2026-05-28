# Active Context

Last updated: 2026-05-28 (PR #306 mergeada, PR #307 fechada, investigacao tela branca CONCLUIDA com causa raiz confirmada)

## Boot
1. Bruno Vault: `00-MASTER.md` -> `MOC-Licoes.md` -> `10-PROJETOS/NOVO-APP.md`
2. `HANDOFF_AI.md` -> este arquivo -> `progress.md`

## Fase atual
**Pendencias pos-PR #307** — PR #307 fechada como "too polluted" (commits de debug poluiram historico). Investigacao de tela branca CONCLUIDA com causa raiz confirmada: `https://html.duckduckgo.com/html/` bloqueado por IPs Vercel -> timeout runtime -> 504 Gateway Timeout. Correcao: remover DDG HTML da cascata, manter apenas Lite + Gemini summary.

Patches uteis de #307 (cascata, fadeoutTimerRef, cache delete, scoutDiag) precisam ser reaplicados em nova PR limpa.

## Proximo passo
Criar nova branch a partir de main com apenas os patches uteis de #307, excluindo o endpoint DDG HTML. Testar preview.

## Ponteiros
- PR #307: https://github.com/brunolimaff-jpg/NOVO-APP/pull/307 (CLOSED)
- Investigacao completa: `docs/obsidian/decisions/INVESTIGACAO-TELA-BRANCA-PR307-2026-05-28.md`
- `HANDOFF_AI.md`
