import type { WebVerificationStatus } from '../types';

export interface VerifiedSource {
  title: string;
  url: string;
  verification?: 'grounding' | 'fallback';
}

export interface ModuleVerificationUpdate {
  moduleName: string;
  status: WebVerificationStatus;
  sources: VerifiedSource[];
}

export function normalizeVerificationStatus(
  status: WebVerificationStatus | undefined,
  groundingUsed?: boolean,
): WebVerificationStatus {
  if (status) return status;
  if (groundingUsed === true) return 'verified';
  if (groundingUsed === false) return 'unverified';
  return 'not_applicable';
}

export function hasVerifiedWebSources(sources: Array<{ title: string; url: string }> | undefined): boolean {
  return Array.isArray(sources) && sources.some(source => /^https?:\/\//i.test(source.url || ''));
}

export function deriveVerificationStatusFromSources(
  sources: Array<{ title: string; url: string }> | undefined,
  fallbackUsed = false,
  required = true,
): WebVerificationStatus {
  if (!required) return 'not_applicable';
  if (!hasVerifiedWebSources(sources)) return 'unverified';
  return fallbackUsed ? 'fallback_verified' : 'verified';
}

export function getVerificationLabel(status: WebVerificationStatus): string {
  switch (status) {
    case 'verified':
      return 'Verificado na web';
    case 'fallback_verified':
      return 'Verificado via fallback web';
    case 'unverified':
      return 'Resposta sem verificacao web';
    case 'not_applicable':
    default:
      return '';
  }
}
