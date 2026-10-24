import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { runDerive } from './derive.js';
import { runViz } from './viz.js';
import { runCucumberJson } from './cucumber-json.js';

const PROJECT = resolve(import.meta.dirname, '../../../../fixtures/valid/model-completeness');

describe('project mode for commands that only read the parsed model (ADR-037 §8)', () => {
  it.each([
    ['derive', runDerive],
    ['viz', runViz],
    ['cucumber-json', runCucumberJson],
  ])('moment %s accepts a directory as one project', async (_name, run) => {
    const result = await run([PROJECT]);

    expect(result.success).toBe(true);
  });
});
