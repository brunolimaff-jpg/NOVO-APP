import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 15_000,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:3000/',
      },
    },
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'App.tsx',
        'components/**/*.tsx',
        'hooks/**/*.ts',
        'utils/**/*.ts',
        'features/**/*.ts',
        'services/**/*.ts',
        'contexts/**/*.tsx',
        'stores/**/*.tsx',
        'api/**/*.ts',
        'prompts/**/*.ts',
      ],
      exclude: [
        '**/node_modules/**',
        'coverage/**',
        'dist/**',
        'tests/**',
        'tests-e2e/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/setup.*',
        'config/**',
        'nimbalyst-local/**',
      ],
      thresholds: {
        lines: 69,
        branches: 57,
        functions: 64,
        statements: 69,
      },
    },
    // FIX: resolve conflitos de ESM entre dependências do jsdom
    server: {
      deps: {
        inline: ['html-encoding-sniffer', '@exodus/bytes'],
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      '~': resolve(__dirname, '.'),
    },
  },
});
