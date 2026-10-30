import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { ProjectLoader } from '@mmmnt/core';
import { TypeScriptEmitter } from '../../services/typescript-emitter.js';

const PROJECT = resolve(import.meta.dirname, '../../../../../fixtures/valid/model-completeness');
let files: Map<string, string>;

beforeAll(async () => {
  const { ir } = await new ProjectLoader().loadProject(
    ['contexts/memory.moment', 'contexts/retrieval.moment', 'flows/recall.moment'].map((f) =>
      resolve(PROJECT, f),
    ),
  );
  files = new TypeScriptEmitter().emit(ir, { scope: { level: 'system' } }).files;
});

describe('TypeScript emission with ADR-037 constructs', () => {
  it('emits a read-model types file with context value objects, projections and queries', () => {
    const readModel = files.get('src/retrieval/read-model.types.ts') ?? '';

    expect(readModel).toContain('export interface TokenBudget {');
    expect(readModel).toContain('export interface TrajectoryResult {');
    expect(readModel).toContain('  readonly entryId: string;');
    expect(readModel).toContain('export interface QueryContextQuery {');
    expect(readModel).toContain('  readonly budget: TokenBudget;');
    expect(readModel).toContain('export type QueryContextResult = TrajectoryResult;');
  });

  it('exports a context that has a read side but no aggregate', () => {
    expect(files.get('src/retrieval/index.ts')).toContain(
      "export type * from './read-model.types.js';",
    );
    expect(files.get('src/index.ts')).toContain("export * from './retrieval/index.js';");
  });
});
