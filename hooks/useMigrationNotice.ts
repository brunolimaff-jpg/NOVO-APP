import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY_MIGRATION_SEEN = 'scout360:supabase_migration_seen';
const STORAGE_KEY_OPERATOR_ID = 'scout360:operator_id';

export function useMigrationNotice() {
  const [showMigrationNotice, setShowMigrationNotice] = useState(false);

  const dismissMigrationNotice = useCallback(() => {
    localStorage.setItem(STORAGE_KEY_MIGRATION_SEEN, 'true');
    setShowMigrationNotice(false);
  }, []);

  useEffect(() => {
    const alreadySeen = localStorage.getItem(STORAGE_KEY_MIGRATION_SEEN);
    const hasOperator = !!localStorage.getItem(STORAGE_KEY_OPERATOR_ID);

    if (!alreadySeen && hasOperator) {
      setShowMigrationNotice(true);
    }
  }, []);

  return {
    showMigrationNotice,
    dismissMigrationNotice,
  };
}
