import { AuthUser } from '../contexts/AuthContext';

export interface UserFeatureAccess {
  miniCRM: boolean;
  dashboard: boolean;
  integrityCheck: boolean;
  clientLookup: boolean;
  deepDive: boolean;
  warRoom: boolean;
}

const MVP_LOCK_RESTRICTED_FEATURES = false;
const ADMIN_IDENTIFIER = 'admin';
const DEEP_DIVE_ENV_FLAG = 'VITE_ENABLE_DEEP_DIVE';

const FULL_ACCESS: UserFeatureAccess = {
  miniCRM: true,
  dashboard: true,
  integrityCheck: true,
  clientLookup: true,
  deepDive: true,
  warRoom: true,
};

function parseEnvBoolean(rawValue: unknown, defaultValue = false): boolean {
  if (typeof rawValue !== 'string') return defaultValue;
  const normalized = rawValue.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;

  return defaultValue;
}

function readEnvFlag(name: string): string | undefined {
  const importMetaEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> })?.env;
  const fromImportMeta = importMetaEnv?.[name];
  if (typeof fromImportMeta === 'string') return fromImportMeta;

  if (typeof process !== 'undefined' && process?.env && typeof process.env[name] === 'string') {
    return process.env[name];
  }

  return undefined;
}

function isDeepDiveEnabledByEnv(): boolean {
  return parseEnvBoolean(readEnvFlag(DEEP_DIVE_ENV_FLAG), false);
}

function normalizeValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function extractIdentifiers(user: Pick<AuthUser, 'id' | 'displayName' | 'email'> | null): Set<string> {
  const identifiers = new Set<string>();
  if (!user) return identifiers;

  const normalizedName = normalizeValue(user.displayName || '');
  if (normalizedName) {
    identifiers.add(normalizedName);
    const firstName = normalizedName.split(/\s+/)[0];
    if (firstName) identifiers.add(firstName);
  }

  const normalizedEmail = normalizeValue(user.email || '');
  if (normalizedEmail) {
    identifiers.add(normalizedEmail);
    const emailPrefix = normalizedEmail.split('@')[0];
    if (emailPrefix) identifiers.add(emailPrefix);
  }

  return identifiers;
}

export function isAdminUser(user: Pick<AuthUser, 'id' | 'displayName' | 'email'> | null): boolean {
  if (!user) return false;
  const identifiers = extractIdentifiers(user);
  return identifiers.has(ADMIN_IDENTIFIER);
}

export function getFeatureAccessForUser(user: Pick<AuthUser, 'id' | 'displayName' | 'email'> | null): UserFeatureAccess {
  const deepDiveEnabled = isDeepDiveEnabledByEnv();
  if (!MVP_LOCK_RESTRICTED_FEATURES) {
    return {
      ...FULL_ACCESS,
      deepDive: deepDiveEnabled,
    };
  }
  const hasRestrictedAccess = isAdminUser(user);
  return {
    miniCRM: hasRestrictedAccess,
    dashboard: hasRestrictedAccess,
    integrityCheck: hasRestrictedAccess,
    clientLookup: true,
    deepDive: hasRestrictedAccess && deepDiveEnabled,
    warRoom: hasRestrictedAccess,
  };
}
