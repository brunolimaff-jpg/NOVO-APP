-- Migration: Schema user_context — colunas de auth
-- Phase 4: Adiciona colunas para vinculo com Supabase Auth
-- Idempotente: todos os comandos usam IF NOT EXISTS / DO blocks

-- ============================================================================
-- PASSO 1: Adicionar coluna supabase_auth_id (se nao existir)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_context'
      AND column_name = 'supabase_auth_id'
  ) THEN
    ALTER TABLE public.user_context ADD COLUMN supabase_auth_id UUID;
  END IF;
END $$;

-- ============================================================================
-- PASSO 2: Adicionar coluna auth_provider (se nao existir)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_context'
      AND column_name = 'auth_provider'
  ) THEN
    ALTER TABLE public.user_context ADD COLUMN auth_provider TEXT;
  END IF;
END $$;

-- ============================================================================
-- PASSO 3: Indice em supabase_auth_id (se nao existir)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_context_supabase_auth_id
  ON public.user_context (supabase_auth_id)
  WHERE supabase_auth_id IS NOT NULL;
