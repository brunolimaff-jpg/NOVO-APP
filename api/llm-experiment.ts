import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticateExperimentRequest, isExperimentAuthError } from './_experiment-auth.js';
import type { CreateRunPayload, ExperimentRunStatus, FinalizeRunPayload } from '../utils/llm/types.js';

const ALLOWED_STATUSES = new Set<ExperimentRunStatus>([
  'running',
  'success',
  'partial_success',
  'failed',
  'timeout',
  'fallback',
  'quality_failure',
  'excluded',
]);

type ExperimentAction = 'createRun' | 'finalizeRun';

interface ExperimentRequestBody extends Partial<CreateRunPayload>, Partial<FinalizeRunPayload> {
  action?: ExperimentAction;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function signRun(id: string, userId: string): string {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '').update(`${id}:${userId}`).digest('hex');
}

function verifyRunToken(id: string, userId: string, token: unknown): boolean {
  if (!isNonEmptyString(token)) return false;
  const expected = Buffer.from(signRun(id, userId));
  const received = Buffer.from(token);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function validateCreateRun(body: ExperimentRequestBody): CreateRunPayload | { error: string } {
  if (!isNonEmptyString(body.experimentId)) return { error: 'experimentId is required' };
  if (!isNonEmptyString(body.selectedModel)) return { error: 'selectedModel is required' };
  if (!isNonEmptyString(body.provider)) return { error: 'provider is required' };
  if (!isNonEmptyString(body.runId)) return { error: 'runId is required' };
  if (!isNonEmptyString(body.promptVersion)) return { error: 'promptVersion is required' };
  if (!isNonEmptyString(body.codeVersion)) return { error: 'codeVersion is required' };
  return {
    experimentId: body.experimentId,
    variant: body.variant,
    selectedModel: body.selectedModel,
    provider: body.provider,
    litellmBaseUrl: body.litellmBaseUrl,
    environment: body.environment,
    runId: body.runId,
    sessionId: body.sessionId,
    operatorId: body.operatorId,
    operatorEmail: body.operatorEmail?.trim().toLowerCase(),
    companyName: body.companyName,
    companyCnpjHash: body.companyCnpjHash,
    promptVersion: body.promptVersion,
    codeVersion: body.codeVersion,
  };
}

async function handleCreateRun(
  supabase: SupabaseClient,
  payload: CreateRunPayload,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from('llm_experiment_runs')
    .insert({
      experiment_id: payload.experimentId,
      variant: payload.variant ?? null,
      selected_model: payload.selectedModel,
      provider: payload.provider,
      litellm_base_url: payload.litellmBaseUrl ?? null,
      environment: process.env.VERCEL_ENV ?? payload.environment ?? 'production',
      run_id: payload.runId,
      session_id: payload.sessionId ?? null,
      operator_id: payload.operatorId ?? null,
      company_name: payload.companyName ?? null,
      company_cnpj_hash: payload.companyCnpjHash ?? null,
      status: 'running',
      prompt_version: payload.promptVersion,
      code_version: payload.codeVersion,
    })
    .select('id')
    .single();

  if (error) {
    return { error: error.message };
  }

  if (!data?.id) {
    return { error: 'Insert succeeded but no id returned' };
  }

  return { id: data.id as string };
}

async function handleFinalizeRun(
  supabase: SupabaseClient,
  payload: FinalizeRunPayload,
): Promise<{ ok: true } | { error: string }> {
  if (!isNonEmptyString(payload.id)) return { error: 'id is required' };
  if (!isNonEmptyString(payload.status)) return { error: 'status is required' };
  if (!ALLOWED_STATUSES.has(payload.status as ExperimentRunStatus)) {
    return { error: `Invalid status: ${payload.status}` };
  }

  const updateRow: Record<string, unknown> = {
    status: payload.status,
    completed_at: new Date().toISOString(),
  };

  const fieldMap: Record<string, keyof FinalizeRunPayload> = {
    exclusion_reason: 'exclusionReason',
    fallback_used: 'fallbackUsed',
    fallback_model: 'fallbackModel',
    retry_count: 'retryCount',
    total_latency_ms: 'totalLatencyMs',
    model_latency_ms: 'modelLatencyMs',
    waterfall_duration_ms: 'waterfallDurationMs',
    modules_generated: 'modulesGenerated',
    modules_required_present: 'modulesRequiredPresent',
    modules_missing: 'modulesMissing',
    report_chars: 'reportChars',
    report_tokens_estimated: 'reportTokensEstimated',
    input_tokens: 'inputTokens',
    output_tokens: 'outputTokens',
    total_tokens: 'totalTokens',
    input_cost_usd: 'inputCostUsd',
    output_cost_usd: 'outputCostUsd',
    total_cost_usd: 'totalCostUsd',
    estimated_cost: 'estimatedCost',
    cost_estimation_method: 'costEstimationMethod',
    input_price_used: 'inputPriceUsed',
    output_price_used: 'outputPriceUsed',
    sources_count: 'sourcesCount',
    valid_sources_count: 'validSourcesCount',
    removed_sources_count: 'removedSourcesCount',
    porta_score_present: 'portaScorePresent',
    porta_markers_valid: 'portaMarkersValid',
    porta_score: 'portaScore',
    teia_complexidade_present: 'teiaComplexidadePresent',
    teia_complexidade: 'teiaComplexidade',
    parser_success: 'parserSuccess',
    render_success: 'renderSuccess',
    prompt_leak_detected: 'promptLeakDetected',
    response_empty: 'responseEmpty',
    response_truncated: 'responseTruncated',
    markdown_broken: 'markdownBroken',
    structural_score: 'structuralScore',
    error_normalized: 'errorNormalized',
  };

  for (const [dbField, payloadField] of Object.entries(fieldMap)) {
    const value = payload[payloadField];
    if (value !== undefined) {
      updateRow[dbField] = value;
    }
  }

  const { error } = await supabase.from('llm_experiment_runs').update(updateRow).eq('id', payload.id);

  if (error) {
    return { error: error.message };
  }

  return { ok: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const auth = await authenticateExperimentRequest(req);
    if (isExperimentAuthError(auth)) {
      return res.status(auth.status).json({ error: auth.error });
    }
    return handleReport(req, res, auth.supabase);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as ExperimentRequestBody;
  const auth = await authenticateExperimentRequest(req);
  if (isExperimentAuthError(auth)) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const action = body.action;
  const { supabase, user } = auth;

  if (action === 'createRun') {
    const validated = validateCreateRun(body);
    if ('error' in validated) {
      return res.status(400).json({ error: validated.error });
    }

    const result = await handleCreateRun(supabase, { ...validated, operatorId: user.id, operatorEmail: user.email });
    if ('error' in result) {
      return res.status(500).json({ error: result.error });
    }

    return res.status(200).json({ id: result.id, runToken: signRun(result.id, user.id) });
  }

  if (action === 'finalizeRun') {
    if (!isNonEmptyString(body.id)) {
      return res.status(400).json({ error: 'id is required' });
    }
    if (!isNonEmptyString(body.status)) {
      return res.status(400).json({ error: 'status is required' });
    }
    if (!verifyRunToken(body.id, user.id, body.runToken)) {
      return res.status(403).json({ error: 'Invalid run token' });
    }
    const result = await handleFinalizeRun(supabase, body as FinalizeRunPayload);
    if ('error' in result) {
      const status = /required|Invalid status/.test(result.error) ? 400 : 500;
      return res.status(status).json({ error: result.error });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Invalid action' });
}

export const config = {
  runtime: 'nodejs',
};

// Exported for unit tests
export { validateCreateRun, handleCreateRun, handleFinalizeRun };

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

async function handleReport(req: VercelRequest, res: VercelResponse, supabase: SupabaseClient): Promise<void> {
  const format = typeof req.query?.format === 'string' ? req.query.format : 'json';
  const experimentId = typeof req.query?.experimentId === 'string' ? req.query.experimentId : undefined;

  let query = supabase.from('llm_model_daily_report').select('*').order('report_date', { ascending: false });

  if (experimentId) {
    query = query.eq('experiment_id', experimentId);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const rows = (data ?? []) as DailyReportRow[];

  if (format === 'markdown') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.status(200).send(toMarkdown(rows));
    return;
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.status(200).send(toCsv(rows));
    return;
  }

  res.status(200).json({ rows });
}
