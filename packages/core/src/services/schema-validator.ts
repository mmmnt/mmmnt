import type {
  IntermediateRepresentation,
  ValidationResult,
  Diagnostic,
  FileRef,
  FlowDefinition,
  ConnectionDefinition,
} from '../ir/index.js';

export class SchemaValidator {
  /**
   * Validates structural correctness of an IntermediateRepresentation.
   * Enforces SP-01 through SP-04 (pure IR checks, no I/O).
   * SP-05 (manifest file references) requires filesystem access —
   * use `validateManifestFiles()` separately.
   */
  validate(ir: IntermediateRepresentation): ValidationResult {
    const diagnostics: Diagnostic[] = [];
    this.checkSP01(ir, diagnostics);
    this.checkSP02(ir, diagnostics);
    this.checkSP03(ir, diagnostics);
    this.checkSP04(ir, diagnostics);
    return { valid: diagnostics.length === 0, diagnostics };
  }

  /**
   * Validates that all file references in the manifest exist on disk (SP-05).
   * Requires an injected `fileExists` function for filesystem access.
   */
  validateManifestFiles(files: FileRef[], fileExists: (path: string) => boolean): ValidationResult {
    const diagnostics: Diagnostic[] = [];
    for (const file of files) {
      if (!fileExists(file.path)) {
        diagnostics.push({
          severity: 'error',
          message: `SP-05: File '${file.path}' referenced in manifest does not exist.`,
          ruleId: 'SP-05',
        });
      }
    }
    return { valid: diagnostics.length === 0, diagnostics };
  }

  private checkSP01(ir: IntermediateRepresentation, diagnostics: Diagnostic[]): void {
    const contextIds = new Set(ir.contexts.map((c) => c.id));
    for (const flow of ir.flows) {
      for (const conn of flow.connections) {
        if (conn.connectionType === 'crosses-to' && !contextIds.has(conn.targetContextId)) {
          diagnostics.push({
            severity: 'error',
            message: `SP-01: Connection '${conn.id}' references unknown context '${conn.targetContextId}'.`,
            ruleId: 'SP-01',
          });
        }
      }
    }
  }

  /**
   * SP-02: A crossing's event must be declared on the boundary it crosses —
   * by the source context (the emitter, the convention the shipped examples
   * follow) or by the target context (consumer-side re-declaration). The
   * original target-only rule flagged every crossing in the canonical
   * examples, because events are declared once, in the emitting context.
   */
  private checkSP02(ir: IntermediateRepresentation, diagnostics: Diagnostic[]): void {
    const contextEventsMap = new Map<string, Set<string>>();
    for (const ctx of ir.contexts) {
      const eventIds = new Set(ctx.events.map((e) => e.id));
      contextEventsMap.set(ctx.id, eventIds);
    }

    for (const flow of ir.flows) {
      for (const conn of flow.connections) {
        if (conn.connectionType === 'crosses-to') {
          this.checkCrossingEventDeclared(flow, conn, contextEventsMap, diagnostics);
        }
      }
    }
  }

  private checkCrossingEventDeclared(
    flow: FlowDefinition,
    conn: ConnectionDefinition,
    contextEventsMap: Map<string, Set<string>>,
    diagnostics: Diagnostic[],
  ): void {
    const targetEvents = contextEventsMap.get(conn.targetContextId);
    const sourceContextId = this.resolveSourceContextId(flow, conn);
    const sourceEvents =
      sourceContextId !== undefined ? contextEventsMap.get(sourceContextId) : undefined;
    // Unknown contexts on both ends are SP-01's finding, not SP-02's.
    if (!targetEvents && !sourceEvents) return;
    if (!targetEvents?.has(conn.eventId) && !sourceEvents?.has(conn.eventId)) {
      diagnostics.push({
        severity: 'error',
        message: `SP-02: Connection '${conn.id}' references event '${conn.eventId}' which is declared neither by its source context nor by target context '${conn.targetContextId}'.`,
        ruleId: 'SP-02',
      });
    }
  }

