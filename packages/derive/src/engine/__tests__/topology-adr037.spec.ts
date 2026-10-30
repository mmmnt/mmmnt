import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { ProjectLoader } from '@mmmnt/core';
import { TopologyEmitter } from '../topology-emitter.js';

const PROJECT = resolve(import.meta.dirname, '../../../../../fixtures/valid/model-completeness');

describe('topology with ADR-037 read-side nodes', () => {
  it('types query and projection nodes as such', async () => {
    const { ir } = await new ProjectLoader().loadProject(
      ['contexts/memory.moment', 'contexts/retrieval.moment', 'flows/recall.moment'].map((f) =>
        resolve(PROJECT, f),
      ),
    );
    const nodes = new TopologyEmitter()
      .emit(ir, ir.flows[0])
      .frames.flatMap((f) => f.nodes.map((n) => [n.label, n.type]));

    expect(nodes).toEqual([
      ['RecordDecision', 'command'],
      ['DecisionMade', 'event'],
      ['QueryContext', 'query'],
      ['TrajectoryResult', 'projection'],
    ]);
  });
});
