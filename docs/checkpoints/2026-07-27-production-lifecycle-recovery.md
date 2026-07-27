# Checkpoint — Recuperação do lifecycle em Produção

> Data: 2026-07-27
> Commit de Produção: `7f262467d657e43f0b70897ff6b5788cdce40b6e`
> Branch de main: `7f262467` (origin/main)
> Autorização: explícita do Bruno após diagnóstico fechado pelo orquestrador.

---

## 1. Resumo executivo

O deploy de Produção estava **funcionalmente quebrado**: o código da `main` já dependia do lifecycle de dossiês (`dossier_runs` + RPCs), mas o Supabase principal não possuía a tabela e os RPCs correspondentes. O primeiro RPC retornava HTTP `404`, interrompendo o fluxo antes de iniciar o waterfall.

Resultado:

```
PRODUÇÃO RESTAURADA — LIFECYCLE, HEARTBEAT, WATERFALL E PERSISTÊNCIA VALIDADOS
```

## 2. Ambientes envolvidos

### Vercel Production

- projeto: `scoutagro`
- deployment ID: `dpl_6WJvVRPiSx3ZMCK7e6ygrYozEHtP`
- commit implantado: `7f262467d657e43f0b70897ff6b5788cdce40b6e`
- branch: `main`
- target: `production`

### Supabase Production

- projeto: `NOVO-APP`
- project ref: `vmqfcaoirjcfucvlnpig`
- não confundir com `scoutagro-preview` (`xlvsrnbynpawgfapowec`)
- o deploy de Produção estava apontando para o projeto correto.

## 3. Causa raiz

Sequência do frontend em `main`:

1. chama `create_or_get_dossier_run`;
2. chama `acquire_dossier_run_lease`;
3. inicia heartbeat;
4. somente depois chama `runMegaPromptWaterfall`.

Estado encontrado no Supabase principal **antes** da correção:

- `public.dossier_runs`: ausente;
- `create_or_get_dossier_run`: ausente;
- `acquire_dossier_run_lease`: ausente;
- primeiro RPC retornava HTTP `404`;
- o frontend caía no `catch` do wrapper;
- a interface mostrava `Erro no processamento`.

**Não era:**

- erro do Gemini;
- erro de build da Vercel;
- problema da PR #456;
- não era necessário reapontar Produção para o Supabase Preview.

## 4. Correção aplicada

Migration de origem no repositório:

`supabase/migrations/20260721090000_dossier_runs_lifecycle.sql`

Aplicação realizada diretamente pelo orquestrador no Supabase principal, após **autorização explícita** do Bruno.

Registro criado no Supabase:

- migration version: `20260727224304`
- migration name: `dossier_runs_lifecycle`

Escopo da aplicação:

- uma única migration;
- nenhuma alteração de código;
- nenhuma alteração de Vercel;
- nenhum merge;
- nenhuma alteração da #456;
- nenhuma outra migration aplicada.

## 5. Validação estrutural após a aplicação

| Validação                             | Resultado |
| ------------------------------------- | --------- |
| `public.dossier_runs` presente        | PASS      |
| RLS habilitado                        | PASS      |
| Policy de leitura própria             | PASS      |
| RPCs lifecycle presentes              | 9/9       |
| `create_or_get_dossier_run` presente  | PASS      |
| `acquire_dossier_run_lease` presente  | PASS      |
| Execução dos RPCs por `authenticated` | PASS      |
| Execução dos RPCs por `anon`          | BLOQUEADA |
| Migration adicional aplicada          | NÃO       |

## 6. Smoke transacional do banco

Teste executado dentro de transação com rollback:

- criação de execução: PASS;
- aquisição de lease: PASS;
- INSERT direto como `authenticated`: bloqueado pela RLS;
- rollback: PASS;
- registros residuais do teste: zero.

## 7. Teste funcional completo em Produção

Empresa pesquisada:

- empresa: `SCHEFFER & CIA LTDA`;
- CNPJ: `04.733.767/0001-80`.

Identificadores:

- session/dossier ID: `00414305-d339-4fe7-aeb3-e5a1115b3f5e`
- lifecycle run ID: `b720cdf9-5e12-453b-b2de-445b0edec3e3`
- waterfall run ID: `00414305-d339-4fe7-aeb3-e5a1115b3f5e-gen1-ms3u5w75`

Resultado do lifecycle:

- status: `COMPLETED`
- created_at: `2026-07-27 23:06:17.284081+00`
- started_at: `2026-07-27 23:06:17.492266+00`
- completed_at: `2026-07-27 23:11:02.664596+00`
- duração aproximada: 4 minutos e 45 segundos
- `failed_at`: null
- `error_code`: null
- `error_stage`: null
- `lease_owner`: null após conclusão
- `lease_expires_at`: null após conclusão

## 8. Persistência confirmada

O dossiê foi persistido em `public.dossies`:

- dossier ID vinculado ao lifecycle: `00414305-d339-4fe7-aeb3-e5a1115b3f5e`
- empresa alvo: `SCHEFFER & CIA LTDA`
- CNPJ: `04733767000180`
- deleted_at: null
- score de oportunidade: `74`
- conteúdo JSON: objeto
- tamanho aproximado no PostgreSQL: `24.557 bytes`
- chaves de primeiro nível: `10`
- saída final exibida na UI: `45.109 caracteres`
- fonte validada no final: `1`
- web verification: `fallback_verified`

