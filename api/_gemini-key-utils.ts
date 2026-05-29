export function isQuotaExhausted(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /RESOURCE_EXHAUSTED|check quota|rate.?limit/i.test(message) || /"code"\s*:\s*429/.test(message);
}

export function isBillingOrPermissionDenied(error: unknown): boolean {
  const err = error as Record<string, unknown>;
  if (typeof err.status === 'number' && err.status === 403) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /dunning|PERMISSION_DENIED|billing/i.test(message) || /"code"\s*:\s*403/.test(message);
}
