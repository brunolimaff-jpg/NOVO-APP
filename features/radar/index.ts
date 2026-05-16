export * from './types';

export { useRadar } from './useRadar';
export type { UseRadarReturn } from './useRadar';

export {
  RadarScanError,
  buildCategoryPrompt,
  fetchRadarAlerts,
  generateAlertId,
} from './service';

export type {
  RadarCategoryStat,
  RadarPartialFailure,
  RadarScanErrorCode,
  RadarScanResult,
} from './service';
