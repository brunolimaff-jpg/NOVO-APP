# Spec: Migracao IndexedDB → Supabase

**Data:** 2026-05-22
**Projeto:** Senior Scout 360 (NOVO-APP)
**Branch base:** main (apos merge codex/standardize-mermaid-maps)
**Status:** Aprovado pelo Bruno

---

## 1. Contexto e Motivacao

O Senior Scout 360 hoje persiste dados exclusivamente no browser via IndexedDB (idb-keyval) e localStorage. Isso impede:

- **Multi-device** — vendedor consulta no desktop, nao acha no celular
- **Persistencia real** — limpar cache = perder todos os dossies
- **Uso comercial** — produto sera vendido para executivos Senior, precisa de storage confiavel
- **Rastreabilidade** — gestor nao sabe quantos prospects a equipe avaliou

**Cenario de uso:** Vendedor em campo consulta prospect pelo celular antes de uma visita. Depois volta ao desktop e precisa acessar o mesmo dossie.

**Escala:** ~50 usuarios simultaneos maximo.

---

## 2. Decisoes Tomadas

| Decisao       | Escolha                                         | Racional                               |
| ------------- | ----------------------------------------------- | -------------------------------------- |
| Arquitetura   | Browser → Supabase direto (anon key + RLS)      | Mais simples, prepara pra Auth futuro  |
| Auth          | Depois (UUID local temporario)                  | Reduz escopo desta iteracao            |
| Offline       | Offline-first com sync (IDB como cache)         | Vendedor em campo pode ficar sem sinal |
| Dados         | Todos os dados IDB migram                       | Dossies + radar + cache de extracao    |
| Identidade    | `operator_id` local (op\_{uuid}) + nome + email | Cadastro simples, sem OAuth            |
| Conflito sync | Ultima escrita ganha (timestamp)                | Cenario raro com 50 users              |

---

## 3. Arquitetura

```
BROWSER
├── hooks/useSessionStorage.ts
├── hooks/useRadar.ts
├── services/extractContentService.ts
│          │
│          ▼
│   services/storage.ts  ← UNICA interface que os hooks chamam
│     ├── IDB (cache local + fila offline)
│     └── Supabase Client (source of truth)
│              │
└──────────────┼──── HTTPS (anon key + RLS)
               ▼
         SUPABASE (Postgres)
         ├── 8 tabelas
         ├── RLS por operator_id
         └── Audit log + sync timestamps
```

**Principios:**

- `services/storage.ts` e a **unica** interface — hooks nunca acessam IDB ou Supabase diretamente
- IDB = cache + fila offline. Supabase = source of truth
- Escrita: salva no IDB (instantaneo) + enfileira sync Supabase (background)
- Leitura: retorna do IDB (rapido) + atualiza do Supabase em background (stale-while-revalidate)
- Se offline: opera no IDB, fila acumula, sincroniza ao voltar online

---

## 4. Schema Supabase (8 tabelas)

### 4.1 user_context

Cadastro simples do operador. Ponte para Auth futuro.

| Coluna           | Tipo        | Descricao                                                |
| ---------------- | ----------- | -------------------------------------------------------- |
| id               | uuid PK     | ID interno                                               |
| operator_id      | text UNIQUE | `op_{uuid}` local                                        |
| display_name     | text        | Nome digitado na tela inicial                            |
| email            | text        | Email digitado na tela inicial                           |
| auth_provider    | text        | `'local'` (default), depois `'google'` / `'email'`       |
| supabase_auth_id | uuid        | NULL inicialmente, preenchido quando Auth for adicionado |
| last_seen        | timestamptz | Ultima atividade                                         |
| created_at       | timestamptz | Criacao                                                  |

### 4.2 dossies

Sessoes de chat completas (o coracao do produto).

| Coluna             | Tipo        | Descricao                                                   |
| ------------------ | ----------- | ----------------------------------------------------------- |
| id                 | uuid PK     | Mesmo ID do ChatSession                                     |
| operator_id        | text        | Dono do dossie                                              |
| title              | text        | Titulo da sessao                                            |
| empresa_alvo       | text        | Nome da empresa                                             |
| cnpj               | text        | CNPJ pesquisado                                             |
| modo_principal     | text        | Modo do chat                                                |
| score_oportunidade | integer     | Score 0-100                                                 |
| resumo_dossie      | text        | Resumo gerado                                               |
| content            | jsonb       | ChatSession completo (messages, context, score PORTA, etc.) |
| synced_at          | timestamptz | Timestamp do ultimo sync bem-sucedido                       |
| deleted_at         | timestamptz | Soft delete (NULL = ativo)                                  |
| created_at         | timestamptz | Criacao                                                     |
| updated_at         | timestamptz | Ultima atualizacao                                          |

### 4.3 radar_alerts

Alertas competitivos do radar.

