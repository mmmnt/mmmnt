import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    // Craft a flow name that escapes exactly one level out of outDir into
    // the test workDir. The first `scenario-flow-..` directory segment
    // absorbs one `..` during path.join normalization, so THREE `..`
    // segments climb: one to cancel scenario-flow-.., one to climb out of
    // outDir's parent (workDir/out → workDir), one more kept by the path
    // renderer. Then 'escaped/sentinel.json' lands at
    // <workDir>/escaped/sentinel.json — outside outDir but inside the
    // temp workspace so the test is hermetic and cross-platform.
    const specPath = writeSpec('"../../../escaped/sentinel"');
    const outDir = join(workDir, 'out');
    // This is the path the exploit would write to if the guard were
    // absent. It's derived from workDir so tests don't collide across
    // runners or touch any global filesystem state.
    const escapeTarget = join(workDir, 'escaped', 'sentinel.json');

    const result = await runSimulate([specPath, '--all', '--out-dir', outDir]);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Path traversal detected/);
    // Crucial assertion: nothing was written at the escape path.
    expect(existsSync(escapeTarget)).toBe(false);
    // And no `escaped/` sibling directory was created next to outDir.
    expect(existsSync(join(workDir, 'escaped'))).toBe(false);
  });

  // NOTE: absolute paths in flow names are NOT a traversal vector via this
  // code path. `path.join(outDir, '/tmp/foo.json')` doesn't treat the leading
  // slash as "start from root" — it treats the whole string as a relative
  // segment, producing `<outDir>/tmp/foo.json`. The attack only works via
  // `../` climb-out sequences (tested above). Documenting the non-threat
  // here so a future reader doesn't reintroduce an absolute-path test that
  // fails for the wrong reason (ENOENT on a deeply nested subdir).
});

describe('moment simulate flag handling', () => {
  it('accepts --out as an alias for --out-dir', async () => {
    const specPath = writeSpec('"alias-flow"');
    const outDir = join(workDir, 'out-alias');
    const result = await runSimulate([specPath, '--all', '--out', outDir]);

    expect(result.success).toBe(true);
    expect(existsSync(join(outDir, 'manifest.json'))).toBe(true);
  });

  it('warns about unrecognized flags instead of silently swallowing them', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const specPath = writeSpec('"warn-flow"');
      const outDir = join(workDir, 'out-warn');
      const result = await runSimulate([specPath, '--all', '--outdir', outDir, '--bogus']);

      expect(result.success).toBe(true);
      const warned = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(warned.some((m) => m.includes('--outdir'))).toBe(true);
      expect(warned.some((m) => m.includes('--bogus'))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not warn for declared flags', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const specPath = writeSpec('"quiet-flow"');
      const outDir = join(workDir, 'out-quiet');
      await runSimulate([specPath, '--all', '--out-dir', outDir]);

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('moment simulate manifest kind classification (M-S15)', () => {
  it('every scenario file carries kind and manifest flags derive from it', async () => {
    const specPath = writeSpec('"kind-flow"');
    const outDir = join(workDir, 'out-kind');
    const result = await runSimulate([specPath, '--all', '--out-dir', outDir]);

    expect(result.success).toBe(true);
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8'));
    for (const flow of manifest.flows) {
      for (const entry of flow.scenarios) {
        expect(['happy', 'variant', 'failure', 'negative', 'timeout']).toContain(entry.kind);
        expect(entry.isHappyPath).toBe(entry.kind === 'happy');
        expect(entry.isNegative).toBe(entry.kind === 'negative');

        const scenario = JSON.parse(readFileSync(join(outDir, entry.file), 'utf-8'));
        expect(scenario.kind).toBe(entry.kind);
      }
    }
  });

  it('emits a timeout scenario per timeout-declaring saga, neither happy nor negative', async () => {
    const fixture = join(
      import.meta.dirname,
      '../../../../fixtures/valid/unified/vet-clinic.moment',
    );
    const outDir = join(workDir, 'out-timeout');
    const result = await runSimulate([fixture, '--all', '--out-dir', outDir]);

    expect(result.success).toBe(true);
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8'));
    const timeoutEntries = manifest.flows.flatMap(
      (f: { scenarios: Array<Record<string, unknown>> }) =>
        f.scenarios.filter((s) => s.kind === 'timeout'),
    );

    // vet-clinic declares exactly one saga (VisitLifecycle, timeout visitTimeout),
    // owned by exactly one flow (single-owner rule).
    expect(timeoutEntries).toHaveLength(1);
    const entry = timeoutEntries[0];
    expect(String(entry.scenarioId).endsWith('-timeout-VisitLifecycle')).toBe(true);
    expect(entry.scenarioLabel).toContain('[VisitLifecycle.visitTimeout]');
    expect(entry.isHappyPath).toBe(false);
    expect(entry.isNegative).toBe(false);

    const scenario = JSON.parse(readFileSync(join(outDir, entry.file as string), 'utf-8'));
    expect(scenario.kind).toBe('timeout');
    // Trailing markers: initial state, TimedOut, Compensated (compensation declared).
    const markerTypes = scenario.events
      .filter((e: { eventType: string }) => e.eventType.startsWith('SimSaga.'))
      .map((e: { eventType: string }) => e.eventType);
    expect(markerTypes).toEqual([
      'SimSaga.VisitLifecycle.Triaging',
      'SimSaga.VisitLifecycle.TimedOut',
      'SimSaga.VisitLifecycle.Compensated',
    ]);
    // Path events align 1:1 with the truncated expectedPath; markers trail.
    expect(scenario.events.length).toBe(scenario.expectedPath.length + markerTypes.length);
  });
});

describe('moment simulate policy-definitions artifact', () => {
  const UNIFIED_FIXTURE = join(
    import.meta.dirname,
    '../../../../fixtures/valid/unified/vet-clinic.moment',
  );

  it('emits [] for a spec that declares no policies and lists it in the manifest', async () => {
    const specPath = writeSpec('"no-policies"');
    const outDir = join(workDir, 'out-nopol');
    const result = await runSimulate([specPath, '--all', '--out-dir', outDir]);

    expect(result.success).toBe(true);
    const policyFile = join(outDir, 'policy-definitions.json');
    expect(existsSync(policyFile)).toBe(true);
    expect(JSON.parse(readFileSync(policyFile, 'utf-8'))).toEqual([]);

    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8'));
    expect(manifest.artifacts.policyDefinitions).toBe('policy-definitions.json');
  });

  it('emits real policies with declaring contextIds and array chainsTo', async () => {
    const outDir = join(workDir, 'out-pol');
    const result = await runSimulate([UNIFIED_FIXTURE, '--all', '--out-dir', outDir]);

    expect(result.success).toBe(true);
    const policies = JSON.parse(
      readFileSync(join(outDir, 'policy-definitions.json'), 'utf-8'),
    ) as Array<{
      name: string;
      contextId: string;
      trigger: string;
      actionDescription?: string;
      chainsTo: string[];
    }>;

    expect(policies.length).toBeGreaterThan(0);
    const triage = policies.find((p) => p.name === 'TriageOnIntakeRegistered');
    expect(triage).toBeDefined();
    expect(triage!.contextId).toBe('ctx-Clinical');
    expect(triage!.trigger).toBe('PatientIntakeRegistered');
    expect(triage!.chainsTo).toEqual(['CompleteTriage']);
    expect(triage!.actionDescription).toBe('Begin triage process for registered patient');

    for (const pol of policies) {
      expect(Array.isArray(pol.chainsTo)).toBe(true);
      expect(pol.contextId.startsWith('ctx-')).toBe(true);
    }
  });
});
