import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // FIX: resolve conflitos de ESM entre dependências do jsdom
    server: {
      deps: {
        inline: [
          "html-encoding-sniffer",
          "@exodus/bytes"
        ]
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      '~': resolve(__dirname, '.'),
    },
  },
});