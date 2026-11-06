import { describe, it, expect } from 'vitest';
import { MomentParser } from '../../src/parser/moment-parser.js';
import type { MomentValidator } from '../../src/validation/moment-validator.js';

/** Parse a source and return "V<n>" rule ids of every error, in order (a message begins with its rule id). */
async function errors(source: string): Promise<string[]> {
  const result = await new MomentParser().parseContent(source);
  return result.diagnostics
    .filter((d) => d.severity === 'error')
    .map((d) => d.message.split(':')[0]);
}

const CLINIC = `
context "Ticketing" [Core]
  aggregate "Customer"
    identity customerId: UUID
    command ReserveSeats
      emits SeatsReserved
    event SeatsReserved
      customerId: UUID
  policy BillOnCompletion
    trigger PurchaseCompleted
    action "Bill the owner"
    chains-to ReserveSeats
  orchestration PurchaseProcess
    command StartPurchase
      emits PurchaseStarted
    command FinishPurchase
      emits PurchaseCompleted
    event PurchaseStarted
      customerId: UUID
    event PurchaseCompleted
      customerId: UUID
    invoked-by StartPurchase
    issues ReserveSeats
    states Started
    compensation none
    timeout purchaseWindow
`;

describe('ADR-040 D1 flows place process commands and process events', () => {
  it('resolves an orchestration command and a process event as declared building blocks (V1)', async () => {
    const source = `${CLINIC}
flow "Purchase"
  lane proc "Ticketing" [Core]
  moment "Purchase starts"
    proc: StartPurchase
    proc: PurchaseStarted
`;
    expect(await errors(source)).toEqual([]);
  });
});

describe('ADR-040 D3 V10 counts a note', () => {
  const flow = (moment: string): string => `
flow "F"
  lane l "L" [Core]
  lane ext "Card network" [External]
  moment "M"
${moment}
`;

  it('accepts a moment that holds only a note', async () => {
    expect(await errors(flow('    note ext: "The network authorises the card"'))).toEqual([]);
  });

  it('accepts a moment that holds only a note with no lane', async () => {
    expect(await errors(flow('    note "A step outside the model"'))).toEqual([]);
  });

  it('still refuses a moment with no node, when block or note', async () => {
    expect(await errors(flow(''))).toEqual(['V10']);
  });

  it('refuses a note that speaks for an undeclared lane (V13)', async () => {
    expect(await errors(flow('    note ghost: "Nobody declared this lane"'))).toEqual(['V13']);
  });
});

describe('ADR-040 D3 a note-only moment is a returns-to target (V6)', () => {
  it('accepts returns-to a moment that holds only a note', async () => {
    expect(
      await errors(`
flow "F"
  lane l "L" [Core]
  moment "Waiting"
    note "A person decides, outside the model"
  moment "Decided"
    l: Decided
      returns-to "Waiting"
`),
    ).toEqual([]);
  });
});

describe('ADR-040 D4 V5 takes an earlier node of the same moment', () => {
  const flow = (moment: string): string => `
flow "F"
  lane l "L" [Core]
  moment "Prior"
    l: Prior
  moment "M"
${moment}
`;

  it('accepts triggered-by of a node placed earlier in the same moment', async () => {
    expect(
      await errors(
        flow(
          '    l: OrderPlaced\n    l: ReserveSeatsOnOrderPlaced\n      triggered-by OrderPlaced',
        ),
      ),
    ).toEqual([]);
  });

  it('accepts a chain of hops inside one moment', async () => {
    expect(
      await errors(
        flow(
          '    l: OrderPlaced\n    l: ReserveSeatsOnOrderPlaced\n      triggered-by OrderPlaced\n    l: ReserveSeats\n      triggered-by ReserveSeatsOnOrderPlaced',
        ),
      ),
    ).toEqual([]);
  });

  it('accepts a hop whose cause is placed earlier in the moment than a when block', async () => {
    expect(await errors(flow('    l: A\n    when ok\n      l: B\n        triggered-by A'))).toEqual(
      [],
    );
  });

  it('still accepts a node from a prior moment', async () => {
    expect(await errors(flow('    l: X\n      triggered-by Prior'))).toEqual([]);
  });

  it('V5: refuses triggered-by of a node placed later in the same moment', async () => {
    expect(await errors(flow('    l: First\n      triggered-by Second\n    l: Second'))).toEqual([
      'V5',
    ]);
  });

  it('V5: refuses a node that names itself', async () => {
    expect(await errors(flow('    l: Loop\n      triggered-by Loop'))).toEqual(['V5']);
  });

  it('V5: refuses a name placed nowhere', async () => {
    expect(await errors(flow('    l: X\n      triggered-by Ghost'))).toEqual(['V5']);
  });
});

