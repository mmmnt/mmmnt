/**
 * ProjectLoader — loads multiple .moment files and produces a single
 * merged IntermediateRepresentation with cross-file validation.
 *
 * This is the entry point for project-mode execution (ADR-032 R2,
 * ADR-034 G1). It replaces the single-file `MomentParser.parseContent()`
 * path with a multi-file pipeline:
 *
 *   1. Sort file paths lexicographically (deterministic merge order)
 *   2. Read and parse each file independently via MomentParser
 *   3. Merge all successful IRs via irMerger (concatenate arrays)
 *   4. Run CrossFileValidator on the merged IR
 *   5. Return the merged IR + aggregated diagnostics
 *
 * Files with parse errors are included in the diagnostics but do NOT
 * block the merge of other files (fail-open per-file, fail-closed for
 * the aggregate if any file has errors).
 */

import { readFileSync } from 'node:fs';
import { MomentParser } from '../parser/index.js';
import type { IntermediateRepresentation, Diagnostic, SpecificationMetadata } from '../ir/index.js';
import { mergeIrs } from './ir-merger.js';
import { validateCrossFileReferences } from './cross-file-validator.js';

export interface ProjectLoadResult {
  /** True if all files parsed successfully and cross-file validation passed. */
  readonly success: boolean;
  /** The merged IR from all successfully-parsed files. */
  readonly ir: IntermediateRepresentation;
  /** Aggregated diagnostics from all files + merge + cross-file validation. */
  readonly diagnostics: readonly Diagnostic[];
  /** Number of files that parsed successfully. */
  readonly filesParsed: number;
  /** Number of files that had parse errors. */
  readonly filesErrored: number;
}

export class ProjectLoader {
  private readonly parser: MomentParser;

  constructor(parser?: MomentParser) {
    this.parser = parser ?? new MomentParser();
  }

  /**
   * Load and merge multiple .moment files into a single IR.
   *
   * @param filePaths Absolute or relative paths to .moment files.
   *   Order doesn't matter — paths are sorted lexicographically internally
   *   for deterministic merge order.
   * @param metadataOverride Optional metadata to use instead of deriving
   *   from the first successfully parsed file (useful when the manifest
   *   provides name/version).
   */
  async loadProject(
    filePaths: readonly string[],
    metadataOverride?: Partial<SpecificationMetadata>,
  ): Promise<ProjectLoadResult> {
    const sortedPaths = [...filePaths].sort();
    const allDiagnostics: Diagnostic[] = [];
    const successfulIrs: IntermediateRepresentation[] = [];
    let filesErrored = 0;

    // Phase 1: Parse each file independently.
    for (const filePath of sortedPaths) {
      const parseResult = await this.parseFile(filePath);
      allDiagnostics.push(...parseResult.diagnostics);

      if (parseResult.success && parseResult.ir) {
        successfulIrs.push(parseResult.ir);
      } else {
        filesErrored++;
      }
    }

    // Phase 2: Merge all successful IRs.
    const mergeResult = mergeIrs(successfulIrs, metadataOverride);
    allDiagnostics.push(...mergeResult.diagnostics);

    // Phase 3: Cross-file validation on the merged IR.
    const validationResult = validateCrossFileReferences(mergeResult.ir);
    allDiagnostics.push(...validationResult.diagnostics);

    const hasErrors = allDiagnostics.some((d) => d.severity === 'error');

    return {
      success: !hasErrors,
      ir: mergeResult.ir,
      diagnostics: allDiagnostics,
      filesParsed: successfulIrs.length,
      filesErrored,
    };
  }

  /**
   * Parse a single file, attaching the file path to any diagnostics
   * so multi-file error messages are traceable.
   */
  private async parseFile(
    filePath: string,
  ): Promise<{ success: boolean; ir?: IntermediateRepresentation; diagnostics: Diagnostic[] }> {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        diagnostics: [
          {
            severity: 'error',
            message: `Failed to read file: ${msg}`,
            source: { file: filePath, line: 0, column: 0 },
            ruleId: 'PM-00',
          },
        ],
      };
    }

    const result = await this.parser.parseContent(content);

    // Attach the file path to any diagnostics that don't already have one.
    const diagnostics: Diagnostic[] = result.diagnostics.map((d) => ({
      ...d,
      source: d.source
        ? { ...d.source, file: d.source.file || filePath }
        : { file: filePath, line: 0, column: 0 },
    }));

    return {
      success: result.success,
      ir: result.ir,
      diagnostics,
    };
  }
}
