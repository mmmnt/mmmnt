#!/usr/bin/env node
/**
 * Pack-and-install smoke test for every published @mmmnt/* package.
 *
 * WHY THIS EXISTS
 *
 * Workspace tests pass when the code works inside the monorepo, but they
 * don't exercise the published-artifact reality. A consumer running
 * `npm install @mmmnt/cli` in a fresh project goes through a different
 * code path than our unit tests: it unpacks the tarball, trusts whatever
 * is in package.json's `files`, `main`, `exports`, and `bin`, and
 * resolves `dependencies` from npmjs (or here, from peer tarballs in
 * the same install batch).
 *
 * Things that pass unit tests but can break the consumer install:
 *
 *   - A runtime `import` declared only in `devDependencies`
 *     (the langium bug fixed in #136 + #143's static audit)
 *   - `files` in package.json missing a dist file the code needs
 *   - `main` / `module` / `exports` pointing at a nonexistent path
 *   - `bin` script not executable or referencing a missing entry
 *   - Generated sources (e.g. src/generated/**) not actually in dist
 *   - Tree-shaking or bundler config that strips something runtime-needed
 *
 * None of these are caught by `vitest run`. All of them are caught here.
 *
 * HOW IT WORKS
 *
 *   1. `pnpm pack` every packages/<pkg> into a staging tmpdir, producing
 *      one .tgz per package.
 *   2. Build a consumer tmpdir with a package.json that depends on every
 *      @mmmnt/* tarball via file: references, so npm resolves the cross-
 *      package deps locally (testing the WORK IN PROGRESS, not whatever
 *      happens to be on npmjs).
 *   3. `npm install` inside the consumer dir.
 *   4. Smoke-test the CLI binary end-to-end:
 *        - `moment` (no args) → prints usage
 *        - `moment init --dir <proj> --name smoke` → writes .manifest.yaml
 *          and .moment/contexts + flows dirs
 *        - Copy a valid fixture .moment into the project
 *        - `moment parse <file>` → parses successfully
 *        - `moment generate --out <out> <file>` → writes TS, specs,
 *          features, docs to disk (this is the disk-write fix #136)
 *        - `moment emit-ts --out <out> <file>` → writes TS + scaffolds
 *        - `moment simulate --out-dir <out> --all <file>` → writes
 *          topology + scenarios + manifest.json
 *        - `moment serve <facet-dir>` → starts, binds port, serves the
 *          baked directory (the #139 feature)
 *      Each step asserts the expected files exist on disk afterward.
 *   5. Smoke-test every library package by dynamic `import()` — verifies
 *      the published main/exports path resolves and at least one symbol
 *      is reachable. Doesn't replace library-specific integration tests
 *      but catches broken `exports` maps and missing dist files.
 *   6. Clean up the staging dirs unless KEEP_SMOKE_DIR=1 is set.
 *
 * EXIT CODES
 *
 *   0 — all packages install cleanly and the CLI smoke path passes
 *   1 — any failure (missing file, CLI error, import failure, etc.)
 *
 * USAGE
 *
 *   node scripts/smoke-test-install.mjs [--keep]
 *   pnpm smoke:install
 */

import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEEP = process.argv.includes('--keep') || process.env.KEEP_SMOKE_DIR === '1';

const LIBRARY_PACKAGES = [
  '@mmmnt/core',
  '@mmmnt/derive',
  '@mmmnt/emit-ts',
  '@mmmnt/generate',
  '@mmmnt/harness',
  '@mmmnt/schema',
  '@mmmnt/sync',
  '@mmmnt/viz',
];

const BIN_PACKAGES = ['@mmmnt/cli', '@mmmnt/mcp'];
const ALL_PACKAGES = [...LIBRARY_PACKAGES, ...BIN_PACKAGES];

// Vet clinic has multiple contexts + flows + sagas + policies + crossings,
// so every codegen path (TS types, scaffolds, features, docs, simulate
// scenarios) produces non-empty output against it. A minimal flow-only
// fixture would legitimately produce 0 TS files because there are no
// aggregates to emit types for, masking real bugs in those paths.
const FIXTURE_SPEC = resolve(ROOT, 'fixtures/valid/unified/vet-clinic.moment');

const log = (msg) => console.log(`[smoke] ${msg}`);
const fail = (msg) => {
  console.error(`[smoke] ✗ ${msg}`);
  process.exit(1);
};

/** Build the spawnSync options from our friendlier run() opts. */
function spawnOptions(opts) {
  return {
    stdio: opts.capture ? 'pipe' : 'inherit',
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
  };
}

/** Format a command + args for log output. */
function prettyCmd(cmd, args) {
  return `${cmd} ${args.join(' ')}`;
}

/** Dump captured output to stderr (used when a captured command fails). */
function dumpCaptured(result) {
  console.error(result.stdout?.toString() ?? '');
  console.error(result.stderr?.toString() ?? '');
}

