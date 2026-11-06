import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runParse } from './parse.js';
import { runSimulate } from './simulate.js';

// ADR-041 pin: `parse` and `simulate` route through the shared helpers or read nothing, so a model that
// records several events is accepted and simulated, and its parse answer is the plain form's.

const MODEL = (emits: string, flow: string): string => `context "Inventory" [Core]
  aggregate "SeatHold"
    identity holdId: UUID
    state initial Active
    state Active -> Closed on Convert
    command Convert
      emits ${emits}
    event Converted
      holdId: UUID
    event Closed
      holdId: UUID
flow "Convert"
  lane inv "Inventory" [Core]
  moment "Hold converts"
${flow}
`;

const PLACED = '    inv: Convert\n    inv: Converted\n    inv: Closed';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'moment-adr041-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const write = (name: string, text: string): string => {
  const file = join(dir, name);
  writeFileSync(file, text);
  return file;
};

describe('ADR-041 CLI pin', () => {
  it('parses a multi-event model with the same answer as the plain form', async () => {
    const plain = await runParse([write('plain.moment', MODEL('Converted', PLACED))]);
    for (const emits of ['Converted, Closed', 'Converted | Closed']) {
      const multi = await runParse([write('multi.moment', MODEL(emits, PLACED))]);
      expect(multi.success).toBe(plain.success);
      expect(multi.message.split(dir).join('')).toBe(plain.message.split(dir).join(''));
    }
  });

  it('simulates a multi-event model: the command step, then the events the flow places', async () => {
    const result = await runSimulate([
      write('multi.moment', MODEL('Converted, Closed', PLACED)),
      '--json',
    ]);
    expect(result.success).toBe(true);
    expect(result.scenarios?.[0].events.map((e) => e.eventType)).toEqual([
      'SimProcess.Convert',
      'Converted',
      'Closed',
    ]);
  });
});
