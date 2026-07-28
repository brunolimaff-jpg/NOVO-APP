-- PR4: Harden grants para tabelas de dossiê e perfis (least privilege).
-- Revoga privilégios excessivos (incluindo REFERENCES e UPDATE total em profiles)
-- para PUBLIC, anon e authenticated, garantindo o princípio do menor privilégio.

-- 1. dossier_runs: apenas SELECT para authenticated (escritas via RPCs SECURITY DEFINER)
REVOKE ALL ON TABLE public.dossier_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.dossier_runs TO authenticated;

-- 2. dossies: SELECT, INSERT, UPDATE para authenticated (criação e atualização de dossiê via app)
REVOKE ALL ON TABLE public.dossies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dossies TO authenticated;

-- 3. profiles: SELECT na tabela + UPDATE apenas na coluna `name` para authenticated
-- (preserva a trava de operator_id/email/id/created_at da migration 20260613)
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (name) ON TABLE public.profiles TO authenticated;

-- 4. handle_new_user: trigger interno executado como SECURITY DEFINER pelo engine/service_role
-- Revoga execução de PUBLIC, anon e authenticated para proibir invocação direta.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;