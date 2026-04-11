/**
 * Generator Descriptor — the contract each generator package implements.
 *
 * Per ADR-032 R1 and ADR-034 G2: generators return in-memory content
 * (Map<string, string>) and the framework handles disk writes with
 * centralized path safety (the CLI's assertPathWithin helper).
 */

import type { IntermediateRepresentation, Diagnostic } from '../ir/index.js';

export type GeneratorScope = 'context' | 'flow' | 'project';

/**
 * Context provided to a generator's run() function. The framework
 * populates this based on the generator's declared scope and dependsOn.
 */
export interface GeneratorRunContext {
  /** The merged IR from all project files. */
  readonly ir: IntermediateRepresentation;
  /** The manifest directory (for resolving relative paths). */
  readonly manifestDir: string;
  /** The resolved output directory for this generator. */
  readonly outputDir: string;
  /** Generator-specific options from the manifest's generators[].options. */
  readonly options: Readonly<Record<string, unknown>>;
  /**
   * Results from upstream generators this one depends on (declared in
   * dependsOn). Keyed by format name. Only populated for formats listed
   * in the descriptor's dependsOn array.
   */
  readonly upstreamOutputs: ReadonlyMap<string, GeneratorRunResult>;
}

/**
 * Result returned by a generator's run() function. Files are in-memory
 * content keyed by relative path — the framework writes them to disk.
 */
export interface GeneratorRunResult {
  /** Map of relative file path → file content. */
  readonly files: ReadonlyMap<string, string>;
  /** Diagnostics emitted during generation (warnings, info). */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * A generator descriptor registered in the GeneratorRegistry. Each
 * generator package exports a registerGenerators() function that
 * creates and registers these descriptors.
 */
export interface GeneratorDescriptor {
  /** Unique format identifier (e.g., "typescript", "gherkin", "facet"). */
  readonly format: string;
  /** Whether this generator runs per-context, per-flow, or once per project. */
  readonly scope: GeneratorScope;
  /** Formats this generator depends on (must run before this one). */
  readonly dependsOn: readonly string[];
  /** Default output directory when not overridden in the manifest. */
  readonly defaultOutputDir: string;
  /** The generator's execution function. */
  readonly run: (ctx: GeneratorRunContext) => Promise<GeneratorRunResult>;
}
