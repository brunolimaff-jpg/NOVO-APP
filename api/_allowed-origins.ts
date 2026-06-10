export const ALLOWED_ORIGINS = new Set(
  [
    process.env.ALLOWED_ORIGIN,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    'https://scoutagro.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean) as string[],
);

/**
 * Verifica se a origem e um preview do projeto no Vercel.
 * O padrao de preview do Vercel inclui o identificador do projeto,
 * garantindo que apenas previews DESTE projeto sejam permitidos.
 */
export function isVercelPreview(origin: string): boolean {
  // Cobre dois formatos de preview Vercel do projeto:
  // 1. Branch preview: scoutagro-git-feat-algo-brunolimaff-3629s-projects.vercel.app
  // 2. Alias principal: scoutagro-brunolimaff-3629s-projects.vercel.app
  return /^https:\/\/scoutagro-(?:[a-z0-9-]+-)?brunolimaff-3629s-projects\.vercel\.app$/.test(origin);
}
