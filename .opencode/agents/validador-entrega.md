---
description: "Papel canônico: validador-entrega. Confirma entrega e regressões."
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "git status*": allow
    "git diff*": allow
    "npm test*": allow
    "npm run test*": allow
    "npm run typecheck*": allow
  task: deny
  external_directory: deny
---

# Adaptador — Validador de Entrega

Fonte canônica: `.agents/papeis/validador-entrega.md`. Em caso de conflito, prevalece o papel canônico.
