import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { ProjectLoader } from '@mmmnt/core';
import { SpecificationDocumentGenerator } from '../../services/specification-document-generator.js';
import { renderFeatureFromIr } from '../../gherkin/feature-renderer.js';
import type { IntermediateRepresentation } from '@mmmnt/core';

const PROJECT = resolve(import.meta.dirname, '../../../../../fixtures/valid/model-completeness');
let document: string;
let feature: string;

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
  const model = ir as IntermediateRepresentation;
  feature = renderFeatureFromIr(model.flows[0], model);
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

// ADR-037: reads are not domain events. A query or projection step must not read as an emission.
describe('read steps in the recall flow', () => {
  it('the narrative says a query is answered and a projection served, and keeps events emitted', () => {
    expect(document).toContain('- Retrieval answers query **QueryContext**');
    expect(document).toContain('- Retrieval serves projection **TrajectoryResult**');
    expect(document).toContain('- Memory emits **DecisionMade**');
    expect(document).not.toMatch(/emits \*\*(QueryContext|TrajectoryResult)\*\*/);
  });

  it('the Gherkin steps use the same verbs', () => {
    expect(feature).toContain('Then Retrieval answers query QueryContext');
    expect(feature).toContain('Then Retrieval serves projection TrajectoryResult');
    expect(feature).toContain('Then Memory emits DecisionMade');
    expect(feature).not.toMatch(/emits (QueryContext|TrajectoryResult)/);
  });
});
