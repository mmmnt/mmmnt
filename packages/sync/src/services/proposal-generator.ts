import type {
  ImplementationChangeProposal,
  FeedbackEventType,
  DifferenceType,
  ASTDifference,
} from '../value-objects/index.js';
import type { TypeDifference } from './typescript-ast-utils.js';
import { deriveProposalId } from './proposal-id.js';

export interface DeprecationMetadata {
  readonly deprecatedFields: ReadonlyMap<string, string>; // oldFieldName → replacementFieldName
}

export interface ProposalGeneratorOptions {
  readonly idFactory?: (difference: ASTDifference) => string;
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

/** A field signature as extracted (`readonly ?string`) split into its type and optionality. */
function parseSignature(signature: string): { type: string; optional: boolean } {
  const bare = signature.replace(/^readonly /, '');
  return bare.startsWith('?')
    ? { type: bare.slice(1), optional: true }
    : { type: bare, optional: false };
}

function fieldPayload(field: NonNullable<TypeDifference['field']>): Record<string, unknown> {
  const { type, optional } = parseSignature(field.signature);
  return {
    fieldName: field.name,
    fieldType: type,
    ...(optional ? { optional } : {}),
    ...(field.previousSignature === undefined
      ? {}
      : { previousFieldType: parseSignature(field.previousSignature).type }),
  };
}

function buildPayload(diff: TypeDifference): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    symbolName: diff.symbolName,
    description: diff.description,
    differenceType: diff.differenceType,
    ...(diff.field ? fieldPayload(diff.field) : {}),
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
  const generateId = options?.idFactory ?? deriveProposalId;

  for (const diff of differences) {
    const dual = checkDualPopulation(diff, deprecation);
    const sourceDifference: ASTDifference = {
      filePath,
      differenceType: diff.differenceType,
      expectedNode: diff.expectedNode,
      actualNode: diff.actualNode,
    };

    proposals.push({
      proposalId: generateId(sourceDifference),
      proposedEventType: DIFFERENCE_TO_EVENT[diff.differenceType],
      proposedPayload: buildPayload(diff),
      sourceFile: filePath,
      sourceDifference,
      dualPopulationApplied: dual.applies,
    });

    if (dual.applies) {
      const replacement = deprecation!.deprecatedFields.get(dual.fieldName!)!;
      const replacementDifference: ASTDifference = {
        filePath,
        differenceType: 'added-field',
        expectedNode: '',
        actualNode: `${diff.symbolName}.${replacement} (replaces deprecated ${dual.fieldName})`,
      };
      proposals.push({
        proposalId: generateId(replacementDifference),
        proposedEventType: 'ValueObjectFieldAdded',
        proposedPayload: {
          symbolName: diff.symbolName,
          description: `Replacement field '${replacement}' for deprecated field '${dual.fieldName}'`,
          differenceType: 'added-field' as DifferenceType,
        },
        sourceFile: filePath,
        sourceDifference: replacementDifference,
        dualPopulationApplied: true,
      });
    }
  }

  return proposals;
}
