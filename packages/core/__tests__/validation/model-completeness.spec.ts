import { describe, it, expect, beforeAll } from 'vitest';
import { MomentParser } from '../../src/parser/moment-parser.js';

let parser: MomentParser;

beforeAll(() => {
  parser = new MomentParser();
});

const messages = (diagnostics: readonly { message: string }[]): string[] =>
  diagnostics.map((d) => d.message);

describe('ADR-037 V1 with the new building blocks', () => {
  it('accepts flow nodes that name a projection, a query and a context-level value object', async () => {
    const result = await parser.parseContent(`
      context "Retrieval" [Core]
        aggregate "Workspace"
          identity workspaceId: UUID
          command RecordDecision
            emits DecisionMade
          event DecisionMade
            entryId: UUID
        projection TrajectoryResult
          sources DecisionMade
        query QueryContext
          reads TrajectoryResult
        value-object TokenBudget
          tokens: number
      flow "recall"
        lane retrieval "Retrieval" [Core]
        moment "The agent asks"
          retrieval: QueryContext
          retrieval: TrajectoryResult
          retrieval: TokenBudget
    `);

    expect(messages(result.diagnostics).filter((m) => m.startsWith('V1:'))).toEqual([]);
  });
});

import { validateModelCompleteness } from '../../src/validation/model-completeness.js';
import type { IntermediateRepresentation } from '../../src/ir/index.js';

async function irOf(source: string): Promise<IntermediateRepresentation> {
  const result = await parser.parseContent(source);
  expect(result.success).toBe(true);
  return result.ir as IntermediateRepresentation;
}

const BASE = `
  context "Memory" [Core]
    aggregate "Workspace"
      identity workspaceId: UUID
      command RecordDecision
        emits DecisionMade
      event DecisionMade
        entryId: UUID
      value-object Actor
        sub: string
`;

const findings = async (source: string) =>
  validateModelCompleteness(await irOf(source)).map((d) => `${d.ruleId}: ${d.message}`);

describe('ADR-037 V22–V28 (model completeness)', () => {
  it('passes a model whose every new reference resolves', async () => {
    expect(
      await findings(`${BASE}
    projection StreamView
      sources DecisionMade
    query Peek
      reads StreamView
    rule ReadsAreOrdered "Entries come back in stream order"
      enforced-by Peek
    service ResolveConnection
      consumes DecisionMade
      produces Actor
      description "resolve"
    term "Revision" "a stream's position"
`),
    ).toEqual([]);
  });

  it('V22: a projection source that names no event', async () => {
    expect(
      await findings(`${BASE}
    projection StreamView
      sources NothingHappened
`),
    ).toEqual([
      "V22: Projection 'StreamView' reads 'NothingHappened', which is no declared event.",
    ]);
  });

  it('V23: a query that reads neither a projection nor a value object', async () => {
    expect(
      await findings(`${BASE}
    query Peek
      reads Nowhere
`),
    ).toEqual([
      "V23: Query 'Peek' reads 'Nowhere', which is no declared projection or value object.",
    ]);
  });

  it('V24: a rule enforced by something its context does not declare as a service or query', async () => {
    expect(
      await findings(`${BASE}
    rule ReadsAreOrdered "Entries come back in stream order"
      enforced-by Nobody
`),
    ).toEqual([
      "V24: Rule 'ReadsAreOrdered' is enforced by 'Nobody', which is no service or query of context 'Memory'.",
    ]);
  });

  it('V25: one value-object name declared twice in a context', async () => {
    expect(
      await findings(`${BASE}
    value-object Actor
      sub: string
`),
    ).toEqual(["V25: Value object 'Actor' is declared more than once in context 'Memory'."]);
  });

  it('V26: one term defined twice in a context', async () => {
    expect(
      await findings(`${BASE}
    term "Revision" "a stream's position"
    term "Revision" "something else"
`),
    ).toEqual(["V26: Term 'Revision' is defined more than once in context 'Memory'."]);
  });

  it('V27: a relationship end that is neither a context nor an external, and an External lane with no external', async () => {
    expect(
      await findings(`${BASE}
    relationship Elsewhere -> Memory
      type PublishedLanguage
      contract "c"
  flow "f"
    lane memory "Memory" [Core]
    lane hosted "HostedService" [External]
    moment "m"
      memory: RecordDecision
`),
    ).toEqual([
      "V27: Relationship end 'Elsewhere' is no declared context or external.",
      "V27: Lane 'hosted' is classified External but 'HostedService' is no declared external.",
    ]);
  });

  it('V28: a service input or output that is neither an event nor a value object', async () => {
    expect(
      await findings(`${BASE}
    service ResolveConnection
      consumes Request
      produces Actor
      description "resolve"
`),
    ).toEqual([
      "V28: Service 'ResolveConnection' consumes 'Request', which is no declared event or value object.",
    ]);
  });
});
