import { describe, it, expect } from 'vitest';
import { ASTDiffEngine } from '../../services/ast-diff-engine.js';
import type { EventTypeDefinition } from '../../services/consumption-scanner.js';

const knownEventTypes: EventTypeDefinition[] = [
  { eventType: 'OrderPlaced', fields: ['orderId', 'amount', 'customerId'] },
  { eventType: 'OrderShipped', fields: ['orderId', 'trackingNumber', 'shippedAt'] },
];

describe('ASTDiffEngine.detectConsumption', () => {
  const engine = new ASTDiffEngine();

  it('returns empty result for empty input', () => {
    const result = engine.detectConsumption({
      sourceFiles: new Map(),
      knownEventTypes,
    });

    expect(result.detectedConsumptions).toHaveLength(0);
    expect(result.unresolvableReferences).toHaveLength(0);
  });

  it('returns empty consumptions for files with no event references', () => {
    const source = `
      const x = 1;
      function add(a: number, b: number): number { return a + b; }
    `;
    const result = engine.detectConsumption({
      sourceFiles: new Map([['utils.ts', source]]),
      knownEventTypes,
    });

    expect(result.detectedConsumptions).toHaveLength(0);
  });

  it('detects import of known event type (high confidence)', () => {
    const source = `
      import type { OrderPlaced } from './events.js';

      function handle(event: OrderPlaced): void {
        console.log(event);
      }
    `;
    const result = engine.detectConsumption({
      sourceFiles: new Map([['handler.ts', source]]),
      knownEventTypes,
    });

    expect(result.detectedConsumptions.length).toBeGreaterThanOrEqual(1);
    const detection = result.detectedConsumptions.find((d) => d.eventType === 'OrderPlaced');
    expect(detection).toBeDefined();
    expect(detection!.confidence).toBe('high');
    expect(detection!.filePath).toBe('handler.ts');
  });

  it('detects type annotation with known event type (high confidence)', () => {
    const source = `
      function process(event: OrderShipped): void {
        console.log(event.trackingNumber);
      }
    `;
    const result = engine.detectConsumption({
      sourceFiles: new Map([['processor.ts', source]]),
      knownEventTypes,
    });

    const detection = result.detectedConsumptions.find((d) => d.eventType === 'OrderShipped');
    expect(detection).toBeDefined();
    expect(detection!.confidence).toBe('high');
  });

  it('detects property access on typed event variable', () => {
    const source = `
      function handle(event: OrderPlaced): void {
        const id = event.orderId;
        const amt = event.amount;
      }
    `;
    const result = engine.detectConsumption({
      sourceFiles: new Map([['consumer.ts', source]]),
      knownEventTypes,
    });

    expect(result.detectedConsumptions.length).toBeGreaterThanOrEqual(1);
    const detection = result.detectedConsumptions.find((d) => d.eventType === 'OrderPlaced');
    expect(detection).toBeDefined();
  });

  it('reports unknown type references as unresolvable', () => {
    const source = `
      import type { UnknownEvent } from './mystery.js';

      function handle(event: UnknownEvent): void {
        console.log(event);
      }
    `;
    const result = engine.detectConsumption({
      sourceFiles: new Map([['unknown.ts', source]]),
      knownEventTypes,
    });

    expect(result.unresolvableReferences).toContain('UnknownEvent');
  });

  it('produces multiple DetectedConsumption entries for multiple event references', () => {
    const source = `
      import type { OrderPlaced, OrderShipped } from './events.js';

      function handlePlaced(event: OrderPlaced): void {
        console.log(event.orderId);
      }

      function handleShipped(event: OrderShipped): void {
        console.log(event.trackingNumber);
      }
    `;
    const result = engine.detectConsumption({
      sourceFiles: new Map([['multi.ts', source]]),
      knownEventTypes,
    });

    expect(result.detectedConsumptions.length).toBeGreaterThanOrEqual(2);
    expect(result.detectedConsumptions.some((d) => d.eventType === 'OrderPlaced')).toBe(true);
    expect(result.detectedConsumptions.some((d) => d.eventType === 'OrderShipped')).toBe(true);
  });

  it('scans multiple files', () => {
    const source1 = `
      import type { OrderPlaced } from './events.js';
      function a(e: OrderPlaced) { return e.orderId; }
    `;
    const source2 = `
      import type { OrderShipped } from './events.js';
      function b(e: OrderShipped) { return e.trackingNumber; }
    `;
    const result = engine.detectConsumption({
      sourceFiles: new Map([
        ['file1.ts', source1],
        ['file2.ts', source2],
      ]),
      knownEventTypes,
    });

    expect(result.detectedConsumptions.length).toBeGreaterThanOrEqual(2);
    expect(result.detectedConsumptions.some((d) => d.filePath === 'file1.ts')).toBe(true);
    expect(result.detectedConsumptions.some((d) => d.filePath === 'file2.ts')).toBe(true);
  });

  it('result is JSON-serializable (EXIT-C4)', () => {
    const source = `
      import type { OrderPlaced } from './events.js';
      function handle(e: OrderPlaced) { return e.orderId; }
    `;
    const result = engine.detectConsumption({
      sourceFiles: new Map([['test.ts', source]]),
      knownEventTypes,
    });

    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);
    expect(parsed.detectedConsumptions).toBeDefined();
    expect(parsed.unresolvableReferences).toBeDefined();
  });

  it('fields array contains known event fields', () => {
    const source = `
      import type { OrderPlaced } from './events.js';
      function handle(e: OrderPlaced) {}
    `;
    const result = engine.detectConsumption({
      sourceFiles: new Map([['fields.ts', source]]),
      knownEventTypes,
    });

    const detection = result.detectedConsumptions.find((d) => d.eventType === 'OrderPlaced');
    expect(detection).toBeDefined();
    expect(detection!.fields).toContain('orderId');
    expect(detection!.fields).toContain('amount');
  });
});
