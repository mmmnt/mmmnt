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

const DIFFERENCE_TO_EVENT: Record<DifferenceType, FeedbackEventType> = {
  'renamed-interface': 'ValueObjectRenamed',
  'added-field': 'ValueObjectFieldAdded',
  'removed-field': 'ValueObjectFieldRemoved',
  'changed-type': 'ValueObjectFieldRevised',
  'new-interface': 'ValueObjectDefined',
  'removed-interface': 'ValueObjectRemoved',
  unrecognized: 'ValueObjectFieldRevised',
};

export function generateProposalsFromDifferences(
  filePath: string,
  differences: readonly TypeDifference[],
  deprecation?: DeprecationMetadata,
): ImplementationChangeProposal[] {
  const proposals: ImplementationChangeProposal[] = [];

  for (const diff of differences) {
    const eventType = DIFFERENCE_TO_EVENT[diff.differenceType];

    // Extract field name from description for deprecation lookup
    const fieldNameMatch = diff.description.match(/'([^']+)'/);
    const fieldName = fieldNameMatch ? fieldNameMatch[1] : undefined;

    const hasDualPopulation =
      deprecation !== undefined &&
      fieldName !== undefined &&
      deprecation.deprecatedFields.has(fieldName);

    const payload: Record<string, unknown> = {
      symbolName: diff.symbolName,
      description: diff.description,
      differenceType: diff.differenceType,
    };

    if (diff.differenceType === 'unrecognized') {
      payload.requiresManualReview = true;
    }

    proposals.push({
      proposalId: randomUUID(),
      proposedEventType: eventType,
      proposedPayload: payload,
      sourceFile: filePath,
      sourceDifference: {
        filePath,
        differenceType: diff.differenceType,
        expectedNode: '',
        actualNode: '',
      },
      dualPopulationApplied: hasDualPopulation,
    });

    // For dual-population: generate a second proposal for the replacement field
    if (hasDualPopulation && diff.differenceType === 'removed-field') {
      const replacementField = deprecation!.deprecatedFields.get(fieldName!)!;
      proposals.push({
        proposalId: randomUUID(),
        proposedEventType: 'ValueObjectFieldAdded',
        proposedPayload: {
          symbolName: diff.symbolName,
          description: `Replacement field '${replacementField}' for deprecated field '${fieldName}'`,
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
