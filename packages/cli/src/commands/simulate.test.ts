import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runSimulate } from './simulate.js';

// A self-contained minimal .moment flow that parses successfully against
// the live grammar. The $NAME placeholder is replaced per-test so each
// case can use its own flow name to probe traversal behavior without
// mutating a checked-in fixture.
const FLOW_TEMPLATE = `flow $NAME
  description "smoke"

  lane ordering "Ordering" [Core]
  lane fulfillment "Fulfillment" [Supporting]

  moment "Order submission"
    ordering: PlaceOrder
    ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier
      contract
        orderId: UUID [required]

  moment "Fulfillment initiation"
    fulfillment: InitiateFulfillment
      triggered-by OrderPlaced
    fulfillment: FulfillmentInitiated
`;

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'moment-simulate-trav-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function writeSpec(name: string): string {
  const spec = FLOW_TEMPLATE.replace('$NAME', name);
  const specPath = join(workDir, 'flow.moment');
  writeFileSync(specPath, spec, 'utf-8');
  return specPath;
}

describe('moment simulate path-traversal guard', () => {
  it('writes scenario files under --out-dir for a normal flow name', async () => {
    const specPath = writeSpec('"order-placed"');
    const outDir = join(workDir, 'out');
    const result = await runSimulate([specPath, '--all', '--out-dir', outDir]);

    expect(result.success).toBe(true);
    expect(existsSync(outDir)).toBe(true);
    const files = readdirSync(outDir);
    expect(files.some((f) => f.startsWith('topology-') && f.endsWith('.json'))).toBe(true);
    expect(files.some((f) => f.startsWith('scenario-') && f.endsWith('.json'))).toBe(true);
    expect(files).toContain('manifest.json');
  });

  it('rejects a flow name crafted to escape --out-dir via ../', async () => {
    // Enough `../` segments to climb above the tmpdir's workDir and out/
    // subdir. The first `scenario-flow-..` directory absorbs one `..` during
    // path.join normalization, so you need N+2 `..` to escape by N levels.
    const specPath = writeSpec('"../../../../../../../../../tmp/pwned-by-simulate-test"');
    const outDir = join(workDir, 'out');

    const result = await runSimulate([specPath, '--all', '--out-dir', outDir]);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Path traversal detected/);
    // And crucially: no file was written outside outDir.
    expect(existsSync(resolve('/tmp/pwned-by-simulate-test.json'))).toBe(false);
  });

  // NOTE: absolute paths in flow names are NOT a traversal vector via this
  // code path. `path.join(outDir, '/tmp/foo.json')` doesn't treat the leading
  // slash as "start from root" — it treats the whole string as a relative
  // segment, producing `<outDir>/tmp/foo.json`. The attack only works via
  // `../` climb-out sequences (tested above). Documenting the non-threat
  // here so a future reader doesn't reintroduce an absolute-path test that
  // fails for the wrong reason (ENOENT on a deeply nested subdir).
});
