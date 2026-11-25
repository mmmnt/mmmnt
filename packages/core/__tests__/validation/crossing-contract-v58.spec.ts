import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MomentParser } from '../../src/parser/moment-parser.js';
import { ProjectLoader } from '../../src/project/index.js';
import { validateCrossingContracts } from '../../src/validation/crossing-contract.js';
import type { IntermediateRepresentation } from '../../src/ir/index.js';

// V58: a crossing's contract names only fields its event declares. A warning per file, an error over a
// merged project, like the other model-level rules.

const TICKETWAVE = resolve(import.meta.dirname, '../../../../examples/ticketwave/spec');

const MODEL = (contract: string): string => `
context "Ordering" [Core]
  aggregate "Order"
    identity orderId: UUID
    command PlaceOrder
      input customerId: UUID
      emits OrderPlaced
    event OrderPlaced
      orderId: UUID
      customerId: UUID
context "Fulfillment" [Supporting]
  aggregate "Shipment"
    identity shipmentId: UUID
    command StartShipment
      input orderId: UUID
      emits ShipmentStarted
    event ShipmentStarted
      shipmentId: UUID

flow "Order to shipment"
  lane ordering "Ordering" [Core]
  lane fulfillment "Fulfillment" [Supporting]
  moment "Order placed"
    ordering: PlaceOrder
    ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier
      contract
${contract}
  moment "Shipment"
    fulfillment: StartShipment
      triggered-by OrderPlaced
    fulfillment: ShipmentStarted
`;

type Finding = { ruleId?: string; severity: string; message: string };

async function v58(source: string): Promise<Finding[]> {
  const result = await new MomentParser().parseContent(source);
  return result.diagnostics.filter((d) => d.ruleId === 'V58');
}

describe('V58: a crossing contract names fields its event declares', () => {
  it('says nothing when every contract field is a field of the event', async () => {
    expect(await v58(MODEL('        orderId: UUID [required]\n        customerId: UUID'))).toEqual(
      [],
    );
  });

  it('reports each contract field the event does not declare, with its rule id', async () => {
    const out = await v58(
      MODEL(
        '        orderId: UUID [required]\n        amount: Money [required]\n        sku: string',
      ),
    );
    expect(out.map((d) => d.severity)).toEqual(['warning', 'warning']);
    expect(out[0].message).toContain("'OrderPlaced'");
    expect(out[0].message).toContain("'Fulfillment'");
    expect(out[0].message).toContain("field 'amount'");
    expect(out[1].message).toContain("field 'sku'");
  });

  it('says nothing about a crossing event neither context declares (SP-02 reports it)', async () => {
    const source = MODEL('        amount: Money').replace(
      'ordering: OrderPlaced crosses-to',
      'ordering: OrderShipped crosses-to',
    );
    expect(await v58(source)).toEqual([]);
  });

  it('is an error over a merged project', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'v58-')), 'orders.moment');
    writeFileSync(file, MODEL('        orderId: UUID\n        amount: Money'));
    const project = await new ProjectLoader().loadProject([file]);
    const out = project.diagnostics.filter((d) => d.ruleId === 'V58');
    expect(out.map((d) => d.severity)).toEqual(['error']);
    expect(project.success).toBe(false);
  });

  it('TicketWave parses with no diagnostic, as a file and as a project', async () => {
    const file = join(TICKETWAVE, 'ticketwave.moment');
    const single = await new MomentParser().parseContent(readFileSync(file, 'utf8'), file);
    expect(single.diagnostics).toEqual([]);
    const project = await new ProjectLoader().loadProject([file]);
    expect(project.diagnostics).toEqual([]);
  });
});

describe('V58 over hand-built IR', () => {
  type Loose = Record<string, unknown>;
  const crossing = (over: Loose = {}): Loose => ({
    id: 'c1',
    connectionType: 'crosses-to',
    sourceMomentId: 'm1',
    targetContextId: 'b',
    eventId: 'evt-Sent',
    sourceNodeName: 'Sent',
    schemaContract: { eventType: 'Sent', fields: [{ name: 'extra' }], relationshipType: 'x' },
    ...over,
  });
  const ir = (contexts: Loose[], connections: Loose[] | undefined): IntermediateRepresentation =>
    ({
      contexts,
      flows: [
        {
          name: 'F',
          moments: [{ id: 'm1', contextEntries: [{ contextId: 'a', nodeName: 'Sent' }] }],
          ...(connections ? { connections } : {}),
        },
      ],
    }) as unknown as IntermediateRepresentation;
  const sent = (fields?: Loose[]): Loose => ({ name: 'Sent', ...(fields ? { fields } : {}) });
  const rules = (r: IntermediateRepresentation): string[] =>
    validateCrossingContracts(r).map((f) => f.message);

  it('reads an aggregate event, and the first of two events of one name', () => {
    const a = {
      id: 'a',
      name: 'A',
      events: [sent([{ name: 'extra' }])],
      aggregates: [{ events: [sent()] }, {}],
    };
    expect(rules(ir([a], [crossing()]))).toEqual([]);
    expect(rules(ir([{ id: 'a', aggregates: [{ events: [sent()] }] }], [crossing()]))).toHaveLength(
      1,
    );
  });

  it("falls back to the target context's event, and to the event id without a node name", () => {
    const b = { id: 'b', name: 'B', events: [sent([{ name: 'extra' }])] };
    expect(rules(ir([b], [crossing()]))).toEqual([]);
    expect(rules(ir([b], [crossing({ sourceNodeName: undefined })]))).toEqual([]);
    const out = rules(ir([{ id: 'b', events: [sent()] }], [crossing({ sourceMomentId: 'gone' })]));
    expect(out).toEqual([
      "Flow 'F': the contract of 'Sent' crossing to 'b' names field 'extra', which 'Sent' does not declare.",
    ]);
  });

  it('skips other connections and tolerates IR without flows or connections', () => {
    const a = { id: 'a', events: [sent()] };
    expect(rules(ir([a], [crossing({ connectionType: 'triggers' })]))).toEqual([]);
    expect(rules(ir([a], undefined))).toEqual([]);
    expect(rules({ contexts: [] } as unknown as IntermediateRepresentation)).toEqual([]);
  });
});
