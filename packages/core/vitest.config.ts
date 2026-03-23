import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    reporters: ['default', 'junit'],
    outputFile: {
      junit: 'test-results/junit.xml',
    },
    coverage: {
      provider: 'v8',
      exclude: ['src/generated/**'],
      thresholds: {
        lines: 95,
        branches: 95,
        functions: 95,
        statements: 95,
      },
    },
  },
});