## 9. Validação de UI

PASS:

- waterfall terminou com `status: completed`;
- generation count: `1`;
- blocked count: `0`;
- mensagem final atualizada;
- `isThinking: false`;
- overlay ocultado;
- conteúdo renderizado;
- botão de interrupção removido;
- loader não permaneceu preso;
- verificações em 0 ms, 100 ms, 1 s, 3 s e 10 s indicaram estado limpo;
- nenhum novo ciclo do waterfall foi disparado.

## 10. Validação Vercel

Durante o teste funcional:

- `POST /api/gemini`: HTTP `200`;
- `POST /api/socio-search`: HTTP `200`;
- `GET /api/cnpj`: HTTP `200`;
- runtime errors agrupados: nenhum;
- build/deploy permaneceu `READY`.

## 11. Alertas não bloqueantes observados

Documentados sem classificar como falha do teste.

### BrasilAPI

- BrasilAPI respondeu `403` em uma tentativa;
- o fallback retornou os dados do CNPJ;
- `/api/cnpj` terminou em `200`.

### Deadline de módulo

- `Operação / Cadeia de Valor` levou aproximadamente `74 segundos`;
- houve warning `module:deadline`;
- o módulo concluiu com resposta válida;
- o waterfall continuou normalmente.

### Teia societária

- ocorreram warnings de validação de CNPJ;
- não impediram a conclusão.

### Renderização de dossiê grande

- o sistema ativou `static-fallback-rendered`;
- o dossiê foi exibido corretamente;
- os eventos `BlankPanelDebug` foram diagnósticos, não falha visual final.

### Evento anterior ao teste

Antes da investigação final, houve um evento:

- `safeMessages ZEROU com sessão ativa`;
- `MENSAGENS DESAPARECERAM`;
- estado mudou de duas mensagens para zero.

Esse evento não impediu a investigação seguinte, mas fica registrado como observação técnica para futura triagem. O log evidencia esse desaparecimento antes do início da execução final.

### Login e recuperação

- não existe uma tela dedicada de login/recuperação adequada;
- um magic link chegou com `otp_expired` na URL;
- a sessão do navegador ficou autenticada;
- isso não bloqueou o teste;
- tratar como backlog separado, sem misturar com lifecycle.

## 12. Riscos ainda abertos

### BLOQUEADOR 1 — drift do histórico de migrations

O arquivo versionado é:

`20260721090000_dossier_runs_lifecycle.sql`

Mas Produção registrou:

`20260727224304_dossier_runs_lifecycle`

Consequência potencial:

- um futuro `supabase db push` pode interpretar `20260721090000` como pendente;
- a ferramenta pode tentar reaplicar a DDL;
- a reaplicação pode falhar porque tabela e funções já existem.

Decisão:

**Não executar novas migrations em Produção antes de reconciliar o histórico de migrations.**

Não corrigir esse drift nesta PR documental.

### BLOQUEADOR 2 — grants diretos amplos

Após criar a tabela, os default privileges do projeto concederam automaticamente a `authenticated`:

- SELECT;
- INSERT;
- UPDATE;
- DELETE;
- TRUNCATE;
- REFERENCES;
- TRIGGER.

A RLS bloqueou a escrita direta no smoke real, portanto não foi comprovado bypass.

Mesmo assim, o contrato desejado é:

- `authenticated`: somente SELECT direto;
- escritas: exclusivamente pelos RPCs `SECURITY DEFINER`.

Correção futura esperada:

- migration corretiva nova;
- `REVOKE ALL` de `authenticated`;
- reconceder somente `SELECT`;
- preservar `service_role`;
- validar default privileges para tabelas futuras.

Não aplicar a correção nesta PR documental.

### BLOQUEADOR 3 — PR #456

A #456 permanece separada deste incidente.

Não:

- marcar Ready;
- fazer merge;
- resolver threads;
- adicionar o checkpoint à branch da #456;
- aplicar sua migration RLS em Produção.

## 13. Gates antes de continuar a fila

- [ ] checkpoint documental aprovado;
- [ ] drift de migration history reconciliado;
- [ ] migration corretiva dos grants criada e auditada;
- [ ] correção validada primeiro em ambiente descartável/Preview;
- [ ] nenhuma alteração destrutiva em `dossier_runs`;
- [ ] lifecycle continua funcional após a correção;
- [ ] PR #456 reavaliada separadamente;
- [ ] fluxo de login/recuperação registrado em backlog próprio;
- [ ] evento `MENSAGENS DESAPARECERAM` triado separadamente.

## 14. Rollback

- nenhum rollback foi executado;
- a migration é aditiva;
- Produção agora possui uma execução real e um dossiê vinculado;
- não remover tabela ou RPCs sem plano específico de preservação de dados;
- rollback destrutivo está proibido sem nova autorização explícita.

## 15. Decisão final

```
PRODUCTION_LIFECYCLE_STATUS: RESTORED
FUNCTIONAL_DOSSIER_TEST: PASS
DATABASE_PERSISTENCE: PASS
VERCEL_RUNTIME: PASS
MIGRATION_HISTORY_DRIFT: OPEN_BLOCKER
AUTHENTICATED_GRANT_GAP: OPEN_BLOCKER
PR_456_STATE: SEPARATE_AND_DRAFT
NEXT_MIGRATION_ALLOWED: NÃO, ATÉ RECONCILIAÇÃO
```
