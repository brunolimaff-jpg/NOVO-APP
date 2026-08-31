# Lições aprendidas + roadmap mestre do Scout 360

> Data: 2026-07-27
> Base: `main` `59c7c27bd68b7168ae4774c4458d77d58b3a296a`
> Função deste documento: o que aprendemos, quais regras passam a valer, qual é o plano completo.
> Complementa `2026-07-27-production-lifecycle-recovery.md` (que descreve o incidente em si).
> PR: somente documental — sem código, migration, workflow, Vercel ou Supabase.

---

## 1. Estado executivo atual

| Frente                   | Estado atual     | Interpretação                                               |
| ------------------------ | ---------------- | ----------------------------------------------------------- |
| Produção                 | VERDE            | Dossiê completo voltou a gerar e persistir                  |
| Lifecycle                | VERDE            | Create, lease, heartbeat, complete e persistência validados |
| Checkpoint do incidente  | CONCLUÍDO        | PR #461 mergeada em `59c7c27`                               |
| Histórico de migrations  | BLOQUEADO        | Versão local e registro remoto divergentes                  |
| Grants de `dossier_runs` | BLOQUEADO        | RLS protege, mas grants diretos estão amplos                |
| PR #456                  | DRAFT / PENDENTE | Código maduro, mas branch precisa atualizar sobre nova main |
| Gateway LiteLLM          | PRESENTE         | Endpoint existe, mas não houve cutover completo da UI       |
| Waterfall atual          | LEGADO           | Produção ainda usa `/api/gemini`                            |
| Zero Gemini              | NÃO ATINGIDO     | Gemini ainda está no caminho generativo                     |
| PR5                      | NÃO INICIADA     | Busca, EvidencePack e RAG                                   |
| PR6                      | NÃO INICIADA     | Cutover final do waterfall e UI                             |
| Login/recuperação        | DÉBITO           | Não existe fluxo adequado para usuário sem sessão           |
| Estado de mensagens      | DÉBITO           | Evento de mensagens desaparecendo precisa triagem           |
| Gates globais            | DÉBITO           | Typecheck, testes, Golden e E2E ainda têm baseline vermelho |

---

## 2. Linha do tempo consolidada

| Ordem | Evento                        | Resultado                                                   |
| ----: | ----------------------------- | ----------------------------------------------------------- |
|     1 | PR #448                       | Baseline Node/npm/CI/Vercel                                 |
|     2 | PR #449                       | Contenção de Radar, War Room e superfícies secundárias      |
|     3 | PR #450                       | Lifecycle persistido incorporado ao código                  |
|     4 | PR #451                       | Gateway autenticado `/api/dossier` e LiteLLM                |
|     5 | PRs #458–#460                 | Lint, runbooks, dependências e recuperação por suporte      |
|     6 | Produção em `7f262467`        | Código lifecycle publicado sem schema remoto correspondente |
|     7 | Primeiro teste                | RPC `create_or_get_dossier_run` retornou 404                |
|     8 | Diagnóstico inicial incorreto | Preview foi confundido com Production                       |
|     9 | DevTools confirmou            | Chamada era ao Supabase principal correto                   |
|    10 | Consulta read-only            | Tabela e RPCs estavam ausentes em Produção                  |
|    11 | Migration lifecycle aplicada  | Produção recuperada                                         |
|    12 | Smoke SQL transacional        | Create, lease e RLS validados                               |
|    13 | Teste Scheffer                | Waterfall completo, persistência e UI validados             |
|    14 | PR #461                       | Incidente documentado                                       |
|    15 | Merge da #461                 | `main` avançou para `59c7c27`                               |

---

## 3. Lições aprendidas

| Área | Lição | Evidência observada | Regra permanente |

### 3.1 Ambiente e deploy

| Lição                                                | Evidência                                                          | Regra permanente                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| URL de Vercel não determina sozinha o ambiente       | Um deploy de Production foi inicialmente interpretado como Preview | Confirmar sempre `target`, deployment ID, branch e commit      |
| Deploy `READY` não significa aplicação funcional     | Vercel estava verde enquanto o primeiro RPC retornava 404          | Todo deploy com mudança de contrato precisa de smoke funcional |
| Preview e Production podem usar Supabases diferentes | Existem `NOVO-APP` e `scoutagro-preview`                           | Registrar uma matriz explícita Vercel × Supabase               |
| Nunca reapontar Production para banco Preview        | Os bancos possuem dados e contratos diferentes                     | Troca de projeto é proibida como atalho de recuperação         |

