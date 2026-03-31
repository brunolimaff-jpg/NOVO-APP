import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { ModeProvider } from './contexts/ModeContext';
import { CRMProvider } from './contexts/CRMContext';
import ErrorBoundary from './components/ErrorBoundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
