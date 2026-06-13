import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { storageGet, storageRemove, storageSet } from '../utils/localStorage';
import { storage } from '../services/storage';
import { initSessionTracking, trackOperatorEvent, endOperatorSession } from '../services/operatorTracking';
import { useMaybeAuth } from './AuthContext';
import { supabase } from '../lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

export interface OperatorProfile {
  operatorId: string;
  name: string;
  email: string;
}

interface OperatorContextType {
  name: string;
  operatorId: string;
  email: string;
  loading: boolean;
  setName: (name: string) => void;
  setEmail: (email: string) => void;
  registerOperator: (name: string, email: string) => void;
  clearName: () => void;
  linkToExistingOperator: (operatorId: string, name: string, email: string) => void;
}

// ===================================================================
// IMPORTANTE DE SEGURANCA
// ===================================================================
// operatorId NAO e identidade autenticada. Email e auto-reportado
// (nao verificado). findUserByEmail client-side so e seguro porque
// operatorId e usado EXCLUSIVAMENTE para analytics/tracking.
//
// NUNCA usar operatorId para:
//   - RLS policies de autorizacao
//   - Controle de acesso a recursos protegidos
//   - Permissoes de escrita/leitura no banco
//   - Qualquer decisao de seguranca
//
// Se no futuro o app precisar de identidade real, implementar auth
// via Supabase Auth (magic link, OAuth, OTP) e usar auth.uid().
// ===================================================================

const OPERATOR_NAME_KEY = 'operator_name';
const OPERATOR_ID_KEY = 'operator_id';
const OPERATOR_EMAIL_KEY = 'operator_email';

