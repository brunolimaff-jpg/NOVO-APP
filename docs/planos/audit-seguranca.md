# Auditoria de Seguranca — NOVO-APP (Senior Scout 360)

**Data:** 2026-05-22
**Escopo:** React 19 + TypeScript + Vite + Vercel serverless + Gemini API
**Metodo:** Revisao estatica de codigo (grep + leitura manual de arquivos)
**Propósito:** Identificar vulnerabilidades sem modificar codigo

---

## Sumario Executivo

| Severidade   | Quantidade | Descricao                                                                         |
| ------------ | ---------- | --------------------------------------------------------------------------------- |
| P0 (Critico) | 2          | Bundle expoe chaves Pinecone; XSS via rehypeRaw + mermaid loose                   |
| P1 (Alto)    | 4          | SSRF em link-status; base64 sem limite; auth ausente; CSP inexistente             |
| P2 (Medio)   | 3          | CORS permissivo em comex.ts; .env.example expoe nomes de chaves; sem protecao DoS |
| P3 (Baixo)   | 1          | mermaid securityLevel 'loose' no PDF export                                       |

**Risco Aceito (documentado):** APIs serverless sem auth porque sao chamadas internamente pelo frontend no mesmo dominio. Ataques requerem conhecimento do endpoint + chaves Gemini expostas via engenharia reversa do bundle.

---

## P0 — Vulnerabilidades Criticas

### P0.1 — Chave Pinecone exposta no bundle do frontend

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/index.tsx` (linhas 13-17)
**Codigo vulneravel:**

```typescript
const OPTIONAL_ENV_VARS: Array<{ key: string; label: string }> = [
  { key: 'VITE_PINECONE_API_KEY', label: 'Chave Pinecone (RAG)' },
  { key: 'VITE_PINECONE_INDEX_HOST', label: 'Host do indice Pinecone' },
  ...
];
function getMissingVars(vars: typeof REQUIRED_ENV_VARS): string[] {
  return vars
    .filter(({ key }) => !import.meta.env[key])
    .map(({ label }) => label);
}
```

**Risco:** Toda variavel com prefixo `VITE_` e inlineada no bundle JavaScript de producao pelo Vite. A linha `import.meta.env.VITE_PINECONE_API_KEY` faz o valor real da chave (ex: `pcsk_...`) aparecer como string literal no JS compilado, acessive via DevTools de qualquer navegador. Atualmente nao ha valor real no `.env.local` para `VITE_PINECONE_API_KEY`, mas o codigo esta pronto para expor quando configurada.

**Correcao sugerida:**

- Remover `VITE_PINECONE_API_KEY` e `VITE_PINECONE_INDEX_HOST` do env-check no `index.tsx` — ou usar uma flag booleana `VITE_PINECONE_CONFIGURED=true` em vez do valor real.
- O Pinecone e usado apenas nas serverless functions (`api/rag.ts`, `api/docs-rag.ts`) via `PINECONE_API_KEY` (sem prefixo `VITE_`), entao o frontend nao precisa da chave.
- Nunca usar `VITE_` para chaves secretas. Convencao Vite: todo `VITE_` e publico.

---

### P0.2 — XSS via rehypeRaw + Mermaid securityLevel 'loose'

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/components/MarkdownRenderer.tsx`

**Dois vetores combinados:**

**a) rehypeRaw ativo por padrao (linha 233):**

```typescript
allowRawHtml = true,  // default TRUE
...
rehypePlugins={allowRawHtml ? [rehypeRaw] : []}
```

O componente `SectionalBotMessage` (usado no chat principal) **nao passa** `allowRawHtml={false}`, herdando o default `true`. O `rehypeRaw` renderiza HTML bruto dentro do markdown sem sanitizacao. Nao ha `DOMPurify` ou `sanitize-html` no projeto. Se o Gemini gerar `<script>`, `<img onerror>`, `<iframe>` ou `javascript:` links no markdown, serao executados no navegador.

**b) Mermaid securityLevel 'loose' (linha 110):**

```typescript
securityLevel: 'loose',
```

`securityLevel: 'loose'` no Mermaid permite a execucao de JavaScript arbitario a partir de diagramas maliciosos (Click event injection). O `sanitizeMermaidCode` em `utils/mermaid.ts` faz sanitizacao basica, mas nao protege contra todas as variantes de click injection.

**Correcao sugerida:**

