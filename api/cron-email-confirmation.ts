import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET || 'scout360-cron';

  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase configuration' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: expired, error: selectError } = await supabase
    .from('profiles')
    .select('id')
    .is('email_confirmed_at', null)
    .lt('created_at', fortyEightHoursAgo);

  if (selectError) {
    return res.status(500).json({ error: 'Failed to query expired profiles', detail: selectError.message });
  }

  if (!expired || expired.length === 0) {
    return res.status(200).json({ cleaned: 0, message: 'No expired unconfirmed accounts.' });
  }

  const expiredIds = expired.map(p => p.id);

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

  return res.status(200).json({
    cleaned: deleted,
    total: expiredIds.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
