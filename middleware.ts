import { ALLOWED_ORIGINS, isVercelPreview } from './api/_allowed-origins.js';

export default function middleware(request: Request) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.method !== 'OPTIONS') {
    return;
  }

  const origin = request.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.has(origin) || isVercelPreview(origin);

  const headers = new Headers();
  if (isAllowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  headers.set(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
  );

  return new Response(null, { status: 204, headers });
}
