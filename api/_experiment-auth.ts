import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { VercelRequest } from '@vercel/node';
import { getExperimentConfig, isOperatorAllowed } from '../utils/llm/modelRouter.js';

export interface ExperimentAuthResult {
  user: User;
  supabase: SupabaseClient;
}

export interface ExperimentAuthError {
  error: string;
  status: number;
}

export function getServerSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getBearerToken(req: VercelRequest): string | null {
  const raw = req.headers?.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function authenticateExperimentRequest(
  req: VercelRequest,
): Promise<ExperimentAuthResult | ExperimentAuthError> {
  if (process.env.LLM_PROVIDER !== 'litellm') {
    return { error: 'Experiment API disabled (LLM_PROVIDER=gemini)', status: 403 };
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) {
    return { error: 'Supabase not configured', status: 500 };
  }

  const token = getBearerToken(req);
  if (!token) {
    return { error: 'Authentication required', status: 401 };
  }

  const { data, error } = await supabase.auth.getUser(token);
  const user = data.user;
  if (error || !user?.email) {
    return { error: 'Invalid or expired session', status: 401 };
  }

  if (!isOperatorAllowed(user.email, getExperimentConfig(process.env))) {
    return { error: 'Operator not in LLM_ALLOWLIST', status: 403 };
  }

  return { user, supabase };
}

export function isExperimentAuthError(
  result: ExperimentAuthResult | ExperimentAuthError,
): result is ExperimentAuthError {
  return 'error' in result;
}
