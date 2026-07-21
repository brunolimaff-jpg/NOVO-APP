import { describe, expect, it } from 'vitest';
import { LOCAL_DEV_API_PROXY_PATHS, LOCAL_DEV_API_PROXY_TARGET } from '../../config/localDevApiProxy';

describe('local dev API proxy', () => {
  it('keeps Vite dev aligned with serverless routes used by the app', () => {
    expect(LOCAL_DEV_API_PROXY_TARGET).toBe('https://scoutagro.vercel.app');
    expect(LOCAL_DEV_API_PROXY_PATHS).toEqual(
      expect.arrayContaining([
        '/api/gemini',
        '/api/open-web-search',
        '/api/link-status',
        '/api/extract-content',
        '/api/rag',
      ]),
    );
  });
});
