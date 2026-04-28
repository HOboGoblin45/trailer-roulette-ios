import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/ios/**', '**/__tests__/**', 'vite.config.js', 'vitest.config.js', 'eslint.config.js'],
    },
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
  },
});
