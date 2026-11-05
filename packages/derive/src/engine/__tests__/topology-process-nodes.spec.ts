import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { ProjectLoader, type IntermediateRepresentation } from '@mmmnt/core';
import { TopologyEmitter, type SimulationTopology } from '../topology-emitter.js';
import { generateSimulationScenario } from '../simulation-scenario-generator.js';

const VALID = resolve(import.meta.dirname, '../../../../../fixtures/valid/process-constructs');
const filesOf = (dir: string): string[] =>
  readdirSync(resolve(VALID, dir))
    .sort()
    .map((f) => resolve(VALID, dir, f));

let ir: IntermediateRepresentation;
const topologyOf = (name: string): SimulationTopology =>
  new TopologyEmitter().emit(
    ir,
    ir.flows.find((f) => f.name === name)!,
  );
const nodeOf = (t: SimulationTopology, label: string) =>
  t.frames.flatMap((f) => f.nodes).find((n) => n.label === label)!;

beforeAll(async () => {
  ir = (await new ProjectLoader().loadProject([...filesOf('contexts'), ...filesOf('flows')])).ir;
});

describe('topology nodes of an orchestration (ADR-040 D1) over a merged project', () => {
  it('types a process command as a command, owned by its orchestration', () => {
    const node = nodeOf(topologyOf('Purchase'), 'StartPurchase');
    expect(node.type).toBe('command');
    expect(node.process).toBe('PurchaseProcess');
  });

  it('routes a process command by its SimProcess event type, not by its plain name', () => {
    const t = topologyOf('Purchase');
    const id = nodeOf(t, 'StartPurchase').id;
    expect(t.eventRouting['SimProcess.StartPurchase']).toEqual([id]);
    expect(t.eventRouting['StartPurchase']).toBeUndefined();
  });

  it('keeps a process event an event owned by its orchestration', () => {
    const node = nodeOf(topologyOf('Purchase'), 'PurchaseCompleted');
    expect(node.type).toBe('event');
    expect(node.process).toBe('PurchaseProcess');
  });
});

describe('every event type a scenario streams resolves in the topology', () => {
  it('routes a placed policy by the event type its own name streams', () => {
    const flow = ir.flows.find((f) => f.name === 'Purchase')!;
    const t = topologyOf('Purchase');
    const types = generateSimulationScenario(ir, flow).events.map((e) => e.eventType);
    const policy = nodeOf(t, 'ReceiptOnPurchaseCompleted');
    expect(types).toContain('ReceiptOnPurchaseCompleted');
    expect(t.eventRouting['ReceiptOnPurchaseCompleted']).toEqual([policy.id]);
  });
});
