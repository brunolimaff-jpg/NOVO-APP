# Estabilização do dossiê e migração LiteLLM — v1

> **Status:** plano aprovado; PR 1 em execução.
> **Baseline:** `a55113e525d31c5a0de82f5b01208ac82ae1eb29`.
> **Prioridade:** estabilizar exclusivamente o fluxo de geração, persistência, exibição e follow-up do dossiê.

## Decisões congeladas

- O único endpoint de negócio consumido diretamente pela UI será `api/dossier.ts`.
- `cnpj`, `extract-content`, `link-status`, `open-web-search` e `socio-search` serão auxiliares protegidos, com operação fixa, payload limitado, rate limit e sem prompt livre. A UI não os chamará diretamente.
- O gateway LiteLLM será módulo interno. O frontend não escolhe provider, modelo, workload, prompt, retry ou ferramentas.
- Uma execução usa idempotência, lifecycle persistido, lease e cancelamento em duas camadas: abort da conexão atual e pedido de cancelamento cooperativo por `runId`.
- O primeiro cutover não tem fallback Gemini nem retry automático. Um workload problemático fica `disabled`.
- `gemini-embedding-001`, índice Pinecone, namespaces e scripts de ingestão permanecem; somente Gemini generativo sai do dossiê.
- O RAG do dossiê é uma integração nova, opcional e degradável. O RAG documental do War Room fica indisponível, sem apagar vetores.
- O benchmark interno `runDossierBenchmarkStage` permanece enquanto contribuir ao relatório. Benchmark independente, War Room e Radar ficam indisponíveis.
- Sentry Replay permanece desligado até existir retenção, acesso e sanitização comprovados.
- A meta é oito Functions, mas o gate é sempre o Build Output observado.

## Fluxo canônico do dossiê

```text
Usuário autenticado
→ empresa ou CNPJ
→ auth, ownership e idempotência
→ CNPJ, QSA e empresas relacionadas
→ pesquisa pública e RAG aplicável
→ EvidencePack com proveniência
→ módulos analíticos via LiteLLM interno
→ benchmark interno quando aplicável
→ consolidação, validação e Score PORTA
→ persistência e lifecycle final
→ renderização e follow-up vinculado ao dossierId
```

Qualquer falha de identidade, persistência ou validação estrutural bloqueia a entrega. Falha de uma fonte opcional ou do RAG deve aparecer como limitação e permitir apenas resultado degradado, nunca fato inventado.

## Superfícies fora do primeiro ciclo

Radar, auto-scan de notícias, War Room, respostas técnicas livres, benchmark independente, docs-RAG, health generativo, curiosidades de loading e recovery judge não essencial devem mostrar:

> Disponível em breve.
> Estamos priorizando a estabilização e a qualidade dos dossiês.

Elas não podem manter botão funcional, timer, request em background, endpoint sem consumidor ou fallback Gemini silencioso. Dados, tabelas, índices e vetores históricos permanecem preservados.

## PRs e gates

| PR | Objetivo | Functions esperadas | Gate de saída |
| --- | --- | ---: | --- |
| 1 | Node 24, npm fixado, `npm ci`, CI, Vercel e Build Output | 13 | instalação, build e Functions explicadas |
| 2 | Contenção de Radar, War Room e superfícies secundárias | 9 | zero execução oculta; benchmark interno preservado |
| 3 | Auth, Supabase, ownership, lifecycle, leases e cancelamento | 9 | RLS, idempotência e cancelamento comprovados |
| 4 | `api/dossier.ts`, gateway LiteLLM e chat contextual | 10 | Preview G3, auth, abort e logs correlacionados |
| 5 | Busca, RAG opcional e EvidencePack consumido | 9 | proveniência correta; RAG comparado e degradável |
| 6 | Waterfall, persistência, UI e remoção Gemini generativo | 8 alvo | dossiê completo, sem EmptyState e sem Gemini generativo |

Cada checkpoint segue o mesmo loop:

```text
INSPECIONAR → CLASSIFICAR → PLANEJAR → IMPLEMENTAR
→ TESTAR ESTATICAMENTE → TESTAR LOCALMENTE → GERAR BUILD
→ PUBLICAR PREVIEW → EXECUTAR PROVA CONTROLADA → LER LOGS
→ VERIFICAR BANCO → COMPARAR ESPERADO E OBSERVADO
→ REVISAR → DOCUMENTAR LIÇÃO → DECIDIR
```

Decisões permitidas: `AVANÇAR`, `CORRIGIR UMA VEZ`, `REVERTER`, `BLOQUEAR`, `DIVIDIR ESCOPO` ou `PEDIR EVIDÊNCIA`.

A regra de uma correção vale por hipótese ou checkpoint, não pela PR inteira. Resultado inconclusivo não avança. Merge e deploy exigem autorização humana separada.

## PR 1 — escopo autorizado

Esta PR altera somente a reprodutibilidade da baseline:

- Node 24 nos workflows CI;
- npm `11.11.0` fixado no pacote;
- `.nvmrc` para desenvolvimento local;
- `npm ci` no deploy Vercel e nas instruções operacionais;
- documentação do plano e handoff de continuidade.

Ficam fora: LiteLLM, Gemini, prompts, APIs, Supabase, Vercel remoto, Sentry, Pinecone, Radar, War Room e comportamento funcional do dossiê.

## Critérios de aceite da PR 1

- `npm ci` com Node 24.14.1 conclui sem modificar o lockfile;
- typecheck, testes e build são executados e registrados separadamente;
- Vercel Build Output é gerado ou bloqueado com motivo verificável;
- as 13 Functions observadas são registradas com origem, runtime e duração;
- `git diff --check` passa;
- nenhum segredo ou arquivo local é versionado;
- nenhuma chamada LLM, migration, deploy ou runtime de agentes é executado.

## Validação registrada em 2026-07-20

- `npm ci` passou com Node `24.14.1` e npm `11.11.0`, sem alterar o lockfile.
- `npm run build` passou. O build revelou que uma credencial Sentry já presente no ambiente publicou sourcemaps; nenhuma alteração de Sentry faz parte desta PR e novos builds devem manter `SENTRY_AUTH_TOKEN` vazio até a revisão específica da observabilidade.
- `npm run docs:obsidian:check` passou.
- Typecheck e a suíte geral falharam em arquivos e contratos fora deste diff, incluindo módulos de dossiê, LiteLLM, auth, socio-search e fixtures Golden. Essas falhas são baseline preexistente e não serão corrigidas nesta PR.
- `vercel build` foi interrompido antes do build com `project_settings_required`: a CLI exigiu `vercel pull` ou `--yes` para obter configuração remota. Essa sincronização pode materializar configuração de ambiente e está fora do escopo; o Build Output fica como gate pendente para a revisão autorizada da PR.

## Próxima sessão

Validar e revisar a PR 1. Antes da PR 2, obter autorização específica para recuperar apenas as configurações necessárias e fechar o Build Output da Vercel sem expor segredos.
