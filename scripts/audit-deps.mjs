#!/usr/bin/env node
/**
 * Runtime-dependency audit across all workspace packages.
 *
 * For each `packages/<pkg>` directory, walks `src/**\/*.ts` (excluding tests
 * and generated code), extracts every bare import specifier, and diffs that
 * set against the package's declared `dependencies` + `peerDependencies` (plus
 * the package's own name, since a package can always import its own sub-paths).
 *
 * Flags any import whose resolved base package is NOT declared — that's the
 * shape of the `langium` miss in `@mmmnt/core` (fixed in #136) where a runtime
 * `import` only had a `devDependencies` entry, so consumers running a fresh
 * `npm install` couldn't resolve it.
 *
 * WHAT'S FILTERED (not flagged)
 *
 *   - Node built-ins (`node:*`, `fs`, `path`, etc.)
 *   - Relative imports (`.` / `..`)
 *   - Template-literal artifacts where the captured spec contains `${` or `{`
 *     (e.g. `from '${pkg}'` inside a dynamically-built error message)
 *   - Source imports in bundled bin-only packages (detected by `pkg.bin`
 *     present + no `main`/`module`/`exports` + `build.mjs` using esbuild's
 *     `bundle: true`). `@mmmnt/cli` and `@mmmnt/mcp` are this shape — their
 *     `src/` imports are build-time inputs to esbuild, not runtime requirements
 *     for consumers.
 *
 * EXIT CODES
 *
 *   0  — all library packages are clean
 *   1  — at least one library package has an import not in its declared deps
 *
 * USAGE
 *
 *   node scripts/audit-deps.mjs [root]
 *   pnpm audit:deps
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { builtinModules } from 'node:module';

// Derive the builtin set from Node's own list so we always reflect the
// current Node version rather than a hand-maintained snapshot. Normalizes
// both bare (`fs`) and `node:` forms; subpath imports like `fs/promises`,
// `timers/promises`, `path/posix` are handled by testing the first
// path segment against the set.
const BUILTINS = new Set(
  builtinModules.map((name) => (name.startsWith('node:') ? name.slice(5) : name)),
);

function isBuiltin(spec) {
  const normalized = spec.startsWith('node:') ? spec.slice(5) : spec;
  if (BUILTINS.has(normalized)) return true;
  return BUILTINS.has(normalized.split('/')[0]);
}

function isRelative(spec) {
  return spec.startsWith('.') || spec.startsWith('/');
}

function isTemplateArtifact(spec) {
  return spec.includes('${') || spec.includes('{');
}

function normalizePkg(spec) {
  // @scope/pkg/subpath → @scope/pkg
  // pkg/subpath → pkg
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    return `${parts[0]}/${parts[1]}`;
  }
  return spec.split('/')[0];
}

const SKIP_DIRS = new Set(['__tests__', 'node_modules', 'dist', 'generated']);

function safeStat(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function walkDir(dir, predicate, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = safeStat(full);
    if (!st) continue;
    if (st.isDirectory() && !SKIP_DIRS.has(entry)) {
      walkDir(full, predicate, acc);
    } else if (st.isFile() && predicate(full)) {
      acc.push(full);
    }
  }
  return acc;
}

function extractImports(content) {
  const specs = new Set();
  // Three shapes, all anchored at line start with optional leading whitespace
  // so we don't match inside string literals (e.g. code-gen templates that
  // emit `import ... from 'vitest'` as a string):
  //
  //   1. `import [type] <ident-or-braces> from 'pkg';`
  //   2. `export [type] (* | { ... }) from 'pkg';` — re-export
  //   3. `import 'pkg';`                             — side-effect import
  //
  // The middle sections use `[^'"`;]` to prevent crossing statement boundaries.
  const importFromRe = /^\s*import\s+(?:type\s+)?(?:[^'"`;]+?)\s+from\s*['"]([^'"\n]+)['"]/gm;
  const exportFromRe = /^\s*export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*from\s*['"]([^'"\n]+)['"]/gm;
  const bareRe = /^\s*import\s+['"]([^'"\n]+)['"]/gm;
  // Dynamic imports can appear mid-expression, so no line anchor. Template
  // interpolation artifacts are still filtered by isTemplateArtifact.
  const dynRe = /import\(\s*['"]([^'"\n]+)['"]/g;

  for (const re of [importFromRe, exportFromRe, bareRe, dynRe]) {
    let m;
    while ((m = re.exec(content)) !== null) {
      if (isTemplateArtifact(m[1])) continue;
      specs.add(m[1]);
    }
  }
  return specs;
}

function isBundledBinOnlyPackage(pkg, pkgDir) {
  const hasBin = pkg.bin && Object.keys(pkg.bin).length > 0;
  const hasLibraryExport = pkg.main || pkg.module || pkg.exports;
  if (!hasBin || hasLibraryExport) return false;
  const buildFile = join(pkgDir, 'build.mjs');
  if (!existsSync(buildFile)) return false;
  const content = readFileSync(buildFile, 'utf-8');
  return content.includes('bundle: true') || content.includes('bundle:true');
}

const ROOT = resolve(process.argv[2] || process.cwd());
const pkgDirs = readdirSync(join(ROOT, 'packages'))
  .map((d) => join(ROOT, 'packages', d))
  .filter((p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  })
  .sort();

let anyMissing = false;

for (const pkgDir of pkgDirs) {
  const pkgJsonPath = join(pkgDir, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  } catch {
    continue;
  }
  const pkgName = pkg.name;

  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);
  declared.add(pkgName);

  const bundledBinOnly = isBundledBinOnlyPackage(pkg, pkgDir);

  const srcDir = join(pkgDir, 'src');
  let srcFiles = [];
  try {
    srcFiles = walkDir(
      srcDir,
      (p) =>
        p.endsWith('.ts') && !p.endsWith('.d.ts') && !p.includes('.test.') && !p.includes('.spec.'),
    );
  } catch {
    /* src/ may not exist for every package */
  }

  const usedPackages = new Map(); // base pkg name → first offending import site
  for (const file of srcFiles) {
    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    for (const spec of extractImports(content)) {
      if (isBuiltin(spec) || isRelative(spec)) continue;
      const base = normalizePkg(spec);
      if (!usedPackages.has(base)) {
        usedPackages.set(base, { spec, file });
      }
    }
  }

  const missing = [];
  for (const [base, info] of usedPackages) {
    if (!declared.has(base)) {
      missing.push({ base, ...info });
    }
  }

  const tag = bundledBinOnly ? ' [bundled bin-only, source imports are build-time]' : '';
  const summary = `${pkgName}: ${srcFiles.length} src files, ${usedPackages.size} unique imports, ${missing.length} missing${tag}`;

  if (missing.length === 0) {
    console.log(`✓ ${summary}`);
  } else if (bundledBinOnly) {
    console.log(`○ ${summary}`);
    for (const m of missing) {
      console.log(
        `    · ${m.base}  (imported as '${m.spec}' from ${toReportPath(ROOT, m.file)})  — bundled`,
      );
    }
  } else {
    anyMissing = true;
    console.log(`✗ ${summary}`);
    for (const m of missing) {
      console.log(
        `    ⚠️  ${m.base}  (imported as '${m.spec}' from ${toReportPath(ROOT, m.file)})`,
      );
    }
  }
}

/**
 * Cross-platform report path helper. `path.relative` handles symlinks, casing,
 * and the POSIX-vs-Windows separator split; the final forward-slash
 * normalization keeps CI log output consistent regardless of runner OS.
 */
function toReportPath(rootDir, filePath) {
  return relative(rootDir, filePath).split(sep).join('/');
}

if (anyMissing) {
  console.error('');
  console.error(
    'Audit failed: one or more library packages import a module that is not declared in dependencies or peerDependencies.',
  );
  console.error(
    'Add the missing package to the offending package.json under "dependencies" (not devDependencies).',
  );
  process.exit(1);
}
