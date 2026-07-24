import packageJson from '../package.json';

export type RuntimeEnvironment = 'preview' | 'production' | 'development';

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function resolveRuntimeEnvironment(vercelEnv = typeof __VERCEL_ENV__ === 'undefined' ? '' : __VERCEL_ENV__): RuntimeEnvironment {
  if (vercelEnv === 'preview') return 'preview';
  if (vercelEnv === 'production') return 'production';
  return 'development';
}

export function resolveRuntimeAppVersion(input?: { buildSha?: string; envSha?: string; packageVersion?: string }): string {
  return (
    nonEmpty(input?.buildSha ?? (typeof __BUILD_SHA__ === 'undefined' ? '' : __BUILD_SHA__)) ??
    nonEmpty(input?.envSha ?? import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA) ??
    nonEmpty(input?.packageVersion ?? packageJson.version) ??
    'unknown'
  );
}
