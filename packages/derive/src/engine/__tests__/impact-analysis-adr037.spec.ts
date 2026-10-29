import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { ProjectLoader } from '@mmmnt/core';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { generateImpactAnalysis } from '../impact-analysis-generator.js';

const PROJECT = resolve(import.meta.dirname, '../../../../../fixtures/valid/model-completeness');
let ir: IntermediateRepresentation;

beforeAll(async () => {
  const result = await new ProjectLoader().loadProject(
    ['contexts/memory.moment', 'contexts/retrieval.moment', 'flows/recall.moment'].map((f) =>
      resolve(PROJECT, f),
    ),
  );
  ir = result.ir;
});

describe('impact analysis with ADR-037 constructs', () => {
  it('makes projections depend on their sources and queries on what they read', () => {
    const nodes = generateImpactAnalysis(ir).nodes;

    expect(nodes.find((n) => n.name === 'TrajectoryResult')).toMatchObject({
      type: 'projection',
      dependsOn: ['event:Memory:DecisionMade'],
    });
    expect(nodes.find((n) => n.name === 'QueryContext')).toMatchObject({
      type: 'query',
      dependsOn: ['projection:Retrieval:TrajectoryResult'],
    });
  });

  it('makes an orchestration depend on the command that invokes it and trigger the commands it issues (ADR-038 §2)', () => {
    const nodes = generateImpactAnalysis(ir).nodes;

    expect(nodes.find((n) => n.name === 'RecallFlow')).toMatchObject({
      type: 'saga',
      dependsOn: ['command:Retrieval:StartRecall'],
      triggers: ['command:Memory:MarkRecalled', 'command:Memory:ClearRecall'],
    });
    expect(nodes.find((n) => n.name === 'RecallOnDecisionMade')?.triggers).toEqual([
      'command:Retrieval:StartRecall',
    ]);
  });
});
