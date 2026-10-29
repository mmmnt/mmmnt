import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { ProjectLoader } from '@mmmnt/core';
import { SpecificationDocumentGenerator } from '../../services/specification-document-generator.js';

const PROJECT = resolve(import.meta.dirname, '../../../../../fixtures/valid/model-completeness');
let document: string;

beforeAll(async () => {
  const { ir } = await new ProjectLoader().loadProject(
    ['contexts/memory.moment', 'contexts/retrieval.moment', 'flows/recall.moment'].map((f) =>
      resolve(PROJECT, f),
    ),
  );
  document = new SpecificationDocumentGenerator()
    .generate(ir)
    .map((d) => d.content)
    .join('\n');
});

describe('specification document with ADR-037 constructs', () => {
  it('renders each context’s projections, queries, rules and terms', () => {
    expect(document).toContain(
      "- **TrajectoryResult** ← DecisionMade: The shape of a retrieval's result",
    );
    expect(document).toContain(
      '- **QueryContext** reads TrajectoryResult: Orient, traverse, rank, fit',
    );
    expect(document).toContain(
      '- **EmbeddingOrderIsRanking**: Results are returned in embedding-similarity order (enforced by QueryContext)',
    );
    expect(document).toContain(
      '- **ModelRunsInProcess**: The embedding model runs inside the engine (enforced by the process that runs the system)',
    );
    expect(document).toContain("- **Revision**: a stream's position after an append");
  });

  it('lists the external systems', () => {
    expect(document).toContain(
      '- **HostedService**: An upstream system publishing the shared envelope schema',
    );
  });
});
