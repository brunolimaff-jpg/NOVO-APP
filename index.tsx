import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import './index.css';
import { SupabaseAuthProvider } from './contexts/AuthContext';
import { OperatorProvider } from './contexts/OperatorContext';
import { ModeProvider } from './contexts/ModeContext';
import ErrorBoundary from './components/ErrorBoundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatStoreProvider } from './stores/chatStore';
import { DossierStoreProvider } from './stores/dossierStore';
import { flushDiagnosticsNow, setupHeartbeat, setupVisibilityTracking } from './utils/diagnosticLog';

// ── Sentry: monitoramento de erros em producao ──
const sentryRelease =
  import.meta.env.VITE_SENTRY_RELEASE ||
  import.meta.env.VITE_APP_VERSION ||
  import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ||
  undefined;

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.PROD ? 'production' : 'development',
  release: sentryRelease,
  dist: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || undefined,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: import.meta.env.PROD ? 0.05 : 1.0,
  replaysSessionSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  replaysOnErrorSampleRate: import.meta.env.PROD ? 1.0 : 1.0,
  enabled: Boolean(import.meta.env.VITE_SENTRY_DSN),
  denyUrls: [/extensions\//, /^chrome-extension:\/\//, /^moz-extension:\/\//],
  beforeSend(event) {
    const message = event.exception?.values?.[0]?.type ?? '';
    const value = event.exception?.values?.[0]?.value ?? '';
    // Ignora erros de carregamento de chunk (tratados pelo ChunkRetry)
    if (
      message === 'ChunkLoadError' ||
      value.includes('Loading chunk') ||
      value.includes('Failed to fetch dynamically imported module')
    ) {
      return null;
    }
    return event;
  },
});

// ─── QW-6: Validação de ENV obrigatórias antes de montar a árvore React ─────
const REQUIRED_ENV_VARS: Array<{ key: string; label: string }> = [];

// ATENÇÃO: Pinecone é usado apenas nas serverless functions (api/rag.ts, api/docs-rag.ts)
// via PINECONE_API_KEY (sem prefixo VITE_). NUNCA usar VITE_ para chaves secretas,
// pois o Vite inlineia todo VITE_* no bundle JavaScript, expondo-as no navegador.
const OPTIONAL_ENV_VARS: Array<{ key: string; label: string }> = [
  { key: 'VITE_BACKEND_URL', label: 'URL do backend (Apps Script)' },
];

function getMissingVars(vars: typeof REQUIRED_ENV_VARS): string[] {
  return vars.filter(({ key }) => !import.meta.env[key]).map(({ label }) => label);
}

const missingRequired = getMissingVars(REQUIRED_ENV_VARS);
const missingOptional = getMissingVars(OPTIONAL_ENV_VARS);

if (missingRequired.length > 0) {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    rootEl.innerHTML = `
      <div style="
        display: flex; align-items: center; justify-content: center;
        min-height: 100dvh; background: #0f172a; font-family: ui-monospace, monospace;
        padding: 2rem;
      ">
        <div style="
          max-width: 560px; width: 100%;
          background: #1e293b; border: 1px solid #334155;
          border-radius: 12px; padding: 2rem;
          color: #e2e8f0;
        ">
          <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">
            <span style="font-size:1.5rem">⚠️</span>
            <h1 style="font-size:1.125rem;font-weight:600;color:#f87171;margin:0">
              Variáveis de ambiente não configuradas
            </h1>
          </div>
          <p style="font-size:0.875rem;color:#94a3b8;margin-bottom:1.25rem;line-height:1.6">
            As seguintes variáveis obrigatórias estão ausentes. O app não pode inicializar sem elas.
          </p>
          <ul style="margin:0 0 1.25rem;padding-left:1.25rem;font-size:0.875rem;color:#fca5a5">
            ${missingRequired.map(l => `<li style="margin-bottom:0.375rem">${l}</li>`).join('')}
          </ul>
          <p style="font-size:0.8rem;color:#64748b;line-height:1.6">
            Crie um arquivo <code style="background:#0f172a;padding:0.1rem 0.4rem;border-radius:4px">.env.local</code> na raiz do projeto
            (ou configure as variáveis no painel do Vercel) e reinicie o servidor.
          </p>
        </div>
      </div>
    `;
  }
  throw new Error(`[Scout Boot] Variáveis obrigatórias ausentes: ${missingRequired.join(', ')}`);
}

if (missingOptional.length > 0 && import.meta.env.DEV) {
  console.warn('[Scout Boot] Variáveis opcionais não configuradas (funcionalidades degradadas):', missingOptional);
}
// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// Desregistra Service Workers antigos e limpa cache em TODOS os ambientes.
// Em previews do Vercel, o alias da branch é fixo — o SW do deploy anterior
// serve assets cacheados velhos, sem nossas correções. Safari ignora SW.
// Só mantemos o SW em PWA instalado (standalone/display-mode).
if (typeof window !== 'undefined') {
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
  if (!isStandalone) {
    void navigator.serviceWorker?.getRegistrations?.().then(registrations => {
      registrations.forEach(r => void r.unregister());
    });
    void window.caches?.keys?.().then(keys => {
      keys.forEach(k => void window.caches.delete(k));
    });
  }
}

// ── Global error listeners — enviam stack + flush imediato dos diagnósticos ──
if (typeof window !== 'undefined') {
  window.addEventListener('error', event => {
    const { message, filename, lineno, colno, error } = event;
    console.error('[Scout360][GlobalError] uncaught error', {
      message,
      filename,
      lineno,
      colno,
      stack: error instanceof Error ? error.stack : undefined,
    });
    flushDiagnosticsNow('global-error');
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    console.error('[Scout360][GlobalError] unhandled rejection', {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    flushDiagnosticsNow('unhandled-rejection');
  });

  // ── Visibility tracking: monitora hidden/visible, pagehide, pageshow, freeze/resume ──
  setupVisibilityTracking();

  // ── Heartbeat de diagnostico a cada 30s ──
  setupHeartbeat();
}

const root = createRoot(rootElement);

root.render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ChatStoreProvider>
        <DossierStoreProvider>
          <SupabaseAuthProvider>
            <OperatorProvider>
              <ModeProvider>
                <App />
              </ModeProvider>
            </OperatorProvider>
          </SupabaseAuthProvider>
        </DossierStoreProvider>
      </ChatStoreProvider>
    </QueryClientProvider>
  </ErrorBoundary>,
);
