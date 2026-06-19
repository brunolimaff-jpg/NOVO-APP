# E2E Playwright

Specs em `critical-ux` e preview Vercel usam **stubs** (`helpers/gemini.ts`, `helpers/cnpj-stub.ts`) — não chamam Gemini nem BrasilAPI real.

- CI blocking: vitest + coverage + build budget (ver `HANDOFF_AI.md`).
- Validação UX no preview: PR Gate IA (`npm run test:e2e:critical-ux` com `BASE_URL`).
- `p2-cnpj-live` / `test:e2e:cnpj:live`: manual apenas.
