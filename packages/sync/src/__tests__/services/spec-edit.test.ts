import { describe, it, expect } from 'vitest';
import { impliedSpecEdit, locateDeclarations } from '../../services/spec-edit.js';
import type { ImplementationChangeProposal, FeedbackEventType } from '../../value-objects/index.js';

const ORDERING = `context "Ordering" [Core]

  aggregate "Order"
    command PlaceOrder
      input customerId: UUID

    event OrderPlaced
      orderId: UUID

  value-object OrderItem
    productId: UUID
`;

const FULFILLMENT = `context "Fulfillment"

  value-object OrderItem
    productId: UUID

  value-object OrderItemSummary
    count: number
`;

const FILES = new Map([
  ['fulfillment.moment', FULFILLMENT],
  ['ordering.moment', ORDERING],
]);

function proposal(
  proposedEventType: FeedbackEventType,
  payload: Record<string, unknown>,
): ImplementationChangeProposal {
  return {
    proposalId: 'prop-1',
    proposedEventType,
    proposedPayload: payload,
    sourceFile: 'src/ordering/order.types.ts',
    sourceDifference: {
      filePath: 'src/ordering/order.types.ts',
      differenceType: 'added-field',
      expectedNode: '',
      actualNode: '',
    },
  };
}

describe('locateDeclarations', () => {
  it('finds every file and line declaring the construct, and its kind', () => {
    expect(locateDeclarations('OrderItem', FILES)).toEqual([
      { file: 'fulfillment.moment', line: 3, kind: 'value-object' },
      { file: 'ordering.moment', line: 10, kind: 'value-object' },
    ]);
  });

  it('matches whole names only', () => {
    expect(locateDeclarations('OrderItemSummary', FILES)).toEqual([
      { file: 'fulfillment.moment', line: 6, kind: 'value-object' },
    ]);
  });

  it('finds events, commands and quoted aggregates', () => {
    expect(locateDeclarations('OrderPlaced', FILES)).toEqual([
      { file: 'ordering.moment', line: 7, kind: 'event' },
    ]);
    expect(locateDeclarations('PlaceOrder', FILES)[0]).toMatchObject({ kind: 'command', line: 4 });
    expect(locateDeclarations('Order', FILES)[0]).toMatchObject({ kind: 'aggregate', line: 3 });
  });

  it('finds nothing for a construct no file declares', () => {
    expect(locateDeclarations('Invoice', FILES)).toEqual([]);
  });
});

describe('impliedSpecEdit', () => {
  it('ValueObjectFieldAdded: add the field to the declaring construct, located', () => {
    const edit = impliedSpecEdit(
      proposal('ValueObjectFieldAdded', {
        symbolName: 'OrderPlaced',
        fieldName: 'note',
        fieldType: 'string',
      }),
      FILES,
    );
    expect(edit).toEqual({
      edit: 'add field `note: string` to event `OrderPlaced`',
      locations: [{ file: 'ordering.moment', line: 7, kind: 'event' }],
    });
  });

  it('defaults the kind to value-object when the construct is declared nowhere', () => {
    const edit = impliedSpecEdit(
      proposal('ValueObjectFieldAdded', {
        symbolName: 'Invoice',
        fieldName: 'n',
        fieldType: 'number',
      }),
      FILES,
    );
    expect(edit).toEqual({
      edit: 'add field `n: number` to value-object `Invoice`',
      locations: [],
    });
  });

  it('marks an optional added field', () => {
    const { edit } = impliedSpecEdit(
      proposal('ValueObjectFieldAdded', {
        symbolName: 'OrderItem',
        fieldName: 'note',
        fieldType: 'string',
        optional: true,
      }),
      FILES,
    );
    expect(edit).toBe('add optional field `note: string` to value-object `OrderItem`');
  });

  it('ValueObjectFieldRemoved: remove the field', () => {
    const { edit } = impliedSpecEdit(
      proposal('ValueObjectFieldRemoved', { symbolName: 'OrderItem', fieldName: 'productId' }),
      FILES,
    );
    expect(edit).toBe('remove field `productId` from value-object `OrderItem`');
  });

  it('ValueObjectFieldRevised: change the field type', () => {
    const { edit } = impliedSpecEdit(
      proposal('ValueObjectFieldRevised', {
        symbolName: 'OrderItem',
        fieldName: 'productId',
        fieldType: 'number',
        previousFieldType: 'string',
      }),
      FILES,
    );
    expect(edit).toBe(
      'change field `productId` of value-object `OrderItem` from `string` to `number`',
    );
  });

  it('ValueObjectFieldRevised without a field: review the construct', () => {
    const { edit } = impliedSpecEdit(
      proposal('ValueObjectFieldRevised', {
        symbolName: 'OrderItem',
        description: "Symbol 'OrderItem' changed kind",
      }),
      FILES,
    );
    expect(edit).toBe("revise value-object `OrderItem`: Symbol 'OrderItem' changed kind");
  });

  it('ValueObjectDefined: declare the new construct', () => {
    const { edit } = impliedSpecEdit(
      proposal('ValueObjectDefined', { symbolName: 'Invoice' }),
      FILES,
    );
    expect(edit).toBe('declare value-object `Invoice`');
  });

  it('ValueObjectRemoved: remove the construct', () => {
    const { edit } = impliedSpecEdit(
      proposal('ValueObjectRemoved', { symbolName: 'OrderItem' }),
      FILES,
    );
    expect(edit).toBe('remove value-object `OrderItem`');
  });

  it('ValueObjectRenamed: rename the construct', () => {
    const { edit } = impliedSpecEdit(
      proposal('ValueObjectRenamed', {
        symbolName: 'OrderItem',
        description: 'renamed to LineItem',
      }),
      FILES,
    );
    expect(edit).toBe('rename value-object `OrderItem`: renamed to LineItem');
  });
});
