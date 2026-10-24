import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runDerive } from './derive.js';
import { runViz } from './viz.js';
import { runCucumberJson } from './cucumber-json.js';
import { runGenerate } from './generate.js';
import { runEmitTs } from './emit-ts.js';
import { runSimulate } from './simulate.js';
import { runLint } from './lint.js';
import { runStatus } from './status.js';
import { runSchemaStatus } from './schema-status.js';
import { runTest } from './test.js';
import { runSyncStatus } from './sync-status.js';
import { runSyncPropose } from './sync-propose.js';

const PROJECT = resolve(import.meta.dirname, '../../../../fixtures/valid/model-completeness');

describe('project mode for commands that only read the parsed model (ADR-037 §8)', () => {
  it.each([
    ['derive', runDerive],
    ['viz', runViz],
    ['cucumber-json', runCucumberJson],
    ['simulate', runSimulate],
    ['lint', runLint],
    ['schema status', runSchemaStatus],
    ['test', runTest],
  ])('moment %s accepts a directory as one project', async (_name, run) => {
    const result = await run([PROJECT]);

    expect(result.success).toBe(true);
  });
});

describe('project mode for commands that write output or compare it', () => {
  it.each([
    ['generate', runGenerate],
    ['emit-ts', runEmitTs],
    ['status', runStatus],
    ['sync status', runSyncStatus],
    ['sync propose', runSyncPropose],
  ])('moment %s parses a directory as one project before its own work', async (_name, run) => {
    const out = mkdtempSync(join(tmpdir(), 'moment-project-mode-'));
    const result = await run([PROJECT, '--dry-run', '--out', out]);

    expect(JSON.stringify(result)).not.toMatch(/EISDIR|Failed to read|Parse failed/);
  });
});
