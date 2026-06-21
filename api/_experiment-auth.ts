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
  if (!header || typeof header !== 'string') return null;
  const bearerPrefix = 'bearer ';
  if (header.length <= bearerPrefix.length) return null;
  if (header.slice(0, bearerPrefix.length).toLowerCase() !== bearerPrefix) return null;
  const token = header.slice(bearerPrefix.length).trim();
  return token.length > 0 ? token : null;
}

function getPreviewOperatorEmail(req: VercelRequest): string | null {
  const raw = req.headers?.['x-experiment-operator-email'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header || typeof header !== 'string') return null;
  return header.trim().toLowerCase() || null;
}

export async function authenticateExperimentRequest(
  req: VercelRequest,
): Promise<ExperimentAuthResult | ExperimentAuthError> {
  if (process.env.LLM_PROVIDER !== 'litellm') {
    return { error: 'Experiment API disabled (LLM_PROVIDER=gemini)', status: 403 };
  }

  const supabase = getServerSupabaseClient();

  // Tenta autenticação Supabase primeiro (token Bearer)
  const token = getBearerToken(req);
  if (token && supabase) {
    const { data, error } = await supabase.auth.getUser(token);
    const user = data.user;
    if (!error && user?.email) {
      if (!isOperatorAllowed(user.email, getExperimentConfig(process.env))) {
        return { error: 'Operator not in LLM_ALLOWLIST', status: 403 };
      }
      return { user, supabase };
    }
  }

  // Fallback: preview local auth (apenas em preview)
  const isPreviewLocalAuth = process.env.LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH === 'true';
  const isPreviewEnv = process.env.VERCEL_ENV === 'preview';

  if (isPreviewLocalAuth && isPreviewEnv) {
    const operatorEmail = getPreviewOperatorEmail(req);
    if (!operatorEmail) {
      return { error: 'x-experiment-operator-email header required for preview local auth', status: 401 };
    }
    if (!isOperatorAllowed(operatorEmail, getExperimentConfig(process.env))) {
      return { error: 'Operator not in LLM_ALLOWLIST', status: 403 };
    }
    if (!supabase) {
      return { error: 'Supabase not configured', status: 500 };
    }
    console.log(`[ExperimentAuth] preview local auth: ${operatorEmail}`);
    return {
      user: { id: `preview_${operatorEmail.replace(/[^a-z0-9]/g, '_')}`, email: operatorEmail } as User,
      supabase,
    };
  }

  return { error: 'Authentication required', status: 401 };
}

export function isExperimentAuthError(
  result: ExperimentAuthResult | ExperimentAuthError,
): result is ExperimentAuthError {
  return 'error' in result;
}