| Coluna       | Tipo        | Descricao                |
| ------------ | ----------- | ------------------------ |
| id           | uuid PK     | ID interno               |
| operator_id  | text        | Dono                     |
| alert_data   | jsonb       | RadarAlert[]             |
| meta_insight | text        | Insight agregado         |
| last_scan    | timestamptz | Timestamp do ultimo scan |
| synced_at    | timestamptz | Sync timestamp           |
| deleted_at   | timestamptz | Soft delete              |
| created_at   | timestamptz | Criacao                  |
| updated_at   | timestamptz | Ultima atualizacao       |

### 4.4 radar_configs

Configuracao pessoal do radar.

| Coluna      | Tipo        | Descricao                    |
| ----------- | ----------- | ---------------------------- |
| id          | uuid PK     | ID interno                   |
| operator_id | text UNIQUE | Dono (1 config por operador) |
| config      | jsonb       | RadarConfig                  |
| synced_at   | timestamptz | Sync timestamp               |
| created_at  | timestamptz | Criacao                      |
| updated_at  | timestamptz | Ultima atualizacao           |

### 4.5 extract_cache

Cache de extracao de conteudo web (TTL 7 dias).

| Coluna      | Tipo        | Descricao             |
| ----------- | ----------- | --------------------- |
| id          | text PK     | Hash da URL           |
| operator_id | text        | Dono                  |
| result      | jsonb       | Resultado da extracao |
| expires_at  | timestamptz | TTL (now + 7 dias)    |
| synced_at   | timestamptz | Sync timestamp        |
| created_at  | timestamptz | Criacao               |

### 4.6 audit_log

Rastro completo de acoes do usuario. Retencao 30 dias detalhado.

| Coluna      | Tipo        | Descricao                                                                           |
| ----------- | ----------- | ----------------------------------------------------------------------------------- |
| id          | uuid PK     | ID interno                                                                          |
| operator_id | text        | Quem fez                                                                            |
| action      | text        | Tipo: `search`, `dossier_create`, `dossier_view`, `favorite`, `share`, `radar_scan` |
| target_type | text        | Entidade: `dossier`, `cnpj`, `radar`, `favorite`                                    |
| target_id   | text        | ID da entidade afetada                                                              |
| metadata    | jsonb       | Dados extras contextuais                                                            |
| created_at  | timestamptz | Quando                                                                              |

### 4.7 favorites

Prospects marcados como favorito pelo vendedor.

| Coluna       | Tipo        | Descricao                               |
| ------------ | ----------- | --------------------------------------- |
| id           | uuid PK     | ID interno                              |
| operator_id  | text        | Dono                                    |
| cnpj         | text        | CNPJ do prospect                        |
| company_name | text        | Nome da empresa                         |
| reason       | text        | "Lead quente", "Interesse em produto X" |
| dossier_id   | uuid        | Link opcional ao dossie                 |
| created_at   | timestamptz | Criacao                                 |

**Constraint:** `UNIQUE(operator_id, cnpj)`

### 4.8 shared_dossiers

Links temporarios para compartilhar dossies com gestor/colega.

| Coluna       | Tipo              | Descricao                  |
| ------------ | ----------------- | -------------------------- |
| id           | uuid PK           | ID interno                 |
| dossier_id   | uuid FK → dossies | Dossie compartilhado       |
| operator_id  | text              | Quem compartilhou          |
| access_token | text UNIQUE       | Token do link temporario   |
| expires_at   | timestamptz       | Expiracao (default 7 dias) |
| view_count   | integer           | Vezes acessado             |
| created_at   | timestamptz       | Criacao                    |

---

## 5. RLS (Row Level Security)

Todas as tabelas com RLS habilitado. Policy padrao:

```sql
-- Exemplo para dossies (mesmo padrao para todas)
ALTER TABLE dossies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operator_own_data" ON dossies
  FOR ALL
  TO anon
  USING (operator_id = current_setting('request.jwt.claims', true)::json ->> 'operator_id')
  WITH CHECK (operator_id = current_setting('request.jwt.claims', true)::json ->> 'operator_id');
```

**Nota:** Sem Auth, o `operator_id` e passado via header customizado no cliente Supabase. Quando Auth for adicionado, troca para `auth.uid()`.

**Seguranca:**

- `anon key` exposta no bundle, mas RLS garante isolamento
- `service_role` key NUNCA no frontend — apenas em serverless functions se necessario
- Sem Auth real, risco baixo (uso interno Senior)
- `audit_log` e `shared_dossiers` com policies restritivas adicionais

---

## 6. Offline-first — Mecanismo de Sync

### Escrita

1. Hook chama `storage.saveDossier(data)`
2. Salva instantaneamente no IDB local
3. Marca registro como `synced = false` na fila local
4. Background: tenta enviar ao Supabase
5. Sucesso → `synced = true`, atualiza `synced_at`
6. Falha (offline) → fica na fila, retry automatico ao reconectar

