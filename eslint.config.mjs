import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';

export default [
  {
    ignores: ['**/dist/', '**/node_modules/', '**/src/generated/', 'examples/**/facet/'],
  },
  eslintComments.recommended,
  {
    files: ['**/*.ts', '**/*.mjs'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Ban @ts-ignore (allow @ts-expect-error instead)
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-expect-error': 'allow-with-description',
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
      // Ban eslint-disable comments without corresponding enable
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
      // Ban coverage-suppression inline comments
      'no-warning-comments': ['error', { terms: ['v8 ignore'], location: 'anywhere' }],
      // Complexity
      complexity: ['error', { max: 10 }],
    },
  },
];
