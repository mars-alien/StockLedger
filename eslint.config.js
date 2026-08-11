import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'server/prisma/migrations/**',
      'server/generated/**',
    ],
  },
  js.configs.recommended,

  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-return-await': 'error',
      'prefer-const': 'error',
    },
  },

  // Prisma is the model layer's private dependency. config/db.js owns the client;
  // everything above the models talks to the database through a model function.
  {
    files: ['server/**/*.js'],
    ignores: ['server/models/**', 'server/config/db.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message: 'Import Prisma only in server/models/ or server/config/db.js.',
            },
          ],
        },
      ],
    },
  },

  // Controllers delegate to a service. Reaching straight for a model would put
  // business logic one layer too high.
  {
    files: ['server/controllers/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/models/*', '../models/*'],
              message: 'Controllers call services, not models.',
            },
          ],
        },
      ],
    },
  },

  // Services must stay callable from the seeder and from tests, so they never
  // see an Express request or response.
  {
    files: ['server/services/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'express', message: 'Services must not depend on Express.' }],
        },
      ],
    },
  },

  {
    files: ['server/tests/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  {
    files: ['frontend/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-console': ['error', { allow: ['error'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]' }],
    },
  },

  prettier,
];
