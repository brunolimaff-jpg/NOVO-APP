---
title: "NUNCA confiar em 'já mudei' sem verificar o arquivo"
date: 2026-06-24
type: lesson
tags: [licao, debug, timeout, litellm, pr386]
---

## O que aconteceu

O bug real da PR #386 (`MAX_LITELLM_REQUEST_TIMEOUT_MS = 38_000` em `api/_llm-client.ts:7`) ficou escondido por **7 dias** porque ninguém verificou o arquivo depois de "ter mudado".

Mudamos env var para 120000, mudamos o cliente, mudamos o waterfall — mas o cap de 38s no código servidor anulava TUDO: `Math.min(120000, 38000) = 38s` efetivo.

## Causa

Confiança cega na afirmação "já mudei" sem confirmação visual do arquivo.

## Solução

Toda vez que afirmar "já mudei X", rodar `cat <arquivo>` ou `git diff` para confirmar. Para diagnósticos de timeout: verificar TODAS as camadas com `grep -r TIMEOUT`.

**Referência:** CALIBER_LEARNINGS.md, decisions.md DI-2026-06-24-26
