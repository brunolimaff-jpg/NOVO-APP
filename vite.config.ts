import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';
import ReactCompilerPlugin from 'babel-plugin-react-compiler';
import { readFileSync, writeFileSync } from 'fs';
import type { Plugin } from 'vite';

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

export default defineConfig(() => {
  const isPreviewBuild = process.env.VERCEL_ENV === 'preview';

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        // Em dev local, evita CORS do browser usando proxy same-origin.
        '/api/gemini': {
          target: 'https://scoutagro.vercel.app',
          changeOrigin: true,
          secure: true,
        },
        '/api/radar-scan': {
          target: 'https://scoutagro.vercel.app',
          changeOrigin: true,
          secure: true,
        },
        '/api/gerar-dossie': {
          target: 'https://scoutagro.vercel.app',
          changeOrigin: true,
          secure: true,
        },
      },
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
          manualChunks: {
            vendor: ['react', 'react-dom'],
            // FIX: chunk com nome fixo evita hash variável a cada deploy.
            // Sem isso, o browser busca mermaid-aBc123.js que não existe mais
            // após redeploy, recebendo index.html com MIME text/html → erro fatal.
            mermaid: ['mermaid'],
            // FIX: isola módulos raiz em chunk dedicado — avaliados ANTES dos
            // componentes que os importam, prevenindo TDZ no bundle minificado.
            // geminiProxy.ts incluído pois suas funções são importadas por
            // geminiService.ts e warRoomService.ts (alto risco de TDZ).
            'app-core': [
              './constants.ts',
              './types.ts',
              './services/investigationStore.ts',
              './services/geminiProxy.ts',
            ],
          },
        },
      },
    },
  };
});