### 3.2 Observabilidade

| Lição                                                                              | Evidência                                           | Regra permanente                                                   |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Chamadas diretas navegador → Supabase não aparecem como erro de Function da Vercel | Vercel não mostrava o 404 do RPC                    | Analisar Vercel, Network, Console e Supabase como fontes distintas |
| Console e Network foram decisivos                                                  | O browser mostrou `create_or_get_dossier_run` 404   | Incidente client-side exige captura do navegador                   |
| `/api/gemini` pode ser apenas flush diagnóstico                                    | Uma chamada apareceu após o catch do fluxo          | Conferir stack e initiator antes de atribuir causa                 |
| Logs agrupados sem erro não provam sucesso end-to-end                              | Runtime Vercel estava limpo antes do teste completo | Validar estado de lifecycle e persistência no banco                |

### 3.3 Migrations

| Lição                                                     | Evidência                                                     | Regra permanente                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Migration no Git não significa migration aplicada         | Arquivo existia na `main`, objetos não existiam em Produção   | Merge de código dependente exige gate de schema remoto                    |
| Código e schema devem ser implantados em ordem compatível | Frontend chamou RPC antes da criação remota                   | Adotar estratégia expand-and-contract                                     |
| Aplicação manual pode criar drift de histórico            | Arquivo é `20260721090000`, remoto registrou `20260727224304` | Preservar versão canônica ou reparar histórico antes da próxima migration |
| Não executar `db push` com histórico divergente           | Migration antiga pode ser vista como pendente                 | `db push` proibido até reconciliação                                      |
| Migration aditiva também pode quebrar Produção se ausente | A ausência causou indisponibilidade total do fluxo            | "Aditiva" não significa "opcional"                                        |

### 3.4 Segurança: grants e RLS

| Lição                                                   | Evidência                                                | Regra permanente                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| RLS e grants são camadas diferentes                     | INSERT direto foi bloqueado, mas grants estavam amplos   | Validar políticas e ACL separadamente                                                    |
| Default privileges podem ampliar tabelas novas          | `authenticated` recebeu privilégios além de SELECT       | Auditar `ALTER DEFAULT PRIVILEGES` do projeto                                            |
| RLS bloquear escrita não torna grants amplos aceitáveis | Não houve bypass, mas contrato foi violado               | Privilégio direto deve seguir mínimo necessário                                          |
| `PUBLIC` deve ser revogado explicitamente               | Auditoria da #456 encontrou ausência de revoke explícito | Toda migration sensível deve revogar `PUBLIC`, `anon` e `authenticated` antes de regrant |
| `service_role` precisa ser testado como BYPASSRLS       | O teste inicial não reproduzia corretamente o Supabase   | Scripts de segurança devem modelar role e grants reais                                   |

### 3.5 Testes SQL

| Lição                                                              | Evidência                                                                 | Regra permanente                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `WHEN others THEN NULL` mascara falhas                             | Asserts do primeiro script podiam passar falsamente                       | Proibir exceções genéricas que engolem asserts               |
| Testes de policy não podem depender apenas do nome                 | Um nome contendo "update" gerou falso sinal                               | Inspecionar `cmd`, `qual` e `with_check`                     |
| Teste cross-operator pode ser ocultado pela própria RLS            | Consultas sob Alice não enxergavam linhas de Bob                          | Usar role administrativa/BYPASSRLS para verificações globais |
| PostgreSQL real revelou bugs que o teste estático não encontrou    | Placeholder de `format`, `pg_policy.cmd` e dollar quoting estavam errados | Migration crítica exige runtime PostgreSQL real              |
| Script deve ser transacional                                       | Foi necessário adicionar `BEGIN/ROLLBACK`                                 | Todo teste SQL deve sair com zero resíduo                    |
| Uma execução não é suficiente                                      | O script passou duas vezes no banco descartável                           | Executar duas vezes para validar idempotência                |
| Grants de schema e tabela também importam para `service_role` mock | BYPASSRLS sozinho não permitia leitura                                    | Modelar privilégios completos da role                        |

### 3.6 Autenticação