- Mudar default de `allowRawHtml` para `false` no `MarkdownRenderer.tsx` linha 233.
- Adicionar `DOMPurify` (pacote `dompurify`) para sanitizar HTML quando `allowRawHtml = true`.
- Mudar `securityLevel` para `'strict'` ou `'antisnatch'` no Mermaid.
- Garantir que `SectionalBotMessage` passe `allowRawHtml={false}` explicitamente onde raw HTML nao e necessario.

---

## P1 — Vulnerabilidades Altas

### P1.1 — SSRF (Server-Side Request Forgery) em api/link-status.ts

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/api/link-status.ts` (linhas 24-68)
**Codigo vulneravel:**

```typescript
function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch { return false; }
}

async function checkUrl(url: string): Promise<ValidationResult> {
  if (!isHttpUrl(url)) { return { status: 'unknown', note: '...' }; }
  let res = await fetch(url, { ... });  // fetch direto para URL arbitraria
}
```

**Risco:** A funcao `isHttpUrl` valida apenas se a URL comeca com `http:` ou `https:`. Nao bloqueia:

- `http://localhost:8080` (acesso a servicos internos)
- `http://127.0.0.1:6379` (Redis)
- `http://192.168.1.1` (rede interna AWS/Vercel)
- `http://169.254.169.254/latest/meta-data/` (metadata cloud AWS — permite escalonamento para credenciais IAM)

`api/link-status.ts` tambem nao usa Zod para validar o input (linha 76: `Array.isArray` simples).

**Correcao sugerida:**

- Usar `isValidPublicUrl()` de `/Users/brunolima/Documents/NOVO-APP/utils/documentExtractor.ts` (funcao ja existe e bloqueia localhost, private IPs, metadata cloud).
- Adicionar validacao Zod para o schema do request body.

---

### P1.2 — Input base64 sem limite de tamanho (DoS)

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/api/extract-content.ts` (linha 9)

```typescript
base64Content: z.string().optional(),  // sem .max()
```

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/utils/documentExtractor.ts` (linha 173)

```typescript
const buffer = Buffer.from(base64Content, 'base64'); // sem limite
```

**Risco:** Um atacante pode enviar um base64 de centenas de megabytes, causando:

- Alocacao de memoria no servidor (potencial OOM)
- Timeout e retry em cascata
- Consumo de cota de execucao Vercel (maxDuration 60s)

**Correcao sugerida:**

- Adicionar `.max(10_000_000)` no schema Zod para `base64Content` (equivalente a ~7.5 MB decodificado).
- Validar tamanho antes de decodificar: `if (base64Content.length > 10_000_000)`.

---

### P1.3 — Nenhuma API route tem autenticacao

**Arquivos afetados:** Todas as 11 rotas em `/Users/brunolima/Documents/NOVO-APP/api/`

- `api/gemini.ts`, `api/gerar-dossie.ts`, `api/radar-scan.ts`, `api/open-web-search.ts`, `api/extract-content.ts`, `api/link-status.ts`, `api/rag.ts`, `api/docs-rag.ts`, `api/pulse-news.ts`, `api/cnpj.ts`, `api/comex.ts`

**Risco:** Qualquer pessoa que descubra a URL base do deployment Vercel pode:

- Chamar `/api/gemini` e consumir cota da API Gemini (custo financeiro)
- Chamar `/api/rag` e `/api/docs-rag` para ler dados do Pinecone
- Chamar `/api/open-web-search` e consumir cota Brave Search
- Chamar `/api/link-status` para realizar scans SSRF (veja P1.1)

**Mitigacao atual:** As rotas sao acessiveis apenas via rewrite Vercel (mesmo dominio), entao requerem conhecimento do endpoint. Nao ha CORS configurado na maioria (exceto `cnpj.ts` e `comex.ts`), entao chamadas cross-origin de navegadores sao bloqueadas. **Ainda assim, chamadas server-side (curl, fetch, scripts) nao sao impedidas.**

**Correcao sugerida:**

- Adicionar Bearer token simples via variavel de ambiente `API_SECRET_TOKEN` em cada rota.
- Ou implementar rate limiting por IP.
- Ou restringir por Vercel WAF/Edge Middleware (ver `vercel-firewall` skill).

---

### P1.4 — Nenhum Content Security Policy (CSP) configurado

**Ausente em:** `vercel.json`, `index.html`, `_headers`, middlewares

