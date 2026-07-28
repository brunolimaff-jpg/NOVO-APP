-- Migration: Auth storage RLS policies
-- PR #372: permite que a sessao autenticada leia/vincule o proprio contexto
-- de operador sem depender de localStorage como fonte de autorizacao.

-- ============================================================================
-- user_context
-- ============================================================================
ALTER TABLE IF EXISTS public.user_context ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.user_context TO authenticated;

DROP POLICY IF EXISTS "authenticated_select_own_user_context" ON public.user_context;
DROP POLICY IF EXISTS "authenticated_insert_own_user_context" ON public.user_context;
DROP POLICY IF EXISTS "authenticated_update_own_user_context" ON public.user_context;

CREATE POLICY "authenticated_select_own_user_context"
  ON public.user_context
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND (
          p.operator_id = user_context.operator_id
          OR (
            user_context.email_normalized IS NOT NULL
            AND user_context.email_normalized = LOWER(p.email)
          )
        )
    )
  );

CREATE POLICY "authenticated_insert_own_user_context"
  ON public.user_context
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.operator_id = user_context.operator_id
    )
  );

CREATE POLICY "authenticated_update_own_user_context"
  ON public.user_context
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.operator_id = user_context.operator_id
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.operator_id = user_context.operator_id
    )
  );

-- ============================================================================
-- Radar
-- ============================================================================
-- Radar ainda nao e parte do fluxo critico de auth. Estas policies mantem o
-- contrato minimo para usuarios autenticados que ja tenham operator_id canonico.
ALTER TABLE IF EXISTS public.radar_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.radar_configs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.radar_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.radar_configs TO authenticated;

DROP POLICY IF EXISTS "authenticated_select_own_radar_alerts" ON public.radar_alerts;
DROP POLICY IF EXISTS "authenticated_insert_own_radar_alerts" ON public.radar_alerts;
DROP POLICY IF EXISTS "authenticated_update_own_radar_alerts" ON public.radar_alerts;
DROP POLICY IF EXISTS "authenticated_select_own_radar_configs" ON public.radar_configs;
DROP POLICY IF EXISTS "authenticated_insert_own_radar_configs" ON public.radar_configs;
DROP POLICY IF EXISTS "authenticated_update_own_radar_configs" ON public.radar_configs;

CREATE POLICY "authenticated_select_own_radar_alerts"
  ON public.radar_alerts
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.operator_id = radar_alerts.operator_id
    )
  );

CREATE POLICY "authenticated_insert_own_radar_alerts"
  ON public.radar_alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.operator_id = radar_alerts.operator_id
    )
  );

CREATE POLICY "authenticated_update_own_radar_alerts"
  ON public.radar_alerts
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.operator_id = radar_alerts.operator_id
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.operator_id = radar_alerts.operator_id
    )
  );

CREATE POLICY "authenticated_select_own_radar_configs"
  ON public.radar_configs
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.operator_id = radar_configs.operator_id
    )
  );

CREATE POLICY "authenticated_insert_own_radar_configs"
  ON public.radar_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.operator_id = radar_configs.operator_id
    )
  );

CREATE POLICY "authenticated_update_own_radar_configs"
  ON public.radar_configs
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.operator_id = radar_configs.operator_id
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.operator_id = radar_configs.operator_id
    )
  );
