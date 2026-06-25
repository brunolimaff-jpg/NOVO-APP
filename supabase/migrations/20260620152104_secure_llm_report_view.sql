-- Mantém o relatório acessível somente ao backend com service_role e faz a view respeitar RLS.
ALTER VIEW public.llm_model_daily_report SET (security_invoker = true);

REVOKE ALL ON public.llm_model_daily_report FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.llm_model_daily_report TO service_role;
