---
description: "Papel canônico: validador-entrega. Confirma entrega e regressões."
mode: subagent
permission:
  edit: deny
  bash: ask
  task: deny
  external_directory: deny
---

# Adaptador — Validador de Entrega

Fonte canônica: `.agents/papeis/validador-entrega.md`. Em caso de conflito, prevalece o papel canônico.

Validação por shell exige aprovação explícita nesta fase; não há garantia automática de read-only para comandos aprovados fora de worktree descartável.
