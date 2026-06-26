import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import ReactCompilerPlugin from 'babel-plugin-react-compiler';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { readFileSync, writeFileSync } from 'fs';
import type { Plugin, ProxyOptions } from 'vite';
import { LOCAL_DEV_API_PROXY_PATHS, LOCAL_DEV_API_PROXY_TARGET } from './config/localDevApiProxy';

// Plugin customizado para gerar version.json em build
function generateVersionPlugin(): Plugin {
  return {
    name: 'generate-version',
    apply: 'build',
    writeBundle() {
      const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as {
        version?: string;
      };
      const version = packageJson.version || '0.0.0';
      const appVersion = `v${version}`;

      const versionData = {
        version: appVersion,
        timestamp: new Date().toISOString(),
      };

      writeFileSync(resolve(__dirname, 'dist/version.json'), JSON.stringify(versionData, null, 2), 'utf-8');

      console.log(`✅ version.json gerado: ${appVersion}`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const localApiProxyTarget = env.LOCAL_DEV_API_PROXY_TARGET || LOCAL_DEV_API_PROXY_TARGET;
  const localApiProxyHeaders = env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? { 'x-vercel-protection-bypass': env.VERCEL_AUTOMATION_BYPASS_SECRET }
    : undefined;
  const localApiProxy = Object.fromEntries(
    LOCAL_DEV_API_PROXY_PATHS.map(path => [
      path,
      {
        target: localApiProxyTarget,
        changeOrigin: true,
        secure: true,
        headers: localApiProxyHeaders,
      } satisfies ProxyOptions,
    ]),
  );

  return {
    // Build metadata exposto em runtime para diagnóstico client-side
    define: {
      __BUILD_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || 'local'),
      __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV || 'local'),
      __BUILD_TS__: JSON.stringify(new Date().toISOString()),
      // Expor SENTRY_DSN da integracao Vercel para o client (Vite so expoe vars com prefixo VITE_)
      // So aplica quando SENTRY_DSN existe (build Vercel); local dev usa VITE_SENTRY_DSN do .env nativo
      ...(env.SENTRY_DSN && !process.env.VITEST
        ? { 'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(env.SENTRY_DSN) }
        : {}),
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: localApiProxy,
    },
    plugins: [
      generateVersionPlugin(),
      react({
        babel: {
          plugins: mode !== 'production' ? [ReactCompilerPlugin] : [],
        },
      }),
      // PWA/Service Worker removido (PR #334).
      // Production estava servindo bundles antigos via SW cache,
      // causando overlay hero preso após deploys.
      Boolean(env.SENTRY_AUTH_TOKEN) &&
        sentryVitePlugin({
          org: env.SENTRY_ORG || 's-3j',
          project: env.SENTRY_PROJECT || 'scout-360',
          authToken: env.SENTRY_AUTH_TOKEN,
          sourcemaps: {
            assets: ['./dist/**'],
            ignore: ['node_modules'],
          },
          release: {
            name:
              env.APP_VERSION || `v${JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')).version}`,
          },
        }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': resolve(__dirname, '.'),
        '~': resolve(__dirname, '.'),
      },
    },
    build: {
      sourcemap: true,
      modulePreload: { polyfill: true },
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        external: [],
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/mermaid/')) return 'mermaid';
            if (id.includes('/node_modules/framer-motion/')) return 'vendor-anim';
            if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'vendor';
            if (
              id.includes('/constants.ts') ||
              id.includes('/types.ts') ||
              id.includes('/services/investigationStore.ts') ||
              id.includes('/services/geminiProxy.ts')
            )
              return 'app-core';
          },
        },
      },
    },
  };
});
