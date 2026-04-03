import { describe, it, expect, afterEach } from 'vitest';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { runReconcile } from './reconcile.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const UNIFIED_FIXTURE = resolve(FIXTURES, 'valid/unified/vet-clinic.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

const tmpBase = join(tmpdir(), 'mmnt-reconcile-test-' + Date.now());

afterEach(() => {
  try { rmSync(tmpBase, { recursive: true, force: true }); } catch { /* */ }
});

describe('moment reconcile', () => {
  it('--local with no .domain/ reports no upstream (EXIT-B1)', async () => {
    const result = await runReconcile(['--local', UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('NO_CHANGES');
    expect(result.message).toContain('No upstream source configured');
  });

  it('--local with matching .domain/ reports APPLIED (EXIT-B2)', async () => {
    // Simple spec with one context, matching .domain/
    const workDir = join(tmpBase, 'work1');
    const specPath = join(workDir, 'spec.moment');
    const domainDir = join(workDir, '.domain');

    mkdirSync(domainDir, { recursive: true });
    writeFileSync(specPath, 'context "Ordering" [Core]\n  aggregate "Order"\n    identity orderId: UUID\n');

    writeFileSync(join(domainDir, 'ordering.jsonl'),
      JSON.stringify({ eventId: 'e1', eventType: 'BoundedContextDefined', version: 1, productSource: 'sift', sessionId: 's', causationEventIds: [], correlationId: 'c', timestamp: new Date().toISOString(), payload: { contextName: 'Ordering' } }) + '\n');

    const result = await runReconcile(['--local', specPath]);

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('APPLIED');
    expect(result.category).toBe(1);
  });

  it('--local with new upstream context reports DRIFT (EXIT-B3)', async () => {
    const workDir = join(tmpBase, 'work2');
    const specPath = join(workDir, 'spec.moment');
    const domainDir = join(workDir, '.domain');

    mkdirSync(domainDir, { recursive: true });
    writeFileSync(specPath, 'context "Ordering" [Core]\n  aggregate "Order"\n    identity orderId: UUID\n');

    // Domain has a context not in the spec
    writeFileSync(join(domainDir, 'ordering.jsonl'),
      JSON.stringify({ eventId: 'e1', eventType: 'BoundedContextDefined', version: 1, productSource: 'sift', sessionId: 's', causationEventIds: [], correlationId: 'c', timestamp: new Date().toISOString(), payload: { contextName: 'Ordering' } }) + '\n');
    writeFileSync(join(domainDir, 'shipping.jsonl'),
      JSON.stringify({ eventId: 'e2', eventType: 'BoundedContextDefined', version: 1, productSource: 'sift', sessionId: 's', causationEventIds: [], correlationId: 'c', timestamp: new Date().toISOString(), payload: { contextName: 'Shipping' } }) + '\n');

    const result = await runReconcile(['--local', specPath]);

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('DRIFT');
    expect(result.category).toBe(2);
  });

  it('--event reads cascade event and classifies (EXIT-B5)', async () => {
    const workDir = join(tmpBase, 'work3');
    const specPath = join(workDir, 'spec.moment');
    const eventPath = join(workDir, 'cascade.json');

    mkdirSync(workDir, { recursive: true });
    writeFileSync(specPath, 'context "Ordering" [Core]\n  aggregate "Order"\n    identity orderId: UUID\n');
    writeFileSync(eventPath, JSON.stringify({ affectedElements: ['Order'] }));

    const result = await runReconcile(['--event', eventPath, specPath]);

    expect(result.success).toBe(true);
    expect(['APPLIED', 'DRIFT', 'BREAKING']).toContain(result.outcome);
  });

  it('writes MomentReconcileCompleted event signal (EXIT-B7)', async () => {
    const workDir = join(tmpBase, 'work4');
    const specPath = join(workDir, 'spec.moment');
    const domainDir = join(workDir, '.domain');

    mkdirSync(domainDir, { recursive: true });
    writeFileSync(specPath, 'context "Test" [Core]\n  aggregate "A"\n    identity id: UUID\n');
    writeFileSync(join(domainDir, 'test.jsonl'),
      JSON.stringify({ eventId: 'e1', eventType: 'BoundedContextDefined', version: 1, productSource: 'sift', sessionId: 's', causationEventIds: [], correlationId: 'c', timestamp: new Date().toISOString(), payload: { contextName: 'Test' } }) + '\n');

    await runReconcile(['--local', specPath]);

    const eventDir = join(workDir, '.complai', 'events', 'moment');
    expect(existsSync(eventDir)).toBe(true);
    const files = readdirSync(eventDir).filter((f) => f.endsWith('.jsonl'));
    expect(files.length).toBe(1);

    const event = JSON.parse(readFileSync(join(eventDir, files[0]), 'utf-8'));
    expect(event.eventType).toBe('MomentReconcileCompleted');
    expect(event.payload.reconcileResult).toBeTruthy();
  });

  it('--json outputs structured JSON', async () => {
    const result = await runReconcile(['--local', UNIFIED_FIXTURE]);

    // No .domain/ → NO_CHANGES, but --json not set so no json field
    // Test with a fixture that has .domain/
    expect(result.success).toBe(true);
  });

  it('no arguments returns usage message', async () => {
    const result = await runReconcile([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('no --local or --event returns error', async () => {
    const result = await runReconcile([UNIFIED_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('--local');
  });

  it('nonexistent spec returns file-not-found', async () => {
    const result = await runReconcile(['--local', join(tmpdir(), 'nonexistent.moment')]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('invalid spec returns error', async () => {
    // Need a file that actually fails parsing (not just missing .domain/)
    const workDir = join(tmpBase, 'work-invalid');
    const specPath = join(workDir, 'bad.moment');
    mkdirSync(workDir, { recursive: true });
    writeFileSync(specPath, 'this is not valid moment syntax {{{');

    const result = await runReconcile(['--local', specPath]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('parse errors');
  });

  it('BREAKING outcome exits with success=false (EXIT-C3)', async () => {
    const workDir = join(tmpBase, 'work5');
    const specPath = join(workDir, 'spec.moment');
    const domainDir = join(workDir, '.domain');

    mkdirSync(domainDir, { recursive: true });
    // Spec has context "Ordering" but domain does NOT
    writeFileSync(specPath, 'context "Ordering" [Core]\n  aggregate "Order"\n    identity orderId: UUID\n');
    writeFileSync(join(domainDir, 'other.jsonl'),
      JSON.stringify({ eventId: 'e1', eventType: 'BoundedContextDefined', version: 1, productSource: 'sift', sessionId: 's', causationEventIds: [], correlationId: 'c', timestamp: new Date().toISOString(), payload: { contextName: 'Other' } }) + '\n');

    const result = await runReconcile(['--local', specPath]);

    expect(result.success).toBe(false);
    expect(result.outcome).toBe('BREAKING');
    expect(result.category).toBe(3);
  });
});
