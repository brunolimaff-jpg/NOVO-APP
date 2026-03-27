import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Regra compartilhada: no-console aplicada a todos os arquivos de script
const sharedRules = {
  'no-console': ['warn', { allow: ['warn', 'error'] }],
};

export default [
  // Ignora arquivos de build, backup e scripts de manutenção
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.agent/**',
      '.claude/**',
      'NOVO-APP/**',
      'tmp/**',
      'old.tsx',
      'old_appcore*.tsx',
      'fix*.cjs',
      'fix*.js',
      'restore*.cjs',
      'unescape*.cjs',
      'clean_refactor.cjs',
      'extract.cjs',
      'refactor_script.*',
      'view_ts.cjs',
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript files
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node,
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      ...sharedRules,
    },
  },

  // JavaScript files (sem TypeScript parser) — browser + node + es2022
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      ...sharedRules,
    },
  },

  // Service Worker files
  {
    files: ['**/sw.js', '**/workbox-*.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },

  // Prettier desativa regras conflitantes (sempre por último)
  prettier,
];
