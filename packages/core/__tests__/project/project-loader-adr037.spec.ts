import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { ProjectLoader } from '../../src/project/index.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID = resolve(FIXTURES, 'valid/model-completeness');
const INVALID = resolve(FIXTURES, 'invalid/model-completeness-unresolved');

const project = [
  resolve(VALID, 'contexts/memory.moment'),
  resolve(VALID, 'contexts/retrieval.moment'),
  resolve(VALID, 'flows/recall.moment'),
];

describe('ProjectLoader with ADR-037 constructs', () => {
  it('loads a project whose new references resolve only across files, with no V22–V28 finding', async () => {
    const result = await new ProjectLoader().loadProject(project);

    expect(result.diagnostics.filter((d) => /^V2[2-8]$/.test(d.ruleId ?? ''))).toEqual([]);
    expect(result.success).toBe(true);
  });
});

describe('ProjectLoader resolves names across files after the merge', () => {
  it('gives flow nodes declared in another file their real kinds', async () => {
    const result = await new ProjectLoader().loadProject(project);
    const kinds = result.ir.flows[0].moments.flatMap((m) =>
      m.contextEntries.map((e) => [e.nodeName, e.nodeKind]),
    );

    expect(kinds).toEqual([
      ['RecordDecision', 'command'],
      ['DecisionMade', 'event'],
      ['QueryContext', 'query'],
      ['TrajectoryResult', 'projection'],
    ]);
  });

  it('keeps the externals and joins a relationship to an external declared in another file', async () => {
    const result = await new ProjectLoader().loadProject([
      ...project,
      resolve(FIXTURES, 'valid/model-completeness-split/transfer.moment'),
    ]);

    expect(result.ir.externals?.map((e) => e.name)).toEqual(['HostedService']);
    expect(result.ir.relationships.map((r) => r.sourceContextId)).toEqual([
      'ext-HostedService',
      'ext-HostedService',
    ]);
    expect(result.success).toBe(true);
  });
});

describe('ProjectLoader reports V22–V28 over the merged project', () => {
  it('fails a project with an unresolvable projection source, once, as an error', async () => {
    const result = await new ProjectLoader().loadProject([resolve(INVALID, 'retrieval.moment')]);
    const completeness = result.diagnostics.filter((d) => /^V2[2-8]$/.test(d.ruleId ?? ''));

    expect(completeness.map((d) => [d.severity, d.ruleId])).toEqual([['error', 'V22']]);
    expect(result.success).toBe(false);
  });
});

import { MomentParser } from '../../src/parser/moment-parser.js';
import { readFileSync } from 'node:fs';

describe('MomentParser reports V22–V28 for a single file as advisories', () => {
  it('warns, without failing the parse, about a source the file does not declare', async () => {
    const result = await new MomentParser().parseContent(
      readFileSync(resolve(INVALID, 'retrieval.moment'), 'utf-8'),
    );

    expect(result.success).toBe(true);
    expect(result.diagnostics.filter((d) => d.ruleId === 'V22').map((d) => d.severity)).toEqual([
      'warning',
    ]);
  });
});
