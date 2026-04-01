/**
 * MMNT-27 Moment Validator — Verification Tests
 *
 * Tests verify that custom validation checks correctly detect
 * invalid constructs and accept valid ones in .moment files.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
} from 'langium';
import { validationHelper, type ValidationResult } from 'langium/test';
import { MomentGeneratedModule, MomentGeneratedSharedModule } from '../../src/generated/module.js';
import type { MomentFile } from '../../src/generated/ast.js';
import { MomentModule, registerMomentValidationChecks } from '../../src/moment-module.js';
import type { MomentAddedServices } from '../../src/moment-module.js';
import type { CrossFileContext } from '../../src/validation/moment-validator.js';
import type { LangiumCoreServices } from 'langium';

let validate: (input: string) => Promise<ValidationResult<MomentFile>>;
let services: LangiumCoreServices & MomentAddedServices;

beforeAll(() => {
  const shared = inject(
    createDefaultSharedCoreModule(EmptyFileSystem),
    MomentGeneratedSharedModule,
  );
  services = inject(createDefaultCoreModule({ shared }), MomentGeneratedModule, MomentModule);
  shared.ServiceRegistry.register(services);
  registerMomentValidationChecks(services);
  validate = validationHelper<MomentFile>(services);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorMessages(result: ValidationResult<MomentFile>): string[] {
  return result.diagnostics
    .filter((d) => d.severity === 1) // DiagnosticSeverity.Error = 1
    .map((d) => d.message);
}

function warningMessages(result: ValidationResult<MomentFile>): string[] {
  return result.diagnostics
    .filter((d) => d.severity === 2) // DiagnosticSeverity.Warning = 2
    .map((d) => d.message);
}

// ===========================================================================
// SP Rules
// ===========================================================================
describe('MomentValidator', () => {
  describe('SP Rules', () => {
    describe('SP-03', () => {
      it('rejects crossing with empty contract (zero fields)', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            lane b "B" [Supporting]
            frame "Step"
              a: SomeEvent crosses-to b via Partnership
                contract
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('SP-03'))).toBe(true);
      });

      it('accepts crossing with populated contract', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            lane b "B" [Supporting]
            frame "Step"
              a: SomeEvent crosses-to b via Partnership
                contract
                  orderId: UUID [required]
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('SP-03'))).toBe(false);
      });
    });

    describe('SP-01', () => {
      it('is available as a cross-file validator method', () => {
        expect(typeof services.validation.MomentValidator.checkSP01).toBe('function');
      });
    });

    describe('SP-02', () => {
      it('is available as a cross-file validator method', () => {
        expect(typeof services.validation.MomentValidator.checkSP02).toBe('function');
      });
    });
  });

  // ===========================================================================
  // Error Rules
  // ===========================================================================
  describe('Error Rules', () => {
    describe('V2', () => {
      it('rejects crosses-to targeting a branch-lane', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            branch-lane errors "Errors" [Terminal]
            frame "Step"
              a: SomeEvent crosses-to errors via Partnership
                contract
                  id: UUID [required]
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V2'))).toBe(true);
      });

      it('accepts crosses-to targeting a regular lane', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            lane b "B" [Supporting]
            frame "Step"
              a: SomeEvent crosses-to b via CustomerSupplier
                contract
                  id: UUID [required]
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V2'))).toBe(false);
      });
    });

    describe('V5', () => {
      it('rejects triggered-by referencing a node not in prior frames', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step 1"
              a: DoSomething
                triggered-by NonExistent
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V5'))).toBe(true);
      });

      it('accepts triggered-by referencing a node from a prior frame', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step 1"
              a: OrderPlaced
            frame "Step 2"
              a: CheckInventory
                triggered-by OrderPlaced
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V5'))).toBe(false);
      });
    });

    describe('V6', () => {
      it('rejects returns-to referencing non-existent prior frame label', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step 1"
              a: First
            frame "Step 2"
              a: Second
                returns-to "Non-existent"
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V6'))).toBe(true);
      });

      it('accepts returns-to referencing a valid prior frame label', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step 1"
              a: First
            frame "Step 2"
              a: Second
                returns-to "Step 1"
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V6'))).toBe(false);
      });
    });

    describe('V7', () => {
      it('rejects optional node with crosses-to', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            lane b "B" [Supporting]
            frame "Step"
              a: SomeEvent [optional] crosses-to b via Partnership
                contract
                  id: UUID [required]
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V7'))).toBe(true);
      });

      it('accepts optional node without crosses-to', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step"
              a: SomeEvent [optional]
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V7'))).toBe(false);
      });
    });

    describe('V8', () => {
      it('rejects terminal node that is not last in its block', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step"
              a: First [terminal]
              a: Second
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V8'))).toBe(true);
      });

      it('accepts terminal node that is last in its block', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step"
              a: First
              a: Second [terminal]
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V8'))).toBe(false);
      });
    });

    describe('V10', () => {
      it('rejects frame with zero nodes and zero when blocks', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Empty"
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V10'))).toBe(true);
      });

      it('accepts frame with nodes', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Filled"
              a: SomeEvent
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V10'))).toBe(false);
      });

      it('accepts frame with when blocks', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Branch" [branch]
              when success
                a: SuccessEvent
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V10'))).toBe(false);
      });
    });

    describe('V13', () => {
      it('rejects node placement with undeclared lane ID', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step"
              nonexistent: SomeEvent
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V13'))).toBe(true);
      });

      it('accepts node placement with declared lane ID', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step"
              a: SomeEvent
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V13'))).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Warning Rules
  // ===========================================================================
  describe('Warning Rules', () => {
    describe('V16', () => {
      it('warns when branch-lane is not referenced in any block', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            branch-lane errors "Errors" [Terminal]
            frame "Step"
              a: SomeEvent
        `);
        const warnings = warningMessages(result);
        expect(warnings.some((m) => m.includes('V16'))).toBe(true);
      });

      it('does not warn when branch-lane is referenced', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            branch-lane errors "Errors" [Terminal]
            frame "Step"
              a: SomeEvent
            frame "Outcome" [branch]
              when failure
                errors: FailEvent [terminal]
        `);
        const warnings = warningMessages(result);
        expect(warnings.some((m) => m.includes('V16'))).toBe(false);
      });
    });

    describe('V17', () => {
      it('warns when flow has more than one returns-to', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step 1"
              a: First
            frame "Step 2"
              a: Second
                returns-to "Step 1"
            frame "Step 3"
              a: Third
                returns-to "Step 1"
        `);
        const warnings = warningMessages(result);
        expect(warnings.some((m) => m.includes('V17'))).toBe(true);
      });

      it('does not warn when flow has exactly one returns-to', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step 1"
              a: First
            frame "Step 2"
              a: Second
                returns-to "Step 1"
        `);
        const warnings = warningMessages(result);
        expect(warnings.some((m) => m.includes('V17'))).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Cross-File Validators (with CrossFileContext)
  // ===========================================================================
  describe('Cross-File Rules', () => {
    const mockContext: CrossFileContext = {
      declaredContextNames: ['Ordering', 'Fulfillment'],
      declaredEvents: new Map([
        ['Ordering', ['OrderPlaced', 'OrderCancelled']],
        ['Fulfillment', ['FulfillmentInitiated', 'OrderPlaced']],
      ]),
      declaredBuildingBlocks: new Map([
        [
          'Ordering',
          [
            { name: 'PlaceOrder', kind: 'command' },
            { name: 'OrderPlaced', kind: 'event' },
          ],
        ],
        [
          'Fulfillment',
          [
            { name: 'InitiateFulfillment', kind: 'command' },
            { name: 'FulfillmentInitiated', kind: 'event' },
          ],
        ],
      ]),
      declaredSagas: ['OrderFulfillment'],
    };

    describe('SP-01', () => {
      it('rejects flow lane referencing non-existent context', async () => {
        const result = await validate(`
          flow "test"
            lane a "NonExistent" [Core]
            frame "Step"
              a: SomeEvent
        `);
        const validator = services.validation.MomentValidator;
        const flow = result.document.parseResult.value.flows[0];
        const diagnostics: string[] = [];
        validator.checkSP01(
          flow,
          (severity, message) => {
            if (severity === 'error') diagnostics.push(message as string);
          },
          mockContext,
        );
        expect(diagnostics.some((m) => m.includes('SP-01'))).toBe(true);
      });

      it('accepts flow lane referencing declared context', async () => {
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            frame "Step"
              a: PlaceOrder
        `);
        const validator = services.validation.MomentValidator;
        const flow = result.document.parseResult.value.flows[0];
        const diagnostics: string[] = [];
        validator.checkSP01(
          flow,
          (severity, message) => {
            if (severity === 'error') diagnostics.push(message as string);
          },
          mockContext,
        );
        expect(diagnostics.some((m) => m.includes('SP-01'))).toBe(false);
      });
    });

    describe('SP-02', () => {
      it('rejects crossing referencing undeclared event', async () => {
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            lane b "Fulfillment" [Supporting]
            frame "Step"
              a: NonExistentEvent crosses-to b via CustomerSupplier
                contract
                  id: UUID [required]
        `);
        const validator = services.validation.MomentValidator;
        const crossing = result.document.parseResult.value.flows[0].frames[0].nodes[0].crossing!;
        const diagnostics: string[] = [];
        validator.checkSP02(
          crossing,
          (severity, message) => {
            if (severity === 'error') diagnostics.push(message as string);
          },
          mockContext,
        );
        expect(diagnostics.some((m) => m.includes('SP-02'))).toBe(true);
      });

      it('accepts crossing referencing declared event', async () => {
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            lane b "Fulfillment" [Supporting]
            frame "Step"
              a: OrderPlaced crosses-to b via CustomerSupplier
                contract
                  id: UUID [required]
        `);
        const validator = services.validation.MomentValidator;
        const crossing = result.document.parseResult.value.flows[0].frames[0].nodes[0].crossing!;
        const diagnostics: string[] = [];
        validator.checkSP02(
          crossing,
          (severity, message) => {
            if (severity === 'error') diagnostics.push(message as string);
          },
          mockContext,
        );
        expect(diagnostics.some((m) => m.includes('SP-02'))).toBe(false);
      });
    });

    describe('V1', () => {
      it('rejects node referencing non-existent building block', async () => {
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            frame "Step"
              a: NonExistentBlock
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
        const diagnostics: string[] = [];
        validator.checkV1(
          node,
          (severity, message) => {
            if (severity === 'error') diagnostics.push(message as string);
          },
          mockContext,
        );
        expect(diagnostics.some((m) => m.includes('V1'))).toBe(true);
      });

      it('accepts node referencing declared building block', async () => {
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            frame "Step"
              a: PlaceOrder
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
        const diagnostics: string[] = [];
        validator.checkV1(
          node,
          (severity, message) => {
            if (severity === 'error') diagnostics.push(message as string);
          },
          mockContext,
        );
        expect(diagnostics.some((m) => m.includes('V1'))).toBe(false);
      });
    });

    describe('V9', () => {
      it('rejects crosses-to on command kind', async () => {
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            lane b "Fulfillment" [Supporting]
            frame "Step"
              a: PlaceOrder crosses-to b via CustomerSupplier
                contract
                  id: UUID [required]
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
        const diagnostics: string[] = [];
        validator.checkV9(
          node,
          (severity, message) => {
            if (severity === 'error') diagnostics.push(message as string);
          },
          mockContext,
        );
        expect(diagnostics.some((m) => m.includes('V9'))).toBe(true);
      });

      it('accepts crosses-to on event kind', async () => {
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            lane b "Fulfillment" [Supporting]
            frame "Step"
              a: OrderPlaced crosses-to b via CustomerSupplier
                contract
                  id: UUID [required]
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
        const diagnostics: string[] = [];
        validator.checkV9(
          node,
          (severity, message) => {
            if (severity === 'error') diagnostics.push(message as string);
          },
          mockContext,
        );
        expect(diagnostics.some((m) => m.includes('V9'))).toBe(false);
      });
    });

    describe('V11', () => {
      it('rejects multiplicity on command kind', async () => {
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            frame "Step"
              a: PlaceOrder (×3)
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
        const diagnostics: string[] = [];
        validator.checkV11(
          node,
          (severity, message) => {
            if (severity === 'error') diagnostics.push(message as string);
          },
          mockContext,
        );
        expect(diagnostics.some((m) => m.includes('V11'))).toBe(true);
      });

      it('accepts multiplicity on event kind', async () => {
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            frame "Step"
              a: OrderPlaced (×3)
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
        const diagnostics: string[] = [];
        validator.checkV11(
          node,
          (severity, message) => {
            if (severity === 'error') diagnostics.push(message as string);
          },
          mockContext,
        );
        expect(diagnostics.some((m) => m.includes('V11'))).toBe(false);
      });
    });

    describe('V14', () => {
      it('warns on one-directional Partnership crossing', async () => {
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            lane b "Fulfillment" [Supporting]
            frame "Step"
              a: OrderPlaced crosses-to b via Partnership
                contract
                  id: UUID [required]
        `);
        const validator = services.validation.MomentValidator;
        const flow = result.document.parseResult.value.flows[0];
        const diagnostics: { severity: string; message: string }[] = [];
        validator.checkV14(flow, (severity, message) => {
          diagnostics.push({ severity: severity as string, message: message as string });
        });
        expect(diagnostics.some((d) => d.severity === 'warning' && d.message.includes('V14'))).toBe(
          true,
        );
      });

      it('no warning on bidirectional Partnership crossing', async () => {
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            lane b "Fulfillment" [Supporting]
            frame "Step 1"
              a: OrderPlaced crosses-to b via Partnership
                contract
                  id: UUID [required]
            frame "Step 2"
              b: FulfillmentReady crosses-to a via Partnership
                contract
                  id: UUID [required]
        `);
        const validator = services.validation.MomentValidator;
        const flow = result.document.parseResult.value.flows[0];
        const diagnostics: { severity: string; message: string }[] = [];
        validator.checkV14(flow, (severity, message) => {
          diagnostics.push({ severity: severity as string, message: message as string });
        });
        expect(diagnostics.some((d) => d.severity === 'warning' && d.message.includes('V14'))).toBe(
          false,
        );
      });
      it('detects Partnership crossings inside when blocks', async () => {
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            lane b "Fulfillment" [Supporting]
            frame "Outcome" [branch]
              when success
                a: OrderPlaced crosses-to b via Partnership
                  contract
                    id: UUID [required]
              when retry
                b: RetryEvent crosses-to a via Partnership
                  contract
                    id: UUID [required]
        `);
        const validator = services.validation.MomentValidator;
        const flow = result.document.parseResult.value.flows[0];
        const diagnostics: { severity: string; message: string }[] = [];
        validator.checkV14(flow, (severity, message) => {
          diagnostics.push({ severity: severity as string, message: message as string });
        });
        // Both crossings are inside when blocks — should detect both and find the reverse
        expect(diagnostics.some((d) => d.severity === 'warning' && d.message.includes('V14'))).toBe(
          false,
        );
      });
    });

    describe('V5 (standalone)', () => {
      it('rejects triggered-by referencing non-existent node via standalone method', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step 1"
              a: DoSomething
                triggered-by NonExistent
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
        const diagnostics: string[] = [];
        validator.checkV5(node, (severity, message) => {
          if (severity === 'error') diagnostics.push(message as string);
        });
        expect(diagnostics.some((m) => m.includes('V5'))).toBe(true);
      });

      it('accepts triggered-by referencing prior node via standalone method', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            frame "Step 1"
              a: First
            frame "Step 2"
              a: Second
                triggered-by First
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].frames[1].nodes[0];
        const diagnostics: string[] = [];
        validator.checkV5(node, (severity, message) => {
          if (severity === 'error') diagnostics.push(message as string);
        });
        expect(diagnostics.some((m) => m.includes('V5'))).toBe(false);
      });
    });

    describe('Cross-file context integration', () => {
      it('fires cross-file V1/V9/V11 when context is set', async () => {
        const validator = services.validation.MomentValidator;
        validator.setCrossFileContext(mockContext);
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            frame "Step"
              a: NonExistentBlock
        `);
        validator.clearCrossFileContext();
        // V1 fires through checkCrossFileNodeRules → checkV1
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V1'))).toBe(true);
      });

      it('does not fire cross-file rules when context is not set', async () => {
        const validator = services.validation.MomentValidator;
        validator.clearCrossFileContext();
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            frame "Step"
              a: NonExistentBlock
        `);
        // V1 should NOT fire since cross-file context is not set
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V1'))).toBe(false);
      });

      it('fires V9 for crosses-to on command via context', async () => {
        const validator = services.validation.MomentValidator;
        validator.setCrossFileContext(mockContext);
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            lane b "Fulfillment" [Supporting]
            frame "Step"
              a: PlaceOrder crosses-to b via CustomerSupplier
                contract
                  id: UUID [required]
        `);
        validator.clearCrossFileContext();
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V9'))).toBe(true);
      });

      it('fires V11 for multiplicity on command via context', async () => {
        const validator = services.validation.MomentValidator;
        validator.setCrossFileContext(mockContext);
        const result = await validate(`
          flow "test"
            lane a "Ordering" [Core]
            frame "Step"
              a: PlaceOrder (×3)
        `);
        validator.clearCrossFileContext();
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V11'))).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Branch coverage: when blocks with returns-to for V17 counting
  // ===========================================================================
  describe('V17 branch coverage', () => {
    it('counts returns-to inside when blocks', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          frame "Step 1"
            a: First
          frame "Step 2" [branch]
            when optionA
              a: PathA
                returns-to "Step 1"
            when optionB
              a: PathB
                returns-to "Step 1"
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V17'))).toBe(true);
    });
  });

  // ===========================================================================
  // Edge cases: null-guard branches for defensive returns
  // ===========================================================================
  describe('Edge Cases', () => {
    const edgeMockContext: CrossFileContext = {
      declaredContextNames: ['Ordering', 'Fulfillment'],
      declaredEvents: new Map([
        ['Ordering', ['OrderPlaced']],
        ['Fulfillment', ['FulfillmentInitiated', 'OrderPlaced']],
      ]),
      declaredBuildingBlocks: new Map([
        [
          'Ordering',
          [
            { name: 'PlaceOrder', kind: 'command' },
            { name: 'OrderPlaced', kind: 'event' },
          ],
        ],
        ['Fulfillment', [{ name: 'InitiateFulfillment', kind: 'command' }]],
      ]),
      declaredSagas: [],
    };

    it('V2 returns gracefully when flow is not found from crossing', async () => {
      const validator = services.validation.MomentValidator;
      // Create a minimal crossing-like node without a flow parent
      const fakeCrossing = {
        $type: 'ContextCrossing',
        targetLaneId: 'x',
        fields: [{ name: 'f', type: { typeName: 'UUID' } }],
        relationshipType: 'Partnership',
        $container: { $type: 'NodePlacement' },
      } as never;
      const diagnostics: string[] = [];
      validator.checkCrossingTargetBranchLane(fakeCrossing, (severity, message) => {
        diagnostics.push(message as string);
      });
      expect(diagnostics).toHaveLength(0);
    });

    it('V13 returns gracefully when flow is not found from node', async () => {
      const validator = services.validation.MomentValidator;
      const fakeNode = {
        $type: 'NodePlacement',
        laneId: 'x',
        nodeName: 'Y',
        connections: [],
        $container: { $type: 'Frame' },
      } as never;
      const diagnostics: string[] = [];
      validator.checkLaneIdExists(fakeNode, (severity, message) => {
        diagnostics.push(message as string);
      });
      expect(diagnostics).toHaveLength(0);
    });

    it('SP-02 returns gracefully when target lane not found', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          frame "Step"
            a: Evt crosses-to nonexistent via CustomerSupplier
              contract
                id: UUID [required]
      `);
      const validator = services.validation.MomentValidator;
      const crossing = result.document.parseResult.value.flows[0].frames[0].nodes[0].crossing!;
      const diagnostics: string[] = [];
      validator.checkSP02(
        crossing,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        edgeMockContext,
      );
      // Target lane 'nonexistent' is not found → early return, no SP-02 error
      expect(diagnostics.some((m) => m.includes('SP-02'))).toBe(false);
    });

    it('V1 returns gracefully when lane not found in context', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          frame "Step"
            a: SomeNode
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
      // Lane label "A" does not match any declaredContextNames ("Ordering", "Fulfillment")
      // so the contextName won't match, but the lane IS found
      const diagnostics: string[] = [];
      validator.checkV1(
        node,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        edgeMockContext,
      );
      // No building blocks for context "A" → V1 error
      expect(diagnostics.some((m) => m.includes('V1'))).toBe(true);
    });

    it('V9 returns gracefully when node has no crossing', async () => {
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          frame "Step"
            a: OrderPlaced
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
      const diagnostics: string[] = [];
      validator.checkV9(
        node,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        edgeMockContext,
      );
      expect(diagnostics).toHaveLength(0);
    });

    it('V11 returns gracefully when node has no multiplicity', async () => {
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          frame "Step"
            a: OrderPlaced
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
      const diagnostics: string[] = [];
      validator.checkV11(
        node,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        edgeMockContext,
      );
      expect(diagnostics).toHaveLength(0);
    });

    it('checkNodePlacement handles node without frame ancestor gracefully', () => {
      const validator = services.validation.MomentValidator;
      const orphanNode = {
        $type: 'NodePlacement',
        laneId: 'a',
        nodeName: 'Test',
        connections: [{ $type: 'TriggeredBy', nodeName: 'Prior', $container: null }],
        crossing: undefined,
        modifier: undefined,
        multiplicity: undefined,
        $container: { $type: 'FlowDeclaration', frames: [], lanes: [] },
      } as never;
      const diagnostics: string[] = [];
      validator.checkNodePlacement(orphanNode, (severity, message) => {
        diagnostics.push(message as string);
      });
      expect(diagnostics).toHaveLength(0);
    });

    it('V11 returns gracefully when lane not found for multiplicity node', async () => {
      const validator = services.validation.MomentValidator;
      // Create a node with multiplicity but whose laneId doesn't match any lane
      const fakeFlow = {
        $type: 'FlowDeclaration',
        frames: [],
        lanes: [{ $type: 'LaneDeclaration', id: 'other', label: '"Other"', isBranch: false }],
      };
      const fakeFrame = { $type: 'Frame', $container: fakeFlow };
      const fakeNode = {
        $type: 'NodePlacement',
        laneId: 'nonexistent',
        nodeName: 'Evt',
        multiplicity: { count: 3 },
        connections: [],
        $container: fakeFrame,
      } as never;
      const diagnostics: string[] = [];
      validator.checkV11(
        fakeNode,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        edgeMockContext,
      );
      // Lane not found → early return, no V11 error
      expect(diagnostics).toHaveLength(0);
    });

    it('V9 returns gracefully when lane not found for crossing node', async () => {
      const validator = services.validation.MomentValidator;
      const fakeFlow = {
        $type: 'FlowDeclaration',
        frames: [],
        lanes: [{ $type: 'LaneDeclaration', id: 'other', label: '"Other"', isBranch: false }],
      };
      const fakeFrame = { $type: 'Frame', $container: fakeFlow };
      const fakeCrossing = {
        $type: 'ContextCrossing',
        targetLaneId: 'b',
        fields: [{ name: 'f', type: { typeName: 'UUID' }, required: true }],
        relationshipType: 'CustomerSupplier',
      };
      const fakeNode = {
        $type: 'NodePlacement',
        laneId: 'nonexistent',
        nodeName: 'Evt',
        crossing: fakeCrossing,
        connections: [],
        $container: fakeFrame,
      } as never;
      (fakeCrossing as Record<string, unknown>).$container = fakeNode;
      const diagnostics: string[] = [];
      validator.checkV9(
        fakeNode,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        edgeMockContext,
      );
      expect(diagnostics).toHaveLength(0);
    });

    it('V11 returns gracefully when flow not found for multiplicity node', () => {
      const validator = services.validation.MomentValidator;
      const fakeNode = {
        $type: 'NodePlacement',
        laneId: 'a',
        nodeName: 'Evt',
        multiplicity: { count: 3 },
        connections: [],
        $container: { $type: 'Frame', $container: { $type: 'Unknown' } },
      } as never;
      const diagnostics: string[] = [];
      validator.checkV11(
        fakeNode,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        edgeMockContext,
      );
      expect(diagnostics).toHaveLength(0);
    });

    it('V9 checks crossing node with lane found in context', async () => {
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          lane b "Fulfillment" [Supporting]
          frame "Step"
            a: OrderPlaced crosses-to b via CustomerSupplier
              contract
                id: UUID [required]
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
      const diagnostics: string[] = [];
      validator.checkV9(
        node,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        edgeMockContext,
      );
      // OrderPlaced is an event in Ordering context → no V9 error
      expect(diagnostics.some((m) => m.includes('V9'))).toBe(false);
    });

    it('V9 reports error when crossing is on command node', async () => {
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          lane b "Fulfillment" [Supporting]
          frame "Step"
            a: PlaceOrder crosses-to b via CustomerSupplier
              contract
                id: UUID [required]
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
      const diagnostics: string[] = [];
      validator.checkV9(
        node,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        edgeMockContext,
      );
      // PlaceOrder is a command in Ordering context → V9 error
      expect(diagnostics.some((m) => m.includes('V9'))).toBe(true);
    });

    it('V11 checks multiplicity node with lane found and blocks resolved', async () => {
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          frame "Step"
            a: OrderPlaced (×3)
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
      const diagnostics: string[] = [];
      validator.checkV11(
        node,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        edgeMockContext,
      );
      // OrderPlaced is an event → no V11 error
      expect(diagnostics.some((m) => m.includes('V11'))).toBe(false);
    });

    it('V11 reports error when multiplicity on command node', async () => {
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          frame "Step"
            a: PlaceOrder (×3)
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].frames[0].nodes[0];
      const diagnostics: string[] = [];
      validator.checkV11(
        node,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        edgeMockContext,
      );
      // PlaceOrder is a command → V11 error
      expect(diagnostics.some((m) => m.includes('V11'))).toBe(true);
    });

    it('V14 Partnership iterates nodes without crossings', async () => {
      // This test ensures the hasReverseCrossing method handles nodes without crossings
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          lane b "Fulfillment" [Supporting]
          frame "Step 1"
            a: PlaceOrder
            a: OrderPlaced crosses-to b via Partnership
              contract
                id: UUID [required]
          frame "Step 2"
            b: InitiateFulfillment
      `);
      const validator = services.validation.MomentValidator;
      const flow = result.document.parseResult.value.flows[0];
      const diagnostics: { severity: string; message: string }[] = [];
      validator.checkV14(flow, (severity, message) => {
        diagnostics.push({ severity: severity as string, message: message as string });
      });
      // One-directional Partnership → V14 warning, nodes without crossings are iterated
      expect(diagnostics.some((d) => d.severity === 'warning' && d.message.includes('V14'))).toBe(
        true,
      );
    });

    it('checkBranchLaneReferenced skips when no branch lanes exist', async () => {
      const validator = services.validation.MomentValidator;
      const fakeFlow = {
        $type: 'FlowDeclaration',
        name: '"test"',
        lanes: [{ $type: 'LaneDeclaration', id: 'a', label: '"A"', isBranch: false }],
        frames: [],
        whenBlocks: [],
      } as never;
      const diagnostics: string[] = [];
      validator.checkBranchLaneReferenced(fakeFlow, (severity, message) => {
        diagnostics.push(message as string);
      });
      expect(diagnostics).toHaveLength(0);
    });

    it('checkNodePlacement handles nodes without connections', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          frame "Step"
            a: Simple
      `);
      const errors = errorMessages(result);
      expect(errors.some((m) => m.includes('V5'))).toBe(false);
      expect(errors.some((m) => m.includes('V6'))).toBe(false);
    });
  });

  // ===========================================================================
  // Integration
  // ===========================================================================
  describe('Integration', () => {
    it('valid minimal sample produces zero error diagnostics', async () => {
      const result = await validate(`
        flow "order-placed"
          description "Order triggers fulfillment"
          lane ordering "Ordering" [Core]
          lane fulfillment "Fulfillment" [Supporting]
          frame "Order submission"
            ordering: PlaceOrder
            ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier
              contract
                orderId: UUID [required]
                items: OrderItem[] [required]
          frame "Fulfillment initiation"
            fulfillment: InitiateFulfillment
              triggered-by OrderPlaced
            fulfillment: FulfillmentInitiated
      `);
      const errors = errorMessages(result);
      expect(errors).toHaveLength(0);
    });

    it('valid multi-context sample produces zero error diagnostics', async () => {
      const result = await validate(`
        flow "order-to-shipment"
          description "Full order lifecycle"
          lane ordering "Ordering" [Core]
          lane fulfillment "Fulfillment" [Supporting]
          lane shipping "Shipping" [Supporting]
          branch-lane outOfStock "Out of Stock" [Terminal]
          frame "Order placement"
            ordering: PlaceOrder
            ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier
              contract
                orderId: UUID [required]
                items: OrderItem[] [required]
                shippingAddress: Address [required]
          frame "Inventory check"
            fulfillment: CheckInventory
              triggered-by OrderPlaced
            fulfillment: InventoryReserved
          frame "Inventory check outcome" [branch]
            when available
              fulfillment: FulfillmentReady crosses-to shipping via Partnership
                contract
                  orderId: UUID [required]
                  reservedItems: ReservedItem[] [required]
            when unavailable
              outOfStock: BackorderCreated [terminal]
          frame "Shipment creation"
            shipping: CreateShipment
              triggered-by FulfillmentReady
            shipping: ShipmentCreated
          frame "Dispatch"
            shipping: DispatchShipment
            shipping: ShipmentDispatched
            shipping: TrackingNumberAssigned [optional]
      `);
      const errors = errorMessages(result);
      expect(errors).toHaveLength(0);
    });

    it('validator is registered with Langium service container', async () => {
      const { MomentValidator } = await import('../../src/validation/moment-validator.js');
      expect(services.validation.MomentValidator).toBeDefined();
      expect(services.validation.MomentValidator).toBeInstanceOf(MomentValidator);
    });

    it('all diagnostics include source location', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          frame "Empty"
      `);
      for (const d of result.diagnostics) {
        expect(d.range).toBeDefined();
        expect(d.range.start).toBeDefined();
        expect(d.range.end).toBeDefined();
      }
    });
  });
});
