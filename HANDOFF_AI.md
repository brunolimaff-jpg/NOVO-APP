# Handoff -- NOVO-APP (entrada rapida)

**Narrativa / licoes / sessoes:** Bruno Vault -> `docs/OBSIDIAN_VAULT.md`  
**Boot completo:** `AGENTS.md` (ordem de leitura)  
**Sessao atual:** `docs/handoffs/2026-05-27-dossier-link-integrity-pr301.md`

## Estado agora (2026-05-27 — PR #301 aberta)

| Item | Valor |
|------|--------|
| Projeto | Senior Scout 360 — React 19, Vite, Gemini, Pinecone, Supabase |
| Branch ativa | `fix/dossier-link-integrity-fontes` |
| PR #301 | **ABERTA** — integridade links + fontes completas no dossiê |
| Main | `22cc0b1` (PR #300 mergeada) |
| CI PR #301 | Verde (último push: `b3af760`) |

## PR #301 — integridade de links + fontes

**Objetivo:** zero link fake; rodapé `## 📚 Fontes` (citadas + consultadas); pool no prompt; fallback web não aborta módulo.  
**URL:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/301  
**Handoff:** `docs/handoffs/2026-05-27-dossier-link-integrity-pr301.md`

### Commits na PR

- `2c6e40b` — feature core (integrity, footer, prompts, waterfall)
- `a7d56ff` — review + testes MessageActionsBar
- `b3af760` — fix tela branca Scheffer

### Pendente local (não pushado)

UX waterfall: preview do dossiê durante geração, overlay hero some com stream, timeout link-status — ver diff em `App.tsx`, `waterfall-orchestrator.ts`, `ChatInterface.tsx`.

### Smoke / produção

- **Produção** (`scoutagro.vercel.app`) ≠ PR — ainda código antigo de fallback.
- Teste usuário: LoadingSmart longo + `open-web-search` degradado (env Brave).
- Após push pendente: smoke preview Scheffer CNPJ `04733767000180`.

## Comandos

```bash
npm run dev
npm test
npm run typecheck
gh pr checks 301
```

## Regras criticas

- Merge guard: token **MERGE** obrigatorio
- Fachadas congeladas; prompts em `prompts/`; CNPJ antes de IA
