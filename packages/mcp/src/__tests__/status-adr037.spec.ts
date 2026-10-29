import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../server.js';

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

describe('moment_status counts deprecated fields of ADR-037 constructs', () => {
  it('counts a deprecated field on a context-level value object and on a projection', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'mcp-adr037-')), 'retrieval.moment');
    writeFileSync(
      file,
      `context "Retrieval" [Core]
  aggregate "Workspace"
    identity workspaceId: UUID
    command RecordDecision
      emits DecisionMade
    event DecisionMade
      entryId: UUID
  value-object TokenBudget
    tokens: number
    size: number [deprecated "renamed" -> "tokens"]
  projection TrajectoryResult
    sources DecisionMade
    field entryId: UUID
    field id: UUID [deprecated "renamed" -> "entryId"]
`,
    );

    const result = await client.callTool({ name: 'moment_status', arguments: { filePath: file } });
    const sections = JSON.parse((result.content as Array<{ text: string }>)[0].text)
      .sections as Array<{
      label: string;
      summary: string;
    }>;

    expect(sections.find((s) => s.label === 'Schema Lifecycle')?.summary).toBe(
      '2 deprecated field(s)',
    );
  });
});
