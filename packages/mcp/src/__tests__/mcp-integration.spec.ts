/**
 * MMNT-264 — MCP Integration Test
 *
 * Tests the MCP server end-to-end using InMemoryTransport.
 * Verifies tools/list returns all 7 tools and tools/call produces correct results.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../server.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/unified/vet-clinic.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

let client: Client;
let clientTransport: InMemoryTransport;
let serverTransport: InMemoryTransport;

beforeAll(async () => {
  const server = createMcpServer();
  [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await clientTransport.close();
  await serverTransport.close();
});

describe('MCP Integration — tools/list', () => {
  it('returns all 7 registered tools (EXIT-B1)', async () => {
    const result = await client.listTools();

    expect(result.tools.length).toBe(7);
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'moment_emit_ts',
      'moment_get_events',
      'moment_import',
      'moment_reconcile',
      'moment_status',
      'moment_validate',
      'moment_viz',
    ]);
  });

  it('each tool has a description', async () => {
    const result = await client.listTools();

    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description!.length).toBeGreaterThan(20);
    }
  });

  it('each tool has an input schema', async () => {
    const result = await client.listTools();

    for (const tool of result.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

describe('MCP Integration — tools/call', () => {
  it('moment_validate with valid fixture returns success (EXIT-B2)', async () => {
    const result = await client.callTool({
      name: 'moment_validate',
      arguments: { filePath: VALID_FIXTURE },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.contextCount).toBe(4);
    expect(parsed.flowCount).toBe(1);
  });

  it('moment_validate with invalid fixture returns diagnostics', async () => {
    const result = await client.callTool({
      name: 'moment_validate',
      arguments: { filePath: INVALID_FIXTURE },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
  });

  it('moment_validate with nonexistent file returns structured error (EXIT-B4)', async () => {
    const result = await client.callTool({
      name: 'moment_validate',
      arguments: { filePath: '/tmp/nonexistent-mcp-test.moment' },
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.errorCode).toBeTruthy();
    expect(parsed.message).toContain('not found');
  });

  it('moment_status returns sections with hasDrift flag', async () => {
    const result = await client.callTool({
      name: 'moment_status',
      arguments: { filePath: VALID_FIXTURE },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(Array.isArray(parsed.sections)).toBe(true);
    expect(typeof parsed.hasDrift).toBe('boolean');
  });

  it('moment_viz returns envelope data', async () => {
    const result = await client.callTool({
      name: 'moment_viz',
      arguments: { filePath: VALID_FIXTURE },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed).toBeDefined();
    // VizDataEnvelope should have context map or timeline data
    expect(typeof parsed).toBe('object');
  });

  it('moment_emit_ts with dryRun returns file list', async () => {
    const result = await client.callTool({
      name: 'moment_emit_ts',
      arguments: { filePath: VALID_FIXTURE, dryRun: true },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.tsFileCount).toBeGreaterThan(0);
    expect(Array.isArray(parsed.fileList)).toBe(true);
  });

  it('moment_reconcile --local with no .domain/ returns NO_CHANGES', async () => {
    const result = await client.callTool({
      name: 'moment_reconcile',
      arguments: { filePath: VALID_FIXTURE, mode: 'local' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.outcome).toBe('NO_CHANGES');
  });

  it('moment_get_events with nonexistent dir returns error or empty', async () => {
    const result = await client.callTool({
      name: 'moment_get_events',
      arguments: { projectDir: '/tmp/nonexistent-project-mcp-test' },
    });

    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    // Either an error or empty events — both valid for nonexistent dir
    if (result.isError) {
      expect(parsed.errorCode).toBeTruthy();
    } else {
      expect(parsed.eventCount).toBe(0);
    }
  });

  it('moment_import with nonexistent domain dir returns error', async () => {
    const result = await client.callTool({
      name: 'moment_import',
      arguments: { domainDir: '/tmp/nonexistent-domain-mcp-test' },
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.errorCode).toBeTruthy();
  });
});
