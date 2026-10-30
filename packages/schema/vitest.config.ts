import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest 4 no longer skips build output by default; compiled tests in dist/ must not run.
    exclude: [...configDefaults.exclude, '**/dist/**'],
    globals: true,
    reporters: ['default', 'junit'],
    outputFile: {
      junit: 'test-results/junit.xml',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 90,
        branches: 88,
        functions: 90,
        statements: 90,
      },
    },
  },
});
