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
            moment "Step"
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
            moment "Step"
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
            moment "Step"
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
            moment "Step"
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
            moment "Step 1"
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
            moment "Step 1"
              a: OrderPlaced
            moment "Step 2"
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
            moment "Step 1"
              a: First
            moment "Step 2"
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
            moment "Step 1"
              a: First
            moment "Step 2"
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
            moment "Step"
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
            moment "Step"
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
            moment "Step"
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
            moment "Step"
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
            moment "Empty"
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V10'))).toBe(true);
      });

      it('accepts frame with nodes', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            moment "Filled"
              a: SomeEvent
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V10'))).toBe(false);
      });

      it('accepts frame with when blocks', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            moment "Branch" [branch]
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
            moment "Step"
              nonexistent: SomeEvent
        `);
        const errors = errorMessages(result);
        expect(errors.some((m) => m.includes('V13'))).toBe(true);
      });

      it('accepts node placement with declared lane ID', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            moment "Step"
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
            moment "Step"
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
            moment "Step"
              a: SomeEvent
            moment "Outcome" [branch]
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
            moment "Step 1"
              a: First
            moment "Step 2"
              a: Second
                returns-to "Step 1"
            moment "Step 3"
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
            moment "Step 1"
              a: First
            moment "Step 2"
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
            moment "Step"
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
            moment "Step"
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
            moment "Step"
              a: NonExistentEvent crosses-to b via CustomerSupplier
                contract
                  id: UUID [required]
        `);
        const validator = services.validation.MomentValidator;
        const crossing = result.document.parseResult.value.flows[0].moments[0].nodes[0].crossing!;
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
            moment "Step"
              a: OrderPlaced crosses-to b via CustomerSupplier
                contract
                  id: UUID [required]
        `);
        const validator = services.validation.MomentValidator;
        const crossing = result.document.parseResult.value.flows[0].moments[0].nodes[0].crossing!;
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
            moment "Step"
              a: NonExistentBlock
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
            moment "Step"
              a: PlaceOrder
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
            moment "Step"
              a: PlaceOrder crosses-to b via CustomerSupplier
                contract
                  id: UUID [required]
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
            moment "Step"
              a: OrderPlaced crosses-to b via CustomerSupplier
                contract
                  id: UUID [required]
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
            moment "Step"
              a: PlaceOrder (×3)
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
            moment "Step"
              a: OrderPlaced (×3)
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
            moment "Step"
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
            moment "Step 1"
              a: OrderPlaced crosses-to b via Partnership
                contract
                  id: UUID [required]
            moment "Step 2"
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
            moment "Outcome" [branch]
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
            moment "Step 1"
              a: DoSomething
                triggered-by NonExistent
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
            moment "Step 1"
              a: First
            moment "Step 2"
              a: Second
                triggered-by First
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].moments[1].nodes[0];
        const diagnostics: string[] = [];
        validator.checkV5(node, (severity, message) => {
          if (severity === 'error') diagnostics.push(message as string);
        });
        expect(diagnostics.some((m) => m.includes('V5'))).toBe(false);
      });

      it('V5 skips non-triggered-by connections on the same node', async () => {
        const result = await validate(`
          flow "test"
            lane a "A" [Core]
            moment "Step 1"
              a: First
            moment "Step 2"
              a: Second
                triggered-by First
                triggers Third
        `);
        const validator = services.validation.MomentValidator;
        const node = result.document.parseResult.value.flows[0].moments[1].nodes[0];
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
            moment "Step"
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
            moment "Step"
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
            moment "Step"
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
            moment "Step"
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
          moment "Step 1"
            a: First
          moment "Step 2" [branch]
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
        $container: { $type: 'Moment' },
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
          moment "Step"
            a: Evt crosses-to nonexistent via CustomerSupplier
              contract
                id: UUID [required]
      `);
      const validator = services.validation.MomentValidator;
      const crossing = result.document.parseResult.value.flows[0].moments[0].nodes[0].crossing!;
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
          moment "Step"
            a: SomeNode
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
          moment "Step"
            a: OrderPlaced
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
          moment "Step"
            a: OrderPlaced
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
        $container: { $type: 'FlowDeclaration', moments: [], lanes: [] },
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
        moments: [],
        lanes: [{ $type: 'LaneDeclaration', id: 'other', label: '"Other"', isBranch: false }],
      };
      const fakeMoment = { $type: 'Moment', $container: fakeFlow };
      const fakeNode = {
        $type: 'NodePlacement',
        laneId: 'nonexistent',
        nodeName: 'Evt',
        multiplicity: { count: 3 },
        connections: [],
        $container: fakeMoment,
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
        moments: [],
        lanes: [{ $type: 'LaneDeclaration', id: 'other', label: '"Other"', isBranch: false }],
      };
      const fakeMoment = { $type: 'Moment', $container: fakeFlow };
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
        $container: fakeMoment,
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
        $container: { $type: 'Moment', $container: { $type: 'Unknown' } },
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
          moment "Step"
            a: OrderPlaced crosses-to b via CustomerSupplier
              contract
                id: UUID [required]
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
          moment "Step"
            a: PlaceOrder crosses-to b via CustomerSupplier
              contract
                id: UUID [required]
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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

    it('V11 passes when context has no declared building blocks (empty fallback)', async () => {
      const result = await validate(`
        flow "test"
          lane a "Unknown" [Core]
          moment "Step"
            a: SomeEvent (×3)
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
      const diagnostics: string[] = [];
      validator.checkV11(
        node,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        edgeMockContext,
      );
      // Unknown context → blocks = [] via ?? fallback → no block found → no V11 error
      expect(diagnostics.some((m) => m.includes('V11'))).toBe(false);
    });

    it('V11 checks multiplicity node with lane found and blocks resolved', async () => {
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          moment "Step"
            a: OrderPlaced (×3)
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
          moment "Step"
            a: PlaceOrder (×3)
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].moments[0].nodes[0];
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
          moment "Step 1"
            a: PlaceOrder
            a: OrderPlaced crosses-to b via Partnership
              contract
                id: UUID [required]
          moment "Step 2"
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
        moments: [],
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
          moment "Step"
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
          moment "Order submission"
            ordering: PlaceOrder
            ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier
              contract
                orderId: UUID [required]
                items: OrderItem[] [required]
          moment "Fulfillment initiation"
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
          moment "Order placement"
            ordering: PlaceOrder
            ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier
              contract
                orderId: UUID [required]
                items: OrderItem[] [required]
                shippingAddress: Address [required]
          moment "Inventory check"
            fulfillment: CheckInventory
              triggered-by OrderPlaced
            fulfillment: InventoryReserved
          moment "Inventory check outcome" [branch]
            when available
              fulfillment: FulfillmentReady crosses-to shipping via Partnership
                contract
                  orderId: UUID [required]
                  reservedItems: ReservedItem[] [required]
            when unavailable
              outOfStock: BackorderCreated [terminal]
          moment "Shipment creation"
            shipping: CreateShipment
              triggered-by FulfillmentReady
            shipping: ShipmentCreated
          moment "Dispatch"
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
          moment "Empty"
      `);
      for (const d of result.diagnostics) {
        expect(d.range).toBeDefined();
        expect(d.range.start).toBeDefined();
        expect(d.range.end).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // V12: Deprecated field replacement must exist
  // -------------------------------------------------------------------------
  describe('V12 — deprecated replacement validation', () => {
    it('warns when replacement field does not exist', async () => {
      const result = await validate(`
        context "Test"
          aggregate "Order"
            identity orderId: UUID
            event OrderPlaced
              orderId: UUID
              legacyId: string [deprecated "Use orderId" -> "missingField"]
      `);

      const warnings = result.diagnostics.filter((d) => d.severity === 2).map((d) => d.message);
      expect(warnings.some((m) => m.includes('V12'))).toBe(true);
      expect(warnings.some((m) => m.includes('missingField'))).toBe(true);
    });

    it('does not warn when replacement field exists', async () => {
      const result = await validate(`
        context "Test"
          aggregate "Order"
            identity orderId: UUID
            event OrderPlaced
              orderId: UUID
              legacyId: string [deprecated "Use orderId" -> "orderId"]
      `);

      const warnings = result.diagnostics.filter((d) => d.severity === 2).map((d) => d.message);
      expect(warnings.some((m) => m.includes('V12'))).toBe(false);
    });

    it('warns on deprecated value object field with missing replacement', async () => {
      const result = await validate(`
        context "Test"
          aggregate "Order"
            identity orderId: UUID
            value-object Address
              street: string [deprecated "Use line1" -> "line1"]
      `);

      const warnings = result.diagnostics.filter((d) => d.severity === 2).map((d) => d.message);
      expect(warnings.some((m) => m.includes('V12'))).toBe(true);
    });

    it('does not warn when field is not deprecated', async () => {
      const result = await validate(`
        context "Test"
          aggregate "Order"
            identity orderId: UUID
            event OrderPlaced
              orderId: UUID
      `);

      const warnings = result.diagnostics.filter((d) => d.severity === 2).map((d) => d.message);
      expect(warnings.some((m) => m.includes('V12'))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // V19: trailing annotation classifies nothing (M-P4)
  // -------------------------------------------------------------------------
  describe('V19 — trailing annotation', () => {
    it('warns when a context ends with an annotation that precedes nothing', async () => {
      const result = await validate(`
        context "Test"
          aggregate "Order"
            identity orderId: UUID
            event OrderPlaced
              orderId: UUID
          @classification(PII)
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V19') && m.includes('classification'))).toBe(true);
    });

    it('warns when an aggregate ends with an annotation that precedes nothing', async () => {
      const result = await validate(`
        context "Test"
          aggregate "Order"
            identity orderId: UUID
            event OrderPlaced
              orderId: UUID
            @retention(HIPAA)
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V19') && m.includes('retention'))).toBe(true);
    });

    it('warns on every annotation in a trailing run', async () => {
      const result = await validate(`
        context "Test"
          aggregate "Order"
            identity orderId: UUID
            event OrderPlaced
              orderId: UUID
          @classification(PII)
          @retention(HIPAA)
      `);
      const warnings = warningMessages(result).filter((m) => m.includes('V19'));
      expect(warnings).toHaveLength(2);
    });

    it('does not warn when the annotation precedes a declaration', async () => {
      const result = await validate(`
        context "Test"
          @classification(PII)
          aggregate "Order"
            identity orderId: UUID
            event OrderPlaced
              orderId: UUID
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V19'))).toBe(false);
    });

    it('does not warn when the annotation precedes a policy declaration', async () => {
      // The policy must precede any aggregate: the aggregate-member loop is
      // greedy, so an annotation written after an aggregate attaches to the
      // aggregate (and V19 truthfully warns that it reaches nothing).
      const result = await validate(`
        context "Test"
          @classification(PII)
          policy NotifyOnPlacement
            trigger OrderPlaced
            action "Notify the warehouse"
          aggregate "Order"
            identity orderId: UUID
            event OrderPlaced
              orderId: UUID
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V19'))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // V8 (M-P13 blind spot): terminal node textually followed by a when block
  // -------------------------------------------------------------------------
  describe('V8 — terminal followed by when block (textual order)', () => {
    it('warns when a terminal main-list node is textually followed by a when block', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          moment "Step"
            a: Done [terminal]
            when retry
              a: RetryEvent
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V8') && m.includes('when block'))).toBe(true);
    });

    it('does not warn when the when block precedes the terminal node', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          moment "Step"
            when retry
              a: RetryEvent
            a: Done [terminal]
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V8'))).toBe(false);
    });

    it('does not warn for a terminal inside a when block followed by sibling arms', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          moment "Outcome" [branch]
            when failure
              a: FailEvent [terminal]
            when success
              a: SuccessEvent
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V8'))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // V20: declared trigger direction vs flow order (M-S10)
  // -------------------------------------------------------------------------
  describe('V20 — trigger direction vs flow order', () => {
    it('warns when triggers references a node placed in an earlier moment', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          moment "Step 1"
            a: EarlyEvent
          moment "Step 2"
            a: LateEvent
              triggers EarlyEvent
      `);
      const warnings = warningMessages(result);
      expect(
        warnings.some((m) => m.includes('V20') && m.includes("'EarlyEvent' occurs before")),
      ).toBe(true);
    });

    it('does not warn when triggers references a node in the same moment', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          moment "Step 1"
            a: SendRequest
              triggers RecordRequest
            a: RecordRequest
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V20'))).toBe(false);
    });

    it('does not warn when triggers references a node in a later moment', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          moment "Step 1"
            a: SendRequest
              triggers HandleRequest
          moment "Step 2"
            a: HandleRequest
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V20'))).toBe(false);
    });

    it('does not warn when the triggers reference is not placed in the flow (V1 territory)', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          moment "Step 1"
            a: SendRequest
              triggers UnplacedNode
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V20'))).toBe(false);
    });

    it('warns when triggered-by references a node placed in a later moment', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          moment "Step 1"
            a: EagerHandler
              triggered-by FutureEvent
          moment "Step 2"
            a: FutureEvent
      `);
      const warnings = warningMessages(result);
      expect(
        warnings.some((m) => m.includes('V20') && m.includes("'FutureEvent' occurs after")),
      ).toBe(true);
    });

    it('does not warn when triggered-by references a node from a prior moment', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          moment "Step 1"
            a: OrderPlaced
          moment "Step 2"
            a: CheckInventory
              triggered-by OrderPlaced
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V20'))).toBe(false);
    });

    it('considers when-block placements when locating the referenced node', async () => {
      const result = await validate(`
        flow "test"
          lane a "A" [Core]
          moment "Branch" [branch]
            when success
              a: BranchEvent
          moment "Step 2"
            a: LateEvent
              triggers BranchEvent
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V20'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // V21: saga transition `on` event unknown (M-S6)
  // -------------------------------------------------------------------------
  describe('V21 — saga transition event unknown', () => {
    it('warns when an `on` event is neither declared in a context nor placed in a flow', async () => {
      const result = await validate(`
        context "Payments"
          aggregate "Hold"
            identity holdId: UUID
            event PaymentConfirmed
          saga HoldLifecycle
            trigger PlaceHold
            states Held -> Converting on PaymentConfirmed -> Converted on HoldConvertdToReservation
            compensation "Release the hold"
            timeout "none"
      `);
      const warnings = warningMessages(result);
      expect(
        warnings.some((m) => m.includes('V21') && m.includes("'HoldConvertdToReservation'")),
      ).toBe(true);
      // The declared event does not warn.
      expect(warnings.some((m) => m.includes("'PaymentConfirmed'"))).toBe(false);
    });

    it('does not warn when every `on` event is declared by a context in the file', async () => {
      const result = await validate(`
        context "Payments"
          aggregate "Hold"
            identity holdId: UUID
            event PaymentConfirmed
            event HoldConvertedToReservation
          saga HoldLifecycle
            trigger PlaceHold
            states Held -> Converting on PaymentConfirmed -> Converted on HoldConvertedToReservation
            compensation "Release the hold"
            timeout "none"
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V21'))).toBe(false);
    });

    it('does not warn when the `on` event is only placed in a flow (not re-declared)', async () => {
      const result = await validate(`
        context "Payments"
          aggregate "Hold"
            identity holdId: UUID
            event HoldPlaced
          saga HoldLifecycle
            trigger PlaceHold
            states Held -> Converted on PaymentConfirmed
            compensation "Release the hold"
            timeout "none"
        flow "checkout"
          lane pay "Payments" [Core]
          moment "Confirmation"
            pay: PaymentConfirmed
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V21'))).toBe(false);
    });

    it('considers when-block placements as flow placements', async () => {
      const result = await validate(`
        context "Payments"
          aggregate "Hold"
            identity holdId: UUID
            event HoldPlaced
          saga HoldLifecycle
            trigger PlaceHold
            states Held -> Converted on PaymentConfirmed
            compensation "Release the hold"
            timeout "none"
        flow "checkout"
          lane pay "Payments" [Core]
          moment "Confirmation" [branch]
            when paid
              pay: PaymentConfirmed
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V21'))).toBe(false);
    });

    it('does not warn for transitions without an `on` mapping', async () => {
      const result = await validate(`
        context "Payments"
          aggregate "Hold"
            identity holdId: UUID
            event HoldPlaced
          saga HoldLifecycle
            trigger PlaceHold
            states Held -> Converting -> Converted
            compensation "Release the hold"
            timeout "none"
      `);
      const warnings = warningMessages(result);
      expect(warnings.some((m) => m.includes('V21'))).toBe(false);
    });

    it('returns gracefully for a saga fragment without a MomentFile ancestor', () => {
      const validator = services.validation.MomentValidator;
      const fakeSaga = {
        $type: 'SagaDeclaration',
        name: 'Orphan',
        trigger: 'Start',
        initialState: 'A',
        transitions: [{ $type: 'SagaTransition', target: 'B', event: 'MysteryEvent' }],
        compensation: '"none"',
        $container: { $type: 'Unknown' },
      } as never;
      const diagnostics: string[] = [];
      validator.checkSagaTransitionEvents(fakeSaga, (severity, message) => {
        diagnostics.push(message as string);
      });
      expect(diagnostics).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Branch-lane skips: cross-file checks ignore outcome-route lanes
  // -------------------------------------------------------------------------
  describe('branch-lane skips for cross-file checks', () => {
    const branchSkipContext: CrossFileContext = {
      declaredContextNames: ['Ordering'],
      declaredEvents: new Map([['Ordering', ['OrderPlaced']]]),
      declaredBuildingBlocks: new Map([
        [
          'Ordering',
          [
            { name: 'PlaceOrder', kind: 'command' },
            { name: 'OrderPlaced', kind: 'event' },
          ],
        ],
      ]),
      declaredSagas: [],
    };

    it('SP-01 skips branch lanes whose labels are not contexts', async () => {
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          branch-lane errs "Not A Context"
          moment "Step"
            a: OrderPlaced
          moment "Outcome" [branch]
            when bad
              errs: OrderPlaced [terminal]
      `);
      const validator = services.validation.MomentValidator;
      const flow = result.document.parseResult.value.flows[0];
      const diagnostics: string[] = [];
      validator.checkSP01(
        flow,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        branchSkipContext,
      );
      expect(diagnostics).toHaveLength(0);
    });

    it('V9 skips crossings declared on branch-lane placements', async () => {
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          branch-lane errs "Errors"
          moment "Step"
            a: OrderPlaced
          moment "Outcome" [branch]
            when bad
              errs: PlaceOrder crosses-to a via CustomerSupplier
                contract
                  id: UUID [required]
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].moments[1].whenBlocks[0].nodes[0];
      const diagnostics: string[] = [];
      validator.checkV9(
        node,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        branchSkipContext,
      );
      expect(diagnostics).toHaveLength(0);
    });

    it('V11 skips multiplicity on branch-lane placements', async () => {
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          branch-lane errs "Errors"
          moment "Step"
            a: OrderPlaced
          moment "Outcome" [branch]
            when bad
              errs: PlaceOrder (×3)
      `);
      const validator = services.validation.MomentValidator;
      const node = result.document.parseResult.value.flows[0].moments[1].whenBlocks[0].nodes[0];
      const diagnostics: string[] = [];
      validator.checkV11(
        node,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        branchSkipContext,
      );
      expect(diagnostics).toHaveLength(0);
    });

    it('SP-02 skips crossings targeting a branch lane', async () => {
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          branch-lane errs "Errors"
          moment "Step"
            a: UndeclaredEvent crosses-to errs via CustomerSupplier
              contract
                id: UUID [required]
          moment "Outcome" [branch]
            when bad
              errs: OrderPlaced [terminal]
      `);
      const validator = services.validation.MomentValidator;
      const crossing = result.document.parseResult.value.flows[0].moments[0].nodes[0].crossing!;
      const diagnostics: string[] = [];
      validator.checkSP02(
        crossing,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        branchSkipContext,
      );
      expect(diagnostics).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Defensive guards on the new checks (fake AST fragments)
  // -------------------------------------------------------------------------
  describe('new-check edge cases', () => {
    it('checkTerminalIsLast returns gracefully when the node has no CST node', () => {
      const validator = services.validation.MomentValidator;
      const fakeMoment: Record<string, unknown> = {
        $type: 'MomentDeclaration',
        nodes: [],
        whenBlocks: [{ $type: 'WhenBlock', condition: 'x', nodes: [] }],
      };
      const fakeNode = {
        $type: 'NodePlacement',
        laneId: 'a',
        nodeName: 'Done',
        modifier: { type: 'terminal' },
        connections: [],
        $container: fakeMoment,
      } as never;
      (fakeMoment.nodes as unknown[]).push(fakeNode);
      const diagnostics: string[] = [];
      validator.checkTerminalIsLast(fakeNode, (severity, message) => {
        diagnostics.push(message as string);
      });
      expect(diagnostics).toHaveLength(0);
    });

    it('checkTerminalIsLast ignores when blocks without CST nodes', () => {
      const validator = services.validation.MomentValidator;
      const fakeMoment: Record<string, unknown> = {
        $type: 'MomentDeclaration',
        nodes: [],
        whenBlocks: [{ $type: 'WhenBlock', condition: 'x', nodes: [] }],
      };
      const fakeNode = {
        $type: 'NodePlacement',
        laneId: 'a',
        nodeName: 'Done',
        modifier: { type: 'terminal' },
        connections: [],
        $cstNode: { offset: 10 },
        $container: fakeMoment,
      } as never;
      (fakeMoment.nodes as unknown[]).push(fakeNode);
      const diagnostics: string[] = [];
      validator.checkTerminalIsLast(fakeNode, (severity, message) => {
        diagnostics.push(message as string);
      });
      expect(diagnostics).toHaveLength(0);
    });

    it('checkTriggerDirection returns gracefully without a flow ancestor', () => {
      const validator = services.validation.MomentValidator;
      const fakeNode = {
        $type: 'NodePlacement',
        laneId: 'a',
        nodeName: 'X',
        connections: [{ $type: 'Triggers', nodeName: 'Y' }],
        $container: { $type: 'Unknown' },
      } as never;
      const diagnostics: string[] = [];
      validator.checkTriggerDirection(fakeNode, (severity, message) => {
        diagnostics.push(message as string);
      });
      expect(diagnostics).toHaveLength(0);
    });

    it('checkTriggerDirection returns gracefully when the moment is not in the flow', () => {
      const validator = services.validation.MomentValidator;
      const fakeFlow = { $type: 'FlowDeclaration', moments: [], lanes: [] };
      const fakeMoment = {
        $type: 'MomentDeclaration',
        label: '"Orphan"',
        nodes: [],
        whenBlocks: [],
        $container: fakeFlow,
      };
      const fakeNode = {
        $type: 'NodePlacement',
        laneId: 'a',
        nodeName: 'X',
        connections: [{ $type: 'Triggers', nodeName: 'Y' }],
        $container: fakeMoment,
      } as never;
      const diagnostics: string[] = [];
      validator.checkTriggerDirection(fakeNode, (severity, message) => {
        diagnostics.push(message as string);
      });
      expect(diagnostics).toHaveLength(0);
    });

    it('checkSP02 treats an unknown source context as declaring nothing', async () => {
      const result = await validate(`
        flow "test"
          lane a "UnknownSource" [Core]
          lane b "Fulfillment" [Supporting]
          moment "Step"
            a: FulfillmentInitiated crosses-to b via CustomerSupplier
              contract
                id: UUID [required]
      `);
      const validator = services.validation.MomentValidator;
      const crossing = result.document.parseResult.value.flows[0].moments[0].nodes[0].crossing!;
      const targetOnlyContext: CrossFileContext = {
        declaredContextNames: ['Fulfillment'],
        declaredEvents: new Map([['Fulfillment', ['FulfillmentInitiated']]]),
        declaredBuildingBlocks: new Map([
          ['Fulfillment', [{ name: 'FulfillmentInitiated', kind: 'event' }]],
        ]),
        declaredSagas: [],
      };
      const diagnostics: string[] = [];
      validator.checkSP02(
        crossing,
        (severity, message) => {
          diagnostics.push(message as string);
        },
        targetOnlyContext,
      );
      // Source context unknown, but the target declares the event — accepted.
      expect(diagnostics).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // SP-02 boundary semantics: source-declared events are valid crossings
  // -------------------------------------------------------------------------
  describe('SP-02 — source-declared crossing event', () => {
    it('accepts a crossing event declared only by the source context', async () => {
      const sourceOnlyContext: CrossFileContext = {
        declaredContextNames: ['Ordering', 'Fulfillment'],
        declaredEvents: new Map([
          ['Ordering', ['OrderPlaced']],
          ['Fulfillment', []],
        ]),
        declaredBuildingBlocks: new Map([
          ['Ordering', [{ name: 'OrderPlaced', kind: 'event' }]],
          ['Fulfillment', []],
        ]),
        declaredSagas: [],
      };
      const result = await validate(`
        flow "test"
          lane a "Ordering" [Core]
          lane b "Fulfillment" [Supporting]
          moment "Step"
            a: OrderPlaced crosses-to b via CustomerSupplier
              contract
                id: UUID [required]
      `);
      const validator = services.validation.MomentValidator;
      const crossing = result.document.parseResult.value.flows[0].moments[0].nodes[0].crossing!;
      const diagnostics: string[] = [];
      validator.checkSP02(
        crossing,
        (severity, message) => {
          if (severity === 'error') diagnostics.push(message as string);
        },
        sourceOnlyContext,
      );
      expect(diagnostics.some((m) => m.includes('SP-02'))).toBe(false);
    });
  });
});
