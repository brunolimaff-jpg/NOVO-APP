import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';
import ReactCompilerPlugin from 'babel-plugin-react-compiler';
import { readFileSync, writeFileSync } from 'fs';
import type { Plugin, ProxyOptions } from 'vite';
import { LOCAL_DEV_API_PROXY_PATHS, LOCAL_DEV_API_PROXY_TARGET } from './config/localDevApiProxy';

// Plugin customizado para gerar version.json em build
function generateVersionPlugin(): Plugin {
  return {
    name: 'generate-version',
    apply: 'build',
    writeBundle() {
      // Ler versão do package.json
      const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as {
        version?: string;
      };
      const version = packageJson.version || '0.0.0';

      // Criar versão em formato legível (APP_VERSION)
      const appVersion = `v${version}`;

      const versionData = {
        version: appVersion,
        timestamp: new Date().toISOString(),
      };

      // Escrever version.json no diretório dist
      writeFileSync(
        resolve(__dirname, 'dist/version.json'),
        JSON.stringify(versionData, null, 2),
        'utf-8'
      );

      console.log(`✅ version.json gerado: ${appVersion}`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isPreviewBuild = process.env.VERCEL_ENV === 'preview';
  const localApiProxyTarget = env.LOCAL_DEV_API_PROXY_TARGET || LOCAL_DEV_API_PROXY_TARGET;
  const localApiProxyHeaders = env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? { 'x-vercel-protection-bypass': env.VERCEL_AUTOMATION_BYPASS_SECRET }
    : undefined;
  const localApiProxy = Object.fromEntries(
    LOCAL_DEV_API_PROXY_PATHS.map((path) => [
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
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Em dev local, evita CORS e aproxima o Vite das rotas serverless do Vercel.
      proxy: localApiProxy,
    },
    plugins: [
      generateVersionPlugin(),
      react({
        babel: {
          // FIX: React Compiler ativo APENAS em desenvolvimento.
          // Em produção, reescreve closures e causa TDZ:
          // "Cannot access 'Sn' before initialization" (símbolo minificado).
          plugins: process.env.NODE_ENV !== 'production' ? [ReactCompilerPlugin] : [],
        },
      }),
      !isPreviewBuild && VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon-192.svg', 'icons/icon-512.svg'],
        manifest: {
          name: '🦅 Senior Scout 360',
          short_name: 'Scout 360',
          description: 'Inteligência Comercial para Agronegócio · Sênior Sistemas',
          theme_color: '#059669',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          lang: 'pt-BR',
          icons: [
            {
              src: '/icons/icon-192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
            {
              src: '/icons/icon-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB — mermaid chunk ~3.1 MB
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          // Estratégias por tipo de recurso
          runtimeCaching: [
            // CDN externos (Tailwind, fonts, html2pdf) → NetworkFirst, cache 7 dias
            {
              urlPattern: /^https:\/\/(cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'cdn-cache',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
                networkTimeoutSeconds: 5,
              },
            },
            // API Gemini → NetworkOnly (respostas de IA nunca cacheadas)
            {
              urlPattern: /^https:\/\/generativelanguage\.googleapis\.com/,
              handler: 'NetworkOnly',
            },
            // Assets estáticos do próprio app → CacheFirst, 30 dias
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'static-assets',
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
          // Não cacheamos rotas de API ou tokens de sessão
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
        },
        devOptions: {
          // Ativa SW em desenvolvimento para facilitar testes
          enabled: false,
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
      // FIX: modulePreload polyfill garante carregamento dos chunks na ordem correta
      modulePreload: { polyfill: true },
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        external: [],
        output: {
          // FIX: função manualChunks para capturar TODOS os sub-módulos internos
          // do mermaid (styles, edges, graph, flowDiagram, layout, etc.) em um
          // único chunk. O formato objeto (`mermaid: ['mermaid']`) só isola o
          // entry point — os dynamic imports internos geravam sub-chunks com
          // hashes que não coincidiam após novo deploy no Vercel (404s).
          manualChunks(id) {
            if (id.includes('/node_modules/mermaid/')) return 'mermaid';
            if (id.includes('/node_modules/framer-motion/')) return 'vendor-anim';
            if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'vendor';
            if (
              id.includes('/constants.ts') ||
              id.includes('/types.ts') ||
              id.includes('/services/investigationStore.ts') ||
              id.includes('/services/geminiProxy.ts')
            ) return 'app-core';
          },
        },
      },
    },
  };
});
