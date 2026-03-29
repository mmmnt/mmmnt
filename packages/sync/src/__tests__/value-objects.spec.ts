import { describe, it, expect } from 'vitest';
import type {
  ASTDifference,
  TypeLevelChange,
  DiffPoint,
  DriftPoint,
  DriftReport,
  ImplementationChangeProposal,
  DetectedConsumption,
  ConsumptionDetectionResult,
  SyncCursor,
  SourceAttribution,
  EventMetadata,
  DifferenceType,
  DriftDirection,
  ProposalStatus,
  FeedbackEventType,
} from '../index.js';

// ---------------------------------------------------------------------------
// String literal union types (enums)
// ---------------------------------------------------------------------------

describe('DifferenceType', () => {
  it('accepts all variant values', () => {
    const values: DifferenceType[] = [
      'renamed-interface',
      'added-field',
      'removed-field',
      'changed-type',
      'new-interface',
      'removed-interface',
      'unrecognized',
    ];
    expect(values).toHaveLength(7);
  });
});

describe('DriftDirection', () => {
  it('accepts all variant values', () => {
    const values: DriftDirection[] = [
      'implementation-added',
      'implementation-removed',
      'specification-added',
      'specification-removed',
    ];
    expect(values).toHaveLength(4);
  });
});

describe('ProposalStatus', () => {
  it('accepts all variant values', () => {
    const values: ProposalStatus[] = ['pending', 'accepted', 'rejected', 'superseded'];
    expect(values).toHaveLength(4);
  });
});