**Risco:** Sem CSP, qualquer XSS (veja P0.2) tem impacto total — o atacante pode:

- Exfiltrar dados para servidores externos
- Ler localStorage/sessionStorage
- Executar requests autenticados para as APIs internas

**Correcao sugerida:**

- Adicionar `_headers` na raiz do projeto (formato Vercel):
  ```
  /*
    Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
  ```
- Ou configurar `headers` em `vercel.json`.
- CSP deve restringir: `script-src`, `connect-src`, `img-src`, `frame-src`.

---

## P2 — Vulnerabilidades Medias

### P2.1 — CORS permissivo em api/comex.ts

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/api/comex.ts` (linha 24)

```typescript
res.setHeader('Access-Control-Allow-Origin', '*');
```

**Risco:** Qualquer site de terceiros pode fazer requests cross-origin para esta API. Combinado com a falta de autenticacao (P1.3), um site malicioso pode ler dados de consulta CNPJ dos usuarios.

**Correcao sugerida:**

- Seguir o padrao de `api/cnpj.ts` com whitelist de origens (linhas 8-14).

---

### P2.2 — .env.example expoe nomes de chaves sensiveis

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/.env.example`

```env
GEMINI_API_KEY=your_gemini_api_key_here
PINECONE_API_KEY=your_pinecone_api_key_here
BRAVE_SEARCH_API_KEY=your_brave_search_api_key_here
```

**Risco:** Baixo — valores sao placeholders. Mas a lista de chaves existentes e util para engenharia reversa. O comentario "Atualmente o projeto ainda usa GEMINI_API_KEY em fluxo que passa pelo frontend" e preocupante e sugere que o design anterior era inseguro. Verificar se ainda ha fluxo que exponha `GEMINI_API_KEY` ao cliente.

**Correcao sugerida:**

- Atualizar o comentario se o fluxo ja foi migrado para o backend.
- Considerar `.env.example` generico sem nomes de chaves especificas (ex: `CHAVE_API_GEMINI=`).