### Leitura

1. Hook chama `storage.getDossiers()`
2. Retorna imediatamente do IDB (sem latencia)
3. Background: busca do Supabase, atualiza IDB
4. Se dado mudou no servidor → hook re-renderiza

### Resolucao de conflitos

- Estrategia: **ultima escrita ganha** (comparacao de `updated_at`)
- Justificativa: 50 users, uso individual, conflitos reais sao extremamente raros
- Quando Auth + multi-device real: pode evoluir para merge inteligente

### Indicador visual

- Badge "Sincronizado" / "Pendente" no status bar
- Contador de itens na fila de sync pendente

---

## 7. Cadastro Simples (nome + email)

**Fluxo atual:** Operador digita nome na tela inicial → salva no localStorage.

**Fluxo novo:**

1. Tela inicial pede nome + email
2. Gera `operator_id` (op\_{uuid})
3. Salva em `user_context` no Supabase
4. Se ja existe (mesmo email), vincula ao `operator_id` existente
5. IDB local recebe o `operator_id` vinculado

**Transicao para Auth futuro:**

- `user_context.supabase_auth_id` comeca NULL
- Quando Auth for adicionado, migration faz `UPDATE user_context SET supabase_auth_id = auth.uid() WHERE email = user_email`
- Dados existentes sao vinculados automaticamente

---

## 8. Migracao dos Dados Existentes

**Arquivos que tocam IDB hoje:**

- `hooks/useSessionStorage.ts` → ChatSession[]
- `features/radar/useRadar.ts` → RadarAlert[], RadarConfig
- `services/extractContentService.ts` → cache de extracao

**Estrategia: um arquivo por vez, testando cada um**

1. Criar `services/storage.ts` — wrapper que abstrai Supabase + IDB
2. Substituir chamadas em `useSessionStorage.ts` → testar dossies
3. Substituir chamadas em `useRadar.ts` → testar radar
4. Substituir chamadas em `extractContentService.ts` → testar cache
5. Cada passo: IDB continua funcionando como fallback

**Dados legados:** IDB existente e preservado. Na primeira leitura via `storage.ts`, os dados sao copiados para o Supabase automaticamente (one-time migration por registro).

---

## 9. Riscos e Mitigacoes

| Risco                              | Probabilidade         | Impacto | Mitigacao                                       |
| ---------------------------------- | --------------------- | ------- | ----------------------------------------------- |
| Conflito sync (edicao simultanea)  | Quase zero            | Baixo   | Ultima escrita ganha                            |
| anon key exposta no bundle         | Baixo (uso interno)   | Medio   | RLS garante isolamento por operator_id          |
| Limite Supabase free tier          | Improvavel (50 users) | Baixo   | Monitorar dashboard                             |
| Perda de dados na migracao         | Baixo                 | Alto    | IDB mantido como fallback, migration gradual    |
| Fila offline crescer demais        | Baixo                 | Baixo   | Auto-sync ao reconectar + retry com backoff     |
| Migração Auth futura quebrar dados | Baixo                 | Medio   | user_context prepara a ponte (supabase_auth_id) |

---

## 10. O que NAO estamos fazendo agora

- Auth completa (Google OAuth, email/senha)
- Historico de buscas separado
- Notificacoes push
- Templates de pesquisa
- Anexos de arquivo (Supabase Storage)
- Tags / pipeline CRM
- Compartilhamento entre organizacoes

---

## 11. Estimativa

| Fase                            | Horas    | Descricao                                           |
| ------------------------------- | -------- | --------------------------------------------------- |
| Setup Supabase + schema         | ~1h      | Criar projeto, 8 tabelas, RLS, indices              |
| storage.ts + offline sync       | ~3h      | Camada de abstracao + fila + stale-while-revalidate |
| Migrar useSessionStorage        | ~1.5h    | Dossies                                             |
| Migrar useRadar                 | ~1h      | Radar                                               |
| Migrar extractContentService    | ~0.5h    | Cache                                               |
| Cadastro simples (nome + email) | ~1h      | Tela inicial + user_context                         |
| Favoritos + compartilhar        | ~1.5h    | 2 features novas                                    |
| Audit log                       | ~0.5h    | Log de acoes                                        |
| Indicador sync visual           | ~0.5h    | Badge de status                                     |
| Testes manuais                  | ~1h      | Cenario offline/online, multi-device                |
| **Total**                       | **~11h** |                                                     |

---

## 12. Caminho para Auth Futuro

1. **Hoje:** `operator_id` local + nome + email em `user_context`
2. **Auth Sprint:** Adicionar Supabase Auth (Google OAuth). Migration vincula `supabase_auth_id` por email match
3. **Clean-up:** RLS troca de `operator_id` para `auth.uid()`. Remove fallback local

Nenhuma tabela nova necessaria — `user_context` ja prepara a ponte.
