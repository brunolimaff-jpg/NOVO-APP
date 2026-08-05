// Cron de limpeza de stale runs de dossiê (medida G do RCA de lease lifecycle).
// Finaliza runs presos em RUNNING com lease expirado (padrão: 15 min de atraso),
// que nenhum cliente consegue finalizar porque fail/complete exigem lease_owner vivo.
//
// Fonte canônica: docs/bugs/rca-lease-lifecycle-2026-08-04.md (D3 + medida G).
// Padrão espelhado de api/cron-email-confirmation.ts (CRON_SECRET + service_role).
//
// NOTA: a ativação do agendamento (vercel.json crons) é deliberadamente NÃO
// incluída nesta PR — exige autorização separada. O handler fica pronto e
// auditável; chamadas manuais com o CRON_SECRET funcionam sem agendamento.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Janela de atraso do lease para considerar um run obsoleto (1h, alinhada ao
// teste original do RCA — decisão registrada no parecer CHANGES_REQUIRED).
const STALE_AFTER_SECONDS = 3600;
// Lote por execução (padrão da RPC; teto validado no SQL).
const BATCH_LIMIT = 50;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron usa GET; mantemos POST para compatibilidade
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron-dossier-run-cleanup] CRON_SECRET não configurado');
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[cron-dossier-run-cleanup] Supabase não configurado');
    return res.status(500).json({ error: 'Missing Supabase configuration' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Espelha CRON_DELETE_ENABLED do cron de e-mail: sem a flag, apenas dry-run.
  const cleanupEnabled = process.env.CRON_STALE_CLEANUP_ENABLED === 'true';

  const { data: closed, error: rpcError } = await supabase.rpc('close_stale_dossier_runs', {
    p_stale_after_seconds: STALE_AFTER_SECONDS,
    p_batch_limit: BATCH_LIMIT,
    p_dry_run: !cleanupEnabled,
  });

  if (rpcError) {
    console.error('[cron-dossier-run-cleanup] Erro ao executar RPC:', rpcError.message);
    return res.status(500).json({ error: 'RPC failed', detail: rpcError.message });
  }

  const count = typeof closed === 'number' ? closed : 0;

  if (!cleanupEnabled) {
    console.warn(`[cron-dossier-run-cleanup] Dry-run: ${count} run(s) candidato(s), nenhum finalizado.`);
  }

  return res.status(200).json({
    dryRun: !cleanupEnabled,
    staleAfterSeconds: STALE_AFTER_SECONDS,
    closed: count,
  });
}
