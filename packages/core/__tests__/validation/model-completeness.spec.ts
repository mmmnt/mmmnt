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
