import type { VerifiedSource } from './webVerification';
import { normalizeSourceUrl } from './textCleaners';

export interface DossierSourceRef {
  title: string;
  url: string;
  verification?: 'grounding' | 'fallback';
  moduleName?: string;
  /** BRU-158 Q1 — proveniência de evidência coletada (EvidencePack do PipelineV2). */
  evidenceTier?: string;
  entityMatch?: string;
  queryOrigin?: string;
  extractedClaim?: string;
}

export function normalizeDossierSourceUrl(url: string): string {
  return normalizeSourceUrl(url);
}

export type GroundingSourceLike = {
  title: string;
  url: string;
  verification?: 'grounding' | 'fallback';
};

/** Normaliza payload legado/corrompido (objeto único, null, etc.) para array seguro. */
export function coerceGroundingSources(raw: unknown): GroundingSourceLike[] {
  if (!raw) return [];

  const toSource = (item: Record<string, unknown>): GroundingSourceLike | null => {
    const url = String(item.url || '').trim();
    const title = String(item.title || url).trim();
    if (!url && !title) return null;
    const verification = item.verification;
    return {
      title: title || url,
      url,
      verification: verification === 'grounding' || verification === 'fallback' ? verification : undefined,
    };
  };

  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map(toSource)
      .filter((item): item is GroundingSourceLike => item !== null);
  }

  if (typeof raw === 'object') {
    const single = toSource(raw as Record<string, unknown>);
    return single ? [single] : [];
  }

  return [];
}

export function mergeDossierSourceRefs(
  existing: DossierSourceRef[],
  incoming: Array<DossierSourceRef>,
): DossierSourceRef[] {
  const out = [...existing];
  const seen = new Set(existing.map(s => normalizeSourceUrl(s.url)));

  for (const source of incoming) {
    const normalized = normalizeSourceUrl(source.url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({
      ...source,
      title: source.title || normalized,
      url: normalized,
      verification: source.verification,
      moduleName: source.moduleName,
    });
  }

  return out;
}

export function verifiedSourcesToPool(sources: VerifiedSource[], moduleName?: string): DossierSourceRef[] {
  return sources
    .map(source => ({
      title: source.title || source.url,
      url: source.url,
      verification: source.verification,
      moduleName,
    }))
    .filter(source => Boolean(source.url?.trim()));
}

/**
 * Bloco injetado no extraContext de cada módulo do waterfall.
 * O modelo só deve citar URLs listadas aqui.
 */
export function connectEvidencePackToPool(
  pack: {
    items: Array<{
      usableForReport: boolean;
      sourceResult: { url: string; title: string; snippet?: string };
      evidenceTier: string;
      entityMatch: string;
      queryOrigin: string;
      module: string;
      extractedClaim?: string;
    }>;
  },
  pool: DossierSourceRef[],
): DossierSourceRef[] {
  const usable = pack.items
    .filter(item => item.usableForReport)
    .map(item => ({
      title: item.sourceResult.title || item.sourceResult.url,
      url: item.sourceResult.url,
      verification: 'grounding' as const,
      moduleName: item.module,
      evidenceTier: item.evidenceTier,
      entityMatch: item.entityMatch,
      queryOrigin: item.queryOrigin,
      extractedClaim: item.extractedClaim,
    }));
  return mergeDossierSourceRefs(pool, usable);
}

export function formatAvailableSourcesForPrompt(pool: DossierSourceRef[]): string {
  if (!pool.length) {
    return [
      '',
      '[FONTES DISPONIVEIS PARA CITACAO]',
      'Nenhuma URL verificada foi retornada pelo grounding/busca nesta sessao ate o momento.',
      'NAO invente links. Use apenas texto sem href ou declare "sem fonte URL verificavel".',
      '',
    ].join('\n');
  }

  const lines = pool.map((source, index) => {
    const label = source.title?.trim() || source.url;
    const origin = source.moduleName ? ` (${source.moduleName})` : '';
    const tier = source.evidenceTier ? ` [tier=${source.evidenceTier}]` : '';
    const claim = source.extractedClaim ? ` claim: ${source.extractedClaim}` : '';
    return `${index + 1}. ${label} — ${source.url}${origin}${tier}${claim}`;
  });

  return ['', '[FONTES DISPONIVEIS PARA CITACAO — use SOMENTE estas URLs em [[n]](url)]', ...lines, ''].join('\n');
}

export function poolToGroundingPayload(
  pool: DossierSourceRef[],
): Array<{ title: string; url: string; verification?: 'grounding' | 'fallback' }> {
  return pool.map(source => ({
    title: source.title,
    url: source.url,
    verification: source.verification,
  }));
}