| Lição                                                          | Evidência                                               | Regra permanente                                         |
| -------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Senhas não podem ser recuperadas em texto                      | Supabase armazena hash                                  | Nunca tentar ler senha                                   |
| Conta ativa não significa acesso recuperável                   | Usuário existia, mas não tinha senha nem tela adequada  | Implementar login e recuperação reais                    |
| Sessão antiga pode esconder ausência de tela de login          | Magic link expirou, mas navegador continuou autenticado | Testar em navegador limpo e sessão expirada              |
| `otp_expired` deve ser tratado pela aplicação                  | Fragmento de erro ficou na URL                          | Criar rota de callback e mensagem apropriada             |
| Chaves públicas e secrets não devem ser colados ou persistidos | Houve tentativa de obter chave para script local        | Usar gestão segura de secrets e nunca documentar valores |

### 3.7 Lifecycle e persistência

| Lição                                                     | Evidência                                                       | Regra permanente                                    |
| --------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| `COMPLETED` só é válido após persistência                 | O teste cruzou `dossier_runs` e `dossies`                       | Estado terminal depende de `dossier_id` persistido  |
| Lease deve ser liberada ao final                          | `lease_owner` e `lease_expires_at` ficaram null                 | Validar sempre liberação terminal                   |
| UI concluída não basta                                    | Foi necessário validar banco e status do run                    | DoD exige UI + lifecycle + persistência             |
| Persistência e renderização podem ter tamanhos diferentes | JSON no banco e markdown final possuem representações distintas | Registrar ambos sem tratá-los como inconsistência   |
| Heartbeat funcionando prova aquisição de lease anterior   | `renew_dossier_run_lease` retornava 200                         | Usar heartbeat como evidência secundária, não única |

### 3.8 Interface e estado

| Lição                                                  | Evidência                                      | Regra permanente                                            |
| ------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------- |
| Loader precisa de probes pós-conclusão                 | Bugs anteriores deixavam tela presa            | Validar 0 ms, 100 ms, 1 s, 3 s e 10 s                       |
| Dossiês grandes precisam de renderização alternativa   | `static-fallback-rendered` foi acionado        | Manter fallback estático até virtualização estar comprovada |
| Warning diagnóstico não é necessariamente falha        | `BlankPanelDebug` ocorreu com conteúdo visível | Classificar warning pelo impacto real                       |
| Mensagens podem desaparecer antes de uma nova execução | Store caiu de 2 mensagens para zero            | Abrir investigação separada para race/state reset           |

O log final confirmou conclusão do waterfall, geração única, zero bloqueios, UI finalizada e ausência de loader preso.

O evento anterior de desaparecimento das mensagens também deve ser preservado como débito real.

### 3.9 Providers, latência e fallback

| Lição                                                     | Evidência                                                          | Regra permanente                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| Warning de deadline não significa necessariamente timeout | Módulo levou ~74 s e concluiu                                      | Separar budget warning de cancelamento físico         |
| Fallback de CNPJ preservou o fluxo                        | BrasilAPI retornou 403, outra fonte respondeu                      | Monitorar degradação por fonte                        |
| Grounding zero em módulos não significa que o run falhou  | Módulos responderam sem fonte e validação final promoveu uma fonte | PR5 deve definir contrato explícito de evidência      |
| Gemini continua no caminho real                           | `/api/gemini` respondeu 200 durante o run                          | Zero Gemini ainda é objetivo futuro, não estado atual |

O módulo Operação/Cadeia de Valor concluiu após aproximadamente 74 segundos apesar do warning.

### 3.10 Processo de engenharia

| Lição                                                 | Evidência                                          | Regra permanente                                                               |
| ----------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Worktrees isoladas evitaram contaminação              | #456 e checkpoint foram trabalhados separadamente  | Uma missão por worktree e branch                                               |
| Executor não deve refazer investigação fechada        | Houve respostas repetindo diagnóstico já concluído | Prompt deve trazer causa, evidência e tarefa única                             |
| Escrita remota exige autorização específica           | Migration foi aplicada somente após autorização    | Separar autorização para merge, migration e Production                         |
| Checkpoint doc-only reduz dependência do chat         | #461 tornou o incidente auditável                  | Incidente material deve gerar checkpoint versionado                            |
| Baseline vermelho exige comparação diferencial        | Typecheck e testes já falhavam na base             | PR não pode ser culpada por falha idêntica, mas dívida deve permanecer visível |
| "Sem regressão nova" não pode ser estado final eterno | Gates críticos continuam vermelhos                 | Antes da PR6, reduzir gates globais prioritários                               |

---

## 4. Decisões arquiteturais consolidadas

