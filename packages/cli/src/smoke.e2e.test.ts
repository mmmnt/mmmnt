/**
 * Tier 3 smoke tests (ADR-009 §5.6) — spawn the compiled bundles and assert
 * the published artifacts actually work. Catches bundle-level regressions
 * (ESM interop, shebang, dispatch) that in-process tests cannot see.
 *
 * Requires `node build.mjs` to have produced dist/moment.mjs (and the mcp
 * package's dist/mcp.mjs) — both are built by `turbo build` before tests.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(__dirname, '..', 'dist', 'moment.mjs');
const MCP = resolve(__dirname, '..', '..', 'mcp', 'dist', 'mcp.mjs');

const hasCli = existsSync(CLI);
const hasMcp = existsSync(MCP);

// A spawned bundle may wait behind every other package's tests under `turbo test`; each test may take
// as long as the process it spawns is allowed to.
const SPAWN_TIMEOUT = 30_000;

function runCli(args: string[], cwd?: string): { code: number; out: string; err: string } {
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf-8', cwd, timeout: SPAWN_TIMEOUT });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

describe.skipIf(!hasCli)('moment CLI bundle smoke', { timeout: SPAWN_TIMEOUT }, () => {
  it('--version prints a semver and exits 0', () => {
    const { code, out } = runCli(['--version']);
    expect(code).toBe(0);
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('--help prints usage and exits 0', () => {
    const { code, out } = runCli(['--help']);
    expect(code).toBe(0);
    expect(out).toContain('Usage: moment <command>');
    expect(out).toContain('parse <file>');
  });

  it('no command prints usage and exits 1', () => {
    const { code } = runCli([]);
    expect(code).toBe(1);
  });

  it("<command> --help prints that command's usage and runs nothing", () => {
    const cwd = mkdtempSync(join(tmpdir(), 'smoke-help-'));
    for (const command of [
      'init',
      'parse',
      'watch',
      'derive',
      'generate',
      'emit-ts',
      'test',
      'simulate',
      'viz',
      'serve',
      'cucumber-json',
      'lint',
      'sync',
      'schema',
      'import',
      'reconcile',
      'status',
      'auth',
      'quorum',
    ]) {
      const { code, out } = runCli([command, 'spec.moment', '--help'], cwd);
      expect(code, command).toBe(0);
      expect(out, command).toMatch(new RegExp(`^  ${command} `, 'm'));
    }
    // -h takes the same path; one command proves it.
    const short = runCli(['init', '-h'], cwd);
    expect(short.code).toBe(0);
    expect(short.out).toMatch(/^ {2}init /m);
    // Nothing ran: in particular, `init --help` used to initialise a project here.
    expect(readdirSync(cwd)).toEqual([]);
  }, 60_000);

  it('unknown command exits 1 and points at help', () => {
    const { code, err } = runCli(['nonsense']);
    expect(code).toBe(1);
    expect(err).toContain("Unknown command 'nonsense'");
    expect(err).toContain('--help');
  });

  it('parse: valid spec exits 0; invalid spec exits 1 with file:line:col', () => {
    const dir = mkdtempSync(join(tmpdir(), 'smoke-'));
    const good = join(dir, 'good.moment');
    writeFileSync(good, 'context "X" [Core]\n\n  aggregate "A"\n    identity id: UUID\n');
    const bad = join(dir, 'bad.moment');
    writeFileSync(bad, 'context "X" [Bogus]\n');

    const ok = runCli(['parse', good]);
    expect(ok.code).toBe(0);

    // A file that parses with warnings still exits 0, and the warnings are printed.
    const warned = join(dir, 'warned.moment');
    writeFileSync(
      warned,
      'context "X" [Core]\n\n  aggregate "A"\n    identity id: UUID\n\n  projection P\n    sources Missing\n',
    );
    const warn = runCli(['parse', warned]);
    expect(warn.code).toBe(0);
    expect(warn.err).toMatch(/^warning: .*warned\.moment — V22: Projection 'P' reads 'Missing'/m);

    const fail = runCli(['parse', bad]);
    expect(fail.code).toBe(1);
    expect(fail.err).toMatch(/bad\.moment:\d+:\d+/);
  }, 30_000);
});

describe.skipIf(!hasMcp)('mcp bundle smoke', () => {
  it('starts and answers tools/list (regression: vscode-jsonrpc dynamic require)', async () => {
    const proc = spawn('node', [MCP], { stdio: ['pipe', 'pipe', 'pipe'] });
    const messages: string[] = [];
    proc.stdout.on('data', (d: Buffer) => messages.push(d.toString()));

    const send = (obj: unknown): void => {
      proc.stdin.write(`${JSON.stringify(obj)}\n`);
    };

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'smoke', version: '0.0.0' },
      },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

    let serverVersion: string | undefined;
    const toolNames = await new Promise<string[]>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('mcp tools/list timeout')), 20_000);
      const tryParse = (): void => {
        for (const chunk of messages.join('').split('\n')) {
          if (!chunk.trim()) continue;
          try {
            const parsed = JSON.parse(chunk) as {
              id?: number;
              result?: { tools?: { name: string }[]; serverInfo?: { version?: string } };
            };
            if (parsed.id === 1) serverVersion = parsed.result?.serverInfo?.version;
            if (parsed.id === 2 && parsed.result?.tools) {
              clearTimeout(timer);
              resolvePromise(parsed.result.tools.map((t) => t.name));
            }
          } catch {
            /* partial chunk */
          }
        }
      };
      proc.stdout.on('data', tryParse);
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code !== null && code !== 0) {
          clearTimeout(timer);
          reject(new Error(`mcp exited with ${code}`));
        }
      });
    }).finally(() => proc.kill());

    expect(toolNames).toContain('moment_validate');
    expect(toolNames.length).toBeGreaterThanOrEqual(7);
    // The server reports its package's version (it reported a hard-coded 0.0.0).
    const mcpPackage = JSON.parse(readFileSync(join(MCP, '..', '..', 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(serverVersion).toBe(mcpPackage.version);
  }, 30_000);
});
