import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runFacetDirPipeline, runServe, runPipeline, describeMode } from './serve.js';

let facetDir: string;

const SAMPLE_TOPOLOGY = {
  flowId: 'flow-order-placed',
  flowName: 'order-placed',
  nodes: [],
  edges: [],
};

const SAMPLE_HAPPY_SCENARIO = {
  scenarioId: 'scenario-flow-order-placed',
  flowId: 'flow-order-placed',
  scenarioLabel: 'Happy Path: order-placed',
  events: [],
  expectedPath: [],
  activeBranches: [],
};

const SAMPLE_NEGATIVE_SCENARIO = {
  scenarioId: 'scenario-flow-order-placed-neg-PlaceOrder-orderNotPlaced',
  flowId: 'flow-order-placed',
  scenarioLabel: 'Failure: precondition violation',
  events: [],
  expectedPath: [],
  activeBranches: [],
};

const SAMPLE_MANIFEST = {
  flows: [
    {
      flowId: 'flow-order-placed',
      flowName: 'order-placed',
      topology: 'topology-order-placed.json',
      scenarios: [
        {
          scenarioId: 'scenario-flow-order-placed',
          scenarioLabel: 'Happy Path: order-placed',
          description: 'Happy path',
          file: 'scenario-flow-order-placed.json',
          eventCount: 4,
          pathLength: 4,
          branchCount: 0,
          isHappyPath: true,
          isNegative: false,
        },
        {
          scenarioId: 'scenario-flow-order-placed-neg-PlaceOrder-orderNotPlaced',
          scenarioLabel: 'Failure: precondition violation',
          description: 'Negative',
          file: 'scenario-flow-order-placed-neg-PlaceOrder-orderNotPlaced.json',
          eventCount: 2,
          pathLength: 1,
          branchCount: 0,
          isHappyPath: false,
          isNegative: true,
        },
      ],
    },
  ],
  artifacts: {
    eventCatalog: 'event-catalog.json',
    impactAnalysis: 'impact-analysis.json',
    sagaStateMachines: 'saga-state-machines.json',
    asyncApi: 'asyncapi.yaml',
  },
};

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

function populateValidFacetDir(dir: string): void {
  writeJson(join(dir, 'manifest.json'), SAMPLE_MANIFEST);
  writeJson(join(dir, 'topology-order-placed.json'), SAMPLE_TOPOLOGY);
  writeJson(join(dir, 'scenario-flow-order-placed.json'), SAMPLE_HAPPY_SCENARIO);
  writeJson(
    join(dir, 'scenario-flow-order-placed-neg-PlaceOrder-orderNotPlaced.json'),
    SAMPLE_NEGATIVE_SCENARIO,
  );
  writeJson(join(dir, 'event-catalog.json'), { events: [] });
  writeJson(join(dir, 'impact-analysis.json'), { nodes: [] });
  writeJson(join(dir, 'saga-state-machines.json'), { sagas: [] });
}

beforeEach(() => {
  facetDir = mkdtempSync(join(tmpdir(), 'moment-serve-facet-'));
});

afterEach(() => {
  rmSync(facetDir, { recursive: true, force: true });
});

