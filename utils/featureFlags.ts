export type FeatureFlagName = 'deepDive' | 'warRoom' | 'newExportFlow' | 'radarV2';

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
};

export function getFlag(name: FeatureFlagName): boolean {
  const config = FEATURE_FLAGS[name];
  const override = config.envOverride ? import.meta.env[config.envOverride] : undefined;

  if (override === 'true') return true;
  if (override === 'false') return false;

  return config.default;
}
