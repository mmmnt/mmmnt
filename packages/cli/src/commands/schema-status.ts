/**
 * moment schema status — Display schema lifecycle and consumption status
 *
 * Delegates to SchemaRegistry + ConsumptionManifest — no lifecycle logic in CLI (EXIT-C1).
 * Four-phase lifecycle per SR-04: Active → Deprecated → EndOfLife → Removed.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { TypeScriptEmitter } from '@mmmnt/emit-ts';
import {
  SchemaRegistry,
  ConsumptionManifest,
} from '@mmmnt/schema';
import type { Diagnostic, IntermediateRepresentation } from '@mmmnt/core';
import type { FieldPhase } from '@mmmnt/schema';

interface SchemaStatusEntry {
  readonly eventType: string;
  readonly fieldName: string;
  readonly fieldType: string;
  readonly required: boolean;
  readonly phase: FieldPhase | 'active';
  readonly consumers: number;
}

export interface SchemaStatusResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly entries?: readonly SchemaStatusEntry[];
  readonly json?: string;
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): SchemaStatusResult {
  return { success: false, message, diagnostics: EMPTY };
}

export async function runSchemaStatus(argv: string[]): Promise<SchemaStatusResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { json: { type: 'boolean' } },
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment schema status <file.moment>');

  const parsed = await parseSpecFile(filePath);
  if (!('ir' in parsed)) return parsed;

  const { ir } = parsed;
  const entries = buildSchemaEntries(ir);

  if (entries.length === 0) {
    const msg = 'No schemas registered';
    return {
      success: true,
      message: values.json === true ? JSON.stringify({ schemas: [], total: 0 }, null, 2) : msg,
      diagnostics: EMPTY,
      entries: [],
      json: values.json === true ? JSON.stringify({ schemas: [], total: 0 }, null, 2) : undefined,
    };
  }

  if (values.json === true) {
    const json = JSON.stringify({ schemas: entries, total: entries.length }, null, 2);
    return { success: true, message: json, diagnostics: EMPTY, entries, json };
  }

  return {
    success: true,
    message: formatSchemaTable(entries),
    diagnostics: EMPTY,
    entries,
  };
}

function buildSchemaEntries(ir: IntermediateRepresentation): SchemaStatusEntry[] {
  const registry = new SchemaRegistry();
  const manifest = new ConsumptionManifest();
  const entries: SchemaStatusEntry[] = [];

  // Register schemas from IR events
  for (const ctx of ir.contexts) {
    registerContextEvents(registry, ctx);
  }

  // Build status entries for each registered event's fields
  for (const eventType of registry.getRegisteredEventTypes()) {
    collectFieldEntries(entries, registry, manifest, eventType);
  }

  return entries;
}

function registerContextEvents(
  registry: SchemaRegistry,
  ctx: IntermediateRepresentation['contexts'][number],
): void {
  for (const agg of ctx.aggregates) {
    for (const event of agg.events) {
      if (registry.hasSchema(event.name, '1')) continue;
      registry.registerEventSchema({
        eventType: event.name,
        version: '1',
        fieldDefinitions: event.fields.map((f) => ({
          fieldName: f.name,
          fieldType: f.type,
          required: f.required,
        })),
        registeredBy: 'moment-cli',
      });
    }
  }
}

function collectFieldEntries(
  entries: SchemaStatusEntry[],
  registry: SchemaRegistry,
  manifest: ConsumptionManifest,
  eventType: string,
): void {
  const consumers = manifest.getConsumers(eventType, '*');
  const consumerCount = consumers.length;

  // We need to get fields — re-derive from the phase query
  // For each field that was registered, check its phase
  const phase = registry.getFieldPhase(eventType, '*');
  entries.push({
    eventType,
    fieldName: '*',
    fieldType: 'schema',
    required: true,
    phase: phase ?? 'active',
    consumers: consumerCount,
  });
}

function formatSchemaTable(entries: SchemaStatusEntry[]): string {
  const lines: string[] = [];
  lines.push('Schema Status:');
  lines.push('');
  lines.push('| Event Type | Phase | Consumers |');
  lines.push('|------------|-------|-----------|');

  for (const e of entries) {
    lines.push(`| ${e.eventType} | ${e.phase} | ${e.consumers} |`);
  }

  lines.push('');
  lines.push(`Total: ${entries.length} schema(s)`);
  return lines.join('\n');
}

async function parseSpecFile(filePath: string): Promise<SchemaStatusResult | { ir: IntermediateRepresentation; resolvedPath: string }> {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);

  let content: string;
  try {
    content = readFileSync(resolvedPath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Error: Failed to read ${resolvedPath}: ${msg}`);
  }

  const parseResult = await new MomentParser().parseContent(content);

  if (!parseResult.success) {
    return {
      success: false,
      message: `Parse failed with ${parseResult.diagnostics.length} diagnostic(s)`,
      diagnostics: parseResult.diagnostics,
      filePath: resolvedPath,
    };
  }

  return { ir: parseResult.ir!, resolvedPath };
}
