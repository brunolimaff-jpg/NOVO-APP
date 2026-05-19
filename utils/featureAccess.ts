export interface UserFeatureAccess {
  dashboard: boolean;
  integrityCheck: boolean;
  clientLookup: boolean;
  deepDive: boolean;
  warRoom: boolean;
}

const MVP_LOCK_RESTRICTED_FEATURES = false;
const DEEP_DIVE_ENV_FLAG = 'VITE_ENABLE_DEEP_DIVE';

const FULL_ACCESS: UserFeatureAccess = {
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

export function getFeatureAccess(): UserFeatureAccess {
  const deepDiveEnabled = isDeepDiveEnabledByEnv();

  if (!MVP_LOCK_RESTRICTED_FEATURES) {
    return {
      ...FULL_ACCESS,
      deepDive: deepDiveEnabled,
    };
  }

  return {
    dashboard: false,
    integrityCheck: false,
    clientLookup: true,
    deepDive: deepDiveEnabled,
    warRoom: false,
  };
}
