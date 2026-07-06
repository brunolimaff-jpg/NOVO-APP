export type FeatureFlagName = 'deepDive' | 'warRoom' | 'newExportFlow' | 'radarV2' | 'inlineLoading' | 'dossierCard';

interface FeatureFlagConfig {
  default: boolean;
  removeBy: string;
  envOverride?: string;
}

export const FEATURE_FLAGS: Record<FeatureFlagName, FeatureFlagConfig> = {
  deepDive: { default: true, removeBy: 'Sprint 14', envOverride: 'VITE_FF_DEEP_DIVE' },
  warRoom: { default: true, removeBy: 'Sprint 14', envOverride: 'VITE_FF_WAR_ROOM' },
  newExportFlow: { default: false, removeBy: 'Sprint 12', envOverride: 'VITE_FF_NEW_EXPORT' },
  radarV2: { default: false, removeBy: 'Sprint 13', envOverride: 'VITE_FF_RADAR_V2' },
  inlineLoading: { default: true, removeBy: 'Sprint 16', envOverride: 'VITE_FF_INLINE_LOADING' },
  dossierCard: { default: false, removeBy: 'BUG-8 v6 follow-up — DossierReadyCard carregando infinito', envOverride: 'VITE_FF_DOSSIER_CARD' },
};

function readQueryOverride(name: string): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const val = params.get(name);
    if (val === '1' || val === 'true') return true;
    if (val === '0' || val === 'false') return false;
  } catch {
    /* SSR */
  }
  return null;
}

function readStorageOverride(name: string): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(`ff_${name}`);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    /* localStorage indisponivel */
  }
  return null;
}

export function getFlag(name: FeatureFlagName): boolean {
  const config = FEATURE_FLAGS[name];

  const queryOverride = readQueryOverride(name);
  if (queryOverride !== null) return queryOverride;

  const storageOverride = readStorageOverride(name);
  if (storageOverride !== null) return storageOverride;

  const override = config.envOverride ? import.meta.env[config.envOverride] : undefined;
  if (override === 'true') return true;
  if (override === 'false') return false;

  return config.default;
}
