import { describe, it, expect, beforeAll } from 'vitest';
import {
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
} from 'langium';
import { parseHelper } from 'langium/test';
import { MomentGeneratedModule, MomentGeneratedSharedModule } from '../../src/generated/module.js';
import type { MomentFile } from '../../src/generated/ast.js';
import { astToIr } from '../../src/parser/ast-to-ir.js';
import type { LangiumDocument } from 'langium';

let parse: (input: string) => Promise<LangiumDocument<MomentFile>>;

beforeAll(() => {
  const shared = inject(
    createDefaultSharedCoreModule(EmptyFileSystem),
    MomentGeneratedSharedModule,
  );
  const services = inject(createDefaultCoreModule({ shared }), MomentGeneratedModule);
  shared.ServiceRegistry.register(services);
  parse = parseHelper<MomentFile>(services);
});

async function toIr(input: string) {
  const doc = await parse(input);
  expect(doc.parseResult.lexerErrors).toHaveLength(0);
  expect(doc.parseResult.parserErrors).toHaveLength(0);
  return astToIr(doc.parseResult.value);
}

describe('ADR-037 projections', () => {
  it('transforms a projection with its sources, description and fields', async () => {
    const ir = await toIr(`
      context "Memory" [Core]
        aggregate "Workspace"
          identity workspaceId: UUID
          command RecordDecision
            emits DecisionMade
          event DecisionMade
            entryId: UUID
        projection StreamView
          sources DecisionMade
          description "Every entry of a stream"
          field entryId: UUID
    `);

    expect(ir.contexts[0].projections).toEqual([
      {
        id: 'proj-StreamView',
        name: 'StreamView',
        sources: ['DecisionMade'],
        description: 'Every entry of a stream',
        fields: [{ name: 'entryId', type: 'UUID', isArray: false, required: true }],
      },
    ]);
  });
});

describe('ADR-037 queries', () => {
  it('transforms a query with what it reads, its inputs and description, even when an input is named like a keyword', async () => {
    const ir = await toIr(`
      context "Retrieval" [Core]
        projection TrajectoryResult
          sources DecisionMade
        query QueryContext
          reads TrajectoryResult
          input query: string, tokenBudget: number
          description "Orient, traverse, rank, fit"
    `);

    expect(ir.contexts[0].queries).toEqual([
      {
        id: 'query-QueryContext',
        name: 'QueryContext',
        reads: ['TrajectoryResult'],
        inputs: [
          { name: 'query', type: 'string', isArray: false, required: true },
          { name: 'tokenBudget', type: 'number', isArray: false, required: true },
        ],
        description: 'Orient, traverse, rank, fit',
      },
    ]);
  });
});
