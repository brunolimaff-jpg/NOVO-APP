import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ModeProvider } from './contexts/ModeContext';
import { CRMProvider } from './contexts/CRMContext';
import ErrorBoundary from './components/ErrorBoundary';
import { ClerkProvider, SignIn, useAuth as useClerkAuth } from '@clerk/react';
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

/**
 * Gate que exige login via Clerk ou modo visitante antes de mostrar o app.
 * Enquanto o Clerk carrega, exibe um spinner; quando não autenticado, mostra <SignIn /> + botão visitante.
 */
const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { isAuthenticated, continueAsGuest } = useAuth();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isSignedIn && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 mb-4">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-6">Scout 360</h1>
          <SignIn appearance={{ variables: { colorPrimary: '#059669' } }} />
          <div className="mt-6">
            <button
              type="button"
              onClick={continueAsGuest}
              className="text-sm text-gray-400 hover:text-emerald-400 transition-colors underline underline-offset-4"
            >
              Continuar como visitante
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {TEMPORARILY_DISABLE_CLERK ? (
          <AuthProvider>
            <ModeProvider>
              <CRMProvider>
                <App />
              </CRMProvider>
            </ModeProvider>
          </AuthProvider>
        ) : (
          <ClerkProvider publishableKey={PUBLISHABLE_KEY} appearance={{ variables: { colorPrimary: '#059669' } }}>
            <AuthProvider>
              <AuthGate>
                <ModeProvider>
                  <CRMProvider>
                    <App />
                  </CRMProvider>
                </ModeProvider>
              </AuthGate>
            </AuthProvider>
          </ClerkProvider>
        )}
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
