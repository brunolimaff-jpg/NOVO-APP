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
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT p.operator_id
    INTO v_operator_id
    FROM public.profiles AS p
   WHERE p.id = v_auth_user_id;

  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'authenticated profile has no operator' USING ERRCODE = '42501';
  END IF;

  IF length(v_cnpj) = 14 THEN
    RETURN QUERY
    SELECT d.id, d.title, d.empresa_alvo, d.created_at, d.score_oportunidade,
           d.operator_id = v_operator_id
      FROM public.dossies AS d
     WHERE regexp_replace(coalesce(d.cnpj, ''), '[^0-9]', '', 'g') = v_cnpj
       AND d.deleted_at IS NULL
     ORDER BY d.created_at DESC NULLS LAST, d.id DESC
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
     ORDER BY d.created_at DESC NULLS LAST, d.id DESC
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
  v_source public.dossies%ROWTYPE;
  v_copy public.dossies%ROWTYPE;
  v_new_id uuid;
  v_now timestamptz := clock_timestamp();
  v_now_iso text;
  v_content jsonb;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT p.operator_id
    INTO v_operator_id
    FROM public.profiles AS p
   WHERE p.id = v_auth_user_id;

  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'authenticated profile has no operator' USING ERRCODE = '42501';
  END IF;

  SELECT d.*
    INTO v_source
    FROM public.dossies AS d
   WHERE d.id = p_source_dossier_id
     AND d.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source dossier not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source.operator_id = v_operator_id THEN
    INSERT INTO public.dossier_accesses (dossier_id, operator_id, cnpj)
    VALUES (v_source.id, v_operator_id, v_source.cnpj);

    RETURN QUERY SELECT v_source.id, v_source.content, false;
    RETURN;
  END IF;

  -- Serializa a criação por operador+fonte; o índice parcial é a segunda barreira.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_operator_id || ':' || p_source_dossier_id::text, 0)
  );

  SELECT d.*
    INTO v_copy
    FROM public.dossies AS d
   WHERE d.operator_id = v_operator_id
     AND d.source_dossier_id = p_source_dossier_id
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
      jsonb_set(v_source.content, '{id}', to_jsonb(v_new_id::text), true),
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
    v_new_id, v_operator_id, NULL, v_source.title, v_source.empresa_alvo, v_source.cnpj,
    v_source.modo_principal, v_source.score_oportunidade, v_source.resumo_dossie, v_content,
    v_now, v_now, v_source.id, v_source.operator_id, v_now
  )
  RETURNING * INTO v_copy;

  INSERT INTO public.dossier_accesses (dossier_id, operator_id, cnpj)
  VALUES (v_copy.id, v_operator_id, v_copy.cnpj);

  RETURN QUERY SELECT v_copy.id, v_copy.content, true;
END;
$$;

REVOKE ALL ON FUNCTION public.find_reusable_dossier(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reuse_dossier_for_current_operator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_reusable_dossier(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reuse_dossier_for_current_operator(uuid) TO authenticated, service_role;
