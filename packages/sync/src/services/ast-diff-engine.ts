import type {
  DriftReport,
  DriftPoint,
  DriftDirection,
  ImplementationChangeProposal,
} from '../value-objects/index.js';
import { extractTypeSymbols, compareTypeSymbols } from './typescript-ast-utils.js';
import type { TypeDifference } from './typescript-ast-utils.js';
import { generateProposalsFromDifferences } from './proposal-generator.js';
import type { DeprecationMetadata } from './proposal-generator.js';

export interface GenerateProposalsInput {
  readonly expected: ReadonlyMap<string, string>;
  readonly actual: ReadonlyMap<string, string>;
  readonly deprecation?: DeprecationMetadata;
  readonly scope?: string;
}

export interface DetectDriftInput {
  /** Map of filePath to source text for expected (from TypeScriptEmitter) */
  readonly expected: ReadonlyMap<string, string>;
  /** Map of filePath to source text for actual (from disk) */
  readonly actual: ReadonlyMap<string, string>;
  /** Optional scope label for the report */
  readonly scope?: string;
}

function directionForDifferenceType(diff: TypeDifference): DriftDirection {
  switch (diff.differenceType) {
    case 'new-interface':
    case 'added-field':
      return 'implementation-added';
    case 'removed-interface':
    case 'removed-field':
      return 'implementation-removed';
    case 'changed-type':
    case 'renamed-interface':
    case 'unrecognized':
      return 'specification-added';
  }
}

function contextFromPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  // Try to extract a meaningful context name from the path
  for (const part of parts) {
    if (part !== 'src' && part !== 'dist' && part !== 'index.ts' && !part.endsWith('.ts')) {
      return part;
    }
  }
  return 'sync';
}

export class ASTDiffEngine {
  detectDrift(input: DetectDriftInput): DriftReport {
    const { expected, actual, scope = 'sync' } = input;
    const driftPoints: DriftPoint[] = [];
    const filesWithDrift = new Set<string>();
    const allFiles = new Set<string>([...expected.keys(), ...actual.keys()]);

    // Files in expected but not in actual
    for (const filePath of expected.keys()) {
      if (!actual.has(filePath)) {
        filesWithDrift.add(filePath);
        driftPoints.push({
          filePath,
          aggregateName: filePath,
          contextName: contextFromPath(filePath),
          driftDirection: 'specification-added',
          description: `File '${filePath}' exists in specification but not in implementation`,
        });
      }
    }

    // Files in actual but not in expected
    for (const filePath of actual.keys()) {
      if (!expected.has(filePath)) {
        filesWithDrift.add(filePath);
        driftPoints.push({
          filePath,
          aggregateName: filePath,
          contextName: contextFromPath(filePath),
          driftDirection: 'implementation-added',
          description: `File '${filePath}' exists in implementation but not in specification`,
        });
      }
    }

    // Files in both — compare type symbols
    for (const filePath of expected.keys()) {
      if (!actual.has(filePath)) continue;

      const expectedSource = expected.get(filePath)!;
      const actualSource = actual.get(filePath)!;

      const expectedSymbols = extractTypeSymbols(expectedSource, filePath);
      const actualSymbols = extractTypeSymbols(actualSource, filePath);

      const differences = compareTypeSymbols(expectedSymbols, actualSymbols);

      if (differences.length > 0) {
        filesWithDrift.add(filePath);
      }

      for (const diff of differences) {
        driftPoints.push({
          filePath,
          aggregateName: diff.symbolName,
          contextName: contextFromPath(filePath),
          driftDirection: directionForDifferenceType(diff),
          description: diff.description,
        });
      }
    }

    const totalDrifted = filesWithDrift.size;
    const totalAligned = allFiles.size - totalDrifted;

    return {
      scope,
      driftPoints,
      totalDrifted,
      totalAligned,
      timestamp: new Date().toISOString(),
    };
  }

  generateProposals(input: GenerateProposalsInput): ImplementationChangeProposal[] {
    const { expected, actual, deprecation } = input;
    const proposals: ImplementationChangeProposal[] = [];

    // Files in both — compare type symbols and generate proposals
    for (const filePath of expected.keys()) {
      if (!actual.has(filePath)) continue;

      const expectedSource = expected.get(filePath)!;
      const actualSource = actual.get(filePath)!;

      const expectedSymbols = extractTypeSymbols(expectedSource, filePath);
      const actualSymbols = extractTypeSymbols(actualSource, filePath);

      const differences = compareTypeSymbols(expectedSymbols, actualSymbols);
      proposals.push(...generateProposalsFromDifferences(filePath, differences, deprecation));
    }

    return proposals;
  }
}
