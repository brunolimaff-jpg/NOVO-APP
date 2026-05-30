// lib/migration/idbToSupabase.ts
// Executa 1x: migra sessions do IndexedDB para Supabase.
// Flag 'scout360:migration_v2_complete' no localStorage controla execução.
// Se falhar, flag não é setada e app continua funcionando com IDB.

import { get } from 'idb-keyval';
import type { ChatSession } from '../../types';

const MIGRATION_FLAG = 'scout360:migration_v2_complete';
const IDB_SESSIONS_KEY = 'scout360_sessions_v2';

export interface MigrationDeps {
  upsertFn: (session: ChatSession) => Promise<void>;
  getOperatorId: () => string | null;
}

export async function runIdbToSupabaseMigration(deps: MigrationDeps): Promise<number> {
  if (localStorage.getItem(MIGRATION_FLAG) === 'true') {
    return 0;
  }

  const operatorId = deps.getOperatorId();
  if (!operatorId) {
    return 0;
  }

  let sessions: ChatSession[];
  try {
    sessions = (await get<ChatSession[]>(IDB_SESSIONS_KEY)) || [];
  } catch (e) {
    // IDB error — don't set flag, retry on next load
    console.warn('[Storage] Migration: IDB read failed, will retry next load', e);
    return 0;
  }

  if (sessions.length === 0) {
    localStorage.setItem(MIGRATION_FLAG, 'true');
    return 0;
  }

  console.warn(`[Storage] Migration: ${sessions.length} sessions found in IDB, migrating to Supabase...`);

  let migrated = 0;
  const errors: Error[] = [];

  for (const session of sessions) {
    try {
      await deps.upsertFn(session);
      migrated++;
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    }
  }

  if (errors.length > 0) {
    console.error(
      `[Storage] Migration failed: ${errors.length}/${sessions.length} errors. First: ${errors[0].message}`,
    );
    throw new Error(`Migration failed: ${errors.length}/${sessions.length} errors`);
  }

  localStorage.setItem(MIGRATION_FLAG, 'true');
  console.log(`[Storage] Migration: ${migrated} sessions migrated successfully`);
  return migrated;
}