| Tema                     | Decisão vigente                                                |
| ------------------------ | -------------------------------------------------------------- |
| Entrada futura do dossiê | `/api/dossier`                                                 |
| Gateway de modelos       | LiteLLM                                                        |
| Ownership                | Derivado server-side do usuário autenticado                    |
| Lifecycle                | Persistido em `dossier_runs`                                   |
| Concorrência             | Lease atômica                                                  |
| Manutenção de execução   | Heartbeat                                                      |
| Cancelamento             | Abort físico + estado persistido                               |
| Estado de sucesso        | Somente após persistência confirmada                           |
| Falha                    | Explícita, sem dossiê falso                                    |
| Exclusão de dossiê       | Soft delete via `deleted_at`                                   |
| Guest                     | Local-only                                                     |
| Identidade autenticada   | Deve estar resolvida antes de qualquer escrita remota          |
| Evidência futura         | EvidencePack estruturado e rastreável                          |
| Busca futura             | Brave primária, com contrato de fallback                       |
| RAG                      | Condicional, nunca evidência inventada                         |
| Gemini                   | Legado atual; retirar do caminho principal na PR6              |
| Functions                | Não criar Function sem necessidade; preservar orçamento Vercel |
| Migration                | Preview primeiro, Production somente após aprovação            |

---

## 5. Mapa completo das PRs

| Etapa |         PR | Objetivo                            | Estado     | Próximo gate                              |
| ----: | ---------: | ----------------------------------- | ---------- | ----------------------------------------- |
|     1 |       #448 | Baseline CI/Vercel                  | MERGED     | Encerrada                                 |
|     2 |       #449 | Contenção Radar/War Room            | MERGED     | Encerrada                                 |
|     3 |       #450 | Lifecycle persistido                | MERGED     | Schema aplicado e validado                |
|     4 |       #451 | Gateway `/api/dossier` + LiteLLM    | MERGED     | Aguardar cutover                          |
|     5 |       #458 | Lint CI                             | MERGED     | Encerrada                                 |
|     6 |       #457 | Runbooks/env                        | MERGED     | Encerrada                                 |
|     7 |       #459 | Dependências                        | MERGED     | Encerrada                                 |
|     8 |       #460 | Recuperação direcionada a suporte   | MERGED     | Débito de login permanece                 |
|     9 |       #461 | Checkpoint incidente Production     | MERGED     | Encerrada                                 |
|    10 |       #456 | RLS/identidade sensível             | DRAFT      | Atualizar sobre `59c7c27` após governança |
|    11 |     futura | Reconciliação migration history     | NÃO CRIADA | Diagnóstico read-only                     |
|    12 |     futura | Grants/default privileges lifecycle | NÃO CRIADA | Após reconciliação                        |
|    13 | futura PR5 | Brave/EvidencePack/RAG              | NÃO CRIADA | Após #456                                 |
|    14 |     futura | Mensagens desaparecendo             | NÃO CRIADA | Antes da PR6                              |
|    15 |     futura | Login/recuperação real              | NÃO CRIADA | Pode correr em paralelo                   |
|    16 | futura PR6 | Cutover `/api/dossier`              | NÃO CRIADA | Após PR5 e state fix                      |
|    17 |     futura | Remoção do legado Gemini            | NÃO CRIADA | Após estabilidade da PR6                  |

Substituições (devem ser fechadas como **superseded**, sem merge):

- #452 substituída por #456
- #453 substituída pela #457
- #454 substituída pela #458
- #455 substituída pela #459

---

## 6. Plano mestre completo

### Fase A — governança do banco

| Ordem | Trabalho                         | Tipo                 | Escrita em Production | Resultado esperado                    |
| ----: | -------------------------------- | -------------------- | --------------------- | ------------------------------------- |
|    A1 | Inventariar migrations repo      | Read-only            | Não                   | Lista canônica                        |
|    A2 | Inventariar history Preview      | Read-only            | Não                   | Versões aplicadas                     |
|    A3 | Inventariar history Production   | Read-only            | Não                   | Versões aplicadas                     |
|    A4 | Comparar objetos lifecycle       | Read-only            | Não                   | Confirmar equivalência                |
|    A5 | Simular `db push`                | Ambiente descartável | Não                   | Saber o que seria reaplicado          |
|    A6 | Definir estratégia de repair     | Documento/PR         | Não                   | Plano auditável                       |
|    A7 | Reparar history                  | Operação autorizada  | Sim, metadado         | CLI reconhece lifecycle como aplicado |
|    A8 | Validar novo `db push --dry-run` | Read-only            | Não                   | Nenhuma reaplicação                   |

