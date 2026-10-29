import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { ProjectLoader } from '@mmmnt/core';
import { generateSimulationScenario } from '../simulation-scenario-generator.js';

const PROJECT = resolve(import.meta.dirname, '../../../../../fixtures/valid/model-completeness');

describe('simulation with ADR-037 read-side nodes', () => {
  it('marks query and projection steps as reads, never as domain events', async () => {
    const { ir } = await new ProjectLoader().loadProject(
      ['contexts/memory.moment', 'contexts/retrieval.moment', 'flows/recall.moment'].map((f) =>
        resolve(PROJECT, f),
      ),
    );

    const types = generateSimulationScenario(ir, ir.flows[0]).events.map((e) => e.eventType);

    expect(types).toEqual(
      expect.arrayContaining(['SimQuery.QueryContext', 'SimProjection.TrajectoryResult']),
    );
    expect(types).not.toContain('QueryContext');
    expect(types).not.toContain('TrajectoryResult');
  });
});
