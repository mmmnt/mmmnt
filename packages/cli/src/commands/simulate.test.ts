import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

  it('keeps a flow name crafted to escape --out-dir via ../ inside it', async () => {
    // Scenario files were named from the raw scenarioId (`scenario-flow-<flow name>-<n>`), so
    // '../' in a flow name climbed out of --out-dir and only the writeSafe guard stopped it. File
    // names are slugged now, so the same name lands inside --out-dir with no '/' or '..' left.
    const specPath = writeSpec('"../../../escaped/sentinel"');
    const outDir = join(workDir, 'out');

    const result = await runSimulate([specPath, '--all', '--out-dir', outDir]);

    expect(result.success).toBe(true);
    expect(existsSync(join(workDir, 'escaped'))).toBe(false);
    expect(readdirSync(workDir).sort()).toEqual(['flow.moment', 'out']);
    const files = readdirSync(outDir);
    expect(files).toContain('topology-escaped-sentinel.json');
    expect(files).toContain('scenario-escaped-sentinel.json');
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
      '../../../../examples/ticketwave/spec/ticketwave.moment',
    );
    const outDir = join(workDir, 'out-timeout');
    const result = await runSimulate([fixture, '--all', '--out-dir', outDir]);

    expect(result.success).toBe(true);
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8'));
    const timeoutEntries = manifest.flows.flatMap(
      (f: { scenarios: Array<Record<string, unknown>> }) =>
        f.scenarios.filter((s) => s.kind === 'timeout'),
    );

    // ticketwave declares two timeout sagas (SeatHoldLifecycle.holdExpiry,
    // TransferLifecycle.transferExpiry), each owned by exactly one flow (single-owner rule).
    expect(timeoutEntries).toHaveLength(2);
    const expected = [
      {
        saga: 'SeatHoldLifecycle',
        timeout: 'holdExpiry',
        initial: 'Held',
        suffix: '-timeout-SeatHoldLifecycle',
      },
      {
        saga: 'TransferLifecycle',
        timeout: 'transferExpiry',
        initial: 'Pending',
        suffix: '-timeout-TransferLifecycle',
      },
    ];
    for (const exp of expected) {
      const entry = timeoutEntries.find((e: Record<string, unknown>) =>
        String(e.scenarioId).endsWith(exp.suffix),
      );
      expect(entry).toBeDefined();
      expect(entry.scenarioLabel).toContain(`[${exp.saga}.${exp.timeout}]`);
      expect(entry.isHappyPath).toBe(false);
      expect(entry.isNegative).toBe(false);

      const scenario = JSON.parse(readFileSync(join(outDir, entry.file as string), 'utf-8'));
      expect(scenario.kind).toBe('timeout');
      // Trailing markers: initial state, TimedOut, Compensated (compensation declared).
      const markerTypes = scenario.events
        .filter((e: { eventType: string }) => e.eventType.startsWith('SimSaga.'))
        .map((e: { eventType: string }) => e.eventType);
      expect(markerTypes).toEqual([
        `SimSaga.${exp.saga}.${exp.initial}`,
        `SimSaga.${exp.saga}.TimedOut`,
        `SimSaga.${exp.saga}.Compensated`,
      ]);
      // Path events align 1:1 with the truncated expectedPath; markers trail.
      expect(scenario.events.length).toBe(scenario.expectedPath.length + markerTypes.length);
    }
  });
});

describe('moment simulate scenario file names', () => {
  it('refuses two scenarios whose ids slug to one file name, and names both', async () => {
    const specPath = join(workDir, 'twins.moment');
    writeFileSync(
      specPath,
      FLOW_TEMPLATE.replace('$NAME', '"Order placed"') +
        '\n' +
        FLOW_TEMPLATE.replace('$NAME', '"order-placed"'),
      'utf-8',
    );
    const outDir = join(workDir, 'out-twins');

    const result = await runSimulate([specPath, '--out-dir', outDir]);

    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "Scenarios 'scenario-flow-Order placed' and 'scenario-flow-order-placed' would both be written to scenario-order-placed.json; rename a flow, a command or a precondition so their names differ in more than case or punctuation",
    );
  });
});

