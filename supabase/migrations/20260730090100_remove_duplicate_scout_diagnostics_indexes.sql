-- Separate code-only migration: remove structurally duplicate non-unique indexes,
-- preserving the oldest index (lowest OID) for each definition.
DO $$
DECLARE
  duplicate_index record;
BEGIN
  FOR duplicate_index IN
    SELECT duplicate.indexrelid::regclass AS index_name
    FROM pg_index duplicate
    JOIN pg_class table_class ON table_class.oid = duplicate.indrelid
    JOIN pg_class duplicate_class ON duplicate_class.oid = duplicate.indexrelid
    JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
    WHERE namespace.nspname = 'public'
      AND table_class.relname = 'scout_diagnostics'
      AND NOT duplicate.indisunique
      AND NOT duplicate.indisprimary
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint dependency WHERE dependency.conindid = duplicate.indexrelid
      )
      AND EXISTS (
        SELECT 1
        FROM pg_index keeper
        JOIN pg_class keeper_class ON keeper_class.oid = keeper.indexrelid
        WHERE keeper.indrelid = duplicate.indrelid
          AND keeper.indexrelid < duplicate.indexrelid
          AND keeper.indkey = duplicate.indkey
          AND keeper.indclass = duplicate.indclass
          AND keeper.indcollation = duplicate.indcollation
          AND keeper.indoption = duplicate.indoption
          AND keeper.indnkeyatts = duplicate.indnkeyatts
          AND keeper.indnatts = duplicate.indnatts
          AND keeper_class.relam = duplicate_class.relam
          AND keeper.indexprs::text IS NOT DISTINCT FROM duplicate.indexprs::text
          AND keeper.indpred::text IS NOT DISTINCT FROM duplicate.indpred::text
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', duplicate_index.index_name);
  END LOOP;
END;
$$;
