import type { VercelResponse } from '@vercel/node';

/**
 * Define headers básicos de segurança em todas as respostas de API serverless.
 * Chamar no início de cada handler antes de qualquer res.status()/res.json().
 *
 * Headers:
 * - X-Content-Type-Options: previne MIME sniffing (navegador não interpreta tipo diferente do declarado)
 * - X-Frame-Options: previne clickjacking (página não pode ser嵌入 em iframe)
 * - X-XSS-Protection: ativa filtro XSS legado em navegadores antigos
 * - Referrer-Policy: controla envio do header Referer para evitar vazamento de URL
 */
export function setSecurityHeaders(res: VercelResponse): void {
  if (typeof res.setHeader !== 'function') return;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}
