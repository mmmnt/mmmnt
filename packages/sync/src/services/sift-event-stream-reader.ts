/**
 * SiftEventStreamReader — Reads .domain/*.jsonl files and replays Sift events
 * into a AccumulatedImportInput shape for SiftSpecificationImporter.
 *
 * Per ADR-028: one JSONL file per bounded context, each line a ComplaiEventEnvelope
 * with productSource: "sift". Transport-agnostic accumulator logic.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  SiftEventEnvelope,
  SiftEventType,
  BoundedContextDefinedPayload,
  AggregateAddedPayload,
  CommandDefinedPayload,
  EventDefinedPayload,
  ValueObjectDefinedPayload,
  InvariantDefinedPayload,
  PolicyDefinedPayload,
  SagaDefinedPayload,
} from '../events/sift-event-types.js';

/** Accumulated building block — mirrors AccumulatedBuildingBlock from @mmmnt/core */
export interface AccumulatedBuildingBlock {
  contextName: string;
  classification?: 'Core' | 'Supporting' | 'Generic';
  aggregates: Array<{
    name: string;
    identityField: { name: string; type: string };
    commands: Array<{ name: string; inputs: Array<{ name: string; type: string }>; emitsEvent: string }>;
    events: Array<{ name: string; fields: Array<{ name: string; type: string; deprecated?: { reason: string; replacement: string } }> }>;
    valueObjects: Array<{ name: string; fields: Array<{ name: string; type: string }> }>;
  }>;
}

/** Accumulated import input — mirrors AccumulatedImportInput from @mmmnt/core */
export interface AccumulatedImportInput {
  sourceProduct: string;
  sourceVersion: string;
  buildingBlocks: AccumulatedBuildingBlock[];
  timelineEvents: never[];
}

export interface SiftEventStreamReadResult {
  readonly input: AccumulatedImportInput;
  readonly eventsProcessed: number;
  readonly filesRead: number;
  readonly errors: readonly string[];
}

export class SiftEventStreamReader {
  read(domainDir: string): SiftEventStreamReadResult {
    if (!existsSync(domainDir)) {
      return { input: emptyInput(), eventsProcessed: 0, filesRead: 0, errors: [`Directory not found: ${domainDir}`] };
    }

    const jsonlFiles = readdirSync(domainDir).filter((f) => f.endsWith('.jsonl')).sort();
    if (jsonlFiles.length === 0) {
      return { input: emptyInput(), eventsProcessed: 0, filesRead: 0, errors: ['No .jsonl files found in .domain/'] };
    }

    const accumulator = new SiftEventAccumulator();
    const errors: string[] = [];
    let eventsProcessed = 0;

    for (const file of jsonlFiles) {
      const filePath = join(domainDir, file);
      const result = this.processFile(filePath, accumulator);
      eventsProcessed += result.processed;
      errors.push(...result.errors);
    }

    return {
      input: accumulator.build(),
      eventsProcessed,
      filesRead: jsonlFiles.length,
      errors,
    };
  }

  private processFile(
    filePath: string,
    accumulator: SiftEventAccumulator,
  ): { processed: number; errors: string[] } {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { processed: 0, errors: [`Failed to read ${filePath}: ${msg}`] };
    }

    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const errors: string[] = [];
    let processed = 0;

    for (let i = 0; i < lines.length; i++) {
      const result = this.processLine(lines[i], filePath, i + 1, accumulator);
      if (result) {
        errors.push(result);
      } else {
        processed++;
      }
    }

