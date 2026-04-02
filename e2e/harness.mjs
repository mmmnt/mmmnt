#!/usr/bin/env node

/**
 * Moment E2E Test Harness
 *
 * Runs every CLI command against the vet-clinic fixture and asserts outputs.
 * Produces a JSON report + individual output files for CI commenting.
 *
 * Usage: node e2e/harness.mjs [--output-dir <dir>]
 * Exit code: 0 = all pass, 1 = any failure
 */

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLI = resolve(ROOT, 'packages/cli/dist/moment.mjs');
const VET_CLINIC = resolve(ROOT, 'fixtures/valid/unified/vet-clinic.moment');
const UNIFIED = resolve(ROOT, 'fixtures/valid/unified/ordering.moment');
const INVALID = resolve(ROOT, 'fixtures/invalid/no-declaration.moment');

const args = process.argv.slice(2);
const outputDirIdx = args.indexOf('--output-dir');
const OUTPUT_DIR =
  outputDirIdx >= 0 ? resolve(args[outputDirIdx + 1]) : resolve(ROOT, '.moment/generated');

mkdirSync(OUTPUT_DIR, { recursive: true });

const results = [];
let failures = 0;

function run(cmd, args, opts = {}) {
  try {
    const result = execFileSync('node', [CLI, cmd, ...args], {
      cwd: ROOT,
      timeout: 30000,
      encoding: 'utf-8',
      ...opts,
    });
    return { success: true, stdout: result.trim(), exitCode: 0 };
  } catch (err) {
    return {
      success: err.status === 0,
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || '').trim(),
      exitCode: err.status ?? 1,
    };
  }
}

function test(name, fn) {
  const result = { name, assertions: [], pass: true };
  const assert = (condition, message) => {
    const entry = { message, pass: !!condition };
    result.assertions.push(entry);
    if (!entry.pass) {
      result.pass = false;
      failures++;
    }
  };
  try {
    fn(assert);
  } catch (err) {
    result.pass = false;
    result.error = err.message;
    failures++;
  }
  results.push(result);
  const icon = result.pass ? '✓' : '✗';
  console.log(`  ${icon} ${name}`);
}

function saveOutput(filename, content) {
  writeFileSync(join(OUTPUT_DIR, filename), content, 'utf-8');
}

// ============================================================================
// Tests
// ============================================================================

console.log('\nMoment E2E Test Harness\n');
console.log('=== Parse ===');

test('parse: vet-clinic (4 contexts, 1 flow)', (assert) => {
  const r = run('parse', [VET_CLINIC]);
  assert(r.exitCode === 0, 'exit code 0');
  assert(r.stdout.includes('4 context(s)'), 'reports 4 contexts');
  assert(r.stdout.includes('1 flow(s)'), 'reports 1 flow');
});

test('parse: unified ordering (2 contexts, 1 flow)', (assert) => {
  const r = run('parse', [UNIFIED]);
  assert(r.exitCode === 0, 'exit code 0');
  assert(r.stdout.includes('2 context(s)'), 'reports 2 contexts');
  assert(r.stdout.includes('1 flow(s)'), 'reports 1 flow');
});

test('parse: invalid file rejects with diagnostics', (assert) => {
  const r = run('parse', [INVALID]);
  assert(r.exitCode === 1, 'exit code 1');
  assert(r.stdout.includes('diagnostic') || r.stderr.includes('diagnostic'), 'reports diagnostics');
});

test('parse: missing file errors', (assert) => {
  const r = run('parse', ['/tmp/nonexistent.moment']);
  assert(r.exitCode === 1, 'exit code 1');
});

console.log('\n=== Derive ===');

test('derive: vet-clinic produces 1 suite, 17 cases', (assert) => {
  const r = run('derive', [VET_CLINIC]);
  assert(r.exitCode === 0, 'exit code 0');
  assert(r.stdout.includes('1 suite'), 'reports 1 suite');
  assert(r.stdout.includes('17 case'), 'reports 17 cases');
});

