// Flat ESLint config (ESLint 9+).
// Rules tuned for solo-dev DX: catches real bugs, doesn't fight the developer.
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // We use the new JSX transform (React 17+); React doesn't need to be in scope.
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // PropTypes are overkill for a private app; we'll add TypeScript later if it matters.
      'react/prop-types': 'off',

      // Allow unused destructured rest patterns (e.g. `const { x, ...rest } = obj`)
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],

      // Empty catch blocks are fine when commented; warn only.
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    // Local Capacitor plugins ship a small web fallback that touches
    // browser globals (window). Give them the same environment as src/.
    files: ['local-plugins/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['src/**/__tests__/**/*.{js,jsx}', 'src/**/*.test.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        // Vitest globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
  },
  {
    ignores: [
      'dist/**',
      'ios/**',
      'build/**',
      'node_modules/**',
      'coverage/**',
    ],
  },
];
