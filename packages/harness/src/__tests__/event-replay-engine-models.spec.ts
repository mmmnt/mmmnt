import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MomentParser, ProjectLoader } from '@mmmnt/core';
import type { IntermediateRepresentation, FlowDefinition } from '@mmmnt/core';
import { EventReplayEngine } from '../event-replay-engine.js';

const ROOT = resolve(import.meta.dirname, '../../../..');
const TICKETWAVE = resolve(ROOT, 'examples/ticketwave/spec/ticketwave.moment');
const MODEL_COMPLETENESS = resolve(ROOT, 'fixtures/valid/model-completeness');

async function parseTicketWave(): Promise<IntermediateRepresentation> {
  const result = await new MomentParser().parseContent(
    readFileSync(TICKETWAVE, 'utf-8'),
    TICKETWAVE,
  );
  if (!result.success || !result.ir) throw new Error('TicketWave does not parse');
  return result.ir;
}

function flowNamed(ir: IntermediateRepresentation, prefix: string): FlowDefinition {
  const flow = ir.flows.find((f) => f.name.startsWith(prefix));
  if (!flow) throw new Error(`no flow ${prefix}`);
  return flow;
}

describe('EventReplayEngine over TicketWave', () => {
  const engine = new EventReplayEngine();
  let ir: IntermediateRepresentation;

  beforeAll(async () => {
    ir = await parseTicketWave();
  });

  it('replays every flow, N1 to N8, with no divergence', () => {
    const names = ir.flows.map((f) => f.name.slice(0, 2));
    expect(names).toEqual(['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8']);

    for (const flow of ir.flows) {
      const replay = engine.replay(flow, ir);
      expect(replay.divergencePoints, flow.name).toEqual([]);
      expect(replay.finalStateMatch, flow.name).toBe(true);
      expect(replay.stepsReplayed, flow.name).toBe(flow.moments.length);
    }
  });

  it('resolves a placement on a branch-lane to the lane, not to a context', () => {
    const flow = flowNamed(ir, 'N1');
    const botDetected = flow.lanes.find((l) => l.id === 'botDetected');
    expect(botDetected?.isBranch).toBe(true);
    expect(ir.contexts.some((c) => c.id === botDetected?.contextId)).toBe(false);
    const placed = flow.moments.some((m) =>
      (m.branches ?? []).some((b) => b.entries.some((e) => e.contextId === botDetected?.contextId)),
    );
    expect(placed).toBe(true);

    expect(engine.replay(flow, ir).finalStateMatch).toBe(true);
  });

  it('still diverges on a broken stream: a placement on a lane the flow does not declare', () => {
    const flow = flowNamed(ir, 'N2');
    const broken: FlowDefinition = {
      ...flow,
      moments: flow.moments.map((m, i) =>
        i === 1
          ? {
              ...m,
              contextEntries: [
                ...m.contextEntries,
                { contextId: 'ctx-Ghost', nodeName: 'GhostHappened', nodeKind: 'event' as const },
              ],
            }
          : m,
      ),
    };

    const replay = engine.replay(broken, ir);

    expect(replay.finalStateMatch).toBe(false);
    expect(replay.divergencePoints).toEqual([
      {
        momentIndex: 1,
        expectedState: 'context ctx-Ghost exists',
        actualState: 'context ctx-Ghost not found',
        eventThatCaused: 'GhostHappened',
      },
    ]);
  });

  it('diverges on a branch-lane of another flow: lanes resolve per flow', () => {
    // N1's `botDetected` lane is not a lane of N2, so a placement on it there names nothing.
    const n1Lane = flowNamed(ir, 'N1').lanes.find((l) => l.id === 'botDetected');
    const flow = flowNamed(ir, 'N2');
    const broken: FlowDefinition = {
      ...flow,
      moments: [
        {
          ...flow.moments[0],
          contextEntries: [
            { contextId: n1Lane!.contextId, nodeName: 'CustomerBlocked', nodeKind: 'event' },
          ],
        },
      ],
    };

    const replay = engine.replay(broken, ir);

    expect(replay.divergencePoints).toHaveLength(1);
    expect(replay.divergencePoints[0].actualState).toBe('context ctx-Bot Detected not found');
  });
});

describe('EventReplayEngine over a project with an [External] lane', () => {
  it('resolves a placement on an external lane to the declared external', async () => {
    const { ir } = await new ProjectLoader().loadProject(
      ['contexts/memory.moment', 'contexts/retrieval.moment', 'flows/recall.moment'].map((f) =>
        resolve(MODEL_COMPLETENESS, f),
      ),
    );
    const declared = ir.flows[0];
    const lane = declared.lanes.find((l) => l.classification === 'External');
    expect(lane).toBeDefined();
    expect((ir.externals ?? []).some((e) => e.name === lane?.label)).toBe(true);
    expect(ir.contexts.some((c) => c.id === lane?.contextId)).toBe(false);
    // The fixture only declares the lane; place a node on it.
    const flow: FlowDefinition = {
      ...declared,
      moments: [
        ...declared.moments,
        {
          id: 'moment-hosted',
          name: 'The hosted service answers',
          contextEntries: [
            { contextId: lane!.contextId, nodeName: 'ContextServed', nodeKind: 'event' },
          ],
        },
      ],
    };

    const engine = new EventReplayEngine();
    expect(engine.replay(flow, ir).divergencePoints).toEqual([]);

    const withoutExternal = { ...ir, externals: [] };
    const replay = engine.replay(flow, withoutExternal);
    expect(replay.finalStateMatch).toBe(false);
    expect(replay.divergencePoints[0].actualState).toBe(`external ${lane?.label} not found`);
  });
});
