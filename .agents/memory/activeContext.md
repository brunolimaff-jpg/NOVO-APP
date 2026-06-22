# Active Context

**Last updated:** 2026-06-22 13:30 — Golden Review 4 riscos corrigidos + OpenCode configurado

## Prioridade Atual

**PR #386 — fechar golden review + validar no preview**

- Branch: `feat/litellm-experiment`
- HEAD: `ef3d437` (docs-rag restaurado)
- PR: https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
- Preview funcionando: https://scoutagro-fwsradft6-brunolimaff-3629s-projects.vercel.app (commit 975d3f14)
- Vault: `/Users/brunolima/Documents/Bruno Vault/20-SESSOES/2026-06/2026-06-22T13-30-00-pr386-golden-review-4-riscos.md`

## 4 Riscos Golden — Corrigidos

1. **SSRF link-status**: isValidPublicUrl expandido + redirect manual 3 hops
2. **Scheffer Chapecó/SC**: locality Sapezal/MT no case.json + localityFound rubrica
3. **Brave 1/5**: waitForNetworkIdle + no finally
4. **IDs distintos**: testInfo.attach JSON proof

## Deploy Quebrado

- Commits pós-18f3a621 falham com Error (deleção docs-rag.ts suspeita)
- Build local OK. Typecheck OK.
- Precisa: commitar finalizeRun fix SEM deletar docs-rag.ts

## OpenCode Global Config

- 10 MCPs, 9 comandos, 11 subagentes, instructions consolidado 86 linhas
- Config em `~/.config/opencode/opencode.jsonc`

## Pendência Crítica

Rodar golden-dossier-live 2x no preview:
- Email: bruno.ferreira@senior.com.br
- Senha: Scout360@2026!
- CNPJ: 04.733.767/0001-80
