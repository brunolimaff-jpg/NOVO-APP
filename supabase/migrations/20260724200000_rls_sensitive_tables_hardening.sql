-- RLS/Auth hardening for sensitive operator-owned tables.
-- Applies to: dossies, extract_cache, feedback_events
-- Based on PR #412, adapted for current schema with profiles table.

-- ---------------------------------------------------------------------
-- dossies: authenticated users can only access rows for their profile's
-- canonical operator_id.
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.dossies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dossies FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dossies TO authenticated;

DROP POLICY IF EXISTS operator_own_dossies ON public.dossies;
DROP POLICY IF EXISTS authenticated_select_own_dossies ON public.dossies;
DROP POLICY IF EXISTS authenticated_insert_own_dossies ON public.dossies;
DROP POLICY IF EXISTS authenticated_update_own_dossies ON public.dossies;

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
  );

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
  );

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
  );

-- ---------------------------------------------------------------------
-- extract_cache: browser mirror is tenant-scoped; server cache still uses
-- service_role and keeps bypassing RLS as intended by Supabase.
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.extract_cache ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.extract_cache FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.extract_cache TO authenticated;

DROP POLICY IF EXISTS operator_own_extract_cache ON public.extract_cache;
DROP POLICY IF EXISTS authenticated_select_own_extract_cache ON public.extract_cache;
DROP POLICY IF EXISTS authenticated_insert_own_extract_cache ON public.extract_cache;
DROP POLICY IF EXISTS authenticated_update_own_extract_cache ON public.extract_cache;

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
  );

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
  );

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
  );

-- ---------------------------------------------------------------------
-- feedback_events: contains comments and ai_content, so anon cannot read
-- or insert rows with arbitrary operator_id values.
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.feedback_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.feedback_events FROM anon;
GRANT SELECT, INSERT ON TABLE public.feedback_events TO authenticated;

DROP POLICY IF EXISTS operator_own_feedback_events ON public.feedback_events;
DROP POLICY IF EXISTS authenticated_select_own_feedback_events ON public.feedback_events;
DROP POLICY IF EXISTS authenticated_insert_own_feedback_events ON public.feedback_events;

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
  );

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
  );
