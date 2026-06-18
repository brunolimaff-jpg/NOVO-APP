import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron usa GET; mantemos POST para compatibilidade
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron-email-confirmation] CRON_SECRET não configurado');
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[cron-email-confirmation] Supabase não configurado');
    return res.status(500).json({ error: 'Missing Supabase configuration' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const deletionEnabled = process.env.CRON_DELETE_ENABLED === 'true';

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Com auto-confirm ativo, auth.users.email_confirmed_at fica NULL.
  // Usamos last_sign_in_at: se o usuario nunca fez login em 48h, remover.
  const { data: expired, error: rpcError } = await supabase.rpc('get_expired_unconfirmed_users', {
    older_than: fortyEightHoursAgo,
    max_results: 50,
  });

  if (rpcError) {
    console.error('[cron-email-confirmation] Erro ao consultar:', rpcError.message);
    return res.status(500).json({ error: 'Query failed', detail: rpcError.message });
  }

  if (!expired || expired.length === 0) {
    console.log('[cron-email-confirmation] Nenhuma conta expirada.');
    return res.status(200).json({ dryRun: true, candidates: 0, cleaned: 0, total: 0 });
  }

  const expiredIds: string[] = expired.map((u: { id: string }) => u.id);

  if (!deletionEnabled) {
    console.warn(`[cron-email-confirmation] Dry-run: ${expiredIds.length} conta(s) candidata(s), nenhuma removida.`);
    return res.status(200).json({
      dryRun: true,
      candidates: expiredIds.length,
      cleaned: 0,
      total: expiredIds.length,
    });
  }

  const errors: string[] = [];
  let deleted = 0;

  for (const userId of expiredIds) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      errors.push(`${userId}: ${deleteError.message}`);
    } else {
      deleted++;
    }
  }

  console.log(`[cron-email-confirmation] ${deleted}/${expiredIds.length} contas removidas.`);

  return res.status(200).json({
    dryRun: false,
    candidates: expiredIds.length,
    cleaned: deleted,
    total: expiredIds.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