test('derive: --json outputs valid topology JSON', (assert) => {
  const r = run('derive', ['--json', VET_CLINIC]);
  assert(r.exitCode === 0, 'exit code 0');
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    parsed = null;
  }
  assert(parsed !== null, 'valid JSON');
  assert(parsed?.suites?.length === 1, '1 suite');
  assert(parsed?.suites?.[0]?.testCases?.length === 17, '17 test cases');
  assert(parsed?.metadata?.sourceIrHash, 'has IR hash');
  saveOutput('derive-topology.json', JSON.stringify(parsed, null, 2));
});

console.log('\n=== Generate ===');

test('generate: vet-clinic produces features + specs + docs', (assert) => {
  const r = run('generate', [VET_CLINIC]);
  assert(r.exitCode === 0, 'exit code 0');
  assert(r.stdout.includes('.feature'), 'produces .feature files');
  assert(r.stdout.includes('.spec.ts'), 'produces .spec.ts files');
  assert(r.stdout.includes('document'), 'produces documents');
});

console.log('\n=== Emit TypeScript ===');

test('emit-ts: vet-clinic produces 14 TS + 6 scaffolds', (assert) => {
  const r = run('emit-ts', [VET_CLINIC]);
  assert(r.exitCode === 0, 'exit code 0');
  assert(r.stdout.includes('14 TypeScript'), '14 TypeScript files');
  assert(r.stdout.includes('6 scaffold'), '6 scaffold files');
});

test('emit-ts: --dry-run lists files without writing', (assert) => {
  const r = run('emit-ts', ['--dry-run', VET_CLINIC]);
  assert(r.exitCode === 0, 'exit code 0');
  assert(r.stdout.includes('Dry run'), 'reports dry run');
  assert(r.stdout.includes('.ts'), 'lists .ts files');
});

console.log('\n=== Simulate ===');

test('simulate: vet-clinic produces 28 events, 3 branches', (assert) => {
  const r = run('simulate', [VET_CLINIC]);
  assert(r.exitCode === 0, 'exit code 0');
  assert(r.stdout.includes('28 events'), '28 events');
  assert(r.stdout.includes('Branches: 3'), '3 branches');
});

test('simulate: --json outputs valid Facet scenario', (assert) => {
  const r = run('simulate', ['--json', VET_CLINIC]);
  assert(r.exitCode === 0, 'exit code 0');
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    parsed = null;
  }
  assert(parsed !== null, 'valid JSON');
  assert(parsed?.scenarioId, 'has scenarioId');
  assert(parsed?.expectedPath?.length === 28, '28-node expected path');
  assert(parsed?.activeBranches?.length === 3, '3 active branches');
  saveOutput('facet.json', JSON.stringify(parsed, null, 2));
});

test('simulate: --json events have causation and payloads', (assert) => {
  const r = run('simulate', ['--json', VET_CLINIC]);
  const parsed = JSON.parse(r.stdout);
  const events = parsed.events || [];
  assert(events.length === 28, '28 events');
  const first = events[0] || {};
  const second = events[1] || {};
  assert(first.eventId, 'first event has eventId');
  assert(Array.isArray(first.causationEventIds), 'has causation field');
  assert(second.causationEventIds.length > 0, 'causation chain populated');
  assert(second.payload, 'events have payloads');
});

console.log('\n=== Viz ===');

test('viz: vet-clinic produces VizDataEnvelope', (assert) => {
  const r = run('viz', [VET_CLINIC]);
  assert(r.exitCode === 0, 'exit code 0');
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    parsed = null;
  }
  assert(parsed !== null, 'valid JSON');
  assert(parsed?.type === 'viz:initial-load', 'type is viz:initial-load');
  assert(parsed?.envelope?.contextMap?.nodes?.length >= 4, '>=4 context nodes');
  assert(parsed?.session?.sessionId, 'has session ID');
  saveOutput('viz-envelope.json', JSON.stringify(parsed, null, 2));
});

console.log('\n=== Sync Status ===');

test('sync status: vet-clinic detects drift', (assert) => {
  const r = run('sync', ['status', VET_CLINIC]);
  assert(r.exitCode === 0, 'exit code 0');
  assert(r.stdout.includes('drifted'), 'reports drift');
});

test('sync status: --json outputs DriftReport', (assert) => {
  const r = run('sync', ['status', '--json', VET_CLINIC]);
  assert(r.exitCode === 0, 'exit code 0');
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    parsed = null;
  }
  assert(parsed !== null, 'valid JSON');
  assert(parsed?.totalDrifted > 0, 'totalDrifted > 0');
  assert(parsed?.driftPoints?.length > 0, 'has drift points');
  // sync-status.json not saved — drift report is a workflow tool, not a showcase artifact
});

