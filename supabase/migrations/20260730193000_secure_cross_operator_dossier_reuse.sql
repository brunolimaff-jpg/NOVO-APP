-- Reutilização interna segura de dossiês por copy-on-access.

ALTER TABLE public.dossies
  ADD COLUMN IF NOT EXISTS source_dossier_id uuid NULL
    REFERENCES public.dossies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_operator_id text NULL,
  ADD COLUMN IF NOT EXISTS reused_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dossies_active_source_copy
  ON public.dossies (operator_id, source_dossier_id)
  WHERE source_dossier_id IS NOT NULL
    AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.find_reusable_dossier(
  p_cnpj text,
  p_empresa_alvo text
)
RETURNS TABLE (
  dossier_id uuid,
  title text,
  empresa_alvo text,
  created_at timestamptz,
  score_oportunidade integer,
  is_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_operator_id text;
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g');
  v_empresa_normalizada text := lower(regexp_replace(btrim(coalesce(p_empresa_alvo, '')), '\s+', ' ', 'g'));
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  SELECT p.operator_id
    INTO v_operator_id
    FROM public.profiles AS p
    JOIN auth.users AS u ON u.id = p.id
   WHERE u.id = v_auth_user_id
     AND u.email_confirmed_at IS NOT NULL
     AND right(lower(btrim(u.email)), 14) = '@senior.com.br'
     AND lower(p.email) = lower(u.email)
     AND p.operator_id IS NOT NULL;

  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  IF length(v_cnpj) = 14 THEN
    RETURN QUERY
    SELECT d.id, d.title, d.empresa_alvo, d.created_at, d.score_oportunidade,
           d.operator_id = v_operator_id
      FROM public.dossies AS d
     WHERE regexp_replace(coalesce(d.cnpj, ''), '[^0-9]', '', 'g') = v_cnpj
       AND d.deleted_at IS NULL
       AND (d.source_dossier_id IS NULL OR d.operator_id = v_operator_id)
     ORDER BY (d.operator_id = v_operator_id) DESC,
              (d.source_dossier_id IS NULL) DESC,
              d.created_at DESC NULLS LAST,
              d.id DESC
     LIMIT 1;
    RETURN;
  END IF;

  IF v_empresa_normalizada <> '' THEN
    RETURN QUERY
    SELECT d.id, d.title, d.empresa_alvo, d.created_at, d.score_oportunidade,
           d.operator_id = v_operator_id
      FROM public.dossies AS d
     WHERE lower(regexp_replace(btrim(coalesce(d.empresa_alvo, '')), '\s+', ' ', 'g')) = v_empresa_normalizada
       AND d.deleted_at IS NULL
       AND (d.source_dossier_id IS NULL OR d.operator_id = v_operator_id)
     ORDER BY (d.operator_id = v_operator_id) DESC,
              (d.source_dossier_id IS NULL) DESC,
              d.created_at DESC NULLS LAST,
              d.id DESC
     LIMIT 1;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reuse_dossier_for_current_operator(
  p_source_dossier_id uuid
)
RETURNS TABLE (
  dossier_id uuid,
  content jsonb,
  was_cloned boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_operator_id text;
  v_requested public.dossies%ROWTYPE;
  v_root public.dossies%ROWTYPE;
  v_copy public.dossies%ROWTYPE;
  v_new_id uuid;
  v_now timestamptz := clock_timestamp();
  v_now_iso text;
  v_content jsonb;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  SELECT p.operator_id
    INTO v_operator_id
    FROM public.profiles AS p
    JOIN auth.users AS u ON u.id = p.id
   WHERE u.id = v_auth_user_id
     AND u.email_confirmed_at IS NOT NULL
     AND right(lower(btrim(u.email)), 14) = '@senior.com.br'
     AND lower(p.email) = lower(u.email)
     AND p.operator_id IS NOT NULL;

  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  SELECT d.*
    INTO v_requested
    FROM public.dossies AS d
   WHERE d.id = p_source_dossier_id
     AND d.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source dossier not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_requested.operator_id = v_operator_id THEN
    INSERT INTO public.dossier_accesses (dossier_id, operator_id, cnpj)
    VALUES (v_requested.id, v_operator_id, v_requested.cnpj);

    RETURN QUERY SELECT v_requested.id, v_requested.content, false;
    RETURN;
  END IF;

  IF v_requested.source_dossier_id IS NULL THEN
    v_root := v_requested;
  ELSE
    SELECT d.*
      INTO v_root
      FROM public.dossies AS d
     WHERE d.id = v_requested.source_dossier_id
       AND d.deleted_at IS NULL
       AND d.source_dossier_id IS NULL;

    IF NOT FOUND OR v_root.id = v_requested.id THEN
      RAISE EXCEPTION 'invalid dossier lineage' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Serializa a criação por operador+fonte; o índice parcial é a segunda barreira.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_operator_id || ':' || v_root.id::text, 0)
  );

  SELECT d.*
    INTO v_copy
    FROM public.dossies AS d
   WHERE d.operator_id = v_operator_id
     AND d.source_dossier_id = v_root.id
     AND d.deleted_at IS NULL
   ORDER BY d.created_at DESC NULLS LAST, d.id DESC
   LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.dossier_accesses (dossier_id, operator_id, cnpj)
    VALUES (v_copy.id, v_operator_id, v_copy.cnpj);

    RETURN QUERY SELECT v_copy.id, v_copy.content, true;
    RETURN;
  END IF;

  v_new_id := gen_random_uuid();
  v_now_iso := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_content := jsonb_set(
    jsonb_set(
      jsonb_set(v_root.content, '{id}', to_jsonb(v_new_id::text), true),
      '{createdAt}', to_jsonb(v_now_iso), true
    ),
    '{updatedAt}', to_jsonb(v_now_iso), true
  );

  INSERT INTO public.dossies (
    id, operator_id, operator_email, title, empresa_alvo, cnpj,
    modo_principal, score_oportunidade, resumo_dossie, content,
    created_at, updated_at, source_dossier_id, source_operator_id, reused_at
  )
  VALUES (
    v_new_id, v_operator_id, NULL, v_root.title, v_root.empresa_alvo, v_root.cnpj,
    v_root.modo_principal, v_root.score_oportunidade, v_root.resumo_dossie, v_content,
    v_now, v_now, v_root.id, v_root.operator_id, v_now
  )
  RETURNING * INTO v_copy;

  INSERT INTO public.dossier_accesses (dossier_id, operator_id, cnpj)
  VALUES (v_copy.id, v_operator_id, v_copy.cnpj);

  RETURN QUERY SELECT v_copy.id, v_copy.content, true;
END;
$$;

REVOKE ALL ON FUNCTION public.find_reusable_dossier(text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.reuse_dossier_for_current_operator(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.find_reusable_dossier(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reuse_dossier_for_current_operator(uuid) TO authenticated;
