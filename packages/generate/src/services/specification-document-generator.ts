import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  FlowDefinition,
  MomentDefinition,
  ConnectionDefinition,
  EventDefinition,
  ValueObjectDefinition,
  SagaDefinition,
} from '@mmmnt/core';
import type { GeneratedDocument } from '../types/index.js';

/**
 * SpecificationDocumentGenerator — produces a single domain narrative
 * document from the IR, structured around how the domain works rather
 * than how the types are organized.
 *
 * Structure:
 *   1. Title + Description (inferred from flow)
 *   2. Table of Contents
 *   3. At a Glance (summary + context overview)
 *   4. What Happens (behavioral flow as narrative with branches)
 *   5. Context Boundaries (crossings with temporal context)
 *   6. Domain Model (aggregates with commands, events, types)
 *   7. Business Rules (inline with where they apply)
 *   8. Data Glossary (all value objects + event shapes)
 */
export class SpecificationDocumentGenerator {
  generate(ir: IntermediateRepresentation): GeneratedDocument[] {
    if (ir.contexts.length === 0 && ir.flows.length === 0) return [];

    const lines: string[] = [];

    this.renderTitle(lines, ir);
    this.renderToc(lines, ir);
    this.renderAtAGlance(lines, ir);
    this.renderMermaidDiagrams(lines, ir);
    this.renderWhatHappens(lines, ir);
    this.renderContextBoundaries(lines, ir);
    this.renderDomainModel(lines, ir);
    this.renderDataGlossary(lines, ir);
    this.renderFooter(lines, ir);

    return [{ documentType: 'specification', filePath: 'specification.md', content: lines.join('\n') }];
  }

  // ===========================================================================
  // 1. Title
  // ===========================================================================

