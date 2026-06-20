import { supabase } from '../../lib/supabaseClient';
import { scoutDiag } from '../diagnosticLog';
import { getExperimentConfig, isOperatorAllowed } from './modelRouter';

export interface LiteLLMExperimentGate {
  llmEnabled: boolean;
  operatorEmail: string | null;
  hasSupabaseSession: boolean;
  reason?: 'experiment_disabled' | 'no_supabase_session' | 'operator_not_allowed';
}

export async function resolveLiteLLMExperimentGate(localOperatorEmail?: string | null): Promise<LiteLLMExperimentGate> {
  const experimentConfig = getExperimentConfig();

  let supabaseEmail: string | null = null;
  let hasSupabaseSession = false;

  if (supabase) {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error) {
        scoutDiag.warn('LiteLLMGate', 'getSession falhou', { error: error.message });
      } else if (session?.access_token && session.user) {
        hasSupabaseSession = true;
        supabaseEmail = session.user.email ?? null;
      }
    } catch (err) {
      scoutDiag.warn('LiteLLMGate', 'getSession exceção', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const operatorEmail = supabaseEmail ?? localOperatorEmail ?? null;

  if (!experimentConfig.enabled) {
    return { llmEnabled: false, operatorEmail, hasSupabaseSession, reason: 'experiment_disabled' };
  }
  if (!hasSupabaseSession) {
    return { llmEnabled: false, operatorEmail, hasSupabaseSession, reason: 'no_supabase_session' };
  }
  if (!isOperatorAllowed(operatorEmail, experimentConfig)) {
    return { llmEnabled: false, operatorEmail, hasSupabaseSession, reason: 'operator_not_allowed' };
  }

  return { llmEnabled: true, operatorEmail, hasSupabaseSession };
}