function generateOperatorId(): string {
  return `op_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function getOrCreateOperatorId(): string {
  const savedId = storageGet(OPERATOR_ID_KEY)?.trim();
  if (savedId) return savedId;

  const nextId = generateOperatorId();
  storageSet(OPERATOR_ID_KEY, nextId);
  return nextId;
}

function getSavedOperatorName(): string {
  return storageGet(OPERATOR_NAME_KEY)?.trim() || '';
}

function getSavedOperatorEmail(): string {
  return storageGet(OPERATOR_EMAIL_KEY)?.trim() || '';
}

// Helper de logging: em producao nao expoe objeto de erro (evita vazamento de PII)
function warnOperator(message: string, err?: unknown): void {
  if (import.meta.env.DEV && err instanceof Error) {
    console.warn(message, err.message);
  } else {
    console.warn(message);
  }
}

// ===================================================================
// resolveOperatorFromAuth — contrato de identidade
// ===================================================================
// Busca o operator_id canonico para um usuario autenticado:
// 1. profiles.operator_id por auth.uid() (fonte canonica)
// 2. user_context por email (operador legado, fallback)
// 3. Retorna null se nada encontrado (primeiro login)
//
// NOTA: nao atualiza profiles — o trigger on_auth_user_created ja cria
// o profile no signup. Para legacy linking, a migration de consolidacao
// (20260612_consolidate_operators) ja trata o backfill. O RPC
// link_legacy_operator fica disponivel para casos pontuais.
// ===================================================================
async function resolveOperatorFromAuth(
  authUser: User,
): Promise<{ operatorId: string; name: string; email: string } | null> {
  if (!supabase) return null;

  try {
    const authEmail = authUser.email?.toLowerCase().trim();

    // Step 1: Ler profiles.operator_id (fonte canonica)
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('operator_id, email, name')
      .eq('id', authUser.id)
      .maybeSingle();

    if (error) {
      warnOperator('[OperatorContext] profiles query error:', error);
      return null;
    }

    // Step 2: Buscar operador legado por email antes de aceitar um operator_id
    // recém-criado pelo trigger. Isso preserva dossiês de contas recriadas.
    const legacyOperator = authEmail ? await storage.findUserByEmail(authEmail) : null;

    if (profile?.operator_id) {
      if (legacyOperator && legacyOperator.operatorId !== profile.operator_id) {
        const resolvedName = legacyOperator.displayName || profile.name || authUser.user_metadata?.name || '';

        void (async () => {
          const { error: linkError } = await supabase.rpc('link_legacy_operator', {
            p_auth_user_id: authUser.id,
            p_operator_id: legacyOperator.operatorId,
            p_email: authEmail,
            p_name: resolvedName,
          });

          if (linkError) {
            warnOperator('[OperatorContext] link_legacy_operator failed:', linkError);
          }
        })();

        return {
          operatorId: legacyOperator.operatorId,
          name: resolvedName,
          email: profile.email || authUser.email || '',
        };
      }

      return {
        operatorId: profile.operator_id,
        name: profile.name || authUser.user_metadata?.name || '',
        email: profile.email || authUser.email || '',
      };
    }

    if (!authEmail) return null;

    if (legacyOperator) {
      // Operador legado encontrado — usar operator_id como canonico
      // O profile sera atualizado por link_legacy_operator quando existir profile.
      return {
        operatorId: legacyOperator.operatorId,
        name: legacyOperator.displayName || authUser.user_metadata?.name || '',
        email: authUser.email || '',
      };
    }

    // Step 3: Nada encontrado — profile deveria existir do trigger
    // Tenta re-ler (caso o trigger tenha sido executado entre nossa consulta)
    const { data: retryProfile } = await supabase
      .from('profiles')
      .select('operator_id, email, name')
      .eq('id', authUser.id)
      .maybeSingle();

    if (retryProfile?.operator_id) {
      return {
        operatorId: retryProfile.operator_id,
        name: retryProfile.name || '',
        email: retryProfile.email || '',
      };
    }

    return null;
  } catch (err) {
    warnOperator('[OperatorContext] resolveOperatorFromAuth error:', err);
    return null;
  }
}

const OperatorContext = createContext<OperatorContextType | undefined>(undefined);

export const OperatorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const auth = useMaybeAuth();
  const authUser = auth?.user ?? null;
  const authLoading = auth?.loading ?? false;

  const [name, setOperatorName] = useState<string>(() => {
    if (authUser?.user_metadata?.name) return authUser.user_metadata.name;
    return getSavedOperatorName();
  });
  const [operatorId, setOperatorId] = useState<string>(() => getOrCreateOperatorId());
  const [email, setOperatorEmail] = useState<string>(() => {
    if (authUser?.email) return authUser.email;
    return getSavedOperatorEmail();
  });
  const shouldBackfillSavedProfileRef = useRef(name.trim().length > 0 && email.trim().length > 0);
  const didBackfillRef = useRef(false);
  const didTrackAppOpenRef = useRef(false);
  const didTrackInFlightRef = useRef(false);
  const didBackfillInFlightRef = useRef(false);
  const operatorResolvedRef = useRef(false); // Ja resolveu operator_id do auth?

  const setName = useCallback(
    (nextName: string) => {
      const normalizedName = nextName.trim();
      if (!normalizedName) return;

      storageSet(OPERATOR_NAME_KEY, normalizedName);
      setOperatorName(normalizedName);

      // Sync to Supabase if email exists
      if (email) {
        void storage
          .saveUserContext({ operatorId, name: normalizedName, email })
          .catch(err => warnOperator('[OperatorContext] saveUserContext failed:', err));
      }
    },
    [operatorId, email],
  );

  const setEmail = useCallback(
    (nextEmail: string) => {
      const normalizedEmail = nextEmail.trim();
      if (!normalizedEmail) return;

      storageSet(OPERATOR_EMAIL_KEY, normalizedEmail);
      setOperatorEmail(normalizedEmail);

      // Sync to Supabase (fire and forget)
      void storage
        .saveUserContext({ operatorId, name, email: normalizedEmail })
        .catch(err => warnOperator('[OperatorContext] saveUserContext failed:', err));
    },
    [operatorId, name],
  );

  const linkToExistingOperator = useCallback(
    (existingOperatorId: string, existingName: string, existingEmail: string) => {
      storageSet(OPERATOR_ID_KEY, existingOperatorId);
      storageSet(OPERATOR_NAME_KEY, existingName);
      storageSet(OPERATOR_EMAIL_KEY, existingEmail);
      setOperatorId(existingOperatorId);
      setOperatorName(existingName);
      setOperatorEmail(existingEmail);

      // Sync to Supabase
      void storage
        .saveUserContext({ operatorId: existingOperatorId, name: existingName, email: existingEmail })
        .catch(err => warnOperator('[OperatorContext] saveUserContext failed:', err));

      // Tracking (se ainda nao disparou nesta sessao)
      if (!didTrackAppOpenRef.current && !didTrackInFlightRef.current) {
        didTrackInFlightRef.current = true;
        void initSessionTracking(existingOperatorId, existingEmail)
          .then(() => {
            didTrackAppOpenRef.current = true;
          })
          .catch(err => {
            warnOperator('[OperatorContext] initSessionTracking failed:', err);
            // Permite retry futuro
          })
          .finally(() => {
            didTrackInFlightRef.current = false;
          });
      }

      // Notificar sessoes para recarregar com o novo operatorId
      window.dispatchEvent(new CustomEvent('operator-relinked'));
    },
    [],
  );

  const registerOperator = useCallback(
    (nextName: string, nextEmail: string) => {
      // Se ja resolvido via auth, nao recria user_context com ID temporario
      if (operatorResolvedRef.current) return;

      const normalizedName = nextName.trim();
      const normalizedEmail = nextEmail.trim();
      if (!normalizedName || !normalizedEmail) return;

      // 1. Persist to localStorage first (sync)
      storageSet(OPERATOR_NAME_KEY, normalizedName);
      storageSet(OPERATOR_EMAIL_KEY, normalizedEmail);
      setOperatorName(normalizedName);
      setOperatorEmail(normalizedEmail);

      const capturedOperatorId = operatorId;

      // 2. Resolve canonical operatorId — depois persiste e inicia tracking
      void (async () => {
        let effectiveOperatorId = capturedOperatorId;

        try {
          const existing = await storage.findUserByEmail(normalizedEmail);
          if (existing && existing.operatorId !== capturedOperatorId) {
            // Canonical operator encontrado — delegar para linkToExistingOperator
            // (que chama saveUserContext + initSessionTracking com ID canonico)
            linkToExistingOperator(existing.operatorId, normalizedName, normalizedEmail);
            return;
          }
          // Se encontrou com mesmo operatorId ou nao encontrou:
          // effectiveOperatorId permanece capturedOperatorId
        } catch (err) {
          warnOperator('[OperatorContext] findUserByEmail failed, using current operatorId:', err);
          // Fall through: usa capturedOperatorId
        }

        // 3. Persiste no Supabase com o operatorId efetivo
        void storage
          .saveUserContext({
            operatorId: effectiveOperatorId,
            name: normalizedName,
            email: normalizedEmail,
          })
          .catch(err => warnOperator('[OperatorContext] saveUserContext failed:', err));

        // 4. Inicia tracking APENAS se ainda nao foi iniciado
        if (!didTrackAppOpenRef.current && !didTrackInFlightRef.current) {
          didTrackInFlightRef.current = true;
          try {
            await initSessionTracking(effectiveOperatorId, normalizedEmail);
            didTrackAppOpenRef.current = true;
            trackOperatorEvent('operator_registered', {
              operatorId: effectiveOperatorId,
              email: normalizedEmail,
            });
          } catch (err) {
            warnOperator('[OperatorContext] initSessionTracking failed:', err);
            // Permite retry futuro (didTrackAppOpenRef continua false)
          } finally {
            didTrackInFlightRef.current = false;
          }
        }
      })();
    },
    [operatorId, linkToExistingOperator],
  );

  // Refs para evitar stale closure nos effects
  const operatorIdRef = useRef(operatorId);
  operatorIdRef.current = operatorId;
  const nameRef = useRef(name);
  nameRef.current = name;
  const emailRef = useRef(email);
  emailRef.current = email;

  // ===================================================================
  // Resolucao de operator_id para usuario autenticado (Phase 1)
  // ===================================================================
  // ORDEM CRITICA: Este effect DEVE vir antes do backfill effect.
  // React executa effects na ordem de declaracao. Este effect marca
  // operatorResolvedRef=true de forma sincrona (antes do async),
  // prevenindo que o backfill effect rode para auth users.
  //
  // Quando o usuario esta autenticado, busca o operator_id canonico
  // via profiles.operator_id. Nao cria user_context com ID temporario.
  //
  // Fluxo:
  //   auth.uid() → profiles.operator_id → se existe → usa
  //   se nao → user_context por email → se acha → usa legado
  //   se nao acha → mantem localStorage (primeiro login, trigger ja criou profile)
  // ===================================================================
  useEffect(() => {
    if (!authUser) {
      operatorResolvedRef.current = false;
      return;
    }
    if (!authUser || operatorResolvedRef.current || authLoading) return;

    operatorResolvedRef.current = true; // Sincrono — protege backfill effect abaixo

    void (async () => {
      try {
        const resolved = await resolveOperatorFromAuth(authUser);
        if (!resolved) {
          // Nao conseguiu resolver — mantem valores atuais do localStorage
          return;
        }

        const currentOpId = operatorIdRef.current;
        const needsRelink = resolved.operatorId !== currentOpId;

        // Atualiza localStorage com valores canonicos
        storageSet(OPERATOR_ID_KEY, resolved.operatorId);
        if (resolved.name) storageSet(OPERATOR_NAME_KEY, resolved.name);
        if (resolved.email) storageSet(OPERATOR_EMAIL_KEY, resolved.email);

        // Atualiza estado do React se necessario
        if (needsRelink) setOperatorId(resolved.operatorId);
        if (resolved.name && resolved.name !== nameRef.current) setOperatorName(resolved.name);
        if (resolved.email && resolved.email !== emailRef.current) setOperatorEmail(resolved.email);

        // Persiste user_context com operator_id canonico (NUNCA com ID temporario)
        void storage
          .saveUserContext({
            operatorId: resolved.operatorId,
            name: resolved.name || nameRef.current,
            email: resolved.email || emailRef.current,
          })
          .catch(err => warnOperator('[OperatorContext] saveUserContext after resolution failed:', err));

        // Dispara relink se operator_id mudou (recarrega dossies etc.)
        if (needsRelink) {
          window.dispatchEvent(new CustomEvent('operator-relinked'));
        }

        // Inicia tracking se ainda nao iniciado
        if (!didTrackAppOpenRef.current && !didTrackInFlightRef.current) {
          didTrackInFlightRef.current = true;
          try {
            await initSessionTracking(resolved.operatorId, resolved.email || emailRef.current);
            didTrackAppOpenRef.current = true;
          } catch (err) {
            warnOperator('[OperatorContext] initSessionTracking after resolution failed:', err);
          } finally {
            didTrackInFlightRef.current = false;
          }
        }
      } catch (err) {
        warnOperator('[OperatorContext] operator resolution error:', err);
      }
    })();
  }, [authUser?.id, authLoading]);

  // ===================================================================
  // Backfill — apenas para usuarios nao autenticados (guest)
  // ===================================================================
  // Se operatorResolvedRef.current esta true, o usuario ja foi resolvido
  // via auth. Este effect nao executa. O guard e sincrono porque o effect
  // de resolucao acima ja marcou o ref antes de iniciar o async.
  // ===================================================================
  useEffect(() => {
    // Auth user: resolution effect ja cuidou
    if (operatorResolvedRef.current) return;
    if (!shouldBackfillSavedProfileRef.current || didBackfillRef.current || didBackfillInFlightRef.current) return;
    if (!operatorId || !name || !email) return;

    didBackfillInFlightRef.current = true;
    const capturedOperatorId = operatorId;
    const capturedName = name;
    const capturedEmail = email;

    void (async () => {
      let effectiveOperatorId = capturedOperatorId;

      try {
        const existing = await storage.findUserByEmail(capturedEmail);
        if (existing && existing.operatorId !== capturedOperatorId) {
          effectiveOperatorId = existing.operatorId;
          storageSet(OPERATOR_ID_KEY, existing.operatorId);
          setOperatorId(existing.operatorId);
          if (existing.displayName) {
            storageSet(OPERATOR_NAME_KEY, existing.displayName);
            setOperatorName(existing.displayName);
          }
        }
      } catch (err) {
        warnOperator('[OperatorContext] findUserByEmail failed during backfill:', err);
        didBackfillInFlightRef.current = false;
        return;
      }

      void storage
        .saveUserContext({ operatorId: effectiveOperatorId, name: capturedName, email: capturedEmail })
        .catch(err => warnOperator('[OperatorContext] saveUserContext failed:', err));

      if (!didTrackAppOpenRef.current && !didTrackInFlightRef.current) {
        didTrackInFlightRef.current = true;
        void initSessionTracking(effectiveOperatorId, capturedEmail)
          .then(() => {
            didTrackAppOpenRef.current = true;
          })
          .catch(err => {
            warnOperator('[OperatorContext] initSessionTracking failed:', err);
          })
          .finally(() => {
            didTrackInFlightRef.current = false;
          });
      }

      didBackfillRef.current = true;
      didBackfillInFlightRef.current = false;
    })();
  }, [email, name, operatorId]);

  // Limpa dados do operador ao fazer logout
  useEffect(() => {
    const handleSignedOut = () => {
      storageRemove(OPERATOR_ID_KEY);
      storageRemove(OPERATOR_NAME_KEY);
      storageRemove(OPERATOR_EMAIL_KEY);
      const nextGuestOperatorId = getOrCreateOperatorId();
      operatorResolvedRef.current = false;
      didBackfillRef.current = false;
      didTrackAppOpenRef.current = false;
      setOperatorName('');
      setOperatorEmail('');
      setOperatorId(nextGuestOperatorId);
    };
    window.addEventListener('operator-signed-out', handleSignedOut);
    return () => window.removeEventListener('operator-signed-out', handleSignedOut);
  }, []);

  // Listener de encerramento de sessao — apenas pagehide (fechar tab)
  // NOTA: visibilitychange NAO encerra sessao — trocar de aba nao deve quebrar metricas
  useEffect(() => {
    const handlePageHide = () => endOperatorSession('pagehide');
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  const clearName = useCallback(() => {
    storageRemove(OPERATOR_NAME_KEY);
    setOperatorName('');
  }, []);

  const value = useMemo<OperatorContextType>(
    () => ({
      name,
      operatorId,
      email,
      loading: authLoading,
      setName,
      setEmail,
      registerOperator,
      clearName,
      linkToExistingOperator,
    }),
    [clearName, email, linkToExistingOperator, name, operatorId, registerOperator, setEmail, setName, authLoading],
  );

  return <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>;
};

export const useOperator = (): OperatorContextType => {
  const context = useContext(OperatorContext);
  if (!context) {
    throw new Error('useOperator deve estar dentro de OperatorProvider');
  }
  return context;
};

export const useMaybeOperator = (): OperatorContextType | undefined => useContext(OperatorContext);
