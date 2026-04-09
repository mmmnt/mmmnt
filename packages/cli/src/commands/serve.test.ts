import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runFacetDirPipeline } from './serve.js';

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
      // Directory exists but is empty — no manifest.json
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
      // No topology file written
      expect(() => runFacetDirPipeline(facetDir, true)).toThrow(
        /topology file 'topology-order-placed\.json' that does not exist/,
      );
    });

    it('throws when a scenario file referenced by the manifest is absent', () => {
      writeJson(join(facetDir, 'manifest.json'), SAMPLE_MANIFEST);
      writeJson(join(facetDir, 'topology-order-placed.json'), SAMPLE_TOPOLOGY);
      // Scenario files missing
      expect(() => runFacetDirPipeline(facetDir, true)).toThrow(
        /scenario file 'scenario-flow-order-placed\.json' that does not exist/,
      );
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

  describe('artifact loading is best-effort', () => {
    it('returns null for missing artifact files without throwing', () => {
      const manifestNoArtifactFiles = {
        ...SAMPLE_MANIFEST,
        flows: [
          {
            ...SAMPLE_MANIFEST.flows[0],
            scenarios: [SAMPLE_MANIFEST.flows[0].scenarios[0]], // happy only
          },
        ],
      };
      writeJson(join(facetDir, 'manifest.json'), manifestNoArtifactFiles);
      writeJson(join(facetDir, 'topology-order-placed.json'), SAMPLE_TOPOLOGY);
      writeJson(join(facetDir, 'scenario-flow-order-placed.json'), SAMPLE_HAPPY_SCENARIO);
      // Intentionally omit event-catalog.json, impact-analysis.json, saga-state-machines.json

      const result = runFacetDirPipeline(facetDir, false);

      expect(result.artifacts.eventCatalog).toBeNull();
      expect(result.artifacts.impactAnalysis).toBeNull();
      expect(result.artifacts.sagaStateMachines).toBeNull();
      // Pipeline still succeeds because artifacts are best-effort.
      expect(Object.keys(result.scenarios)).toEqual(['scenario-flow-order-placed.json']);
    });
  });
});
