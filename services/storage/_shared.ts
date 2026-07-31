// services/storage/_shared.ts
// Helpers compartilhados entre módulos de storage.
//
// IDENTIDADE — máquina de estados explícita (corrigindo janela de race condition):
//
// Estados:
//   'guest'         — sessão sem usuário autenticado; usa ID local do localStorage
//   'resolving'     — usuário autenticado com resolução em andamento;
//                     getOperatorId() retorna null para impedir escritas com ID
//                     temporário/stale durante a janela de resolução
//   'authenticated' — usuário autenticado com ID canônico resolvido;
//                     getOperatorId() retorna exclusivamente o ID em memória
//                     (profiles.operator_id), sem depender de localStorage
//   'error'         — usuário autenticado cuja resolução FALHOU;
//                     getOperatorId() retorna null; operações de escrita devem
//                     falhar explicitamente (nunca fallback para ID legado)
//
// Regras de segurança:
//   1. Sessão sem auth: pode usar ID local de guest.
//   2. Auth com resolução em andamento: getOperatorId() NÃO retorna ID antigo
//      do localStorage; operações protegidas devem falhar explicitamente.
//   3. Auth resolvido: usar exclusivamente profiles.operator_id canônico em memória.
//   4. Logout/troca/sessão expirada: limpar imediatamente ID autenticado em memória;
//      impedir reutilização do ID anterior.
//   5. Falha na resolução para usuário autenticado: transitar para 'error'.
//      NÃO voltar para 'guest' (impedir uso de ID legado do localStorage como
//      fallback silencioso). Operações de escrita devem falhar explicitamente.

import { storageGet } from '../../utils/localStorage';
import { scoutDiag } from '../../utils/diagnosticLog';

// ===================================================================
// Máquina de estados de identidade
// ===================================================================

export type IdentityState = 'guest' | 'resolving' | 'authenticated' | 'error';

let identityState: IdentityState = 'guest';
let authenticatedOperatorId: string | null = null;
let authenticatedSessionActive = false;

export const OPERATOR_IDENTITY_BLOCKED_ERROR =
  'operator_id não resolvido: escrita bloqueada durante resolução de identidade';
export const GUEST_REMOTE_SYNC_DISABLED_ERROR =
  'sincronização remota requer usuário autenticado';

/**
 * Retorna o estado atual da identidade.
 * - 'guest': sessão não autenticada, ID vem do localStorage
 * - 'resolving': auth em andamento, escritas devem ser bloqueadas
 * - 'authenticated': ID canônico resolvido, usar exclusivamente memória
 * - 'error': resolução falhou para usuário autenticado; escritas devem falhar
 */
export function getIdentityState(): IdentityState {
  return identityState;
}

/** Somente identidade autenticada e resolvida pode acessar tabelas protegidas. */
export function canUseProtectedRemoteStorage(): boolean {
  return identityState === 'authenticated' && authenticatedOperatorId !== null;
}

/**
 * Marca a identidade como 'resolving' de forma síncrona, antes de iniciar
 * a consulta assíncrona de resolução do operator_id canônico.
 *
 * Durante o estado 'resolving', getOperatorId() retorna null para impedir
 * que operações de storage usem o ID temporário/stale do localStorage.
 */
export function markResolving(): void {
  authenticatedSessionActive = true;
  identityState = 'resolving';
}

/**
 * Define o ID autenticado canônico e marca a identidade como 'authenticated'.
 * Deve ser chamado APENAS após resolução bem-sucedida de profiles.operator_id.
 *
 * A partir deste momento, getOperatorId() retorna exclusivamente este ID,
 * ignorando completamente o localStorage como fonte de autorização.
 */
export function setAuthenticatedOperatorId(operatorId: string): void {
  if (!operatorId) return;
  authenticatedSessionActive = true;
  authenticatedOperatorId = operatorId;
  identityState = 'authenticated';
}

/**
 * Marca a identidade como 'error' (resolução falhou para usuário autenticado).
 * Limpa qualquer ID autenticado residual em memória. Não expõe o ID legado
 * do localStorage — getOperatorId() passa a retornar null.
 *
 * Deve ser chamado APENAS quando uma resolução para usuário autenticado falha.
 * Para logout/troca deliberada de sessão, use clearAuthenticatedOperatorId().
 */
export function markResolutionError(): void {
  authenticatedSessionActive = true;
  authenticatedOperatorId = null;
  identityState = 'error';
}

/**
 * Limpa o ID autenticado em memória sem reabrir o fallback guest enquanto
 * ainda existe uma sessão autenticada.
 *
 * Para logout/sessão encerrada, use markGuest().
 */
export function clearAuthenticatedOperatorId(): void {
  authenticatedOperatorId = null;
  identityState = authenticatedSessionActive ? 'error' : 'guest';
}

/** Transição explícita de logout para sessão guest. */
export function markGuest(): void {
  authenticatedSessionActive = false;
  authenticatedOperatorId = null;
  identityState = 'guest';
}

/**
 * Retorna o operator_id para escrita e lança erro quando uma sessão
 * autenticada ainda está resolvendo ou terminou em erro.
 */
export function getOperatorIdForWrite(): string | null {
  const operatorId = getOperatorId();
  if (!operatorId && (identityState === 'resolving' || identityState === 'error')) {
    scoutDiag.warn('StorageIdentity', 'write_blocked_unresolved_identity', {
      identityState,
    });
    throw new Error(`${OPERATOR_IDENTITY_BLOCKED_ERROR} (estado atual: ${identityState})`);
  }
  return operatorId;
}

/**
 * Retorna o operator_id a ser usado para operações de storage.
 *
 * Comportamento por estado:
 *   - 'guest': retorna ID do localStorage (comportamento legado para guest)
 *   - 'resolving': retorna null — operações protegidas devem falhar
 *     explicitamente ou aguardar resolução; NUNCA retorna ID temporário
 *   - 'authenticated': retorna o ID canônico em memória (profiles.operator_id);
 *     NÃO depende de localStorage como fonte de autorização
 *   - 'error': retorna null — resolução falhou para usuário autenticado;
 *     operações protegidas devem falhar explicitamente; NUNCA retorna
 *     ID legado do localStorage (impede fallback silencioso)
 *
 * NOTA DE SEGURANÇA: Durante os estados 'resolving' e 'error', este método
 * retorna null intencionalmente. Isso força o caller a tratar a ausência de
 * identidade resolvida, impedindo escritas com ID stale que falhariam no RLS
 * WITH CHECK ou, pior, usariam ID de outra identidade.
 */
export function getOperatorId(): string | null {
  if (identityState === 'authenticated') {
    return authenticatedOperatorId;
  }

  if (identityState === 'resolving' || identityState === 'error') {
    return null;
  }

  return storageGet('operator_id');
}
