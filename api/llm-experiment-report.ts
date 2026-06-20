import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

interface DailyReportRow {
  report_date: string;
  experiment_id: string;
  selected_model: string;
  runs_valid: number | null;
  runs_success: number | null;
  runs_quality_failure: number | null;
  runs_failed: number | null;
  runs_fallback: number | null;
  avg_cost_per_dossier: number | null;
  total_cost: number | null;
  avg_input_tokens: number | null;
  avg_output_tokens: number | null;
  avg_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  avg_report_chars: number | null;
  avg_valid_sources: number | null;
  avg_structural_score: number | null;
  pct_porta_valid: number | null;
}

function toCsv(rows: DailyReportRow[]): string {
  if (rows.length === 0) return 'report_date,experiment_id,selected_model,runs_valid,runs_success\n';

  const headers = Object.keys(rows[0] ?? {}) as Array<keyof DailyReportRow>;
  const lines = [headers.join(',')];

  for (const row of rows) {
    lines.push(headers.map(header => String(row[header] ?? '')).join(','));
  }

  return `${lines.join('\n')}\n`;
}

function toMarkdown(rows: DailyReportRow[]): string {
  if (rows.length === 0) {
    return '# LLM Experiment Report\n\nNenhum dado disponível.\n';
  }

  const lines = [
    '# LLM Experiment Report',
    '',
    '| Data | Modelo | Runs | Sucesso | Quality Fail | Fallback | Custo médio | Score |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.report_date} | ${row.selected_model} | ${row.runs_valid ?? 0} | ${row.runs_success ?? 0} | ${row.runs_quality_failure ?? 0} | ${row.runs_fallback ?? 0} | $${(row.avg_cost_per_dossier ?? 0).toFixed(6)} | ${row.avg_structural_score ?? 0} |`,
    );
  }

  return `${lines.join('\n')}\n`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const format = typeof req.query.format === 'string' ? req.query.format : 'json';
  const experimentId = typeof req.query.experimentId === 'string' ? req.query.experimentId : undefined;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = supabase.from('llm_model_daily_report').select('*').order('report_date', { ascending: false });

  if (experimentId) {
    query = query.eq('experiment_id', experimentId);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const rows = (data ?? []) as DailyReportRow[];

  if (format === 'markdown') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.status(200).send(toMarkdown(rows));
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.status(200).send(toCsv(rows));
  }

  return res.status(200).json({ rows });
}

export const config = {
  runtime: 'nodejs',
};
