import { defineConfig } from 'vitest/config';

// `vitest run` at the root runs the root infrastructure specs plus every
// package's own config. Turbo runs each package's config directly.
export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: {
      junit: 'test-results/junit.xml',
    },
    projects: [
      {
        test: {
          name: 'root',
          include: ['__tests__/**/*.spec.ts'],
          globals: true,
        },
      },
      'packages/*',
    ],
  },
});
