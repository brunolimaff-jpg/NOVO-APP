export const ALLOWED_ORIGINS = new Set(
  [
    process.env.ALLOWED_ORIGIN,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    'https://scoutagro.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean) as string[],
);
