import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { ModeProvider } from './contexts/ModeContext';
import { CRMProvider } from './contexts/CRMContext';
import ErrorBoundary from './components/ErrorBoundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── QW-6: Validação de ENV obrigatórias antes de montar a árvore React ─────
const REQUIRED_ENV_VARS: Array<{ key: string; label: string }> = [
  { key: 'VITE_GEMINI_API_KEY', label: 'Chave da API Gemini' },
  { key: 'VITE_CLERK_PUBLISHABLE_KEY', label: 'Chave pública do Clerk' },
];

const OPTIONAL_ENV_VARS: Array<{ key: string; label: string }> = [
  { key: 'VITE_PINECONE_API_KEY', label: 'Chave Pinecone (RAG)' },
  { key: 'VITE_PINECONE_INDEX_HOST', label: 'Host do índice Pinecone' },
  { key: 'VITE_BACKEND_URL', label: 'URL do backend (Apps Script)' },
];

function getMissingVars(vars: typeof REQUIRED_ENV_VARS): string[] {
  return vars
    .filter(({ key }) => !import.meta.env[key])
    .map(({ label }) => label);
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
  throw new Error(
    `[Scout Boot] Variáveis obrigatórias ausentes: ${missingRequired.join(', ')}`,
  );
}

if (missingOptional.length > 0 && import.meta.env.DEV) {
  console.warn(
    '[Scout Boot] Variáveis opcionais não configuradas (funcionalidades degradadas):',
    missingOptional,
  );
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

// Em ambiente de desenvolvimento, desregistra Service Workers antigos para evitar
// que assets em cache contaminem o ambiente local.
if (typeof window !== 'undefined') {
  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (import.meta.env.DEV || isLocalHost) {
    void navigator.serviceWorker?.getRegistrations?.().then((registrations) => {
      registrations.forEach((r) => void r.unregister());
    });
    void window.caches?.keys?.().then((keys) => {
      keys.forEach((k) => void window.caches.delete(k));
    });
  }
}

const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ModeProvider>
            <CRMProvider>
              <App />
            </CRMProvider>
          </ModeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
