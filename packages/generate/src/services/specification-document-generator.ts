import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  FlowDefinition,
  MomentDefinition,
  ConnectionDefinition,
  ContextRelationship,
} from '@mmmnt/core';
import type { GeneratedDocument } from '../types/index.js';

/**
 * SpecificationDocumentGenerator — produces a single, human-readable
 * domain specification report from the IR.
 *
 * The output is designed to be shared with non-technical stakeholders.
 * One .moment file → one specification.md.
 */
export class SpecificationDocumentGenerator {
  generate(ir: IntermediateRepresentation): GeneratedDocument[] {
    if (ir.contexts.length === 0 && ir.flows.length === 0) {
      return [];
    }

    const lines: string[] = [];

    this.renderHeader(lines, ir);
    this.renderExecutiveSummary(lines, ir);
    this.renderDomainModel(lines, ir);
    this.renderRelationships(lines, ir);
    this.renderBehavioralFlows(lines, ir);
    this.renderBusinessRules(lines, ir);
    this.renderFooter(lines, ir);

    return [
      {
        documentType: 'specification',
        filePath: 'specification.md',
        content: lines.join('\n'),
      },
    ];
  }

  private renderHeader(lines: string[], ir: IntermediateRepresentation): void {
    const name = ir.metadata.name || 'Domain Specification';
    lines.push(`# ${name}`);
    lines.push('');
    if (ir.metadata.description) {
      lines.push(`> ${ir.metadata.description}`);
      lines.push('');
    }
    lines.push(
      'This document describes the domain model, business rules, and behavioral flows ' +
        'defined in the Moment specification. It is generated from the `.moment` source files ' +
        'and reflects the current state of the domain design.',
    );
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  private renderExecutiveSummary(lines: string[], ir: IntermediateRepresentation): void {
    lines.push('## Executive Summary');
    lines.push('');

    const ctxCount = ir.contexts.length;
    const flowCount = ir.flows.length;
    const aggCount = this.total(ir, (c) => c.aggregates.length);
    const cmdCount = this.total(ir, (c) => c.commands.length);
    const evtCount = this.total(ir, (c) => c.events.length);

    lines.push(
      `This domain is organized into **${ctxCount} bounded context${ctxCount !== 1 ? 's' : ''}**, ` +
        `containing **${aggCount} aggregate${aggCount !== 1 ? 's' : ''}** that handle ` +
        `**${cmdCount} command${cmdCount !== 1 ? 's' : ''}** and produce ` +
        `**${evtCount} event${evtCount !== 1 ? 's' : ''}**.`,
    );
    lines.push('');

    if (flowCount > 0) {
      const momentCount = ir.flows.reduce((s, f) => s + f.moments.length, 0);
      lines.push(
        `**${flowCount} behavioral flow${flowCount !== 1 ? 's' : ''}** describe how these contexts ` +
          `interact across **${momentCount} moment${momentCount !== 1 ? 's' : ''}** in time.`,
      );
      lines.push('');
    }

    lines.push('| | Count |');
    lines.push('|---|---:|');
    lines.push(`| Bounded Contexts | ${ctxCount} |`);
    lines.push(`| Aggregates | ${aggCount} |`);
    lines.push(`| Commands | ${cmdCount} |`);
    lines.push(`| Events | ${evtCount} |`);
    lines.push(`| Value Objects | ${this.total(ir, (c) => c.valueObjects.length)} |`);
    lines.push(`| Business Rules | ${this.total(ir, (c) => c.invariants.length)} |`);
    lines.push(`| Policies | ${this.total(ir, (c) => c.policies.length)} |`);
    lines.push(`| Behavioral Flows | ${flowCount} |`);
    lines.push('');
  }

  private renderDomainModel(lines: string[], ir: IntermediateRepresentation): void {
    if (ir.contexts.length === 0) return;

    lines.push('## Domain Model');
    lines.push('');

    for (const ctx of ir.contexts) {
      this.renderContext(lines, ctx);
    }
  }

  private renderContext(lines: string[], ctx: ContextDefinition): void {
    const tag = ctx.classification ? ` — ${ctx.classification}` : '';
    lines.push(`### ${ctx.name}${tag}`);
    lines.push('');

    const summary: string[] = [];
    if (ctx.aggregates.length > 0) {
      summary.push(`${ctx.aggregates.length} aggregate${ctx.aggregates.length !== 1 ? 's' : ''}`);
    }
    if (ctx.commands.length > 0) {
      summary.push(`${ctx.commands.length} command${ctx.commands.length !== 1 ? 's' : ''}`);
    }
    if (ctx.events.length > 0) {
      summary.push(`${ctx.events.length} event${ctx.events.length !== 1 ? 's' : ''}`);
    }
    if (summary.length > 0) {
      lines.push(`*${summary.join(', ')}*`);
      lines.push('');
    }

    for (const agg of ctx.aggregates) {
      this.renderAggregate(lines, agg);
    }
  }

  private renderAggregate(lines: string[], agg: AggregateDefinition): void {
    lines.push(`#### ${agg.name}`);
    lines.push('');
    lines.push(`Identified by \`${agg.identityField.name}\` (${agg.identityField.type})`);
    lines.push('');

    if (agg.commands.length > 0) {
      lines.push('| Operation | What It Does | Produces |');
      lines.push('|-----------|-------------|----------|');
      for (const cmd of agg.commands) {
        const inputs = cmd.inputs.map((i) => `${i.name}`).join(', ');
        const desc = inputs ? `Accepts: ${inputs}` : 'No input required';
        lines.push(`| **${cmd.name}** | ${desc} | ${cmd.emitsEvent} |`);
      }
      lines.push('');
    }

    if (agg.events.length > 0) {
      for (const evt of agg.events) {
        lines.push(`**${evt.name}** carries:`);
        lines.push('');
        for (const field of evt.fields) {
          const arr = field.isArray ? ' (list)' : '';
          lines.push(`- ${field.name} — *${field.type}${arr}*`);
        }
        lines.push('');
      }
    }

    if (agg.valueObjects.length > 0) {
      lines.push('**Data structures:**');
      lines.push('');
      for (const vo of agg.valueObjects) {
        const fields = vo.fields.map((f) => `${f.name}`).join(', ');
        lines.push(`- **${vo.name}**: ${fields}`);
      }
      lines.push('');
    }
  }

  private renderRelationships(lines: string[], ir: IntermediateRepresentation): void {
    const crossings = ir.flows.flatMap((f) =>
      f.connections.filter((c) => c.connectionType === 'crosses-to'),
    );

    if (ir.relationships.length === 0 && crossings.length === 0) return;

    lines.push('## How Contexts Communicate');
    lines.push('');

    if (ir.relationships.length > 0) {
      for (const rel of ir.relationships) {
        const src = this.resolveCtxName(rel.sourceContextId, ir);
        const tgt = this.resolveCtxName(rel.targetContextId, ir);
        lines.push(`- **${src}** → **${tgt}** (${rel.relationshipType})`);
      }
      lines.push('');
    }

    if (crossings.length > 0) {
      lines.push('Context boundaries are crossed at these points:');
      lines.push('');
      lines.push('| Event | From | To | Relationship | Required Fields |');
      lines.push('|-------|------|----|-------------|-----------------|');
      for (const conn of crossings) {
        if (!('schemaContract' in conn)) continue;
        const target = this.resolveCtxName(conn.targetContextId, ir);
        const source = this.findSourceContext(conn, ir);
        const fields = conn.schemaContract.fields
          .filter((f) => f.required)
          .map((f) => f.name)
          .join(', ');
        lines.push(
          `| ${conn.schemaContract.eventType} | ${source} | ${target} | ${conn.schemaContract.relationshipType} | ${fields} |`,
        );
      }
      lines.push('');
    }
  }

  private renderBehavioralFlows(lines: string[], ir: IntermediateRepresentation): void {
    if (ir.flows.length === 0) return;

    lines.push('## Behavioral Flows');
    lines.push('');
    lines.push(
      'Flows describe what happens over time — the sequence of operations and events ' +
        'that move through the domain. Each **moment** is a point in time where something significant occurs.',
    );
    lines.push('');

    for (const flow of ir.flows) {
      this.renderFlow(lines, flow, ir);
    }
  }

  private renderFlow(lines: string[], flow: FlowDefinition, ir: IntermediateRepresentation): void {
    lines.push(`### ${flow.name}`);
    lines.push('');
    if (flow.description) {
      lines.push(`> ${flow.description}`);
      lines.push('');
    }

    const branchCount = flow.moments.filter((m) => m.branches && m.branches.length > 0).length;
    lines.push(
      `This flow progresses through **${flow.moments.length} moments**` +
        (branchCount > 0
          ? ` with **${branchCount} decision point${branchCount !== 1 ? 's' : ''}**`
          : '') +
        '.',
    );
    lines.push('');

    let step = 1;
    for (const moment of flow.moments) {
      this.renderFlowMoment(lines, moment, step, flow, ir);
      step++;
    }
  }

  private renderFlowMoment(
    lines: string[],
    moment: MomentDefinition,
    step: number,
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
  ): void {
    const hasBranches = moment.branches && moment.branches.length > 0;
    const label = hasBranches ? `${moment.name} *(decision point)*` : moment.name;
    lines.push(`**Step ${step}: ${label}**`);
    lines.push('');

    for (const entry of moment.contextEntries) {
      const ctx = entry.contextId.replace(/^ctx-/, '');
      lines.push(`- ${ctx} performs **${entry.nodeName}**`);
    }

    if (hasBranches) {
      for (const branch of moment.branches!) {
        lines.push(`- *If ${branch.condition}:*`);
        for (const entry of branch.entries) {
          const ctx = entry.contextId.replace(/^ctx-/, '');
          const terminal = entry.terminal ? ' *(flow ends)*' : '';
          lines.push(`  - ${ctx}: **${entry.nodeName}**${terminal}`);
        }
      }
    }

    const crossings = flow.connections.filter(
      (c) => c.sourceMomentId === moment.id && c.connectionType === 'crosses-to',
    );
    for (const conn of crossings) {
      if (!('schemaContract' in conn)) continue;
      const target = this.resolveCtxName(conn.targetContextId, ir);
      lines.push(`- → *Crosses to **${target}***`);
    }

    lines.push('');
  }

  private renderBusinessRules(lines: string[], ir: IntermediateRepresentation): void {
    const allInvariants = ir.contexts.flatMap((c) =>
      c.invariants.map((inv) => ({ ...inv, contextName: c.name })),
    );
    if (allInvariants.length === 0) return;

    lines.push('## Business Rules');
    lines.push('');
    lines.push('These rules must hold true at all times:');
    lines.push('');
    lines.push('| Rule | Description | Applies To |');
    lines.push('|------|-------------|------------|');
    for (const inv of allInvariants) {
      lines.push(`| ${inv.id} | ${inv.description} | ${inv.contextName} / ${inv.scope} |`);
    }
    lines.push('');
  }

  private renderFooter(lines: string[], ir: IntermediateRepresentation): void {
    lines.push('---');
    lines.push('');
    lines.push(
      `*This specification was generated by [Moment](https://github.com/mmmnt/mmmnt) ` +
        `from ${ir.contexts.length} bounded context${ir.contexts.length !== 1 ? 's' : ''} ` +
        `and ${ir.flows.length} behavioral flow${ir.flows.length !== 1 ? 's' : ''}.*`,
    );
    lines.push('');
  }

  private resolveCtxName(id: string, ir: IntermediateRepresentation): string {
    return ir.contexts.find((c) => c.id === id)?.name ?? id.replace(/^ctx-/, '');
  }

  private findSourceContext(conn: ConnectionDefinition, ir: IntermediateRepresentation): string {
    for (const flow of ir.flows) {
      const moment = flow.moments.find((m) => m.id === conn.sourceMomentId);
      if (moment) {
        const entry = moment.contextEntries[0] ?? moment.branches?.[0]?.entries?.[0];
        if (entry) return this.resolveCtxName(entry.contextId, ir);
      }
    }
    return 'Unknown';
  }

  private total(ir: IntermediateRepresentation, fn: (c: ContextDefinition) => number): number {
    return ir.contexts.reduce((s, c) => s + fn(c), 0);
  }
}
