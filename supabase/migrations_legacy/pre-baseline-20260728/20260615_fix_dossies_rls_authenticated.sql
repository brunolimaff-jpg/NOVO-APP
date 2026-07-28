-- Fix: authenticated users nao conseguiam ler dossies
-- A politica operator_own_dossies so aplicava para role anon.
-- Usuarios logados (authenticated) recebiam [] do Supabase.
ALTER POLICY operator_own_dossies ON public.dossies TO anon, authenticated;
