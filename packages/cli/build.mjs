import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/moment.mjs',
  banner: { js: '#!/usr/bin/env node' },
  external: [],
  sourcemap: true,
});
