import { randomUUID } from 'crypto';
import type {
  ImplementationChangeProposal,
  FeedbackEventType,
  DifferenceType,
} from '../value-objects/index.js';
import type { TypeDifference } from './typescript-ast-utils.js';

export interface DeprecationMetadata {
  readonly deprecatedFields: ReadonlyMap<string, string>; // oldFieldName → replacementFieldName
}

export interface ProposalGeneratorOptions {
  readonly idFactory?: () => string;
}

const DIFFERENCE_TO_EVENT: Record<DifferenceType, FeedbackEventType> = {
  'renamed-interface': 'ValueObjectRenamed',
  'added-field': 'ValueObjectFieldAdded',
  'removed-field': 'ValueObjectFieldRemoved',
  'changed-type': 'ValueObjectFieldRevised',
  'new-interface': 'ValueObjectDefined',
  'removed-interface': 'ValueObjectRemoved',
  unrecognized: 'ValueObjectFieldRevised',
};

function checkDualPopulation(
  diff: TypeDifference,
  deprecation?: DeprecationMetadata,
): { applies: boolean; fieldName?: string } {
  if (diff.differenceType !== 'removed-field' || !deprecation) {
    return { applies: false };
  }
  const match = diff.description.match(/'([^']+)'/);
  const fieldName = match ? match[1] : undefined;
  if (!fieldName || !deprecation.deprecatedFields.has(fieldName)) {
    return { applies: false };
  }
  return { applies: true, fieldName };
}

function buildPayload(diff: TypeDifference): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    symbolName: diff.symbolName,
    description: diff.description,
    differenceType: diff.differenceType,
  };
  if (diff.differenceType === 'unrecognized') {
    payload.requiresManualReview = true;
  }
  return payload;
}

export function generateProposalsFromDifferences(
  filePath: string,
  differences: readonly TypeDifference[],
  deprecation?: DeprecationMetadata,
  options?: ProposalGeneratorOptions,
): ImplementationChangeProposal[] {
  const proposals: ImplementationChangeProposal[] = [];
  const generateId = options?.idFactory ?? randomUUID;

  for (const diff of differences) {
    const dual = checkDualPopulation(diff, deprecation);

    proposals.push({
      proposalId: generateId(),
      proposedEventType: DIFFERENCE_TO_EVENT[diff.differenceType],
      proposedPayload: buildPayload(diff),
      sourceFile: filePath,
      sourceDifference: {
        filePath,
        differenceType: diff.differenceType,
        expectedNode: '',
        actualNode: '',
      },
      dualPopulationApplied: dual.applies,
    });

    if (dual.applies) {
      const replacement = deprecation!.deprecatedFields.get(dual.fieldName!)!;
      proposals.push({
        proposalId: generateId(),
        proposedEventType: 'ValueObjectFieldAdded',
        proposedPayload: {
          symbolName: diff.symbolName,
          description: `Replacement field '${replacement}' for deprecated field '${dual.fieldName}'`,
          differenceType: 'added-field' as DifferenceType,
        },
        sourceFile: filePath,
        sourceDifference: {
          filePath,
          differenceType: 'added-field',
          expectedNode: '',
          actualNode: '',
        },
        dualPopulationApplied: true,
      });
    }
  }

  return proposals;
}
