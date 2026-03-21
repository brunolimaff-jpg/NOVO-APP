import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { ModeProvider } from './contexts/ModeContext';
import { CRMProvider } from './contexts/CRMContext';
import ErrorBoundary from './components/ErrorBoundary';
import { ClerkProvider } from '@clerk/react';
import { TEMPORARILY_DISABLE_CLERK } from './contexts/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min — sessões remotas não mudam com frequência
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Evita que um Service Worker antigo contamine o ambiente local/dev com assets desatualizados.
if (typeof window !== 'undefined') {
  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (import.meta.env.DEV || isLocalHost) {
    void navigator.serviceWorker?.getRegistrations?.().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    });
    void window.caches?.keys?.().then((keys) => {
      keys.forEach((key) => {
        void window.caches.delete(key);
      });
    });
  }
}

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_dG91Z2gta2l3aS05MS5jbGVyay5hY2NvdW50cy5kZXYk';

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY — configure it in your .env file")
}

const root = createRoot(rootElement);
const appTree = (
  <AuthProvider>
    <ModeProvider>
      <CRMProvider>
        <App />
      </CRMProvider>
    </ModeProvider>
  </AuthProvider>
);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {TEMPORARILY_DISABLE_CLERK ? (
          appTree
        ) : (
          <ClerkProvider publishableKey={PUBLISHABLE_KEY} appearance={{ variables: { colorPrimary: '#059669' } }}>
            {appTree}
          </ClerkProvider>
        )}
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
