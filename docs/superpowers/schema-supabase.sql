-- Supabase Schema for Senior Scout 360
--
-- Run this SQL in Supabase Dashboard → SQL Editor
-- This file contains the complete DDL for 8 tables, RLS policies, and indexes
--
-- Schema Overview:
-- - user_context: Operator profiles and authentication
-- - dossies: Company intelligence dossiers
-- - radar_alerts: Monitoring alerts for tracked companies
-- - radar_configs: User-specific radar configuration
-- - extract_cache: Cached extraction results
-- - audit_log: Action audit trail
-- - favorites: User-favorite companies
-- - shared_dossiers: Temporary dossier sharing links

-- ============================================================================
-- TABLES
-- ============================================================================

-- Table: user_context
-- Stores operator profiles and links to Supabase Auth
CREATE TABLE user_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text UNIQUE NOT NULL,
  display_name text,
  email text,
  auth_provider text DEFAULT 'local',
  supabase_auth_id uuid UNIQUE,
  last_seen timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Table: dossies
-- Company intelligence dossiers with embedded content
CREATE TABLE dossies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL,
  title text,
  empresa_alvo text,
  cnpj text,
  modo_principal text,
  score_oportunidade integer,
  resumo_dossie text,
  content jsonb NOT NULL,
  synced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table: radar_alerts
-- Monitoring alerts for tracked companies
CREATE TABLE radar_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL,
  alert_data jsonb NOT NULL,
  meta_insight text,
  last_scan timestamptz,
  synced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table: radar_configs
-- User-specific radar configuration (watched companies, alert rules, etc.)
CREATE TABLE radar_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text UNIQUE NOT NULL,
  config jsonb NOT NULL,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table: extract_cache
-- Cached extraction results to avoid redundant processing
CREATE TABLE extract_cache (
  id text PRIMARY KEY,
  operator_id text NOT NULL,
  result jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Table: audit_log
-- Audit trail for all actions
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Table: favorites
-- User-favorite companies
CREATE TABLE favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL,
  cnpj text NOT NULL,
  company_name text,
  reason text,
  dossier_id uuid REFERENCES dossies ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(operator_id, cnpj)
);

-- Table: shared_dossiers
-- Temporary dossier sharing links with expiration
CREATE TABLE shared_dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES dossies ON DELETE CASCADE,
  operator_id text NOT NULL,
  access_token text UNIQUE NOT NULL,
  expires_at timestamptz DEFAULT now() + interval '7 days',
  view_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
--
-- Estrategia: operator_id IS NOT NULL
-- Como todas as queries do storage.ts usam .eq('operator_id', getOperatorId()),
-- o RLS valida que o registro TEM um operator_id (nao anonimo).
-- Quando Auth for adicionado, trocar para: USING (auth.uid() = operator_id)
--
-- Enable RLS on all tables
ALTER TABLE user_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossies ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE extract_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_dossiers ENABLE ROW LEVEL SECURITY;

-- Policy: all tables — operator_id must be present
CREATE POLICY operator_own_user_context ON user_context FOR ALL TO anon
  USING (operator_id IS NOT NULL) WITH CHECK (operator_id IS NOT NULL);

CREATE POLICY operator_own_dossies ON dossies FOR ALL TO anon
  USING (operator_id IS NOT NULL) WITH CHECK (operator_id IS NOT NULL);

CREATE POLICY operator_own_radar_alerts ON radar_alerts FOR ALL TO anon
  USING (operator_id IS NOT NULL) WITH CHECK (operator_id IS NOT NULL);

CREATE POLICY operator_own_radar_configs ON radar_configs FOR ALL TO anon
  USING (operator_id IS NOT NULL) WITH CHECK (operator_id IS NOT NULL);

CREATE POLICY operator_own_extract_cache ON extract_cache FOR ALL TO anon
  USING (operator_id IS NOT NULL) WITH CHECK (operator_id IS NOT NULL);

CREATE POLICY operator_own_audit_log ON audit_log FOR ALL TO anon
  USING (operator_id IS NOT NULL) WITH CHECK (operator_id IS NOT NULL);

CREATE POLICY operator_own_favorites ON favorites FOR ALL TO anon
  USING (operator_id IS NOT NULL) WITH CHECK (operator_id IS NOT NULL);

CREATE POLICY operator_own_shared_dossiers ON shared_dossiers FOR ALL TO anon
  USING (operator_id IS NOT NULL) WITH CHECK (operator_id IS NOT NULL);

-- shared_dossiers: leitura publica por access_token (link compartilhavel)
CREATE POLICY shared_dossiers_access_token ON shared_dossiers FOR SELECT TO anon
  USING (access_token IS NOT NULL AND expires_at > now());

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index: dossies - operator_id + created_at (for listing with pagination)
CREATE INDEX idx_dossies_operator_created ON dossies(operator_id, created_at DESC);

-- Index: dossies - operator_id + cnpj (for finding dossiers by company)
CREATE INDEX idx_dossies_operator_cnpj ON dossies(operator_id, cnpj);

-- Index: radar_alerts - operator_id (for fetching user alerts)
CREATE INDEX idx_radar_alerts_operator ON radar_alerts(operator_id);

-- Index: radar_configs - operator_id (for fetching user config)
CREATE INDEX idx_radar_configs_operator ON radar_configs(operator_id);

-- Index: extract_cache - operator_id (for cache lookups)
CREATE INDEX idx_extract_cache_operator ON extract_cache(operator_id);

-- Index: audit_log - operator_id + created_at (for audit trail pagination)
CREATE INDEX idx_audit_log_operator_created ON audit_log(operator_id, created_at DESC);

-- Index: favorites - operator_id (for fetching user favorites)
CREATE INDEX idx_favorites_operator ON favorites(operator_id);

-- Index: shared_dossiers - access_token (for share link lookup)
CREATE INDEX idx_shared_dossiers_token ON shared_dossiers(access_token);