describe('runFacetDirPipeline', () => {
  describe('manifest.json as authoritative index', () => {
    it('throws when manifest.json is missing', () => {
      expect(() => runFacetDirPipeline(facetDir, true)).toThrow(/missing manifest\.json/);
    });

    it('throws when manifest.json is not a JSON object', () => {
      writeFileSync(join(facetDir, 'manifest.json'), '[]', 'utf-8');
      expect(() => runFacetDirPipeline(facetDir, true)).toThrow(/expected a JSON object/);
    });

    it('throws when manifest is missing the flows array', () => {
      writeJson(join(facetDir, 'manifest.json'), { artifacts: {} });
      expect(() => runFacetDirPipeline(facetDir, true)).toThrow(/expected a 'flows' array/);
    });

    it('throws when manifest is missing the artifacts object', () => {
      writeJson(join(facetDir, 'manifest.json'), { flows: [] });
      expect(() => runFacetDirPipeline(facetDir, true)).toThrow(/expected an 'artifacts' object/);
    });

    it('throws when a topology file referenced by the manifest is absent', () => {
      writeJson(join(facetDir, 'manifest.json'), SAMPLE_MANIFEST);
      expect(() => runFacetDirPipeline(facetDir, true)).toThrow(
        /'topology-order-placed\.json' that does not exist/,
      );
    });

    it('throws when a scenario file referenced by the manifest is absent', () => {
      writeJson(join(facetDir, 'manifest.json'), SAMPLE_MANIFEST);
      writeJson(join(facetDir, 'topology-order-placed.json'), SAMPLE_TOPOLOGY);
      expect(() => runFacetDirPipeline(facetDir, true)).toThrow(
        /'scenario-flow-order-placed\.json' that does not exist/,
      );
    });

    it('throws when a referenced topology file is not valid JSON', () => {
      writeJson(join(facetDir, 'manifest.json'), SAMPLE_MANIFEST);
      writeFileSync(join(facetDir, 'topology-order-placed.json'), '{not json', 'utf-8');
      expect(() => runFacetDirPipeline(facetDir, true)).toThrow(
        /'topology-order-placed\.json' is not valid JSON/,
      );
    });
  });

  describe('path traversal guard', () => {
    it('rejects a manifest that points topology at a relative escape (../)', () => {
      const escapingManifest = {
        flows: [
          {
            ...SAMPLE_MANIFEST.flows[0],
            topology: '../escaped-topology.json',
          },
        ],
        artifacts: SAMPLE_MANIFEST.artifacts,
      };
      writeJson(join(facetDir, 'manifest.json'), escapingManifest);
      expect(() => runFacetDirPipeline(facetDir, true)).toThrow(/escapes the facet directory/);
    });

    it('rejects a manifest that points scenario at an absolute path', () => {
      const escapingManifest = {
        flows: [
          {
            ...SAMPLE_MANIFEST.flows[0],
            scenarios: [
              {
                ...SAMPLE_MANIFEST.flows[0].scenarios[0],
                file: '/etc/passwd',
              },
            ],
          },
        ],
        artifacts: SAMPLE_MANIFEST.artifacts,
      };
      writeJson(join(facetDir, 'manifest.json'), escapingManifest);
      writeJson(join(facetDir, 'topology-order-placed.json'), SAMPLE_TOPOLOGY);
      expect(() => runFacetDirPipeline(facetDir, true)).toThrow(/escapes the facet directory/);
    });
  });

  describe('happy path (includeAll = false)', () => {
    beforeEach(() => {
      populateValidFacetDir(facetDir);
    });

    it('serves only the happy-path scenario by default', () => {
      const result = runFacetDirPipeline(facetDir, false);

      expect(Object.keys(result.scenarios)).toEqual(['scenario-flow-order-placed.json']);
      expect(result.manifest.flows).toHaveLength(1);
      expect(result.manifest.flows[0].scenarioCount).toBe(1);
      expect(result.manifest.flows[0].flowId).toBe('flow-order-placed');
      expect(result.manifest.flows[0].flowName).toBe('order-placed');
    });

    it('loads the topology referenced by the manifest', () => {
      const result = runFacetDirPipeline(facetDir, false);

      expect(result.topologies).toHaveProperty('topology-order-placed.json');
      const topo = result.topologies['topology-order-placed.json'] as unknown as {
        flowId: string;
      };
      expect(topo.flowId).toBe('flow-order-placed');
    });

    it('loads artifacts from the filenames in the manifest', () => {
      const result = runFacetDirPipeline(facetDir, false);

      expect(result.artifacts.eventCatalog).not.toBeNull();
      expect(result.artifacts.impactAnalysis).not.toBeNull();
      expect(result.artifacts.sagaStateMachines).not.toBeNull();
    });
  });

  describe('all scenarios (includeAll = true)', () => {
    beforeEach(() => {
      populateValidFacetDir(facetDir);
    });

    it('serves happy and negative scenarios when includeAll is true', () => {
      const result = runFacetDirPipeline(facetDir, true);

      expect(Object.keys(result.scenarios).sort()).toEqual([
        'scenario-flow-order-placed-neg-PlaceOrder-orderNotPlaced.json',
        'scenario-flow-order-placed.json',
      ]);
      expect(result.manifest.flows[0].scenarioCount).toBe(2);
    });

    it('preserves flow metadata from the manifest', () => {
      const result = runFacetDirPipeline(facetDir, true);

      expect(result.manifest.flows[0]).toMatchObject({
        flowId: 'flow-order-placed',
        flowName: 'order-placed',
        topology: 'topology-order-placed.json',
      });
    });
  });

  describe('artifact filename normalization', () => {
    it('falls back to default filenames when a manifest omits an artifact key', () => {
      // manifest.artifacts is present but missing `impactAnalysis`
      const partial = {
        flows: [
          {
            ...SAMPLE_MANIFEST.flows[0],
            scenarios: [SAMPLE_MANIFEST.flows[0].scenarios[0]],
          },
        ],
        artifacts: {
          eventCatalog: 'event-catalog.json',
          // impactAnalysis intentionally missing
          sagaStateMachines: 'saga-state-machines.json',
        },
      };
      writeJson(join(facetDir, 'manifest.json'), partial);
      writeJson(join(facetDir, 'topology-order-placed.json'), SAMPLE_TOPOLOGY);
      writeJson(join(facetDir, 'scenario-flow-order-placed.json'), SAMPLE_HAPPY_SCENARIO);
      writeJson(join(facetDir, 'event-catalog.json'), { events: [] });
      writeJson(join(facetDir, 'saga-state-machines.json'), { sagas: [] });
      // impact-analysis.json intentionally absent so loadArtifact returns null
      // — the manifest filenames should still advertise the default name so
      // both sides (WS manifest + disk loader) agree.

      const result = runFacetDirPipeline(facetDir, false);

      expect(result.manifest.artifacts.eventCatalog).toBe('event-catalog.json');
      expect(result.manifest.artifacts.impactAnalysis).toBe('impact-analysis.json');
      expect(result.manifest.artifacts.sagaStateMachines).toBe('saga-state-machines.json');

      expect(result.artifacts.impactAnalysis).toBeNull();
      expect(result.artifacts.eventCatalog).not.toBeNull();
      expect(result.artifacts.sagaStateMachines).not.toBeNull();
    });

    it('returns null for missing artifact files without throwing', () => {
      const manifestNoArtifactFiles = {
        ...SAMPLE_MANIFEST,
        flows: [
          {
            ...SAMPLE_MANIFEST.flows[0],
            scenarios: [SAMPLE_MANIFEST.flows[0].scenarios[0]],
          },
        ],
      };
      writeJson(join(facetDir, 'manifest.json'), manifestNoArtifactFiles);
      writeJson(join(facetDir, 'topology-order-placed.json'), SAMPLE_TOPOLOGY);
      writeJson(join(facetDir, 'scenario-flow-order-placed.json'), SAMPLE_HAPPY_SCENARIO);

      const result = runFacetDirPipeline(facetDir, false);

      expect(result.artifacts.eventCatalog).toBeNull();
      expect(result.artifacts.impactAnalysis).toBeNull();
      expect(result.artifacts.sagaStateMachines).toBeNull();
      expect(Object.keys(result.scenarios)).toEqual(['scenario-flow-order-placed.json']);
    });
  });
});

