/**
 * ValidateOnSchemaEvolution Policy
 *
 * Trigger: File watcher detects change in `.domain/schema-registry.jsonl`
 * Action: Replays schema events, extracts evaluation inputs, delegates to
 *         CodexRuleEvaluator for compliance checking.
 * Independence: Does NOT chain from the parse→derive→generate pipeline.
 *
 * The file watcher trigger is an application layer (CLI) concern.
 * This policy is the domain logic that runs when triggered.
 */

import type { RuleEvaluationResult } from '../value-objects/rule-evaluation-result.js';
import type {
  SchemaRegistryEvent,
  EventSchemaRegistered,
} from '../events/schema-registry-events.js';
import type { SchemaEvaluationInput } from '../services/codex-rule-evaluator.js';
import { CodexRuleEvaluator } from '../services/codex-rule-evaluator.js';
import { SchemaRegistry } from '../aggregates/schema-registry.js';

export interface SchemaEvolutionDiagnostic {
  readonly eventType: string;
  readonly version: string;
  readonly evaluationResult: RuleEvaluationResult;
}

export interface SchemaEvolutionPolicyResult {
  readonly diagnostics: readonly SchemaEvolutionDiagnostic[];
  readonly totalViolations: number;
  readonly evaluatedEventTypes: number;
}

export async function validateOnSchemaEvolution(
  events: readonly SchemaRegistryEvent[],
  evaluator: CodexRuleEvaluator,
): Promise<SchemaEvolutionPolicyResult> {
  const registry = new SchemaRegistry();
  const evaluationInputs: SchemaEvaluationInput[] = [];

  for (const event of events) {
    registry.apply(event);

    if (event.type === 'EventSchemaRegistered') {
      evaluationInputs.push(extractEvaluationInput(event));
    }
  }

  const diagnostics: SchemaEvolutionDiagnostic[] = [];
  let totalViolations = 0;

  for (const input of evaluationInputs) {
    const result = await evaluator.evaluate(input);
    diagnostics.push({
      eventType: input.eventType,
      version: input.version,
      evaluationResult: result,
    });
    totalViolations += result.violations.length;
  }

  return {
    diagnostics,
    totalViolations,
    evaluatedEventTypes: evaluationInputs.length,
  };
}

function extractEvaluationInput(event: EventSchemaRegistered): SchemaEvaluationInput {
  return {
    eventType: event.eventType,
    version: event.version,
    fieldNames: event.fieldDefinitions.map((fd) => fd.fieldName),
  };
}
