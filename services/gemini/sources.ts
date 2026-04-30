import type { VerifiedSource } from '../../utils/webVerification';

export function normalizeGroundingSources(response: unknown): VerifiedSource[] {
  const out: VerifiedSource[] = [];
  const seen = new Set<string>();

  const pushIfValid = (title: unknown, url: unknown) => {
    const normalizedUrl = typeof url === 'string' ? url.trim() : '';
    if (!/^https?:\/\//i.test(normalizedUrl)) return;
    if (seen.has(normalizedUrl)) return;
    seen.add(normalizedUrl);
    out.push({
      title: (typeof title === 'string' && title.trim()) || normalizedUrl,
      url: normalizedUrl,
      verification: 'grounding',
    });
  };

  const r = (response || {}) as {
    sources?: unknown[];
    groundingChunks?: unknown[];
  };

  if (Array.isArray(r.sources)) {
    for (const item of r.sources) {
      const src = item as { title?: unknown; url?: unknown };
      pushIfValid(src.title, src.url);
    }
  }

  if (Array.isArray(r.groundingChunks)) {
    for (const chunk of r.groundingChunks) {
      const c = chunk as {
        web?: { title?: unknown; uri?: unknown; url?: unknown };
        retrievedContext?: { title?: unknown; uri?: unknown; url?: unknown };
        title?: unknown;
        uri?: unknown;
        url?: unknown;
      };
      pushIfValid(c.web?.title, c.web?.uri || c.web?.url);
      pushIfValid(c.retrievedContext?.title, c.retrievedContext?.uri || c.retrievedContext?.url);
      pushIfValid(c.title, c.uri || c.url);
    }
  }

  return out;
}
