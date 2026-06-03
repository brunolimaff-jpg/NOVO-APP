-- Blank panel observability indexes.
--
-- RLS exception: this migration does not create tables or policies.
-- It only adds read-path indexes for the existing server-written scout_diagnostics table.

CREATE INDEX IF NOT EXISTS idx_scout_diagnostics_session_created
  ON scout_diagnostics(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scout_diagnostics_area_event_created
  ON scout_diagnostics(area, event, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scout_diagnostics_operator_created
  ON scout_diagnostics(operator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scout_diagnostics_blank_panel_created
  ON scout_diagnostics(created_at DESC)
  WHERE area = 'BlankPanel';
