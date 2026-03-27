import type {
  IntermediateRepresentation,
  ContextDefinition,
  ContextRelationship,
} from '@mmmnt/core';
import type { GeneratedDocument } from '../types/index.js';

/**
 * SpecificationDocumentGenerator consumes an IntermediateRepresentation
 * and produces GeneratedDocument[] containing specification markdown documents.
 *
 * Generated documents:
 *  1. specification.md — overview of all bounded contexts with aggregate/command/event counts
 *  2. architecture-palette.md — context relationships and building block summary
 *  3. Per-context {context-name}/inventory.md — detailed inventory per context
 *
 * Domain rules:
 *  - GN-03: Uses exact specification vocabulary (context/aggregate/command/event names)
 *  - Deterministic: same IR → identical output
 *  - Pure transformation: no I/O side effects
 */
function safePathSegment(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export class SpecificationDocumentGenerator {
  generate(ir: IntermediateRepresentation): GeneratedDocument[] {
    if (ir.contexts.length === 0) {
      return [];
    }

    const documents: GeneratedDocument[] = [];

    documents.push(this.generateSpecification(ir));
    documents.push(this.generateArchitecturePalette(ir));

    for (const context of ir.contexts) {
      documents.push(this.generateContextInventory(context));
    }

    return documents;
  }

  private generateSpecification(ir: IntermediateRepresentation): GeneratedDocument {
    const lines: string[] = [];
    lines.push(`# Specification: ${ir.metadata.name}`);
    lines.push('');

    if (ir.metadata.description) {
      lines.push(ir.metadata.description);
      lines.push('');
    }

    lines.push('## Bounded Contexts');
    lines.push('');

    for (const context of ir.contexts) {
      const aggregateCount = context.aggregates.length;
      const commandCount = this.countCommands(context);
      const eventCount = this.countEvents(context);

      lines.push(`### ${context.name}`);
      lines.push('');
      if (context.classification) {
        lines.push(`- Classification: ${context.classification}`);
      }
      lines.push(`- Aggregates: ${aggregateCount}`);
      lines.push(`- Commands: ${commandCount}`);
      lines.push(`- Events: ${eventCount}`);
      lines.push('');
    }

    return {
      documentType: 'specification',
      filePath: 'specification.md',
      content: lines.join('\n'),
    };
  }

  private generateArchitecturePalette(ir: IntermediateRepresentation): GeneratedDocument {
    const lines: string[] = [];
    lines.push('# Architecture Palette');
    lines.push('');

    lines.push('## Context Relationships');
    lines.push('');

    if (ir.relationships.length === 0) {
      lines.push('No relationships defined.');
      lines.push('');
    } else {
      for (const rel of ir.relationships) {
        lines.push(this.formatRelationship(rel, ir));
      }
      lines.push('');
    }

    lines.push('## Building Block Summary');
    lines.push('');

    let totalAggregates = 0;
    let totalCommands = 0;
    let totalEvents = 0;
    let totalValueObjects = 0;

    for (const context of ir.contexts) {
      totalAggregates += context.aggregates.length;
      totalCommands += this.countCommands(context);
      totalEvents += this.countEvents(context);
      totalValueObjects += this.countValueObjects(context);
    }

    lines.push(`- Total Aggregates: ${totalAggregates}`);
    lines.push(`- Total Commands: ${totalCommands}`);
    lines.push(`- Total Events: ${totalEvents}`);
    lines.push(`- Total Value Objects: ${totalValueObjects}`);
    lines.push('');

    return {
      documentType: 'architecture-palette',
      filePath: 'architecture-palette.md',
      content: lines.join('\n'),
    };
  }

  private generateContextInventory(context: ContextDefinition): GeneratedDocument {
    const lines: string[] = [];
    lines.push(`# ${context.name} Inventory`);
    lines.push('');

    // De-duplicate: context-level arrays include aggregate members (from core IR transform).
    // Only show items NOT already listed under an aggregate.
    const aggregateCommandNames = new Set<string>();
    const aggregateEventNames = new Set<string>();
    const aggregateVONames = new Set<string>();

    for (const aggregate of context.aggregates) {
      for (const cmd of aggregate.commands) aggregateCommandNames.add(cmd.name);
      for (const evt of aggregate.events) aggregateEventNames.add(evt.name);
      for (const vo of aggregate.valueObjects) aggregateVONames.add(vo.name);
    }

    const contextOnlyCommands = context.commands.filter((c) => !aggregateCommandNames.has(c.name));
    const contextOnlyEvents = context.events.filter((e) => !aggregateEventNames.has(e.name));
    const contextOnlyVOs = context.valueObjects.filter((v) => !aggregateVONames.has(v.name));

    this.appendAggregatesSection(lines, context);
    this.appendNamedItemSection(
      lines,
      '## Commands',
      'No context-level commands defined.',
      contextOnlyCommands,
    );
    this.appendNamedItemSection(
      lines,
      '## Events',
      'No context-level events defined.',
      contextOnlyEvents,
    );
    this.appendNamedItemSection(
      lines,
      '## Value Objects',
      'No context-level value objects defined.',
      contextOnlyVOs,
    );

    return {
      documentType: 'context-inventory',
      filePath: `${safePathSegment(context.name)}/inventory.md`,
      content: lines.join('\n'),
    };
  }

  private appendAggregatesSection(lines: string[], context: ContextDefinition): void {
    lines.push('## Aggregates');
    lines.push('');

    if (context.aggregates.length === 0) {
      lines.push('No aggregates defined.');
      lines.push('');
      return;
    }

    for (const aggregate of context.aggregates) {
      lines.push(`### ${aggregate.name}`);
      lines.push('');
      this.appendNamedItemBlock(lines, '**Commands:**', aggregate.commands);
      this.appendNamedItemBlock(lines, '**Events:**', aggregate.events);
      this.appendNamedItemBlock(lines, '**Value Objects:**', aggregate.valueObjects);
    }
  }

  private appendNamedItemBlock(
    lines: string[],
    heading: string,
    items: ReadonlyArray<{ name: string }>,
  ): void {
    if (items.length === 0) {
      return;
    }
    lines.push(heading);
    lines.push('');
    for (const item of items) {
      lines.push(`- ${item.name}`);
    }
    lines.push('');
  }

  private appendNamedItemSection(
    lines: string[],
    heading: string,
    emptyMessage: string,
    items: ReadonlyArray<{ name: string }>,
  ): void {
    lines.push(heading);
    lines.push('');
    if (items.length === 0) {
      lines.push(emptyMessage);
    } else {
      for (const item of items) {
        lines.push(`- ${item.name}`);
      }
    }
    lines.push('');
  }

  private formatRelationship(rel: ContextRelationship, ir: IntermediateRepresentation): string {
    const sourceName = this.resolveContextName(rel.sourceContextId, ir);
    const targetName = this.resolveContextName(rel.targetContextId, ir);
    return `- ${sourceName} → ${targetName} (${rel.relationshipType}: ${rel.contract})`;
  }

  private resolveContextName(contextId: string, ir: IntermediateRepresentation): string {
    const context = ir.contexts.find((c) => c.id === contextId);
    return context ? context.name : contextId;
  }

  // context.commands/events/valueObjects already include aggregate members
  // (flattened by @mmmnt/core AST→IR transform). No need to sum separately.
  private countCommands(context: ContextDefinition): number {
    return context.commands.length;
  }

  private countEvents(context: ContextDefinition): number {
    return context.events.length;
  }

  private countValueObjects(context: ContextDefinition): number {
    return context.valueObjects.length;
  }
}