describe('describeMode', () => {
  it('returns "spec file" for live-derive mode', () => {
    expect(describeMode(false, false)).toBe('spec file');
    expect(describeMode(false, true)).toBe('spec file');
  });

  it('returns "facet dir, happy path only" for directory mode without --all', () => {
    expect(describeMode(true, false)).toBe('facet dir, happy path only');
  });

  it('returns "facet dir, all scenarios" for directory mode with --all', () => {
    expect(describeMode(true, true)).toBe('facet dir, all scenarios');
  });
});

describe('runPipeline (spec-file live derive)', () => {
  const FIXTURE = resolve(
    import.meta.dirname,
    '../../../../fixtures/valid/minimal/flows/order-placed.moment',
  );

  it('parses a .moment flow fixture and produces a hydrated PipelineResult', async () => {
    const result = await runPipeline(FIXTURE, false);

    expect(result.ir).toBeDefined();
    expect(result.manifest.flows.length).toBeGreaterThan(0);
    expect(Object.keys(result.topologies).length).toBeGreaterThan(0);
    expect(Object.keys(result.scenarios).length).toBeGreaterThan(0);
    expect(result.artifacts.eventCatalog).toBeDefined();
    expect(result.artifacts.impactAnalysis).toBeDefined();
    expect(result.artifacts.sagaStateMachines).toBeDefined();
  });

  it('returns at least as many scenarios with includeAll=true as with includeAll=false', async () => {
    const base = await runPipeline(FIXTURE, false);
    const all = await runPipeline(FIXTURE, true);

    expect(Object.keys(all.scenarios).length).toBeGreaterThanOrEqual(
      Object.keys(base.scenarios).length,
    );
  });
});

describe('runServe argument validation', () => {
  it('returns a usage error when no positional is given', async () => {
    const result = await runServe([]);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Usage:/);
  });

  it('returns a path-not-found error for a nonexistent positional', async () => {
    const missing = resolve(tmpdir(), `moment-serve-missing-${Date.now()}`);
    const result = await runServe([missing]);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Path not found/);
  });

  it('returns an invalid-port error for non-numeric --port', async () => {
    const result = await runServe([facetDir, '--port', 'not-a-number']);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Invalid port/);
  });

  it('returns an invalid-port error for out-of-range --port', async () => {
    const result = await runServe([facetDir, '--port', '99999']);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Invalid port/);
  });

  it('returns an initial-pipeline-failed error for a dir missing manifest.json', async () => {
    // facetDir is an empty temp dir — no manifest.json.
    const result = await runServe([facetDir]);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Initial pipeline failed/);
    expect(result.message).toMatch(/missing manifest\.json/);
  });

  it('returns an initial-pipeline-failed error for a malformed manifest.json', async () => {
    writeFileSync(join(facetDir, 'manifest.json'), 'not json at all', 'utf-8');
    const result = await runServe([facetDir]);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Initial pipeline failed/);
  });
});
