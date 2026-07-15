import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/mcp.mjs',
  banner: {
    js: [
      '#!/usr/bin/env node',
      // vscode-jsonrpc (transitive via langium) uses dynamic require(); provide a
      // CommonJS-compatible require in this ESM bundle. Same shim as packages/cli.
      'import { createRequire as __createRequire } from "node:module";',
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
  // typescript cannot be bundled into an ESM bundle (__filename usage); it is
  // resolvable at runtime via @mmmnt/sync's runtime dependency. Same as packages/cli.
  external: ['typescript'],
  sourcemap: true,
});
