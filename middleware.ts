export const config = {
  runtime: 'nodejs',
};

const ALLOWED_ORIGINS = new Set(
  [
    process.env.ALLOWED_ORIGIN,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    'https://scoutagro.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean) as string[],
);

export default function middleware(request: Request) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.method !== 'OPTIONS') {
    return;
  }

  const origin = request.headers.get('origin') || '';
  const isVercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
  const isAllowed = ALLOWED_ORIGINS.has(origin) || isVercelPreview;

  const headers = new Headers();
  if (isAllowed) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-Requested-With, Accept');

  return new Response(null, { status: 204, headers });
}
