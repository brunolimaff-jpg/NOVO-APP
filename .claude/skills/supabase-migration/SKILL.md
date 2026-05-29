---
name: supabase-migration
description: Cria e valida migrations Supabase com boas práticas de RLS, segurança e padrões do projeto
disable-model-invocation: true
---

# Supabase Migration

Skill para criar, validar e aplicar migrations no Supabase seguindo as boas práticas do projeto.

## Quando usar

- Precisa criar nova tabela, coluna, ou política RLS
- Precisa modificar schema existente
- Precisa revisar políticas de segurança antes de deploy
- Usuário digita `/supabase-migration`

## Fluxo de criação de migration

### 1. Analisar schema atual

Antes de criar qualquer migration, SEMPRE verificar o estado atual:

```
Usar mcp__supabase__list_tables com verbose=true para ver colunas e FKs
Usar mcp__supabase__list_migrations para ver migrations existentes
Usar mcp__supabase__get_advisors type="security" para ver vulnerabilidades
```

### 2. Criar a migration

Usar `mcp__supabase__apply_migration` com:

- `name`: nome descritivo em snake_case (ex: `add_operator_tracking_rls`)
- `query`: SQL completo com:

```sql
-- Sempre incluir:
-- 1. RLS enabled na tabela
ALTER TABLE nome_tabela ENABLE ROW LEVEL SECURITY;

-- 2. Policies explícitas (nunca deixar tabela sem policy)
--    Se a tabela deve ser acessível publicamente, criar policy explícita
CREATE POLICY "..."
ON nome_tabela
FOR SELECT
USING (true);

-- 3. Para INSERT/UPDATE: validar auth.uid()
CREATE POLICY "..."
ON nome_tabela
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 4. NUNCA usar USING (true) para INSERT/UPDATE/DELETE
```

### 3. Validar após criar

Depois de aplicar a migration:

1. Rodar `mcp__supabase__get_advisors type="security"` para verificar novas vulnerabilidades
2. Rodar `mcp__supabase__list_tables` para confirmar que a estrutura está correta
3. Atualizar tipos TypeScript se necessário: `mcp__supabase__generate_typescript_types`

### 4. Testar localmente

```bash
npm run test:contracts  # Testes de contrato validam integração Supabase
```

## Padrões do projeto

### Nomenclatura

- Tabelas: snake_case plural (ex: `operator_sessions`)
- Colunas: snake_case (ex: `created_at`, `user_id`)
- Policies: descritivas (ex: `operators_can_read_own_sessions`)

### RLS (Row Level Security) — Regras P0

- Toda tabela NOVA deve ter RLS enabled
- Toda tabela deve ter pelo menos 1 policy
- INSERT e UPDATE devem validar `auth.uid()`
- Nunca usar `USING (true)` para operações de escrita
- SELECT pode usar `USING (true)` se dados forem públicos

### sanitizePayload

- Dados que vão para o Supabase devem passar por `sanitizePayload` (camelCase → snake_case)
- Verificar implementação em `services/operatorTracking.ts`

## Anti-padrões (NUNCA fazer)

- ❌ Criar tabela sem RLS
- ❌ `USING (true)` para INSERT/UPDATE/DELETE
- ❌ Deixar tabela sem policy documentada
- ❌ Usar SELECT sem RLS em tabelas com dados sensíveis
- ❌ Esquecer de atualizar tipos TypeScript após migration
