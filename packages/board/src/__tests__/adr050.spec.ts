import { describe, it, expect } from 'vitest';
import { projectBoard } from '../project-board.js';
import { policyText } from '../uses.js';
import { loadIr, numbered } from './helpers.js';

// ADR-050 D5: the board writes a union guard as the model does, `decision.kind = Admitted`.

describe('ADR-050 the board renders a union guard as written', () => {
  it('writes the path in the policy text', () => {
    expect(
      policyText({
        name: 'P',
        trigger: 'DecisionRecorded',
        chainsTo: 'StartVisit',
        condition: { field: 'decision.kind', equals: 'Admitted' },
      }),
    ).toBe('P\ntrigger DecisionRecorded [decision.kind = Admitted] -> StartVisit');
  });

  it('lists the policy with its condition in the manifest', async () => {
    const ir = numbered(await loadIr('fixtures/valid/union-conditions'));
    const { manifest } = projectBoard(ir);
    expect(manifest.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'policy',
        name: 'AdmittedDecisionStartsVisit',
        condition: 'decision.kind = Admitted',
        role: 'definition',
      }),
    );
  });
});
