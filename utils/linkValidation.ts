import { scoutDiag } from './diagnosticLog';

export type LinkValidationState = 'valid' | 'broken' | 'unknown';

export interface LinkValidationResult {
  status: LinkValidationState;
  httpStatus?: number;
  note?: string;
}

export async function fetchLinkStatuses(urls: string[]): Promise<Record<string, LinkValidationResult>> {
  const uniqueUrls = Array.from(new Set((urls || []).filter(Boolean)));
  if (uniqueUrls.length === 0) return {};

  try {
    const response = await fetch('/api/link-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: uniqueUrls }),
    });

    if (!response.ok) {
      return {};
    }

    const data = await response.json();
    return data?.results || {};
  } catch (err) {
    scoutDiag.warn('LinkValidation', 'Falha na verificação de link', {
      error: err instanceof Error ? err.message : String(err),
      urls: uniqueUrls.length,
    });
    return {};
  }
}
