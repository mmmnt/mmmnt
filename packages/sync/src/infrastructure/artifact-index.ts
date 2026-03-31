/**
 * MomentArtifactIndex — Semantic index for selective artifact retrieval (ADR-024)
 *
 * Stored at .moment/index.json in each project repository.
 * Small enough to always fit in AI context; enables index-first retrieval.
 */

export interface MomentArtifactIndex {
  readonly version: 1;
  readonly generatedAt: string;
  readonly specHash: string;

  readonly contexts: readonly ContextIndexEntry[];
  readonly flows: readonly FlowIndexEntry[];
  readonly artifacts: readonly ArtifactIndexEntry[];
  readonly decisions: readonly DecisionIndexEntry[];
}

export interface ContextIndexEntry {
  readonly name: string;
  readonly specPath: string;
  readonly generatedPaths: readonly string[];
  readonly keywords: readonly string[];
}

export interface FlowIndexEntry {
  readonly name: string;
  readonly contextName: string;
  readonly specPath: string;
  readonly steps: number;
}

export type ArtifactType = 'spec' | 'typescript' | 'gherkin' | 'topology' | 'journal';

export interface ArtifactIndexEntry {
  readonly path: string;
  readonly type: ArtifactType;
  readonly contextName?: string;
  readonly generatedFrom?: string;
  readonly blobSha?: string;
}

export interface DecisionIndexEntry {
  readonly code: string;
  readonly summary: string;
  readonly sourcePath: string;
  readonly lineNumber?: number;
}