### P2.3 — api/open-web-search.ts expoe providerStatus com detalhes internos

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/api/open-web-search.ts` (linha 293)

```typescript
providerStatus: [{ provider: 'brave', ok: false, reason: 'quota_exhausted' }];
```

**Risco:** O response da API expoe detalhes internos de infraestrutura (quota esgotada, chave ausente, timeout). Isso ajuda atacantes a entender o funcionamento interno do sistema.

**Correcao sugerida:**

- Logar no servidor e retornar apenas `degraded: true/false` para o cliente.

---

## P3 — Vulnerabilidades Baixas

### P3.1 — Mermaid securityLevel 'loose' no export PDF

**Arquivos:**

- `/Users/brunolima/Documents/NOVO-APP/utils/printExport.ts` (linha 274)
- `/Users/brunolima/Documents/NOVO-APP/utils/PDFGenerator.ts` (linha 356)

**Risco:** Contexto off-line (export HTML/PDF), mas `securityLevel: 'loose'` permite click injection nos diagramas exportados. Baixo impacto real.

**Correcao sugerida:**

- Mudar para `securityLevel: 'strict'` nos exports tambem.

---

### P3.2 — Mermaid parse sem validacao de entrada

**Arquivo:** `/Users/brunolima/Documents/NOVO-APP/components/MarkdownRenderer.tsx` (linhas 150-152)

```typescript
const mermaid = (await getMermaid(isDarkMode ?? false)) as MermaidWithParse;
if (typeof mermaid.parse === 'function') {
  await mermaid.parse(sanitizedChart);
}
const { svg: rendered } = await mermaid.render(idRef.current, sanitizedChart);
```

**Observacao:** O `sanitizeMermaidCode` ja faz sanitizacao basica. Nao ha risco imediato, mas notar que `securityLevel: 'loose'` combinado com parse que pode ter vulnerabilidades conhecidas.

---

## Matriz de Risco

| #    | Vulnerabilidade             | Probabilidade          | Impacto | Risco                  |
| ---- | --------------------------- | ---------------------- | ------- | ---------------------- |
| P0.1 | Chave Pinecone no bundle    | Media (se configurada) | Alto    | **Alto**               |
| P0.2 | XSS via rehypeRaw + mermaid | Media                  | Alto    | **Alto**               |
| P1.1 | SSRF em link-status         | Baixa                  | Alto    | **Medio-Alto**         |
| P1.2 | DoS via base64              | Baixa                  | Medio   | **Medio**              |
| P1.3 | APIs sem auth               | Baixa                  | Alto    | **Medio**              |
| P1.4 | CSP ausente                 | -                      | -       | **Mitigacao faltando** |
| P2.1 | CORS permissivo             | Baixa                  | Medio   | **Baixo-Medio**        |
| P2.2 | .env.example                | Baixa                  | Baixo   | **Baixo**              |
| P2.3 | Exposicao detalhes internos | Alta                   | Baixo   | **Baixo**              |

---

## Recomendacoes (ordenadas por prioridade)

### Imediatas (fazer antes do proximo deploy)

1. **Desativar rehypeRaw por padrao** (`MarkdownRenderer.tsx` linha 233: `allowRawHtml = false`) e mudar `securityLevel` para `'strict'` no Mermaid. Adicionar DOMPurify se raw HTML for necessario.

2. **Corrigir SSRF em `api/link-status.ts`**: Usar `isValidPublicUrl()` do `documentExtractor.ts` (ja existe) e adicionar Zod validation.

3. **Remover `VITE_PINECONE_API_KEY` e `VITE_PINECONE_INDEX_HOST` do env-check do `index.tsx`** ou trocar por flag booleana.

4. **Adicionar limite de tamanho no schema Zod de `base64Content`** em `api/extract-content.ts`.

### Curto Prazo (proxima sprint)

5. **Adicionar autenticacao basica nas API routes** (Bearer token via `API_SECRET_TOKEN` env var). Como minimo, nas rotas que consomem recursos pagos: `gemini.ts`, `gerar-dossie.ts`, `open-web-search.ts`, `rag.ts`, `docs-rag.ts`.

6. **Configurar CSP** via `_headers` ou `vercel.json` para mitigar impacto de XSS.

7. **Corrigir CORS em `api/comex.ts`**: Trocar `*` pela whitelist de origens (seguir padrao de `cnpj.ts`).

### Medio Prazo

8. **Adicionar rate limiting** via Vercel WAF ou Edge Middleware para proteger contra abuso de quota das APIs pagas (Gemini, Brave Search, Pinecone).

9. **Remover informacoes internas dos responses de API** (`providerStatus`, nomes internos de keys).

10. **Adicionar testes de seguranca**: Scan de chaves expostas no bundle, validacao de SSRF, testes de XSS no componente MarkdownRenderer.

---

## Chaves Reais Atualmente em `.env.local`

Para referencia do desenvolvedor (NAO comitar):

| Variavel               | Prefixo     | Exposta no bundle? | Risco atual      |
| ---------------------- | ----------- | ------------------ | ---------------- |
| `PINECONE_DOCS_KEY`    | sem `VITE_` | Nao                | OK (server-side) |
| `PINECONE_DOCS_INDEX`  | sem `VITE_` | Nao                | OK (server-side) |
| `GEMINI_API_KEY`       | sem `VITE_` | Nao                | OK (server-side) |
| `BRAVE_SEARCH_API_KEY` | sem `VITE_` | Nao                | OK (server-side) |

**Nenhuma chave real esta atualmente exposta no bundle.** Mas o codigo em `index.tsx` referencia `VITE_PINECONE_API_KEY` que, se preenchida, seria exposta.

---

## Observacoes Finais

1. **Projeto interno**: O risco e mitigado pelo fato de ser uma ferramenta interna da Senior Sistemas, com acesso restrito a colaboradores. Ataques externos requerem conhecimento do deployment Vercel.

2. **Boa pratica**: A sanitizacao de dados pessoais (`sanitizeSensitivePersonalData` em `utils/privacy.ts`) e correta e usada em varios lugares -- manter.

3. **Ponto forte**: `isValidPublicUrl()` em `utils/documentExtractor.ts` e bem implementada (bloqueia localhost, 127.0.0.1, ranges privados 10.x, 172.16-31.x, 192.168.x, 169.254.x, .local, .internal). Basta aplica-la onde falta (P1.1).

4. **Ponto forte**: Zod e usado em 9 das 11 API routes. Apenas `cnpj.ts` (validacao manual de CNPJ) e `link-status.ts` (sem validacao de schema) fogem do padrao.

5. **`.env.local` esta no `.gitignore`** -- confirmado. As chaves reais nao serao commitadas acidentalmente.
