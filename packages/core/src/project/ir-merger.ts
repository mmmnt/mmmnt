/**
 * IR Merger — pure function that combines N IntermediateRepresentations
 * into one, with deterministic ordering and duplicate detection.
 *
 * Rules (from ADR-034 G1):
 *   - contexts[], flows[], glossary[], relationships[], externals[] are concatenated
 *   - names a file could not resolve alone are resolved over the merge (ADR-037)
 *   - Merge order follows the order of the input array (caller sorts by
 *     file path for determinism)
 *   - Duplicate context names across IRs produce a diagnostic error
 *   - metadata uses the first IR's metadata (caller can override)
 */

import type {
  IntermediateRepresentation,
  SpecificationMetadata,
  Diagnostic,
  MomentEntry,
} from '../ir/index.js';

export interface MergeResult {
  readonly ir: IntermediateRepresentation;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Merge N independently-parsed IRs into a single combined IR.
 *
 * The input array's order is authoritative — `irs[0]`'s contexts appear
 * before `irs[1]`'s in the merged output. The caller is responsible for
 * sorting the input (typically by file path, lexicographically) to ensure
 * deterministic output across platforms.
 */
const EMPTY_METADATA: SpecificationMetadata = { name: '', version: '0.0.0' };

/** Build the merged metadata, preferring overrides then first IR's values. */
function resolveMetadata(
  baseMetadata: SpecificationMetadata,
  override?: Partial<SpecificationMetadata>,
): SpecificationMetadata {
  return {
    name: override?.name ?? baseMetadata.name,
    version: override?.version ?? baseMetadata.version,
    description: override?.description ?? baseMetadata.description,
  };
}

/** Detect duplicate context names across IRs. */
function detectDuplicateContexts(irs: readonly IntermediateRepresentation[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < irs.length; i++) {
    for (const ctx of irs[i].contexts) {
      const existing = seen.get(ctx.name);
      if (existing !== undefined) {
        diagnostics.push({
          severity: 'error',
          message: `Duplicate context name '${ctx.name}' — declared in IR #${existing + 1} and IR #${i + 1}. Each context must be defined in exactly one file.`,
          ruleId: 'PM-01',
        });
      } else {
        seen.set(ctx.name, i);
      }
    }
  }
  return diagnostics;
}

/**
 * Names each file could not resolve alone (ADR-037): a flow node's kind when its building block is declared
 * in another file (a file resolves only its own, defaulting to 'event'), and a relationship end that names
 * an external declared in another file.
 */
function resolveAcrossFiles(ir: IntermediateRepresentation): IntermediateRepresentation {
  const kinds = new Map<string, MomentEntry['nodeKind']>(
    ir.contexts.flatMap((ctx) => [
      ...(ctx.commands ?? []).map((c) => [c.name, 'command'] as const),
      ...(ctx.events ?? []).map((e) => [e.name, 'event'] as const),
      ...(ctx.policies ?? []).map((p) => [p.name, 'policy'] as const),
      ...(ctx.sagas ?? []).map((g) => [g.name, 'saga'] as const),
      ...(ctx.projections ?? []).map((p) => [p.name, 'projection'] as const),
      ...(ctx.queries ?? []).map((q) => [q.name, 'query'] as const),
    ]),
  );
  const kindOf = (entry: MomentEntry): MomentEntry => ({
    ...entry,
    nodeKind: kinds.get(entry.nodeName) ?? entry.nodeKind,
  });
  const externalIds = new Set((ir.externals ?? []).map((e) => e.id));
  const endOf = (id: string): string =>
    externalIds.has(id.replace(/^ctx-/, 'ext-')) ? id.replace(/^ctx-/, 'ext-') : id;
  return {
    ...ir,
    flows: ir.flows.map((flow) => ({
      ...flow,
      moments: flow.moments.map((moment) => ({
        ...moment,
        contextEntries: moment.contextEntries.map(kindOf),
        ...(moment.branches
          ? { branches: moment.branches.map((b) => ({ ...b, entries: b.entries.map(kindOf) })) }
          : {}),
      })),
    })),
    relationships: ir.relationships.map((r) => ({
      ...r,
      sourceContextId: endOf(r.sourceContextId),
      targetContextId: endOf(r.targetContextId),
    })),
  };
}

export function mergeIrs(
  irs: readonly IntermediateRepresentation[],
  metadataOverride?: Partial<SpecificationMetadata>,
): MergeResult {
  if (irs.length === 0) {
    return {
      ir: {
        contexts: [],
        flows: [],
        glossary: [],
        relationships: [],
        metadata: resolveMetadata(EMPTY_METADATA, metadataOverride),
      },
      diagnostics: [],
    };
  }

  return {
    ir: resolveAcrossFiles({
      contexts: irs.flatMap((ir) => ir.contexts),
      flows: irs.flatMap((ir) => ir.flows),
      glossary: irs.flatMap((ir) => ir.glossary),
      relationships: irs.flatMap((ir) => ir.relationships),
      externals: irs.flatMap((ir) => ir.externals ?? []),
      metadata: resolveMetadata(irs[0].metadata, metadataOverride),
    }),
    diagnostics: detectDuplicateContexts(irs),
  };
}
