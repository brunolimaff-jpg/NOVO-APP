// services/radarService.ts
// Compatibility facade. The Radar service now lives under features/radar.

export { RadarScanError, buildCategoryPrompt, fetchRadarAlerts, generateAlertId } from '../features/radar/service';

export type {
  RadarCategoryStat,
  RadarPartialFailure,
  RadarScanErrorCode,
  RadarScanResult,
} from '../features/radar/service';
