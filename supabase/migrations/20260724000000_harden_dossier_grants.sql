-- PR4: Harden grants para tabelas de dossiê no Preview/Produção.
-- Remove concessões excessivas para `authenticated` e `anon`,
-- deixando apenas o mínimo necessário para a operação das RPCs canônicas.

-- 1. dossier_runs: apenas SELECT para authenticated (as RPCs usam SECURITY DEFINER)
REVOKE ALL ON TABLE public.dossier_runs FROM PUBLIC, anon;
REVOKE DELETE, INSERT, TRUNCATE, TRIGGER, UPDATE ON TABLE public.dossier_runs FROM authenticated;
GRANT SELECT ON TABLE public.dossier_runs TO authenticated;

-- 2. dossies: SELECT, INSERT, UPDATE para authenticated (criação de dossiê via app)
REVOKE ALL ON TABLE public.dossies FROM PUBLIC, anon;
REVOKE DELETE, TRUNCATE, TRIGGER ON TABLE public.dossies FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dossies TO authenticated;

-- 3. profiles: apenas SELECT, UPDATE para authenticated (perfil próprio), sem anon
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon;
REVOKE DELETE, INSERT, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.profiles FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;

-- 4. handle_new_user: trigger interno, não deve ser executável por anon/PUBLIC
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role;

-- Nota: as 9 RPCs de dossier_runs já têm GRANT EXECUTE TO authenticated
-- na migration 20260721090000_dossier_runs_lifecycle.sql.
-- Não repetimos aqui para evitar duplicação.