  /** Context that owns the connection's declaring node, via its moment entry. */
  private resolveSourceContextId(
    flow: FlowDefinition,
    conn: ConnectionDefinition,
  ): string | undefined {
    if (conn.sourceNodeName === undefined) return undefined;
    const moment = flow.moments.find((m) => m.id === conn.sourceMomentId);
    if (!moment) return undefined;
    const entries = [
      ...moment.contextEntries,
      ...(moment.branches?.flatMap((b) => b.entries) ?? []),
    ];
    return entries.find((e) => e.nodeName === conn.sourceNodeName)?.contextId;
  }

  private checkSP03(ir: IntermediateRepresentation, diagnostics: Diagnostic[]): void {
    for (const flow of ir.flows) {
      for (const conn of flow.connections) {
        if (conn.connectionType === 'crosses-to') {
          if (conn.schemaContract.fields.length === 0) {
            diagnostics.push({
              severity: 'error',
              message: `SP-03: Crossing connection '${conn.id}' has an empty schema contract.`,
              ruleId: 'SP-03',
            });
          }
        }
      }
    }
  }

  /**
   * SP-04: returns-to must land on a prior moment in the same flow.
   *
   * Resolution uses the connection's `targetMomentId` (with a
   * `targetMomentLabel` name-match fallback) — the moment the spec actually
   * names. The original implementation resolved via `targetContextId`, which
   * is the SOURCE node's own lane (audit M-P10) and flagged every moment that
   * merely shared that context — semantically wrong in both directions.
   */
  private checkSP04(ir: IntermediateRepresentation, diagnostics: Diagnostic[]): void {
    for (const flow of ir.flows) {
      const momentIndexMap = new Map<string, number>();
      flow.moments.forEach((m, index) => {
        momentIndexMap.set(m.id, index);
      });

      for (const conn of flow.connections) {
        if (conn.connectionType === 'returns-to') {
          this.checkReturnsToIsPrior(flow, conn, momentIndexMap, diagnostics);
        }
      }
    }
  }

  private checkReturnsToIsPrior(
    flow: FlowDefinition,
    conn: Extract<
      ConnectionDefinition,
      { connectionType: 'returns-to' | 'triggers' | 'triggered-by' }
    >,
    momentIndexMap: Map<string, number>,
    diagnostics: Diagnostic[],
  ): void {
    const sourceIndex = momentIndexMap.get(conn.sourceMomentId);
    if (sourceIndex === undefined) {
      diagnostics.push({
        severity: 'error',
        message: `SP-04: Connection '${conn.id}' references unresolvable source moment '${conn.sourceMomentId}'.`,
        ruleId: 'SP-04',
      });
      return;
    }

    const targetMomentId =
      conn.targetMomentId ?? this.resolveMomentIdByLabel(flow, conn.targetMomentLabel);
    const targetIndex =
      targetMomentId !== undefined ? momentIndexMap.get(targetMomentId) : undefined;

    if (targetIndex === undefined) {
      diagnostics.push({
        severity: 'error',
        message: `SP-04: Connection '${conn.id}' returns-to target moment '${conn.targetMomentLabel ?? conn.targetMomentId ?? 'unknown'}' which cannot be resolved in this flow.`,
        ruleId: 'SP-04',
      });
      return;
    }

    if (targetIndex >= sourceIndex) {
      diagnostics.push({
        severity: 'error',
        message: `SP-04: Connection '${conn.id}' returns-to a moment that is not prior (source moment index ${sourceIndex}, target moment index ${targetIndex}).`,
        ruleId: 'SP-04',
      });
    }
  }

  private resolveMomentIdByLabel(flow: FlowDefinition, label?: string): string | undefined {
    if (label === undefined) return undefined;
    return flow.moments.find((m) => m.name === label)?.id;
  }
}