describe('FeedbackEventType', () => {
  it('accepts all variant values', () => {
    const values: FeedbackEventType[] = [
      'ValueObjectDefined',
      'ValueObjectRemoved',
      'ValueObjectRenamed',
      'ValueObjectFieldAdded',
      'ValueObjectFieldRemoved',
      'ValueObjectFieldRevised',
      'CommandInputRevised',
      'DomainEventPayloadRevised',
    ];
    expect(values).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// Interface VOs — construction + immutability
// ---------------------------------------------------------------------------

describe('ASTDifference', () => {
  it('constructs with valid inputs', () => {
    const vo: ASTDifference = {
      filePath: 'src/types/order.ts',
      differenceType: 'added-field',
      expectedNode: 'interface Order { id: string }',
      actualNode: 'interface Order { id: string; amount: number }',
    };
    expect(vo.filePath).toBe('src/types/order.ts');
    expect(vo.differenceType).toBe('added-field');
  });
});

describe('TypeLevelChange', () => {
  it('constructs with valid inputs', () => {
    const vo: TypeLevelChange = {
      symbolName: 'Order',
      changeKind: 'field-added',
    };
    expect(vo.symbolName).toBe('Order');
    expect(vo.previousDefinition).toBeUndefined();
  });

  it('accepts optional fields', () => {
    const vo: TypeLevelChange = {
      symbolName: 'Order',
      changeKind: 'renamed',
      previousDefinition: 'interface OrderV1 {}',
      newDefinition: 'interface Order {}',
    };
    expect(vo.previousDefinition).toBe('interface OrderV1 {}');
  });
});

describe('DiffPoint', () => {
  it('constructs with valid inputs', () => {
    const vo: DiffPoint = {
      filePath: 'src/order.ts',
      differenceType: 'new-interface',
      symbolName: 'Order',
    };
    expect(vo.symbolName).toBe('Order');
  });
});

describe('DriftPoint', () => {
  it('constructs with valid inputs', () => {
    const vo: DriftPoint = {
      filePath: 'src/order.ts',
      aggregateName: 'Order',
      contextName: 'Ordering',
      driftDirection: 'implementation-added',
      description: 'New field added in implementation',
    };
    expect(vo.driftDirection).toBe('implementation-added');
    expect(vo.suggestedEvent).toBeUndefined();
  });
});

describe('DriftReport', () => {
  it('constructs with valid inputs', () => {
    const vo: DriftReport = {
      scope: 'full',
      driftPoints: [
        {
          filePath: 'src/order.ts',
          aggregateName: 'Order',
          contextName: 'Ordering',
          driftDirection: 'implementation-added',
          description: 'New field',
        },
      ],
      totalDrifted: 1,
      totalAligned: 5,
      timestamp: '2026-01-01T00:00:00Z',
    };
    expect(vo.driftPoints).toHaveLength(1);
    expect(vo.totalDrifted).toBe(1);
  });
});

describe('ImplementationChangeProposal', () => {
  it('constructs with valid inputs', () => {
    const vo: ImplementationChangeProposal = {
      proposalId: 'prop-001',
      proposedEventType: 'ValueObjectFieldAdded',
      proposedPayload: { fieldName: 'amount', fieldType: 'number' },
      sourceFile: 'src/order.ts',
      sourceDifference: {
        filePath: 'src/order.ts',
        differenceType: 'added-field',
        expectedNode: '',
        actualNode: 'amount: number',
      },
    };
    expect(vo.proposalId).toBe('prop-001');
    expect(vo.dualPopulationApplied).toBeUndefined();
  });
});

describe('DetectedConsumption', () => {
  it('constructs with valid inputs', () => {
    const vo: DetectedConsumption = {
      filePath: 'src/handler.ts',
      eventType: 'OrderPlaced',
      fields: ['orderId', 'amount'],
      confidence: 'high',
    };
    expect(vo.fields).toHaveLength(2);
    expect(vo.confidence).toBe('high');
  });
});

describe('ConsumptionDetectionResult', () => {
  it('constructs with valid inputs', () => {
    const vo: ConsumptionDetectionResult = {
      detectedConsumptions: [
        {
          filePath: 'src/handler.ts',
          eventType: 'OrderPlaced',
          fields: ['orderId'],
          confidence: 'medium',
        },
      ],
      unresolvableReferences: ['UnknownEvent'],
    };
    expect(vo.detectedConsumptions).toHaveLength(1);
    expect(vo.unresolvableReferences).toHaveLength(1);
  });
});

describe('SyncCursor', () => {
  it('constructs with valid inputs', () => {
    const vo: SyncCursor = {
      specificationHash: 'abc123',
      timestamp: '2026-01-01T00:00:00Z',
    };
    expect(vo.specificationHash).toBe('abc123');
    expect(vo.lastProcessedFile).toBeUndefined();
  });
});

describe('SourceAttribution', () => {
  it('constructs with valid inputs', () => {
    const vo: SourceAttribution = {
      source: 'mmmnt:emission',
    };
    expect(vo.source).toBe('mmmnt:emission');
  });
});

describe('EventMetadata', () => {
  it('constructs with valid inputs', () => {
    const vo: EventMetadata = {
      eventId: 'evt-001',
      eventType: 'ValueObjectDefined',
      timestamp: '2026-01-01T00:00:00Z',
      actor: 'dev@example.com',
      source: { source: 'mmmnt:implementation-feedback' },
      causationId: 'cause-001',
      correlationId: 'corr-001',
      version: 1,
      commitRef: 'abc123',
    };
    expect(vo.eventId).toBe('evt-001');
    expect(vo.version).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Immutability verification
// ---------------------------------------------------------------------------

describe('Immutability', () => {
  it('VO instances are readonly at type level', () => {
    // TypeScript readonly enforcement is compile-time only.
    // This test verifies that the types compile with readonly fields.
    const cursor: SyncCursor = {
      specificationHash: 'hash',
      timestamp: 'now',
    };

    if (false) {
      // @ts-expect-error — readonly field cannot be assigned
      cursor.specificationHash = 'changed';
    }

    // Readonly enforcement is compile-time via TypeScript.
    // This test validates the type constraint exists without runtime mutation.
    expect(cursor).toBeDefined();
  });
});