describe('ADR-040 D4 V43 decides strictly when the file declares the policy it needs', () => {
  const hop = (moment: string): string => `${CLINIC}
flow "Purchase"
  lane proc "Ticketing" [Core]
  moment "Hop"
${moment}
`;
  const v43 = async (source: string): Promise<{ success: boolean; severities: string[] }> => {
    const result = await new MomentParser().parseContent(source);
    return {
      success: result.success,
      severities: result.diagnostics.filter((d) => d.ruleId === 'V43').map((d) => d.severity),
    };
  };

  it('fails a single file whose policy does not declare the hop to the policy (a)', async () => {
    const r = await v43(
      hop(
        '    proc: PurchaseStarted\n    proc: BillOnCompletion\n      triggered-by PurchaseStarted',
      ),
    );
    expect(r).toEqual({ success: false, severities: ['error'] });
  });

  it('fails a single file whose policy does not chain to the command (b)', async () => {
    const r = await v43(
      hop(
        '    proc: BillOnCompletion\n    proc: StartPurchase\n      triggered-by BillOnCompletion',
      ),
    );
    expect(r).toEqual({ success: false, severities: ['error'] });
  });

  it('passes a hop the file declares', async () => {
    const r = await v43(
      hop(
        '    proc: PurchaseCompleted\n    proc: BillOnCompletion\n      triggered-by PurchaseCompleted',
      ),
    );
    expect(r).toEqual({ success: true, severities: [] });
    const chained = await v43(
      hop(
        '    proc: BillOnCompletion\n    proc: ReserveSeats\n      triggered-by BillOnCompletion',
      ),
    );
    expect(chained).toEqual({ success: true, severities: [] });
  });

  it('stays advisory when the deciding policy could live in another file (c)', async () => {
    const r = await v43(
      hop(
        '    proc: PurchaseStarted\n    proc: FinishPurchase\n      triggered-by PurchaseStarted',
      ),
    );
    expect(r).toEqual({ success: true, severities: ['warning'] });
  });
});

describe('ADR-040 validators over hand-built nodes', () => {
  const services = new MomentParser() as unknown as {
    services: { validation: { MomentValidator: MomentValidator } };
  };
  const validator = (): MomentValidator => services.services.validation.MomentValidator;
  const collect = (): { messages: string[]; accept: (s: unknown, m: unknown) => void } => {
    const messages: string[] = [];
    return { messages, accept: (_s, m) => messages.push(m as string) };
  };

  it('V13 for a note that is detached from a flow says nothing', () => {
    const { messages, accept } = collect();
    validator().checkNoteLane({ $type: 'NoteStatement', laneId: 'x', text: 't' } as never, accept);
    expect(messages).toEqual([]);
  });

  it('V13 for a note with no lane says nothing', () => {
    const { messages, accept } = collect();
    validator().checkNoteLane({ $type: 'NoteStatement', text: 't' } as never, accept);
    expect(messages).toEqual([]);
  });

  it('V10 treats a hand-built moment without a notes list as having no notes', () => {
    const { messages, accept } = collect();
    validator().checkMoment(
      { $type: 'MomentDeclaration', label: 'M', nodes: [], whenBlocks: [] } as never,
      accept,
    );
    expect(messages).toEqual(['V10: Moment must contain at least one node, when block or note.']);
  });

  it('V5 orders the nodes of a hand-built moment without CST as own nodes, then when nodes', () => {
    const earlier = { $type: 'NodePlacement', laneId: 'a', nodeName: 'Earlier', connections: [] };
    const hop = {
      $type: 'NodePlacement',
      laneId: 'a',
      nodeName: 'Hop',
      connections: [{ $type: 'TriggeredBy', nodeName: 'Earlier' }],
    };
    const moment = {
      $type: 'MomentDeclaration',
      label: 'M',
      nodes: [earlier, hop],
      whenBlocks: [],
    };
    const flow = { $type: 'FlowDeclaration', name: 'F', lanes: [], moments: [moment] };
    for (const n of [earlier, hop]) Object.assign(n, { $container: moment });
    Object.assign(moment, { $container: flow });
    const { messages, accept } = collect();
    validator().checkV5(hop as never, accept);
    expect(messages).toEqual([]);
  });

  it('V5 treats a node its moment does not hold as having no earlier siblings', () => {
    const sibling = { $type: 'NodePlacement', laneId: 'a', nodeName: 'Sibling', connections: [] };
    const other = { $type: 'NodePlacement', laneId: 'a', nodeName: 'Other', connections: [] };
    const stray = {
      $type: 'NodePlacement',
      laneId: 'a',
      nodeName: 'Stray',
      connections: [{ $type: 'TriggeredBy', nodeName: 'Sibling' }],
    };
    const moment = {
      $type: 'MomentDeclaration',
      label: 'M',
      nodes: [sibling, other],
      whenBlocks: [],
    };
    const flow = { $type: 'FlowDeclaration', name: 'F', lanes: [], moments: [moment] };
    Object.assign(stray, { $container: moment });
    Object.assign(moment, { $container: flow });
    const { messages, accept } = collect();
    validator().checkV5(stray as never, accept);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^V5:/);
  });
});
