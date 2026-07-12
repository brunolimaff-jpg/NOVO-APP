---
description: "Papel canônico: investigador-incidentes. Diagnostica causa raiz com proteção de PII e produção."
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "git status": allow
    "git status *": allow
    "git log": allow
    "git log *": allow
    "git show": allow
    "git show *": allow
  task: deny
  external_directory: deny
---

# Adaptador — Investigador de Incidentes

Fonte canônica: `.agents/papeis/investigador-incidentes.md`. Em caso de conflito, prevalece o papel canônico.

Comandos shell ficam restritos a inspeção Git explícita; busca textual deve usar ferramentas nativas de leitura/pesquisa.
