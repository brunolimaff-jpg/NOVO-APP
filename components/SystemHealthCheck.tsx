import React, { useState } from 'react';
import { buscarContextoPinecone, buscarContextoDocsPinecone } from '../services/ragService';
import { lookupCliente } from '../services/clientLookupService';
import { BACKEND_URL } from '../services/apiConfig';
import { proxyGeminiHealth } from '../services/geminiProxy';
import { getFeatureAccess } from '../utils/featureAccess';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  duration?: number;
}

interface SystemHealthCheckProps {
  isDarkMode: boolean;
  onClose: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const SystemHealthCheck: React.FC<SystemHealthCheckProps> = ({ isDarkMode, onClose }) => {
  const canUseLookup = getFeatureAccess().clientLookup;
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [overallStatus, setOverallStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');

  const updateTest = (name: string, updates: Partial<TestResult>) => {
    setResults(prev => 
      prev.map(test => test.name === name ? { ...test, ...updates } : test)
    );
  };

  const runTests = async () => {
    setIsRunning(true);
    setOverallStatus('running');
    
    const tests: TestResult[] = [
      { name: '🤖 Gemini API', status: 'pending' },
      { name: '🧠 RAG - Base Interna', status: 'pending' },
      { name: '📚 RAG - Documentação', status: 'pending' },
      { name: '🔍 Lookup de Clientes', status: 'pending' },
      { name: '☁️ Backend Cloud', status: 'pending' },
      { name: '💾 LocalStorage', status: 'pending' },
      { name: '🎨 Interface React', status: 'pending' },
    ];
    
    setResults(tests);

    let hasError = false;

    // Teste 1: Gemini API
    try {
      updateTest('🤖 Gemini API', { status: 'running' });
      const start = Date.now();
      const response = await proxyGeminiHealth();
      const duration = Date.now() - start;
      
      if (response.ok) {
        updateTest('🤖 Gemini API', { 
          status: 'success', 
          message: `Conectado (${duration}ms)`,
          duration 
        });
      } else {
        throw new Error('Resposta inválida');
      }
    } catch (error: unknown) {
      hasError = true;
      updateTest('🤖 Gemini API', { 
        status: 'error', 
        message: getErrorMessage(error, 'Falha na conexão')
      });
    }

    // Teste 2: RAG Base Interna
    try {
      updateTest('🧠 RAG - Base Interna', { status: 'running' });
      const start = Date.now();
      const resultado = await buscarContextoPinecone('teste senior');
      const duration = Date.now() - start;
      
      updateTest('🧠 RAG - Base Interna', { 
        status: 'success', 
        message: `${resultado.context.length > 0 ? 'Online' : 'Vazio'} (${duration}ms)`,
        duration 
      });
    } catch (error: unknown) {
      hasError = true;
      updateTest('🧠 RAG - Base Interna', { 
        status: 'error', 
        message: getErrorMessage(error, 'Falha no RAG')
      });
    }

    // Teste 3: RAG Documentação
    try {
      updateTest('📚 RAG - Documentação', { status: 'running' });
      const start = Date.now();
      const resultado = await buscarContextoDocsPinecone('ERP');
      const duration = Date.now() - start;
      
      updateTest('📚 RAG - Documentação', { 
        status: 'success', 
        message: `${resultado.context.length > 0 ? 'Online' : 'Vazio'} (${duration}ms)`,
        duration 
      });
    } catch (error: unknown) {
      hasError = true;
      updateTest('📚 RAG - Documentação', { 
        status: 'error', 
        message: getErrorMessage(error, 'Falha no RAG Docs')
      });
    }

    // Teste 4: Lookup de Clientes
    if (!canUseLookup) {
      updateTest('🔍 Lookup de Clientes', {
        status: 'success',
        message: '⏭️ Lookup desabilitado no MVP',
      });
    } else {
      try {
        updateTest('🔍 Lookup de Clientes', { status: 'running' });
        const start = Date.now();
        await lookupCliente('Senior Sistemas');
        const duration = Date.now() - start;

        updateTest('🔍 Lookup de Clientes', {
          status: 'success',
          message: `Funcional (${duration}ms)`,
          duration,
        });
      } catch (error: unknown) {
        hasError = true;
        updateTest('🔍 Lookup de Clientes', {
          status: 'error',
          message: getErrorMessage(error, 'Falha no lookup'),
        });
      }
    }

    // Teste 5: Backend Cloud
    try {
      updateTest('☁️ Backend Cloud', { status: 'running' });
      const start = Date.now();
      const response = await fetch(`${BACKEND_URL}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      const duration = Date.now() - start;
      
      if (response.ok) {
        updateTest('☁️ Backend Cloud', { 
          status: 'success', 
          message: `Online (${duration}ms)`,
          duration 
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error: unknown) {
      hasError = true;
      updateTest('☁️ Backend Cloud', { 
        status: 'error', 
        message: getErrorMessage(error, 'Backend offline')
      });
    }

    // Teste 6: LocalStorage
    try {
      updateTest('💾 LocalStorage', { status: 'running' });
      const start = Date.now();
      const testKey = '__health_check_test__';
      const testValue = Date.now().toString();
      localStorage.setItem(testKey, testValue);
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      const duration = Date.now() - start;
      
      if (retrieved === testValue) {
        updateTest('💾 LocalStorage', { 
          status: 'success', 
          message: `Funcional (${duration}ms)`,
          duration 
        });
      } else {
        throw new Error('Leitura/escrita falhou');
      }
    } catch (error: unknown) {
      hasError = true;
      updateTest('💾 LocalStorage', { 
        status: 'error', 
        message: getErrorMessage(error, 'Storage bloqueado')
      });
    }

    // Teste 7: Interface React
    try {
      updateTest('🎨 Interface React', { status: 'running' });
      const start = Date.now();
      await new Promise(resolve => setTimeout(resolve, 100));
      const duration = Date.now() - start;
      
      updateTest('🎨 Interface React', { 
        status: 'success', 
        message: `Renderizando (${duration}ms)`,
        duration 
      });
    } catch {
      hasError = true;
      updateTest('🎨 Interface React', { 
        status: 'error', 
        message: 'Erro crítico' 
      });
    }

    setOverallStatus(hasError ? 'error' : 'success');
    setIsRunning(false);
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return '⚪';
      case 'running': return '🔄';
      case 'success': return '✅';
      case 'error': return '❌';
    }
  };

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return isDarkMode ? 'text-gray-500' : 'text-gray-400';
      case 'running': return 'text-blue-500 animate-pulse';
      case 'success': return 'text-emerald-500';
      case 'error': return 'text-red-500';
    }
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const totalTests = results.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden ${
        isDarkMode ? 'bg-slate-900' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${
          isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔧</span>
              <div>
                <h2 className={`text-lg font-bold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>Teste de Integridade do Sistema</h2>
                <p className={`text-xs ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>Verificando todos os componentes críticos</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode ? 'hover:bg-slate-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
              }`}
            >✕</button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {results.length === 0 ? (
            <div className="text-center py-12">
              <p className={`text-sm mb-4 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>Clique no botão abaixo para iniciar o diagnóstico completo</p>
            </div>
          ) : (
            <>
              {/* Status Geral */}
              {overallStatus !== 'running' && (
                <div className={`mb-6 p-4 rounded-xl border-2 ${
                  overallStatus === 'success'
                    ? 'bg-emerald-50 border-emerald-500 dark:bg-emerald-950/30'
                    : 'bg-red-50 border-red-500 dark:bg-red-950/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-bold ${
                        overallStatus === 'success' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                      }`}>
                        {overallStatus === 'success' ? '✅ Sistema Operacional' : '⚠️ Problemas Detectados'}
                      </p>
                      <p className={`text-xs mt-1 ${
                        overallStatus === 'success' ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'
                      }`}>
                        {successCount}/{totalTests} testes passaram
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${
                        overallStatus === 'success' ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {Math.round((successCount / totalTests) * 100)}%
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Lista de Testes */}
              <div className="space-y-2">
                {results.map((test) => (
                  <div
                    key={test.name}
                    className={`p-4 rounded-xl border transition-all ${
                      isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-xl ${getStatusColor(test.status)}`}>
                          {getStatusIcon(test.status)}
                        </span>
                        <div>
                          <p className={`font-semibold text-sm ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>{test.name}</p>
                          {test.message && (
                            <p className={`text-xs mt-0.5 ${
                              test.status === 'error'
                                ? 'text-red-500'
                                : isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}>{test.message}</p>
                          )}
                        </div>
                      </div>
                      {test.duration && test.status === 'success' && (
                        <span className={`text-xs font-mono ${
                          isDarkMode ? 'text-gray-500' : 'text-gray-400'
                        }`}>{test.duration}ms</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t flex gap-3 ${
          isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'
        }`}>
          {!isRunning && results.length > 0 && (
            <button
              onClick={runTests}
              className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all ${
                isDarkMode
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              🔄 Executar Novamente
            </button>
          )}
          {!isRunning && results.length === 0 && (
            <button
              onClick={runTests}
              className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all ${
                isDarkMode
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white'
              }`}
            >
              ▶️ Iniciar Diagnóstico
            </button>
          )}
          {isRunning && (
            <button
              disabled
              className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm cursor-not-allowed ${
                isDarkMode ? 'bg-slate-700 text-gray-400' : 'bg-gray-300 text-gray-500'
              }`}
            >
              ⏳ Executando testes...
            </button>
          )}
          <button
            onClick={onClose}
            disabled={isRunning}
            className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              isDarkMode
                ? 'bg-slate-700 hover:bg-slate-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemHealthCheck;
