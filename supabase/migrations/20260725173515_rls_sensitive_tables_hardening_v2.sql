-- =====================================================================
-- RLS/Auth hardening for sensitive operator-owned tables (v2).
-- Applies to: dossies, extract_cache, feedback_events
--
-- Diferenças vs tentativa anterior (#452 / 20260724200000):
--   * Cada bloco é protegido por `to_regclass`: se a tabela não existir
--     (ex.: Preview sem `extract_cache`/`feedback_events`), o bloco
--     inteiro vira no-op. Não confiamos apenas em `ALTER TABLE IF EXISTS`
--     porque REVOKE/GRANT/DROP POLICY/CREATE POLICY são incondicionais
--     e falham quando a tabela ausenta.
--   * Remove TODAS as policies residuais encontradas no catálogo antes de
--     recriar o conjunto canônico. Isso cobre `FOR ALL`, variantes históricas
--     e nomes desconhecidos sem depender de uma lista manual incompleta.
--
-- Modelo de ameaças coberto:
--   * `anon` não pode ler, escrever, alterar ou apagar linhas.
--   * `authenticated` só acessa linhas cujo `operator_id` bate com o
--     `profiles.operator_id` resolvido por `auth.uid()` (server-side).
--   * `authenticated` não pode INSERT/UPDATE com `operator_id` divergente
--     do seu profile (WITH CHECK exige o mesmo EXISTS do USING).
--   * `authenticated` não recebe DELETE/TRUNCATE. `deleteDossier()` é soft
--     delete via UPDATE de `deleted_at`, coberto pela policy UPDATE própria.
--   * `service_role` continua com bypass RLS (intacto).
--
-- Rollback: Forward-fix via migration corretiva que restaura grants/policies
-- anteriores de forma controlada. NÃO restaure grants amplos de `anon` nem
-- policies vulneráveis. Use `DROP POLICY` + `REVOKE` seletivo + recriação
-- controlada das policies legadas. A migration é aditiva e idempotente
-- (usa IF EXISTS), segura de re-aplicar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- dossies: authenticated users can only access rows for their profile's
-- canonical operator_id.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  policy_record record;
BEGIN
  IF to_regclass('public.dossies') IS NULL THEN
    RAISE NOTICE 'Skipping dossies: table does not exist';
    RETURN;
  END IF;

  -- Habilita RLS (idempotente).
  EXECUTE 'ALTER TABLE public.dossies ENABLE ROW LEVEL SECURITY';

  -- Revoga TODO acesso de anon.
  EXECUTE 'REVOKE ALL ON TABLE public.dossies FROM anon';

  -- Concede apenas o necessário para authenticated (sem DELETE/TRUNCATE).
  EXECUTE 'REVOKE ALL ON TABLE public.dossies FROM authenticated';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.dossies TO authenticated';

  -- Remove qualquer policy residual antes de recriar o conjunto canônico.
  -- A enumeração via catálogo evita depender de uma lista histórica incompleta.
  FOR policy_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'dossies'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.dossies', policy_record.policyname);
  END LOOP;

  -- Cria policies novas (DROP IF EXISTS acima garante idempotência).
  EXECUTE $sql$
    CREATE POLICY authenticated_select_own_dossies
      ON public.dossies
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.operator_id = dossies.operator_id
        )
      )
  $sql$;

  EXECUTE $sql$
    CREATE POLICY authenticated_insert_own_dossies
      ON public.dossies
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.operator_id = dossies.operator_id
        )
      )
  $sql$;

  EXECUTE $sql$
    CREATE POLICY authenticated_update_own_dossies
      ON public.dossies
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.operator_id = dossies.operator_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.operator_id = dossies.operator_id
        )
      )
  $sql$;
END $$;

-- ---------------------------------------------------------------------
-- extract_cache: browser mirror is tenant-scoped; server cache still
-- uses service_role and keeps bypassing RLS as intended by Supabase.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  policy_record record;
BEGIN
  IF to_regclass('public.extract_cache') IS NULL THEN
    RAISE NOTICE 'Skipping extract_cache: table does not exist';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.extract_cache ENABLE ROW LEVEL SECURITY';

  EXECUTE 'REVOKE ALL ON TABLE public.extract_cache FROM anon';

  EXECUTE 'REVOKE ALL ON TABLE public.extract_cache FROM authenticated';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.extract_cache TO authenticated';

  FOR policy_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'extract_cache'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.extract_cache', policy_record.policyname);
  END LOOP;

  EXECUTE $sql$
    CREATE POLICY authenticated_select_own_extract_cache
      ON public.extract_cache
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.operator_id = extract_cache.operator_id
        )
      )
  $sql$;

  EXECUTE $sql$
    CREATE POLICY authenticated_insert_own_extract_cache
      ON public.extract_cache
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.operator_id = extract_cache.operator_id
        )
      )
  $sql$;

  EXECUTE $sql$
    CREATE POLICY authenticated_update_own_extract_cache
      ON public.extract_cache
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.operator_id = extract_cache.operator_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.operator_id = extract_cache.operator_id
        )
      )
  $sql$;
END $$;

-- ---------------------------------------------------------------------
-- feedback_events: contains comments and ai_content, so anon cannot read
-- or insert rows with arbitrary operator_id values. authenticated só
-- SELECT/INSERT (sem UPDATE — feedback é write-once por design).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  policy_record record;
BEGIN
  IF to_regclass('public.feedback_events') IS NULL THEN
    RAISE NOTICE 'Skipping feedback_events: table does not exist';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.feedback_events ENABLE ROW LEVEL SECURITY';

  EXECUTE 'REVOKE ALL ON TABLE public.feedback_events FROM anon';

  EXECUTE 'REVOKE ALL ON TABLE public.feedback_events FROM authenticated';
  EXECUTE 'GRANT SELECT, INSERT ON TABLE public.feedback_events TO authenticated';

  FOR policy_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'feedback_events'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.feedback_events', policy_record.policyname);
  END LOOP;

  EXECUTE $sql$
    CREATE POLICY authenticated_select_own_feedback_events
      ON public.feedback_events
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.operator_id = feedback_events.operator_id
        )
      )
  $sql$;

  EXECUTE $sql$
    CREATE POLICY authenticated_insert_own_feedback_events
      ON public.feedback_events
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.operator_id = feedback_events.operator_id
        )
      )
  $sql$;
END $$;

-- ---------------------------------------------------------------------
-- Nota operacional: service_role mantém bypass RLS (supabase admin).
-- Nenhuma mudança em grants de service_role é necessária ou feita aqui.
-- =====================================================================