describe('moment simulate ticketwave branch paths (ADR-042, ADR-043)', () => {
  const TICKETWAVE = join(
    import.meta.dirname,
    '../../../../examples/ticketwave/spec/ticketwave.moment',
  );
  type Entry = {
    scenarioId: string;
    scenarioLabel: string;
    kind: string;
    isHappyPath: boolean;
    isNegative: boolean;
  };

  async function manifestEntries(outName: string): Promise<Entry[]> {
    const outDir = join(workDir, outName);
    const result = await runSimulate([TICKETWAVE, '--all', '--out-dir', outDir]);
    expect(result.success).toBe(true);
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8'));
    return manifest.flows.flatMap((f: { scenarios: Entry[] }) => f.scenarios);
  }

  it('names scenario files with the slug topology files use, and keeps each scenarioId', async () => {
    const outDir = join(workDir, 'out-slug');
    expect((await runSimulate([TICKETWAVE, '--all', '--out-dir', outDir])).success).toBe(true);
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8')) as {
      flows: { flowName: string; topology: string; scenarios: (Entry & { file: string })[] }[];
    };

    const n5 = manifest.flows.find((f) => f.flowName === 'N5 - Seat request')!;
    expect(n5.topology).toBe('topology-n5-seat-request.json');
    expect(n5.scenarios[0].file).toBe('scenario-n5-seat-request-0.json');
    expect(n5.scenarios[0].scenarioId).toBe('scenario-flow-N5 - Seat request-0');
    const negative = n5.scenarios.find(
      (s) =>
        s.scenarioId === 'scenario-flow-N5 - Seat request-neg-JoinWaitlist-notAlreadyOnWaitlist',
    );
    expect(negative?.file).toBe(
      'scenario-n5-seat-request-neg-joinwaitlist-notalreadyonwaitlist.json',
    );

    const scenarios = manifest.flows.flatMap((f) => f.scenarios);
    expect(scenarios).toHaveLength(72);
    expect(new Set(scenarios.map((s) => s.file)).size).toBe(72);
    for (const entry of scenarios) {
      expect(entry.file).toMatch(/^scenario-[a-z0-9-]+\.json$/);
      const written = JSON.parse(readFileSync(join(outDir, entry.file), 'utf-8'));
      expect(written.scenarioId).toBe(entry.scenarioId);
    }
    expect(readdirSync(outDir).filter((f) => f.startsWith('scenario-'))).toHaveLength(72);
  });

  it('lists a negative for the refusal a later arm issues (ADR-042)', async () => {
    const entries = await manifestEntries('out-042');
    const ids = entries.map((e) => e.scenarioId);
    for (const id of [
      'scenario-flow-N5 - Seat request-neg-JoinWaitlist-notAlreadyOnWaitlist',
      'scenario-flow-N1 - General admission purchase-neg-FailPayment-paymentPending',
      'scenario-flow-N3 - Ticket transfer-neg-DeclineTransfer-transferPending',
      'scenario-flow-N3 - Ticket transfer-neg-CancelTransfer-transferPending',
    ]) {
      const entry = entries.find((e) => e.scenarioId === id);
      expect(entry, id).toBeDefined();
      expect(entry!.kind).toBe('negative');
      expect(entry!.isNegative).toBe(true);
      expect(entry!.isHappyPath).toBe(false);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('classifies an arm that ends at [outcome] a variant and one that ends at [terminal] a failure (ADR-043)', async () => {
    const entries = await manifestEntries('out-043');
    const labelled = (label: string) => entries.find((e) => e.scenarioLabel === label);

    for (const label of [
      'Variant: N5 - Seat request [sold-out]',
      'Variant: N6 - Payment settlement [approved-after-rehold]',
    ]) {
      const entry = labelled(label);
      expect(entry, label).toBeDefined();
      expect(entry!.kind).toBe('variant');
      expect(entry!.isHappyPath).toBe(false);
      expect(entry!.isNegative).toBe(false);
    }
    expect(labelled('Failure Path: N1 - General admission purchase [declined]')?.kind).toBe(
      'failure',
    );
    expect(entries.some((e) => e.scenarioLabel.startsWith('Failure Path: N5 - Seat request'))).toBe(
      false,
    );
  });
});

describe('moment simulate policy-definitions artifact', () => {
  const UNIFIED_FIXTURE = join(
    import.meta.dirname,
    '../../../../examples/ticketwave/spec/ticketwave.moment',
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
    const track = policies.find((p) => p.name === 'TrackHoldOnSeatsHeld');
    expect(track).toBeDefined();
    expect(track!.contextId).toBe('ctx-Inventory');
    expect(track!.trigger).toBe('SeatsHeld');
    expect(track!.chainsTo).toEqual(['TrackHold']);
    expect(track!.actionDescription).toBe('Track the hold until it converts or expires');

    for (const pol of policies) {
      expect(Array.isArray(pol.chainsTo)).toBe(true);
      expect(pol.contextId.startsWith('ctx-')).toBe(true);
    }
  });

  // ADR-045 D3: `condition` appears on a policy that declares one and on no other.
  it('emits `condition` on the policies that declare one, and no key on the others', async () => {
    const outDir = join(workDir, 'out-cond');
    const result = await runSimulate([UNIFIED_FIXTURE, '--all', '--out-dir', outDir]);
    expect(result.success).toBe(true);
    const policies = JSON.parse(
      readFileSync(join(outDir, 'policy-definitions.json'), 'utf-8'),
    ) as Array<{ name: string; condition?: Record<string, string> }>;
    const byName = new Map(policies.map((p) => [p.name, p]));

    expect(byName.get('PromoteWaitlistOnRelease')?.condition).toEqual({
      field: 'reason',
      equals: 'expired',
    });
    expect(byName.get('ConvertHoldOnPayment')?.condition).toEqual({ after: 'SeatsHeld' });
    expect(byName.get('ConvertHoldOnRehold')?.condition).toEqual({ after: 'PaymentConfirmed' });
    expect(
      policies
        .filter((p) => 'condition' in p)
        .map((p) => p.name)
        .sort(),
    ).toEqual(['ConvertHoldOnPayment', 'ConvertHoldOnRehold', 'PromoteWaitlistOnRelease']);
  });
});
