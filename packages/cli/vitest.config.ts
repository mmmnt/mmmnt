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
      thresholds: {
        lines: 75,
        branches: 75,
        functions: 75,
        statements: 75,
      },
    },
  },
});
