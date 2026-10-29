import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { ProjectLoader } from '@mmmnt/core';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { renderContextMap } from '../renderers/context-map-renderer.js';

const PROJECT = resolve(import.meta.dirname, '../../../../fixtures/valid/model-completeness');
let ir: IntermediateRepresentation;

beforeAll(async () => {
  ir = (
    await new ProjectLoader().loadProject(
      ['contexts/memory.moment', 'contexts/retrieval.moment', 'flows/recall.moment'].map((f) =>
        resolve(PROJECT, f),
      ),
    )
  ).ir;
});

describe('context map with ADR-037 externals', () => {
  it('draws an external as an external node and keeps the relationship to it', () => {
    const map = renderContextMap(ir);

    expect(map.nodes.find((n) => n.contextId === 'ext-HostedService')).toMatchObject({
      contextName: 'HostedService',
      isExternal: true,
    });
    expect(
      map.edges.map((e) => [e.sourceContextId, e.targetContextId, e.relationshipType]),
    ).toContainEqual(['ext-HostedService', 'ctx-Retrieval', 'PublishedLanguage']);
  });
});
