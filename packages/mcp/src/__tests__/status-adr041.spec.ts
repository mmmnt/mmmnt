import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../server.js';

// ADR-041 pin: no MCP tool reads `emits`, so a model that records several events answers the way the
// equivalent plain-form model does, and the answer carries no trace of the new forms.

let client: Client;
let transports: InMemoryTransport[];

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  transports = [clientTransport, serverTransport];
  await createMcpServer().connect(serverTransport);
  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  for (const t of transports) await t.close();
});

const MODEL = (emits: string, placed: string[]): string => `context "Inventory" [Core]
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
    inv: Convert
${placed.map((e) => `    inv: ${e}`).join('\n')}
`;

async function answer(tool: string, emits: string, placed = ['Converted']): Promise<unknown> {
  const file = join(mkdtempSync(join(tmpdir(), 'mcp-adr041-')), 'inventory.moment');
  writeFileSync(file, MODEL(emits, placed));
  const result = await client.callTool({ name: tool, arguments: { filePath: file } });
  const text = (result.content as Array<{ text: string }>)[0].text;
  return JSON.parse(text.split(file).join('<file>'));
}

describe('ADR-041 MCP pin', () => {
  it.each(['moment_status', 'moment_validate'])(
    '%s answers a multi-event model as it answers the plain form',
    async (tool) => {
      const plain = await answer(tool, 'Converted');
      expect(await answer(tool, 'Converted, Closed', ['Converted', 'Closed'])).toEqual(plain);
      expect(await answer(tool, 'Converted when Active | Closed when Closed')).toEqual(plain);
    },
  );

  it('moment_validate adds only the advisory about an unguarded choice between alternatives', async () => {
    const plain = (await answer('moment_validate', 'Converted')) as { diagnostics: unknown[] };
    const unguarded = (await answer('moment_validate', 'Converted | Closed')) as {
      success: boolean;
      diagnostics: { ruleId?: string; severity: string }[];
    };
    expect(unguarded.success).toBe(true);
    expect(plain.diagnostics).toEqual([]);
    expect(unguarded.diagnostics.map((d) => [d.severity, d.ruleId])).toEqual([['warning', 'V46']]);
  });
});
