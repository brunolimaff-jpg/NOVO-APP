// services/storage/audit.ts
import { supabase, isSupabaseAvailable } from '../../lib/supabaseClient';
import { getOperatorId } from './_shared';

export const audit = {
  async logAudit(
    action: string,
    targetType?: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!isSupabaseAvailable()) return;

    const operatorId = getOperatorId();
    if (!operatorId) return;

    void supabase!.from('audit_log').insert({
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
      operator_id: operatorId,
      created_at: new Date().toISOString(),
    });
  },
};
