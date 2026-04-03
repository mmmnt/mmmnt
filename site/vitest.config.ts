import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
});