console.log('\n=== Test ===');

test('test: vet-clinic runs harness', (assert) => {
  const r = run('test', [VET_CLINIC]);
  const output = r.stdout || r.stderr || '';
  assert(output.includes('Tests:'), 'reports test summary');
  assert(output.includes('suite'), 'reports suite count');
});

console.log('\n=== Init ===');

test('init: creates project structure', (assert) => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'moment-e2e-'));
  try {
    const r = run('init', ['--dir', tmpDir, '--name', 'e2e-test']);
    assert(r.exitCode === 0, 'exit code 0');
    assert(existsSync(join(tmpDir, '.manifest.yaml')), '.manifest.yaml exists');
    assert(existsSync(join(tmpDir, '.moment', 'contexts')), '.moment/contexts exists');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('init: manifest contains project name', (assert) => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'moment-e2e-'));
  try {
    run('init', ['--dir', tmpDir, '--name', 'e2e-test']);
    const manifest = readFileSync(join(tmpDir, '.manifest.yaml'), 'utf-8');
    assert(manifest.includes('e2e-test'), 'manifest contains project name');
    assert(existsSync(join(tmpDir, '.moment', 'flows')), '.moment/flows exists');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('init: rejects duplicate', (assert) => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'moment-e2e-'));
  try {
    run('init', ['--dir', tmpDir, '--name', 'first']);
    const r = run('init', ['--dir', tmpDir, '--name', 'second']);
    assert(r.exitCode === 1, 'exit code 1');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

console.log('\n=== Auth ===');

test('auth status: reports not authenticated', (assert) => {
  const r = run('auth', ['status']);
  assert(r.exitCode === 0, 'exit code 0');
  assert(
    r.stdout.includes('Not authenticated') || r.stdout.includes('Authenticated'),
    'reports auth state',
  );
});

test('auth logout: reports result', (assert) => {
  const r = run('auth', ['logout']);
  assert(r.exitCode === 0, 'exit code 0');
  assert(
    r.stdout.includes('removed') ||
      r.stdout.includes('logged out') ||
      r.stdout.includes('No credentials'),
    'reports logout result',
  );
});

// ============================================================================
// Generate Artifacts — Real output files for .moment/generated/
// ============================================================================

console.log('\n=== Generating Artifacts ===');

// Write temp script inside packages/cli for @mmmnt/* resolution
const tmpScript = resolve(ROOT, 'packages/cli', '_e2e_gen.mjs');
const genCode = [
  'import{mkdirSync,writeFileSync,readFileSync}from"node:fs";',
  'import{join,dirname}from"node:path";',
  'import{MomentParser}from"@mmmnt/core";',
  'import{deriveTopology}from"@mmmnt/derive";',
  'import{TypeScriptEmitter,TestScaffoldEmitter}from"@mmmnt/emit-ts";',
  'import{GherkinGenerator,SpecificationDocumentGenerator}from"@mmmnt/generate";',
  'const[mf,od]=process.argv.slice(2);',
  'const ir=(await new MomentParser().parseContent(readFileSync(mf,"utf-8"))).ir;',
  'const topo=deriveTopology(ir);',
  'const ts=new TypeScriptEmitter().emit(ir,{scope:{level:"system"}});',
  'const sc=new TestScaffoldEmitter().emit(ir,topo);',
  'for(const[p,c]of ts.files){const o=join(od,"typescript",p);mkdirSync(dirname(o),{recursive:true});writeFileSync(o,c);}',
  'console.log("  TS: "+ts.files.size+" files");',
  'const gm=new GherkinGenerator().generate(ir,topo);',
  'for(const f of gm.featuresGenerated||[]){const n=f.fileName||f.name||"feature";const o=join(od,"gherkin",n+".feature");mkdirSync(dirname(o),{recursive:true});writeFileSync(o,f.content||JSON.stringify(f,null,2));}',
  'console.log("  Gherkin: "+(gm.featuresGenerated?.length??0)+" features");',
  'const docs=new SpecificationDocumentGenerator().generate(ir);',
  'for(let i=0;i<docs.length;i++){const d=docs[i];const o=join(od,"docs",d.filePath||("doc-"+i+".md"));mkdirSync(dirname(o),{recursive:true});writeFileSync(o,d.content||JSON.stringify(d,null,2));}',
  'console.log("  Docs: "+docs.length+" documents");',
].join('\n');
writeFileSync(tmpScript, genCode);
try {
  execFileSync('node', [tmpScript, VET_CLINIC, OUTPUT_DIR], {
    cwd: resolve(ROOT, 'packages/cli'),
    timeout: 30000,
    stdio: 'inherit',
  });
} finally {
  rmSync(tmpScript, { force: true });
}

// ============================================================================
// Report
// ============================================================================

console.log('\n' + '='.repeat(60));

const totalAssertions = results.reduce((sum, r) => sum + r.assertions.length, 0);
const passedAssertions = results.reduce(
  (sum, r) => sum + r.assertions.filter((a) => a.pass).length,
  0,
);
const failedTests = results.filter((r) => !r.pass);

const report = {
  timestamp: new Date().toISOString(),
  fixture: 'fixtures/valid/unified/vet-clinic.moment',
  summary: {
    tests: results.length,
    passed: results.length - failedTests.length,
    failed: failedTests.length,
    assertions: totalAssertions,
    assertionsPassed: passedAssertions,
  },
  results: results.map((r) => ({
    name: r.name,
    pass: r.pass,
    assertions: r.assertions,
    error: r.error,
  })),
};

saveOutput('report.json', JSON.stringify(report, null, 2));

// Generate markdown summary for PR comment
const md = [
  '## Moment E2E Test Results',
  '',
  `**${report.summary.passed}/${report.summary.tests} tests passed** (${report.summary.assertionsPassed}/${report.summary.assertions} assertions)`,
  '',
  '| Test | Status | Assertions |',
  '|------|--------|------------|',
  ...results.map((r) => {
    const icon = r.pass ? '✅' : '❌';
    const passed = r.assertions.filter((a) => a.pass).length;
    return `| ${r.name} | ${icon} | ${passed}/${r.assertions.length} |`;
  }),
  '',
  '<details>',
  '<summary>Generated Artifacts</summary>',
  '',
  '**JSON Outputs**',
  '| File | Description |',
  '|------|-------------|',
  '| `facet.json` | Facet-compatible simulation (28 events, causation chains) |',
  '| `derive-topology.json` | Test suite topology (17 cases, assertion points) |',
  '| `viz-envelope.json` | Visualization data envelope (context map + timeline) |',
  '',
  '**TypeScript** (`typescript/`)',
  '| File | Description |',
  '|------|-------------|',
  '| `src/{context}/{aggregate}.types.ts` | Command, event, value object interfaces |',
  '| `src/{context}/{aggregate}.aggregate.ts` | Aggregate root interface |',
  '| `src/{context}/index.ts` | Barrel exports |',
  '| `__tests__/flows/{flow}.spec.ts` | Flow test scaffold |',
  '| `__tests__/{context}/{aggregate}.spec.ts` | Aggregate test scaffold |',
  '',
  '**Gherkin** (`gherkin/`)',
  '| File | Description |',
  '|------|-------------|',
  '| `{flow}.feature` | BDD scenarios from temporal flows |',
  '',
  '**Documentation** (`docs/`)',
  '| File | Description |',
  '|------|-------------|',
  '| `specification.md` | Context overview with counts |',
  '| `{context}/inventory.md` | Detailed aggregate inventory |',
  '',
  '</details>',
];

if (failedTests.length > 0) {
  md.push('', '### Failures', '');
  for (const t of failedTests) {
    md.push(`**${t.name}**`);
    for (const a of t.assertions.filter((a) => !a.pass)) {
      md.push(`- ❌ ${a.message}`);
    }
    if (t.error) md.push(`- Error: ${t.error}`);
    md.push('');
  }
}

saveOutput('summary.md', md.join('\n'));

console.log(
  `\n${report.summary.passed}/${report.summary.tests} tests passed (${report.summary.assertionsPassed}/${report.summary.assertions} assertions)`,
);

if (failures > 0) {
  console.log(`\n${failures} failure(s)\n`);
  process.exit(1);
} else {
  console.log('\nAll tests passed.\n');
}
