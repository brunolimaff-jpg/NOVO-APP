# Handoff — Fase 3B.2A (plano mínimo + topologia)

> **Atualizado:** 2026-07-13 (rodada corretiva)
> **Branch:** `feat/fase-3b2a-plano-minimo`
> **PR:** #426
> **Baseline main:** `0f9bfda7`
> **Próxima etapa:** Fase 3B.2B — **não iniciada**

## Estado atual

| Fase   | Status       | Entrega                                                 |
| ------ | ------------ | ------------------------------------------------------- |
| 3B.1.5 | main `#425`  | harness Codex                                           |
| 3B.2A  | PR #426      | topologia + `executavel` + prova planner→runner dry-run |
| 3B.2B  | não iniciada | schema `if/then` / simplicidade avaliada                |

Orquestração: **84 testes**. Executor: **54**. Schema `if/then` ainda deferido.

## Contratos 3B.2A

- Default single-agent; papéis via `roteamento.yaml`
- Analítico: `planejado` + `executavel:false` + `comandos:[]` — não enviar ao runner
- Executor sem comandos: `negado` / `PLANEJADO_REQUIRES_COMMANDS` no planner
- `simplicidade.avaliada=false` + `SIMPLICITY_REQUIRES_REVIEW`

## Não fazer agora

- Merge sem **MERGE**; Ponytail / Multi-Agent V2 / `codex exec`; Scout funcional; 3B.2B