/** Run a command, stream stdout/stderr to our console, exit on failure. */
function run(cmd, args, opts = {}) {
  const pretty = prettyCmd(cmd, args);
  log(`$ ${pretty}${opts.cwd ? `   (cwd: ${opts.cwd})` : ''}`);
  const result = spawnSync(cmd, args, spawnOptions(opts));
  if (result.status !== 0) {
    if (opts.capture) dumpCaptured(result);
    fail(`command failed (exit ${result.status}): ${pretty}`);
  }
  return {
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
  };
}

/** Read package.json for a package in the workspace. */
function readPkg(pkgDir) {
  return JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
}

/** Pack a single workspace package into the staging dir, return tarball path. */
function packPackage(pkgDir, stagingDir) {
  run('pnpm', ['pack', '--pack-destination', stagingDir], { cwd: pkgDir });
  const pkg = readPkg(pkgDir);
  // pnpm names the tarball <name-with-dashes>-<version>.tgz, scoped packages
  // get the scope dropped and replaced with the package name (no slash).
  const flatName = pkg.name.replace('@', '').replace('/', '-');
  const tarball = join(stagingDir, `${flatName}-${pkg.version}.tgz`);
  if (!existsSync(tarball)) {
    // Fall back to "first tarball created" heuristic — name mangling rules
    // vary across pnpm versions.
    const candidates = readdirSync(stagingDir).filter(
      (f) => f.startsWith(flatName) && f.endsWith('.tgz'),
    );
    if (candidates.length === 0) {
      fail(`packed ${pkg.name} but no matching tarball in ${stagingDir}`);
    }
    return join(stagingDir, candidates[0]);
  }
  return tarball;
}

/** Assert a path exists; fail with a useful message if not. */
function assertExists(path, label) {
  if (!existsSync(path)) {
    fail(`${label}: expected path does not exist: ${path}`);
  }
}

function assertIsFile(path, label) {
  assertExists(path, label);
  if (!statSync(path).isFile()) {
    fail(`${label}: expected file, got directory: ${path}`);
  }
}

function assertIsDir(path, label) {
  assertExists(path, label);
  if (!statSync(path).isDirectory()) {
    fail(`${label}: expected directory, got file: ${path}`);
  }
}

function packAllPackages(stagingDir) {
  const tarballs = {};
  for (const pkgName of ALL_PACKAGES) {
    const pkgDir = join(ROOT, 'packages', pkgName.split('/')[1]);
    log(`packing ${pkgName}`);
    tarballs[pkgName] = packPackage(pkgDir, stagingDir);
  }
  return tarballs;
}

function writeConsumerPackageJson(consumerDir, tarballs) {
  const dependencies = {};
  for (const [name, tarball] of Object.entries(tarballs)) {
    dependencies[name] = `file:${tarball}`;
  }
  writeFileSync(
    join(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'mmmnt-smoke-consumer',
        version: '0.0.0',
        private: true,
        dependencies,
      },
      null,
      2,
    ),
  );
}

/** Initialize a project via `moment init` and assert the scaffolded layout. */
function smokeInit(momentBin, consumerDir) {
  const projectDir = join(consumerDir, 'test-project');
  mkdirSync(projectDir);
  run(momentBin, ['init', '--dir', projectDir, '--name', 'smoke-project']);
  assertIsFile(join(projectDir, '.manifest.yaml'), 'init manifest');
  assertIsDir(join(projectDir, '.moment', 'contexts'), 'init contexts dir');
  assertIsDir(join(projectDir, '.moment', 'flows'), 'init flows dir');
  return projectDir;
}

/** Run `moment generate` and assert the expected files landed on disk. */
function smokeGenerate(momentBin, projectSpec, consumerDir) {
  const genOut = join(consumerDir, 'generate-out');
  run(momentBin, ['generate', '--out', genOut, projectSpec]);
  assertIsDir(join(genOut, 'features'), 'generate features dir');
  const featureFiles = readdirSync(join(genOut, 'features')).filter((f) => f.endsWith('.feature'));
  if (featureFiles.length === 0) {
    fail('generate wrote features/ but it contains no .feature files');
  }
  assertIsFile(join(genOut, 'specification.md'), 'generate specification.md');
}

/** Run `moment emit-ts` and assert src/ + __tests__/ were populated. */
function smokeEmitTs(momentBin, projectSpec, consumerDir) {
  const emitOut = join(consumerDir, 'emit-out');
  run(momentBin, ['emit-ts', '--out', emitOut, projectSpec]);
  assertIsDir(join(emitOut, 'src'), 'emit-ts src dir');
  assertIsDir(join(emitOut, '__tests__'), 'emit-ts scaffold dir');
}