    return { processed, errors };
  }

  private processLine(
    line: string,
    filePath: string,
    lineNumber: number,
    accumulator: SiftEventAccumulator,
  ): string | null {
    let envelope: SiftEventEnvelope;
    try {
      envelope = JSON.parse(line) as SiftEventEnvelope;
    } catch {
      return `${filePath}:${lineNumber}: Invalid JSON`;
    }

    if (envelope.productSource !== 'sift') {
      return `${filePath}:${lineNumber}: Expected productSource "sift", got "${envelope.productSource}"`;
    }

    if (!envelope.eventType || !envelope.payload) {
      return `${filePath}:${lineNumber}: Missing eventType or payload`;
    }

    accumulator.apply(envelope.eventType, envelope.payload);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Accumulator — builds AccumulatedImportInput from individual events
// ---------------------------------------------------------------------------

class SiftEventAccumulator {
  private readonly contexts = new Map<string, AccumulatedBuildingBlock>();
  private sourceProduct = 'unknown';
  private sourceVersion = '1.0.0';

  apply(eventType: SiftEventType, payload: unknown): void {
    switch (eventType) {
      case 'BoundedContextDefined': return this.onBoundedContextDefined(payload as BoundedContextDefinedPayload);
      case 'AggregateAdded': return this.onAggregateAdded(payload as AggregateAddedPayload);
      case 'CommandDefined': return this.onCommandDefined(payload as CommandDefinedPayload);
      case 'EventDefined': return this.onEventDefined(payload as EventDefinedPayload);
      case 'ValueObjectDefined': return this.onValueObjectDefined(payload as ValueObjectDefinedPayload);
      case 'InvariantDefined': return this.onInvariantDefined(payload as InvariantDefinedPayload);
      case 'PolicyDefined': return this.onPolicyDefined(payload as PolicyDefinedPayload);
      case 'SagaDefined': return this.onSagaDefined(payload as SagaDefinedPayload);
    }
  }

  build(): AccumulatedImportInput {
    return {
      sourceProduct: this.sourceProduct,
      sourceVersion: this.sourceVersion,
      buildingBlocks: [...this.contexts.values()],
      timelineEvents: [], // Phase 2 — deferred until SIFT-1
    };
  }

  private getOrCreateContext(contextName: string): AccumulatedBuildingBlock {
    let ctx = this.contexts.get(contextName);
    if (!ctx) {
      ctx = { contextName, aggregates: [] };
      this.contexts.set(contextName, ctx);
    }
    return ctx;
  }

  private getOrCreateAggregate(
    ctx: AccumulatedBuildingBlock,
    aggregateName: string,
  ): AccumulatedBuildingBlock['aggregates'][number] {
    let agg = ctx.aggregates.find((a: AccumulatedBuildingBlock['aggregates'][number]) => a.name === aggregateName);
    if (!agg) {
      agg = { name: aggregateName, identityField: { name: 'id', type: 'UUID' }, commands: [], events: [], valueObjects: [] };
      ctx.aggregates.push(agg);
    }
    return agg;
  }

  private onBoundedContextDefined(p: BoundedContextDefinedPayload): void {
    const ctx = this.getOrCreateContext(p.contextName);
    if (p.classification) ctx.classification = p.classification;
  }

  private onAggregateAdded(p: AggregateAddedPayload): void {
    const ctx = this.getOrCreateContext(p.contextName);
    const agg = this.getOrCreateAggregate(ctx, p.aggregateName);
    agg.identityField = p.identityField;
  }

  private onCommandDefined(p: CommandDefinedPayload): void {
    const ctx = this.getOrCreateContext(p.contextName);
    const agg = this.getOrCreateAggregate(ctx, p.aggregateName);
    agg.commands.push({
      name: p.commandName,
      inputs: p.inputs.map((i) => ({ name: i.name, type: i.type })),
      emitsEvent: p.emitsEvent,
    });
  }

  private onEventDefined(p: EventDefinedPayload): void {
    const ctx = this.getOrCreateContext(p.contextName);
    const agg = this.getOrCreateAggregate(ctx, p.aggregateName);
    agg.events.push({
      name: p.eventName,
      fields: p.fields.map((f) => ({ name: f.name, type: f.type, ...(f.deprecated ? { deprecated: f.deprecated } : {}) })),
    });
  }

  private onValueObjectDefined(p: ValueObjectDefinedPayload): void {
    const ctx = this.getOrCreateContext(p.contextName);
    const agg = this.getOrCreateAggregate(ctx, p.aggregateName);
    agg.valueObjects.push({
      name: p.voName,
      fields: p.fields.map((f) => ({ name: f.name, type: f.type })),
    });
  }

  private onInvariantDefined(_p: InvariantDefinedPayload): void {
    // Invariants are context-level but AccumulatedBuildingBlock doesn't have an invariants array
    // They'll be handled when the importer generates .moment files via context-level constructs
    // For now, ensure the context exists
    this.getOrCreateContext(_p.contextName);
  }

  private onPolicyDefined(_p: PolicyDefinedPayload): void {
    // Policies are context-level — AccumulatedBuildingBlock doesn't carry policies
    // The importer handles these at the context file generation level
    this.getOrCreateContext(_p.contextName);
  }

  private onSagaDefined(_p: SagaDefinedPayload): void {
    // Sagas are context-level — same as policies
    this.getOrCreateContext(_p.contextName);
  }
}

function emptyInput(): AccumulatedImportInput {
  return { sourceProduct: 'unknown', sourceVersion: '1.0.0', buildingBlocks: [], timelineEvents: [] };
}