**Gate da fase A:** `MIGRATION_HISTORY_RECONCILED: SIM`

Nenhuma migration nova pode avançar antes desse gate.

### Fase B — grants do lifecycle

| Ordem | Trabalho                         | Resultado                      |
| ----: | -------------------------------- | ------------------------------ |
|    B1 | Auditar ACL de `dossier_runs`    | Matriz real                    |
|    B2 | Auditar default privileges       | Origem dos grants identificada |
|    B3 | Criar migration corretiva        | Revoke + SELECT                |
|    B4 | Preservar `service_role`         | PASS                           |
|    B5 | Validar nove RPCs                | PASS                           |
|    B6 | Testar direto como authenticated | Escrita bloqueada              |
|    B7 | Testar Preview                   | Lifecycle completo             |
|    B8 | Aplicar em Production            | Autorização específica         |
|    B9 | Smoke funcional                  | Dossiê completo                |

**Gate da fase B:** `DOSSIER_RUNS_GRANTS_CANONICAL: SIM`

### Fase C — concluir #456

| Ordem | Trabalho                                        |
| ----: | ----------------------------------------------- |
|    C1 | Atualizar branch da #456 sobre `main @ 59c7c27` |
|    C2 | Interromper em conflito                         |
|    C3 | Rodar testes dirigidos                          |
|    C4 | Rodar PostgreSQL 18/18 novamente                |
|    C5 | Comparar lint/build/typecheck com nova main     |
|    C6 | Aplicar migration da #456 no Supabase Preview   |
|    C7 | Testar dois operadores reais                    |
|    C8 | Testar guest local-only                         |
|    C9 | Testar soft delete                              |
|   C10 | Testar feedback write-once                      |
|   C11 | Testar dossiê completo no Preview               |
|   C12 | Marcar Ready após auditoria                     |
|   C13 | Merge                                           |
|   C14 | Aplicar migration em Production com autorização |
|   C15 | Smoke Production                                |

**Gates da #456:**

| Gate                        | Obrigatório |
| --------------------------- | ----------- |
| History reconciliado        | Sim         |
| Grants lifecycle corrigidos | Sim         |
| Branch atualizada           | Sim         |
| PostgreSQL 18/18            | Sim         |
| Cross-operator Preview      | Sim         |
| Guest remoto bloqueado      | Sim         |
| Build                       | Sim         |
| Sem regressão nova          | Sim         |

### Fase D — PR5: busca, EvidencePack e RAG

| Entrega              | Critério                             |
| -------------------- | ------------------------------------ |
| Brave primária       | Timeout e abort reais                |
| Normalização de URLs | Sem duplicatas                       |
| EvidencePack         | Fonte, título, data, domínio, trecho |
| Validação de fontes  | Sem URL privada ou inválida          |
| RAG                  | Somente quando existir evidência     |
| Pinecone             | Preservado, uso controlado           |
| Falha de busca       | Explicitamente insuficiente          |
| Provider             | Não controlável pelo cliente         |
| Logs                 | Sem segredo, com correlação          |
| Function budget      | Sem crescimento desnecessário        |

**Fora do escopo da PR5:**

- cutover total da UI;
- remoção imediata de `/api/gemini`;
- Radar;
- War Room;
- grande redesign;
- migration de lifecycle.

### Fase E — débitos obrigatórios antes da PR6

| Débito                  | Trabalho                                |
| ----------------------- | --------------------------------------- |
| Mensagens desaparecendo | Reproduzir, identificar race e corrigir |
| Login                   | Tela/rota real                          |
| Recuperação             | Callback e senha/magic link             |
| `otp_expired`           | Mensagem e limpeza de URL               |
| Gates globais           | Reduzir falhas prioritárias             |
| Deadline de módulo      | Diferenciar warning e timeout           |

### Fase F — PR6: cutover final

| Entrega               | Definição de conclusão                |
| --------------------- | ------------------------------------- |
| UI → `/api/dossier`   | Nenhum waterfall principal no cliente |
| Lifecycle server-side | Todo run rastreado                    |
| LiteLLM               | Gateway canônico                      |
| EvidencePack          | Entrada dos módulos                   |
| Cancelamento físico   | Fetch abortado                        |
| Reload                | Recupera run em andamento             |
| Idempotência          | Uma geração por run                   |
| Persistência          | Antes de COMPLETED                    |
| Erros                 | Sem conteúdo falso                    |
| Fallback              | Explícito e observável                |
| Feature flag          | Rollout gradual                       |
| Gemini                | Removido do caminho principal         |