/** Run `moment simulate --out-dir --all` and assert facet dir layout. */
function smokeSimulate(momentBin, projectSpec, consumerDir) {
  const facetDir = join(consumerDir, 'facet-out');
  run(momentBin, ['simulate', '--all', '--out-dir', facetDir, projectSpec]);
  assertIsFile(join(facetDir, 'manifest.json'), 'simulate manifest.json');
  const simulated = readdirSync(facetDir);
  if (!simulated.some((f) => f.startsWith('topology-') && f.endsWith('.json'))) {
    fail('simulate --out-dir produced no topology-*.json files');
  }
  if (!simulated.some((f) => f.startsWith('scenario-') && f.endsWith('.json'))) {
    fail('simulate --out-dir produced no scenario-*.json files');
  }
  assertIsFile(join(facetDir, 'event-catalog.json'), 'simulate event-catalog.json');
  return facetDir;
}

/**
 * Start `moment serve <facet-dir>` and verify it printed its ready banner.
 *
 * We use spawnSync with a timeout because the serve command is a long-running
 * process with no exit path. The timeout fires, the process dies, and we
 * check that (a) the only reason it died was the timeout (not a crash) and
 * (b) the banner made it to stdout before the timeout. That's sufficient
 * to smoke-test startup without needing an async port probe.
 */
function smokeServe(momentBin, facetDir, consumerDir) {
  const servePort = 4444;
  log(`starting moment serve ${facetDir} --port ${servePort} (background)`);
  const serveProcess = spawnSync(momentBin, ['serve', facetDir, '--port', String(servePort)], {
    cwd: consumerDir,
    stdio: 'pipe',
    timeout: 10000,
    detached: false,
  });
  if (serveProcess.error && serveProcess.error.code !== 'ETIMEDOUT') {
    fail(`moment serve crashed: ${serveProcess.error.message}`);
  }
  const serveOutput =
    (serveProcess.stdout?.toString() ?? '') + (serveProcess.stderr?.toString() ?? '');
  if (!serveOutput.includes(`ws://localhost:${servePort}`)) {
    fail(`moment serve never printed its ready banner. Output:\n${serveOutput}`);
  }
  log('moment serve started and printed ready banner ✓');
}

/** Smoke-import each library package. Catches broken exports / missing dist. */
function smokeLibraryImports(consumerDir) {
  for (const libPkg of LIBRARY_PACKAGES) {
    log(`smoke-importing ${libPkg}`);
    const checkScript = `
      const mod = await import('${libPkg}');
      const keys = Object.keys(mod);
      if (keys.length === 0) {
        console.error('${libPkg}: no exports');
        process.exit(1);
      }
      console.log('${libPkg}: ' + keys.length + ' exports');
    `;
    run('node', ['--input-type=module', '-e', checkScript], { cwd: consumerDir });
  }
}

async function main() {
  if (!existsSync(FIXTURE_SPEC)) {
    fail(`fixture not found: ${FIXTURE_SPEC}`);
  }

  // Ensure every package has a fresh dist/ before we pack. In CI this is
  // usually a no-op because the Build step ran earlier, but running the
  // smoke test locally shouldn't require remembering to build first.
  log('building all packages (turbo will skip up-to-date ones)');
  run('pnpm', ['turbo', 'build'], { cwd: ROOT });

  const staging = mkdtempSync(join(tmpdir(), 'mmmnt-smoke-staging-'));
  const consumer = mkdtempSync(join(tmpdir(), 'mmmnt-smoke-consumer-'));
  log(`staging dir: ${staging}`);
  log(`consumer dir: ${consumer}`);

  try {
    const tarballs = packAllPackages(staging);
    writeConsumerPackageJson(consumer, tarballs);

    log('installing tarballs into consumer dir');
    run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
      cwd: consumer,
    });

    const momentBin = join(consumer, 'node_modules', '.bin', 'moment');
    assertIsFile(momentBin, 'moment bin');
    assertIsFile(join(consumer, 'node_modules', '.bin', 'mcp'), 'mcp bin');

    const projectDir = smokeInit(momentBin, consumer);
    const projectSpec = join(projectDir, 'vet-clinic.moment');
    cpSync(FIXTURE_SPEC, projectSpec);
    run(momentBin, ['parse', projectSpec]);

    smokeGenerate(momentBin, projectSpec, consumer);
    smokeEmitTs(momentBin, projectSpec, consumer);
    const facetDir = smokeSimulate(momentBin, projectSpec, consumer);
    smokeServe(momentBin, facetDir, consumer);
    smokeLibraryImports(consumer);

    log('');
    log('✓ All smoke tests passed');
    log(`  - Packed:        ${ALL_PACKAGES.length} tarballs`);
    log(`  - CLI flow:      init → parse → generate → emit-ts → simulate → serve`);
    log(`  - Library imports: ${LIBRARY_PACKAGES.length} packages`);
  } finally {
    if (KEEP) {
      log(`KEEP_SMOKE_DIR set — leaving ${staging} and ${consumer} in place`);
    } else {
      rmSync(staging, { recursive: true, force: true });
      rmSync(consumer, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
