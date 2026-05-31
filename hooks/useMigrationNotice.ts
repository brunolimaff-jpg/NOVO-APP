import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY_MIGRATION_SEEN = 'scout360:supabase_migration_seen';

export function useMigrationNotice(operatorId: string | null | undefined, hasOperatorName: boolean) {
  const [showMigrationNotice, setShowMigrationNotice] = useState(false);

  const dismissMigrationNotice = useCallback(() => {
    localStorage.setItem(STORAGE_KEY_MIGRATION_SEEN, 'true');
    setShowMigrationNotice(false);
  }, []);

  useEffect(() => {
    const alreadySeen = localStorage.getItem(STORAGE_KEY_MIGRATION_SEEN);

    if (!alreadySeen && operatorId && hasOperatorName) {
      setShowMigrationNotice(true);
    }
  }, [operatorId, hasOperatorName]);

  return {
    showMigrationNotice,
    dismissMigrationNotice,
  };
}
