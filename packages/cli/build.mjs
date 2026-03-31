import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/moment.mjs',
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire as __createRequire } from "node:module";',
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
  external: ['typescript'],
  sourcemap: true,
  define: {
    __GH_APP_CLIENT_ID__: JSON.stringify(process.env.GH_APP_CLIENT_ID ?? ''),
  },
});
