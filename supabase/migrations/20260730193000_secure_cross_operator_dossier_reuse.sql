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
       AND (
         d.operator_id = v_operator_id
         OR (
           d.source_dossier_id IS NULL
           AND (
             SELECT count(*)
             FROM jsonb_array_elements(
               CASE
                 WHEN jsonb_typeof(d.content->'messages') = 'array' THEN d.content->'messages'
                 ELSE '[]'::jsonb
               END
             ) AS candidate(message)
             WHERE candidate.message->>'sender' = 'bot'
               AND btrim(coalesce(candidate.message->>'text', '')) <> ''
               AND candidate.message->'isError' IS DISTINCT FROM 'true'::jsonb
               AND candidate.message->'isThinking' IS DISTINCT FROM 'true'::jsonb
               AND candidate.message ? 'scorePorta'
               AND jsonb_typeof(candidate.message->'scorePorta') = 'object'
           ) = 1
         )
       )
     ORDER BY (d.operator_id = v_operator_id) DESC,
              (d.operator_id = v_operator_id AND d.source_dossier_id IS NOT NULL) DESC,
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
       AND (
         d.operator_id = v_operator_id
         OR (
           d.source_dossier_id IS NULL
           AND (
             SELECT count(*)
             FROM jsonb_array_elements(
               CASE
                 WHEN jsonb_typeof(d.content->'messages') = 'array' THEN d.content->'messages'
                 ELSE '[]'::jsonb
               END
             ) AS candidate(message)
             WHERE candidate.message->>'sender' = 'bot'
               AND btrim(coalesce(candidate.message->>'text', '')) <> ''
               AND candidate.message->'isError' IS DISTINCT FROM 'true'::jsonb
               AND candidate.message->'isThinking' IS DISTINCT FROM 'true'::jsonb
               AND candidate.message ? 'scorePorta'
               AND jsonb_typeof(candidate.message->'scorePorta') = 'object'
           ) = 1
         )
       )
     ORDER BY (d.operator_id = v_operator_id) DESC,
              (d.operator_id = v_operator_id AND d.source_dossier_id IS NOT NULL) DESC,
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
  v_report jsonb;
  v_report_count integer;
  v_report_message jsonb;
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

  SELECT count(*), jsonb_agg(candidate.message)->0
    INTO v_report_count, v_report
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(v_root.content->'messages') = 'array' THEN v_root.content->'messages'
        ELSE '[]'::jsonb
      END
    ) AS candidate(message)
   WHERE candidate.message->>'sender' = 'bot'
     AND btrim(coalesce(candidate.message->>'text', '')) <> ''
     AND candidate.message->'isError' IS DISTINCT FROM 'true'::jsonb
     AND candidate.message->'isThinking' IS DISTINCT FROM 'true'::jsonb
     AND candidate.message ? 'scorePorta'
     AND jsonb_typeof(candidate.message->'scorePorta') = 'object';

  IF v_report_count <> 1 OR v_report IS NULL THEN
    RAISE EXCEPTION 'dossier unavailable' USING ERRCODE = 'P0002';
  END IF;

  -- Serializa a criação por operador+raiz; índice e ON CONFLICT são barreiras adicionais.
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
  v_report_message :=
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'sender', 'bot',
      'text', v_report->>'text',
      'timestamp', v_now_iso
    )
    || CASE WHEN v_report ? 'groundingSources' THEN jsonb_build_object('groundingSources', v_report->'groundingSources') ELSE '{}'::jsonb END
    || CASE WHEN v_report ? 'scorePorta' THEN jsonb_build_object('scorePorta', v_report->'scorePorta') ELSE '{}'::jsonb END
    || CASE WHEN v_report ? 'statuses' THEN jsonb_build_object('statuses', v_report->'statuses') ELSE '{}'::jsonb END
    || CASE WHEN v_report ? 'suggestions' THEN jsonb_build_object('suggestions', v_report->'suggestions') ELSE '{}'::jsonb END
    || CASE WHEN v_report ? 'clienteSeniorData' THEN jsonb_build_object('clienteSeniorData', v_report->'clienteSeniorData') ELSE '{}'::jsonb END
    || CASE WHEN v_report ? 'groundingUsed' THEN jsonb_build_object('groundingUsed', v_report->'groundingUsed') ELSE '{}'::jsonb END
    || CASE WHEN v_report ? 'webVerificationStatus' THEN jsonb_build_object('webVerificationStatus', v_report->'webVerificationStatus') ELSE '{}'::jsonb END;
  v_content := jsonb_build_object(
    'id', v_new_id::text,
    'title', v_root.title,
    'empresaAlvo', v_root.empresa_alvo,
    'cnpj', v_root.cnpj,
    'modoPrincipal', v_root.modo_principal,
    'scoreOportunidade', v_root.score_oportunidade,
    'resumoDossie', v_root.resumo_dossie,
    'createdAt', v_now_iso,
    'updatedAt', v_now_iso,
    'messages', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'sender', 'user',
        'text', '🔍 Investigando ' || coalesce(v_root.empresa_alvo, '') || '...',
        'timestamp', v_now_iso
      ),
      v_report_message
    )
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
  ON CONFLICT (operator_id, source_dossier_id)
  WHERE source_dossier_id IS NOT NULL
    AND deleted_at IS NULL
  DO NOTHING
  RETURNING * INTO v_copy;

  IF NOT FOUND THEN
    SELECT d.*
      INTO v_copy
      FROM public.dossies AS d
     WHERE d.operator_id = v_operator_id
       AND d.source_dossier_id = v_root.id
       AND d.deleted_at IS NULL
     ORDER BY d.created_at DESC NULLS LAST, d.id DESC
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'dossier unavailable' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.dossier_accesses (dossier_id, operator_id, cnpj)
  VALUES (v_copy.id, v_operator_id, v_copy.cnpj);

  RETURN QUERY SELECT v_copy.id, v_copy.content, true;
END;
$$;

REVOKE ALL ON FUNCTION public.find_reusable_dossier(text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.reuse_dossier_for_current_operator(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.find_reusable_dossier(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reuse_dossier_for_current_operator(uuid) TO authenticated;
