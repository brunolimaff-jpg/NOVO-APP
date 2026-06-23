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
  const hasSupabaseUrl = !!process.env.SUPABASE_URL;
  const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.error('[TRACE] G3 authenticateExperimentRequest ENTRADA', {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    hasAuthorization: !!req.headers?.authorization,
    hasOperatorEmailHeader: !!req.headers?.['x-experiment-operator-email'],
    VERCEL_ENV: process.env.VERCEL_ENV,
    LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH: process.env.LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH,
    hasSupabaseUrl,
    hasServiceRoleKey,
  });

  if (process.env.LLM_PROVIDER !== 'litellm') {
    console.error('[TRACE] G3a LLM_PROVIDER_nao_litellm', {
      LLM_PROVIDER: process.env.LLM_PROVIDER,
      acao: 'return 403',
    });
    return { error: 'Experiment API disabled (LLM_PROVIDER=gemini)', status: 403 };
  }

  const supabase = getServerSupabaseClient();
  console.error('[TRACE] G3 supabase_client', {
    hasSupabase: !!supabase,
    hasUrl: hasSupabaseUrl,
    hasKey: hasServiceRoleKey,
  });

  // Tenta autenticação Supabase primeiro (token Bearer)
  const token = getBearerToken(req);
  console.error('[TRACE] G3b bearer_token', {
    hasToken: !!token,
    tokenPreview: token ? token.slice(0, 10) + '...' : null,
  });
  if (token && supabase) {
    const { data, error } = await supabase.auth.getUser(token);
    const user = data.user;
    console.error('[TRACE] G3b supabase_getUser', {
      hasUser: !!user,
      userEmail: user?.email ?? null,
      error: error?.message ?? null,
    });
    if (!error && user?.email) {
      const allowed = isOperatorAllowed(user.email, getExperimentConfig(process.env));
      console.error('[TRACE] G3b isOperatorAllowed', {
        email: user.email,
        allowed,
        acao: allowed ? 'return OK' : 'return 403',
      });
      if (!allowed) {
        return { error: 'Operator not in LLM_ALLOWLIST', status: 403 };
      }
      console.error('[TRACE] G3b auth_supabase_OK', { email: user.email });
      return { user, supabase };
    }
  }

  // Fallback: preview local auth (apenas em preview)
  const isPreviewLocalAuth = process.env.LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH === 'true';
  const isPreviewEnv = process.env.VERCEL_ENV === 'preview';
  console.error('[TRACE] G3c preview_local_auth_check', {
    isPreviewLocalAuth,
    isPreviewEnv,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });

  if (isPreviewLocalAuth && isPreviewEnv) {
    const operatorEmail = getPreviewOperatorEmail(req);
    console.error('[TRACE] G3c operatorEmail_header', {
      operatorEmail,
      header_raw: req.headers?.['x-experiment-operator-email'],
    });
    if (!operatorEmail) {
      console.error('[TRACE] G3c FAIL header_faltando', { acao: 'return 401' });
      return { error: 'x-experiment-operator-email header required for preview local auth', status: 401 };
    }
    const allowed = isOperatorAllowed(operatorEmail, getExperimentConfig(process.env));
    console.error('[TRACE] G3c isOperatorAllowed', {
      email: operatorEmail,
      allowed,
      acao: allowed ? 'check_supabase' : 'return 403',
    });
    if (!allowed) {
      return { error: 'Operator not in LLM_ALLOWLIST', status: 403 };
    }
    if (!supabase) {
      console.error('[TRACE] G3c FAIL supabase_null', { acao: 'return 500' });
      return { error: 'Supabase not configured', status: 500 };
    }
    console.error('[TRACE] G3c preview_local_auth_OK', { operatorEmail });
    return {
      user: { id: `preview_${operatorEmail.replace(/[^a-z0-9]/g, '_')}`, email: operatorEmail } as User,
      supabase,
    };
  }

  console.error('[TRACE] G3d auth_fallthrough', {
    isPreviewLocalAuth,
    isPreviewEnv,
    hasToken: !!token,
    acao: 'return 401',
  });
  return { error: 'Authentication required', status: 401 };
}

export function isExperimentAuthError(
  result: ExperimentAuthResult | ExperimentAuthError,
): result is ExperimentAuthError {
  return 'error' in result;
}
