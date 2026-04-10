/**
 * IR Merger — pure function that combines N IntermediateRepresentations
 * into one, with deterministic ordering and duplicate detection.
 *
 * Rules (from ADR-034 G1):
 *   - contexts[], flows[], glossary[], relationships[] are concatenated
 *   - Merge order follows the order of the input array (caller sorts by
 *     file path for determinism)
 *   - Duplicate context names across IRs produce a diagnostic error
 *   - metadata uses the first IR's metadata (caller can override)
 */

import type { IntermediateRepresentation, SpecificationMetadata, Diagnostic } from '../ir/index.js';

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
    ir: {
      contexts: irs.flatMap((ir) => ir.contexts),
      flows: irs.flatMap((ir) => ir.flows),
      glossary: irs.flatMap((ir) => ir.glossary),
      relationships: irs.flatMap((ir) => ir.relationships),
      metadata: resolveMetadata(irs[0].metadata, metadataOverride),
    },
    diagnostics: detectDuplicateContexts(irs),
  };
}
