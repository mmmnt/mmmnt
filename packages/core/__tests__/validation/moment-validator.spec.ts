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
