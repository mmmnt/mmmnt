import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { ProjectLoader } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { TestRunner } from '../test-runner.js';

const PROJECT = resolve(import.meta.dirname, '../../../../fixtures/valid/model-completeness');

describe('TestRunner over the ADR-038 exemplar project', () => {
  it('passes every orchestration and relay-policy case derived from it', async () => {
    const { ir } = await new ProjectLoader().loadProject(
      ['contexts/memory.moment', 'contexts/retrieval.moment', 'flows/recall.moment'].map((f) =>
        resolve(PROJECT, f),
      ),
    );
    const topology = deriveTopology(ir);
    const cases = topology.suites.flatMap((s) => s.testCases.map((c) => c.momentId));

    const result = new TestRunner().run(topology, ir);

    expect(cases).toEqual(
      expect.arrayContaining([
        'saga-RecallFlow-initiated',
        'policy-RecallOnDecisionMade',
        'policy-FinishRecallOnDecisionRecalled',
      ]),
    );
    expect(result.testsFailed).toBe(0);
  });
});