### Fase G — pós-cutover

| Trabalho                            | Resultado                 |
| ----------------------------------- | ------------------------- |
| Observar Production                 | Latência e erros estáveis |
| Comparar legado × novo              | Qualidade preservada      |
| Remover código legado               | Menor superfície          |
| Remover `/api/gemini` não utilizado | Zero Gemini real          |
| Limpar flags                        | Arquitetura final         |
| Recuperar gates globais             | CI confiável              |

---

## 7. Caminho crítico

```
MIGRATION HISTORY → GRANTS LIFECYCLE → #456 → PR5 → STATE FIX → PR6 → REMOÇÃO DO LEGADO
```

- Login pode correr em paralelo.
- Fechamento das PRs #452–#455 pode correr em paralelo.
- Gates globais devem ser reduzidos progressivamente, mas não podem ser ignorados até a PR6.

---

## 8. Regras operacionais permanentes

- [ ] identificar projeto, target, deployment ID e commit antes de diagnosticar;
- [ ] confirmar Supabase ref utilizado pelo bundle;
- [ ] consultar migration history antes de aplicar DDL;
- [ ] nunca assumir que arquivo versionado foi aplicado;
- [ ] testar migration em PostgreSQL real;
- [ ] executar scripts SQL duas vezes;
- [ ] exigir rollback e zero resíduo;
- [ ] auditar `PUBLIC`, `anon`, `authenticated` e `service_role`;
- [ ] auditar policies e grants separadamente;
- [ ] não usar Preview como substituto de Production;
- [ ] não aplicar várias migrations numa autorização única;
- [ ] separar autorização de merge, deploy e migration;
- [ ] usar worktree isolada;
- [ ] uma missão e um escopo por PR;
- [ ] manter PR draft durante investigação;
- [ ] não resolver threads sem evidência;
- [ ] não marcar Ready antes dos gates;
- [ ] validar Vercel, browser e Supabase;
- [ ] confirmar persistência antes de declarar sucesso;
- [ ] criar checkpoint após incidente material;
- [ ] nunca registrar secrets;
- [ ] nunca tentar recuperar senha em texto;
- [ ] nunca considerar baseline vermelho como "normal para sempre".

---

## 9. Definition of Done do novo dossiê

| Dimensão        | DoD                                      |
| --------------- | ---------------------------------------- |
| Auth            | Login e recuperação utilizáveis          |
| Identity        | Sem fallback stale                       |
| Ownership       | Server-side                              |
| Security        | Cross-operator bloqueado                 |
| Lifecycle       | Estados persistidos                      |
| Concurrency     | Lease funcional                          |
| Cancelamento    | Físico e persistido                      |
| Busca           | EvidencePack rastreável                  |
| RAG             | Sem invenção                             |
| Providers       | LiteLLM canônico                         |
| Gemini          | Fora do caminho principal                |
| Persistência    | Antes de COMPLETED                       |
| Reload          | Recuperação de run                       |
| UI              | Sem loader infinito ou painel vazio      |
| Observabilidade | IDs correlacionados                      |
| Migrations      | Repo, Preview e Production reconciliados |
| CI              | Gates críticos confiáveis                |
| Produção        | Smoke completo aprovado                  |

---

## 10. Estado final que o plano busca

```
PRODUCTION_STATUS: HEALTHY
MIGRATION_HISTORY: RECONCILED
DOSSIER_RUNS_GRANTS: LEAST_PRIVILEGE
PR_456: MERGED_AND_DEPLOYED
EVIDENCE_PACK: ACTIVE
DOSSIER_ENTRYPOINT: /api/dossier
LITELLM: CANONICAL_GATEWAY
CLIENT_SIDE_WATERFALL: REMOVED
GEMINI_LEGACY_PATH: REMOVED
CANCELLATION: PHYSICAL_AND_PERSISTED
PERSISTENCE_BEFORE_COMPLETION: ENFORCED
LOGIN_AND_RECOVERY: FUNCTIONAL
GLOBAL_GATES: TRUSTWORTHY
```

---

## Divisão documental

| Documento                             | Função                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `production-lifecycle-recovery.md`    | O que ocorreu, como foi corrigido e quais bloqueadores ficaram          |
| `scout-lessons-and-master-roadmap.md` | O que aprendemos, quais regras passam a valer e qual é o plano completo |

**Próxima frente técnica depois deste documento:** diagnóstico read-only do histórico de migrations.
