import type {
  IntermediateRepresentation,
  ValidationResult,
  Diagnostic,
  FileRef,
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

  private checkSP02(ir: IntermediateRepresentation, diagnostics: Diagnostic[]): void {
    const contextEventsMap = new Map<string, Set<string>>();
    for (const ctx of ir.contexts) {
      const eventIds = new Set(ctx.events.map((e) => e.id));
      contextEventsMap.set(ctx.id, eventIds);
    }

    for (const flow of ir.flows) {
      for (const conn of flow.connections) {
        if (conn.connectionType === 'crosses-to') {
          const targetEvents = contextEventsMap.get(conn.targetContextId);
          if (targetEvents && !targetEvents.has(conn.eventId)) {
            diagnostics.push({
              severity: 'error',
              message: `SP-02: Connection '${conn.id}' references unknown event '${conn.eventId}' in context '${conn.targetContextId}'.`,
              ruleId: 'SP-02',
            });
          }
        }
      }
    }
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

  private checkSP04(ir: IntermediateRepresentation, diagnostics: Diagnostic[]): void {
    for (const flow of ir.flows) {
      const momentIndexMap = new Map<string, number>();
      flow.moments.forEach((m, index) => {
        momentIndexMap.set(m.id, index);
      });

      for (const conn of flow.connections) {
        if (conn.connectionType === 'returns-to') {
          const sourceIndex = momentIndexMap.get(conn.sourceMomentId);
          if (sourceIndex === undefined) {
            diagnostics.push({
              severity: 'error',
              message: `SP-04: Connection '${conn.id}' references unresolvable source moment '${conn.sourceMomentId}'.`,
              ruleId: 'SP-04',
            });
            continue;
          }

          const targetMomentIds = flow.moments
            .filter((m) => m.contextEntries.some((e) => e.contextId === conn.targetContextId))
            .map((m) => m.id);

          if (targetMomentIds.length === 0) {
            diagnostics.push({
              severity: 'error',
              message: `SP-04: Connection '${conn.id}' returns-to target context '${conn.targetContextId}' which does not appear in any moment.`,
              ruleId: 'SP-04',
            });
            continue;
          }

          for (const targetMomentId of targetMomentIds) {
            const targetIndex = momentIndexMap.get(targetMomentId);
            if (targetIndex !== undefined && targetIndex >= sourceIndex) {
              diagnostics.push({
                severity: 'error',
                message: `SP-04: Connection '${conn.id}' returns-to a moment that is not prior (source moment index ${sourceIndex}, target moment index ${targetIndex}).`,
                ruleId: 'SP-04',
              });
            }
          }
        }
      }
    }
  }
}