  private renderTitle(lines: string[], ir: IntermediateRepresentation): void {
    const title = this.inferTitle(ir);
    lines.push(`# ${title}`);
    lines.push('');

    const desc = this.inferDescription(ir);
    if (desc) {
      lines.push(`> ${desc}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  private inferTitle(ir: IntermediateRepresentation): string {
    if (ir.metadata.name && ir.metadata.name !== '') return ir.metadata.name;
    if (ir.flows.length > 0 && ir.flows[0].description) {
      const first = ir.flows[0].description.split('.')[0].split('—')[0].trim();
      if (first.length > 5) return first;
    }
    const names = ir.contexts.map((c) => c.name);
    if (names.length <= 3) return names.join(' + ') + ' Domain';
    return 'Domain Specification';
  }

  private inferDescription(ir: IntermediateRepresentation): string | undefined {
    if (ir.flows.length > 0 && ir.flows[0].description) return ir.flows[0].description;
    return ir.metadata.description;
  }

  // ===========================================================================
  // 2. Table of Contents
  // ===========================================================================

  private renderToc(lines: string[], ir: IntermediateRepresentation): void {
    lines.push('## Table of Contents');
    lines.push('');
    lines.push('1. [At a Glance](#at-a-glance)');
    if (ir.flows.length > 0) lines.push('2. [What Happens](#what-happens)');
    lines.push('3. [Context Boundaries](#context-boundaries)');
    lines.push('4. [Domain Model](#domain-model)');
    lines.push('5. [Data Glossary](#data-glossary)');
    lines.push('');
  }

  // ===========================================================================
  // 3. At a Glance
  // ===========================================================================

  private renderAtAGlance(lines: string[], ir: IntermediateRepresentation): void {
    lines.push('## At a Glance');
    lines.push('');

    // Context cards
    lines.push('| Context | Role | Description | Aggregates | Commands | Events |');
    lines.push('|---------|------|-------------|:----------:|:--------:|:------:|');
    for (const ctx of ir.contexts) {
      const role = ctx.classification ?? '—';
      const desc = ctx.description ?? '—';
      lines.push(
        `| **${ctx.name}** | ${role} | ${desc} | ${ctx.aggregates.length} | ${ctx.commands.length} | ${ctx.events.length} |`,
      );
    }
    lines.push('');

    // Quick stats
    const flows = ir.flows.length;
    const moments = ir.flows.reduce((s, f) => s + f.moments.length, 0);
    const crossings = ir.flows.reduce(
      (s, f) => s + f.connections.filter((c) => c.connectionType === 'crosses-to').length,
      0,
    );
    const rules = ir.contexts.reduce((s, c) => s + c.invariants.length, 0);
    const policies = ir.contexts.reduce((s, c) => s + c.policies.length, 0);

    if (flows > 0) {
      lines.push(
        `**${flows} flow${flows !== 1 ? 's' : ''}** · ` +
          `${moments} moments · ` +
          `${crossings} context crossing${crossings !== 1 ? 's' : ''} · ` +
          `${rules} business rule${rules !== 1 ? 's' : ''} · ` +
          `${policies} polic${policies !== 1 ? 'ies' : 'y'}`,
      );
      lines.push('');
    }
  }

  // ===========================================================================
  // 4. What Happens (behavioral narrative)
  // ===========================================================================

  private renderWhatHappens(lines: string[], ir: IntermediateRepresentation): void {
    if (ir.flows.length === 0) return;

    lines.push('## What Happens');
    lines.push('');

    for (const flow of ir.flows) {
      this.renderFlowNarrative(lines, flow, ir);
    }
  }

  private renderFlowNarrative(lines: string[], flow: FlowDefinition, ir: IntermediateRepresentation): void {
    if (ir.flows.length > 1) {
      lines.push(`### ${flow.name}`);
      lines.push('');
      if (flow.description) {
        lines.push(`> ${flow.description}`);
        lines.push('');
      }
    }

    let step = 0;
    for (const moment of flow.moments) {
      step++;
      this.renderMomentNarrative(lines, moment, step, flow, ir);
    }
  }

  private renderMomentNarrative(
    lines: string[],
    moment: MomentDefinition,
    step: number,
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
  ): void {
    this.renderMomentHeader(lines, moment, step, flow, ir);

    for (const entry of moment.contextEntries) {
      this.renderEntryNarrative(lines, entry, flow, ir);
    }

    this.renderMomentBranches(lines, moment, flow, ir);
    this.renderMomentPoliciesAndRules(lines, moment, ir);

    lines.push('');
  }

  private renderMomentHeader(
    lines: string[],
    moment: MomentDefinition,
    step: number,
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
  ): void {
    const ctxLabel = this.buildContextLabel(moment, ir);
    const sagaLabel = this.findSagaStateForMoment(moment, step, flow, ir);
    const sagaSuffix = sagaLabel ? ` — *${sagaLabel}*` : '';
    lines.push(`**${step}. ${moment.name}**${ctxLabel}${sagaSuffix}`);
    lines.push('');
  }

  private buildContextLabel(moment: MomentDefinition, ir: IntermediateRepresentation): string {
    const primaryCtxId = moment.contextEntries[0]?.contextId
      ?? moment.branches?.[0]?.entries?.[0]?.contextId
      ?? '';
    const ctxName = primaryCtxId ? this.resolveCtxName(primaryCtxId, ir) : '';
    return ctxName ? ` *(${ctxName})*` : '';
  }

  private renderMomentBranches(
    lines: string[],
    moment: MomentDefinition,
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
  ): void {
    if (!moment.branches || moment.branches.length === 0) return;
    for (const branch of moment.branches) {
      const isTerminal = branch.entries.some((e) => e.terminal);
      if (isTerminal) {
        lines.push(`  - ❌ **If ${branch.condition}** → flow terminates`);
      } else {
        lines.push(`  - ✅ **If ${branch.condition}:**`);
        for (const entry of branch.entries) {
          this.renderEntryNarrative(lines, entry, flow, ir, '    ');
        }
      }
    }
  }

  private renderMomentPoliciesAndRules(
    lines: string[],
    moment: MomentDefinition,
    ir: IntermediateRepresentation,
  ): void {
    for (const pol of this.findPoliciesTriggeredBy(moment, ir)) {
      lines.push(`  - 🔗 *Policy: ${pol.name}* — ${pol.action}`);
    }
    for (const rule of this.findApplicableRules(moment, ir)) {
      lines.push(`  - 📋 *Rule ${rule.id}:* ${rule.description}`);
    }
  }

  private renderEntryNarrative(
    lines: string[],
    entry: MomentEntry,
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
    indent = '  ',
  ): void {
    const ctx = ir.contexts.find((c) => c.id === entry.contextId);
    const ctxName = entry.contextId.replace(/^ctx-/, '');
    const crossing = this.findCrossing(entry.nodeName, flow);

    if (this.isCommand(entry.nodeName, ctx)) {
      this.renderCommandNarrative(lines, entry, ctx, ctxName, indent);
    } else if (crossing) {
      const target = this.resolveCtxName(crossing.targetContextId, ir);
      lines.push(`${indent}- **${entry.nodeName}** → crosses to **${target}**`);
    } else {
      lines.push(`${indent}- ${ctxName} emits **${entry.nodeName}**`);
    }
  }

  private renderCommandNarrative(
    lines: string[],
    entry: MomentEntry,
    ctx: ContextDefinition | undefined,
    ctxName: string,
    indent: string,
  ): void {
    const cmd = this.findCommand(ctx, entry.nodeName);
    const intent = cmd?.preconditions?.[0]?.description;
    const produces = cmd?.emitsEvent ? ` → produces **${cmd.emitsEvent}**` : '';
    if (intent) {
      lines.push(`${indent}- *Requires:* ${intent}`);
    }
    lines.push(`${indent}- ${ctxName} performs **${cmd?.name ?? entry.nodeName}**${produces}`);
  }

  // ===========================================================================
  // 5. Context Boundaries
  // ===========================================================================

  private renderContextBoundaries(lines: string[], ir: IntermediateRepresentation): void {
    const allCrossings = ir.flows.flatMap((f) =>
      f.connections
        .filter((c) => c.connectionType === 'crosses-to')
        .map((c) => ({ conn: c, flow: f })),
    );

    if (allCrossings.length === 0 && ir.relationships.length === 0) return;

    lines.push('## Context Boundaries');
    lines.push('');
    lines.push(
      'These are the points where data crosses from one bounded context to another. ' +
        'Each crossing defines a contract — the required fields that the receiving context depends on.',
    );
    lines.push('');

    for (const { conn, flow } of allCrossings) {
      if (!('schemaContract' in conn)) continue;
      const moment = flow.moments.find((m) => m.id === conn.sourceMomentId);
      const momentName = moment?.name ?? '—';
      const source = this.findSourceCtx(conn, moment, ir);
      const target = this.resolveCtxName(conn.targetContextId, ir);

      lines.push(`### ${conn.schemaContract.eventType}`);
      lines.push('');
      lines.push(`**${source}** → **${target}** via ${conn.schemaContract.relationshipType}`);
      lines.push(`*Occurs during: ${momentName}*`);
      lines.push('');

      if (conn.schemaContract.fields.length > 0) {
        lines.push('| Field | Type | Required |');
        lines.push('|-------|------|:--------:|');
        for (const f of conn.schemaContract.fields) {
          lines.push(`| \`${f.name}\` | ${f.type} | ${f.required ? '✓' : '—'} |`);
        }
        lines.push('');
      }
    }
  }

  // ===========================================================================
  // 6. Domain Model
  // ===========================================================================

  private renderDomainModel(lines: string[], ir: IntermediateRepresentation): void {
    if (ir.contexts.length === 0) return;

    lines.push('## Domain Model');
    lines.push('');

    for (const ctx of ir.contexts) {
      this.renderContextModel(lines, ctx);
    }
  }

  private renderContextModel(lines: string[], ctx: ContextDefinition): void {
    const tag = ctx.classification ? ` [${ctx.classification}]` : '';
    lines.push(`### ${ctx.name}${tag}`);
    lines.push('');

    if (ctx.description) {
      lines.push(`> ${ctx.description}`);
      lines.push('');
    }

    for (const agg of ctx.aggregates) {
      this.renderAggregateModel(lines, agg);
    }

    if (ctx.sagas.length > 0) {
      lines.push('**Sagas:**');
      lines.push('');
      for (const saga of ctx.sagas) {
        lines.push(`- **${saga.name}**: ${saga.states.join(' → ')}`);
        lines.push(`  - Triggered by: ${saga.trigger}`);
        lines.push(`  - Compensation: ${saga.compensation}`);
      }
      lines.push('');
    }
  }

  private renderAggregateModel(lines: string[], agg: AggregateDefinition): void {
    lines.push(`#### ${agg.name}`);
    lines.push('');
    lines.push(`*Identity:* \`${agg.identityField.name}: ${agg.identityField.type}\``);
    lines.push('');

    if (agg.commands.length > 0) {
      lines.push('| Command | Purpose | Produces |');
      lines.push('|---------|---------|----------|');
      for (const cmd of agg.commands) {
        const purpose = cmd.preconditions[0]?.description ?? `Accepts ${cmd.inputs.map((i) => i.name).join(', ')}`;
        lines.push(`| **${cmd.name}** | ${purpose} | ${cmd.emitsEvent} |`);
      }
      lines.push('');
    }

    if (agg.events.length > 0) {
      for (const evt of agg.events) {
        lines.push(`**${evt.name}:**`);
        for (const f of evt.fields) {
          const arr = f.isArray ? '[]' : '';
          const fieldLabel = f.deprecated ? `~~${f.name}~~ (deprecated)` : f.name;
          lines.push(`- \`${fieldLabel}\`: *${f.type}${arr}*`);
        }
        lines.push('');
      }
    }
  }

  // ===========================================================================
  // 7. Data Glossary
  // ===========================================================================

  private renderDataGlossary(lines: string[], ir: IntermediateRepresentation): void {
    const allVOs = this.collectAllValueObjects(ir);
    if (allVOs.size === 0) return;

    lines.push('## Data Glossary');
    lines.push('');
    lines.push('Shared data structures used across the domain:');
    lines.push('');

    for (const [name, vo] of allVOs) {
      this.renderValueObject(lines, name, vo);
    }
  }

  private collectAllValueObjects(ir: IntermediateRepresentation): Map<string, ValueObjectDefinition> {
    const allVOs = new Map<string, ValueObjectDefinition>();
    for (const ctx of ir.contexts) {
      for (const agg of ctx.aggregates) {
        for (const vo of agg.valueObjects) {
          if (!allVOs.has(vo.name)) allVOs.set(vo.name, vo);
        }
      }
      for (const vo of ctx.valueObjects) {
        if (!allVOs.has(vo.name)) allVOs.set(vo.name, vo);
      }
    }
    return allVOs;
  }

  private renderValueObject(lines: string[], name: string, vo: ValueObjectDefinition): void {
    lines.push(`**${name}**`);
    lines.push('');
    lines.push('| Field | Type |');
    lines.push('|-------|------|');
    for (const f of vo.fields) {
      const arr = f.isArray ? '[]' : '';
      const fieldLabel = f.deprecated ? `~~${f.name}~~ (deprecated)` : f.name;
      lines.push(`| \`${fieldLabel}\` | ${f.type}${arr} |`);
    }
    lines.push('');
  }

  // ===========================================================================
  // Footer
  // ===========================================================================

  private renderFooter(lines: string[], ir: IntermediateRepresentation): void {
    lines.push('---');
    lines.push('');
    lines.push(
      `*Generated by [Moment](https://github.com/mmmnt/mmmnt) from ` +
        `${ir.contexts.length} context${ir.contexts.length !== 1 ? 's' : ''} and ` +
        `${ir.flows.length} flow${ir.flows.length !== 1 ? 's' : ''}.*`,
    );
    lines.push('');
  }

  // ===========================================================================
  // Mermaid Diagrams
  // ===========================================================================

  private renderMermaidDiagrams(lines: string[], ir: IntermediateRepresentation): void {
    this.renderContextMapDiagram(lines, ir);
    this.renderFlowSequenceDiagram(lines, ir);
  }

  private renderContextMapDiagram(lines: string[], ir: IntermediateRepresentation): void {
    const edges = this.buildContextMapEdges(ir);
    if (ir.contexts.length === 0) return;

    lines.push('```mermaid');
    lines.push('graph LR');

    for (const ctx of ir.contexts) {
      const classification = ctx.classification ?? 'Generic';
      const nodeId = this.mermaidNodeId(ctx.name);
      lines.push(`  ${nodeId}["${ctx.name}<br/><i>${classification}</i>"]`);
    }

    for (const edge of edges) {
      lines.push(`  ${edge.source} -->|${edge.label}| ${edge.target}`);
    }

    lines.push('```');
    lines.push('');
  }

  private buildContextMapEdges(
    ir: IntermediateRepresentation,
  ): { source: string; target: string; label: string }[] {
    const edges: { source: string; target: string; label: string }[] = [];
    const seen = new Set<string>();

    for (const flow of ir.flows) {
      for (const conn of flow.connections) {
        if (conn.connectionType !== 'crosses-to') continue;
        const moment = flow.moments.find((m) => m.id === conn.sourceMomentId);
        const sourceCtxId = this.resolveSourceContextId(moment);
        if (!sourceCtxId) continue;

        const sourceNode = this.mermaidNodeId(this.resolveCtxName(sourceCtxId, ir));
        const targetNode = this.mermaidNodeId(this.resolveCtxName(conn.targetContextId, ir));
        const label = conn.schemaContract.relationshipType;
        const key = `${sourceNode}-${targetNode}-${label}`;

        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ source: sourceNode, target: targetNode, label });
        }
      }
    }
    return edges;
  }

  private renderFlowSequenceDiagram(lines: string[], ir: IntermediateRepresentation): void {
    if (ir.flows.length === 0) return;

    for (const flow of ir.flows) {
      this.renderSingleFlowSequence(lines, flow, ir);
    }
  }

  private renderSingleFlowSequence(
    lines: string[],
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
  ): void {
    const participants = this.collectFlowParticipants(flow, ir);
    if (participants.length === 0) return;

    lines.push('```mermaid');
    lines.push('sequenceDiagram');

    for (const p of participants) {
      lines.push(`  participant ${p}`);
    }

    for (const moment of flow.moments) {
      this.renderMomentSequenceMessages(lines, moment, flow, ir);
    }

    lines.push('```');
    lines.push('');
  }

  private collectFlowParticipants(flow: FlowDefinition, ir: IntermediateRepresentation): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    const addCtx = (contextId: string): void => {
      const name = this.resolveCtxName(contextId, ir);
      // Only add real contexts (those that exist in IR)
      if (!seen.has(name) && ir.contexts.some((c) => c.id === contextId)) {
        seen.add(name);
        result.push(name);
      }
    };

    for (const moment of flow.moments) {
      for (const entry of moment.contextEntries) addCtx(entry.contextId);
      if (moment.branches) {
        for (const branch of moment.branches) {
          for (const entry of branch.entries) addCtx(entry.contextId);
        }
      }
    }
    // Also include crossing targets
    for (const conn of flow.connections) {
      if (conn.connectionType === 'crosses-to') addCtx(conn.targetContextId);
    }
    return result;
  }

  private renderMomentSequenceMessages(
    lines: string[],
    moment: MomentDefinition,
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
  ): void {
    const ctxName = this.resolveMomentCtxName(moment, ir);

    // Render main context entries
    this.renderSequenceEntries(lines, moment.contextEntries, ctxName, flow, ir);

    // Branches as alt blocks — only if non-terminal entries exist
    if (moment.branches && moment.branches.length > 0) {
      this.renderBranchAltBlock(lines, moment, ctxName, flow, ir);
    }
  }

  private renderBranchAltBlock(
    lines: string[],
    moment: MomentDefinition,
    ctxName: string,
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
  ): void {
    const nonTerminal = moment.branches!.filter((b) => !b.entries.some((e) => e.terminal));
    const terminal = moment.branches!.filter((b) => b.entries.some((e) => e.terminal));

    if (nonTerminal.length === 0 && terminal.length === 0) return;

    for (let i = 0; i < nonTerminal.length; i++) {
      const branch = nonTerminal[i];
      const keyword = i === 0 ? 'alt' : 'else';
      lines.push(`  ${keyword} ${branch.condition}`);
      const branchCtx = this.resolveBranchCtx(branch, ctxName, ir);
      this.renderSequenceEntries(lines, branch.entries, branchCtx, flow, ir);
    }
    if (terminal.length > 0) {
      const keyword = nonTerminal.length === 0 ? 'alt' : 'else';
      const labels = terminal.map((b) => b.condition).join(' / ');
      lines.push(`  ${keyword} ${labels}`);
      lines.push(`  Note over ${ctxName}: Flow terminates`);
    }
    lines.push('  end');
  }

  private resolveBranchCtx(
    branch: { entries: MomentEntry[] },
    fallback: string,
    ir: IntermediateRepresentation,
  ): string {
    const entry = branch.entries.find((e) => !e.terminal);
    return entry ? this.resolveCtxName(entry.contextId, ir) : fallback;
  }

  private renderSequenceEntries(
    lines: string[],
    entries: MomentEntry[],
    ctxName: string,
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
  ): void {
    for (const entry of entries) {
      if (entry.terminal) continue;
      this.renderSingleSequenceEntry(lines, entry, ctxName, flow, ir);
    }
  }

  private renderSingleSequenceEntry(
    lines: string[],
    entry: MomentEntry,
    ctxName: string,
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
  ): void {
    const entryCtx = this.resolveCtxName(entry.contextId, ir);
    const crossing = this.findCrossing(entry.nodeName, flow);

    if (crossing) {
      const target = this.resolveCtxName(crossing.targetContextId, ir);
      lines.push(`  ${entryCtx}->>${target}: ${entry.nodeName} (crosses)`);
    } else if (this.isCommand(entry.nodeName, ir.contexts.find((c) => c.id === entry.contextId))) {
      const cmd = this.findCommand(ir.contexts.find((c) => c.id === entry.contextId), entry.nodeName);
      const emits = cmd?.emitsEvent ? ` → ${cmd.emitsEvent}` : '';
      lines.push(`  ${entryCtx}->>${entryCtx}: ${entry.nodeName}${emits}`);
    } else {
      lines.push(`  ${entryCtx}->>${entryCtx}: ${entry.nodeName}`);
    }
  }

  private resolveMomentCtxName(moment: MomentDefinition, ir: IntermediateRepresentation): string {
    const entry = moment.contextEntries[0] ?? moment.branches?.[0]?.entries?.[0];
    return entry ? this.resolveCtxName(entry.contextId, ir) : '';
  }

  private mermaidNodeId(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '');
  }

  private resolveSourceContextId(moment: MomentDefinition | undefined): string | undefined {
    if (!moment) return undefined;
    const entry = moment.contextEntries[0] ?? moment.branches?.[0]?.entries?.[0];
    return entry?.contextId;
  }

  // ===========================================================================
  // Saga Helpers
  // ===========================================================================

  private findSagaStateForMoment(
    moment: MomentDefinition,
    step: number,
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
  ): string | undefined {
    const matchedSaga = this.findSagaForMoment(moment, step, flow, ir);
    if (!matchedSaga) return undefined;

    const stateIndex = this.computeSagaStateIndex(matchedSaga.saga, matchedSaga.triggerStep, step);
    if (stateIndex < 0 || stateIndex >= matchedSaga.saga.states.length) return undefined;

    return `${matchedSaga.saga.name}: ${matchedSaga.saga.states[stateIndex]}`;
  }

  private findSagaForMoment(
    _moment: MomentDefinition,
    step: number,
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
  ): { saga: SagaDefinition; triggerStep: number } | undefined {
    // Collect all events emitted up to and including this moment
    const eventsUpTo = this.collectEventsUpToStep(flow, step);

    for (const ctx of ir.contexts) {
      for (const saga of ctx.sagas) {
        const triggerStep = this.findSagaTriggerStep(saga, flow);
        if (triggerStep >= 1 && triggerStep <= step) {
          // Verify the trigger event is in the events we've seen
          if (eventsUpTo.has(saga.trigger)) {
            return { saga, triggerStep };
          }
        }
      }
    }
    return undefined;
  }

  private findSagaTriggerStep(saga: SagaDefinition, flow: FlowDefinition): number {
    for (let i = 0; i < flow.moments.length; i++) {
      const moment = flow.moments[i];
      const hasEvent = moment.contextEntries.some(
        (e) => e.nodeKind === 'event' && e.nodeName === saga.trigger,
      );
      if (hasEvent) return i + 1;
    }
    return -1;
  }

  private collectEventsUpToStep(flow: FlowDefinition, step: number): Set<string> {
    const events = new Set<string>();
    for (let i = 0; i < step && i < flow.moments.length; i++) {
      for (const entry of flow.moments[i].contextEntries) {
        if (entry.nodeKind === 'event') events.add(entry.nodeName);
      }
    }
    return events;
  }

  private computeSagaStateIndex(
    saga: SagaDefinition,
    triggerStep: number,
    currentStep: number,
  ): number {
    const elapsed = currentStep - triggerStep;
    return Math.min(elapsed, saga.states.length - 1);
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private resolveCtxName(id: string, ir: IntermediateRepresentation): string {
    return ir.contexts.find((c) => c.id === id)?.name ?? id.replace(/^ctx-/, '');
  }

  private isCommand(name: string, ctx: ContextDefinition | undefined): boolean {
    if (!ctx) return false;
    return ctx.commands.some((c) => c.name === name);
  }

  private findCommand(ctx: ContextDefinition | undefined, name: string) {
    if (!ctx) return undefined;
    for (const agg of ctx.aggregates) {
      const cmd = agg.commands.find((c) => c.name === name);
      if (cmd) return cmd;
    }
    return undefined;
  }

  private findCrossing(nodeName: string, flow: FlowDefinition): ConnectionDefinition | undefined {
    return flow.connections.find(
      (c) => c.connectionType === 'crosses-to' && c.eventId === `evt-${nodeName}`,
    );
  }

  private findSourceCtx(
    conn: ConnectionDefinition,
    moment: MomentDefinition | undefined,
    ir: IntermediateRepresentation,
  ): string {
    if (!moment) return '—';
    const entry = moment.contextEntries[0] ?? moment.branches?.[0]?.entries?.[0];
    return entry ? this.resolveCtxName(entry.contextId, ir) : '—';
  }

  private findPoliciesTriggeredBy(moment: MomentDefinition, ir: IntermediateRepresentation) {
    const eventNames = moment.contextEntries
      .filter((e) => !this.isCommand(e.nodeName, ir.contexts.find((c) => c.id === e.contextId)))
      .map((e) => e.nodeName);

    const policies: { name: string; action: string }[] = [];
    for (const ctx of ir.contexts) {
      for (const pol of ctx.policies) {
        if (eventNames.includes(pol.trigger)) {
          policies.push({ name: pol.name, action: pol.action });
        }
      }
    }
    return policies;
  }

  private findApplicableRules(moment: MomentDefinition, ir: IntermediateRepresentation) {
    const rules: { id: string; description: string }[] = [];
    const seen = new Set<string>();

    for (const entry of moment.contextEntries) {
      const ctx = ir.contexts.find((c) => c.id === entry.contextId);
      if (!ctx) continue;
      for (const agg of ctx.aggregates) {
        if (agg.commands.some((c) => c.name === entry.nodeName)) {
          for (const inv of ctx.invariants) {
            if (inv.scope === agg.name && !seen.has(inv.id)) {
              rules.push({ id: inv.id, description: inv.description });
              seen.add(inv.id);
            }
          }
        }
      }
    }
    return rules;
  }
}

type MomentEntry = { contextId: string; nodeName: string; nodeKind: string; terminal?: boolean };
