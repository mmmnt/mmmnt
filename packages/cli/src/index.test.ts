/**
 * In-process tests for the CLI dispatcher (src/index.ts).
 *
 * The dispatcher runs at import time from process.argv, so each case sets argv, re-imports the
 * module fresh, and observes what reaches stdout/stderr and the exit code. Every command module is
 * mocked: these tests pin the routing and the result-to-output contract (which stream, which exit
 * code, how diagnostics and thrown errors are reported), not the commands themselves, which have
 * their own suites. The spawned-bundle equivalents live in smoke.e2e.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

const m = vi.hoisted(() => ({
  runInit: vi.fn(),
  runParse: vi.fn(),
  runWatch: vi.fn(),
  runServe: vi.fn(),
  runDerive: vi.fn(),
  runGenerate: vi.fn(),
  runCucumberJson: vi.fn(),
  runEmitTs: vi.fn(),
  runTest: vi.fn(),
  runViz: vi.fn(),
  runSyncStatus: vi.fn(),
  runSyncPropose: vi.fn(),
  runSyncAccept: vi.fn(),
  runSyncReject: vi.fn(),
  runSchemaStatus: vi.fn(),
  runLint: vi.fn(),
  runImportFromSift: vi.fn(),
  runStatus: vi.fn(),
  runReconcile: vi.fn(),
  runSimulate: vi.fn(),
  runAuthLogin: vi.fn(),
  runAuthStatus: vi.fn(),
  runAuthLogout: vi.fn(),
  runAuthQuorum: vi.fn(),
  runQuorumWatch: vi.fn(),
}));

vi.mock('./commands/init.js', () => ({ runInit: m.runInit }));
vi.mock('./commands/parse.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./commands/parse.js')>()),
  runParse: m.runParse,
}));
vi.mock('./commands/watch.js', () => ({ runWatch: m.runWatch }));
vi.mock('./commands/serve.js', () => ({ runServe: m.runServe }));
vi.mock('./commands/derive.js', () => ({ runDerive: m.runDerive }));
vi.mock('./commands/generate.js', () => ({ runGenerate: m.runGenerate }));
vi.mock('./commands/cucumber-json.js', () => ({ runCucumberJson: m.runCucumberJson }));
vi.mock('./commands/emit-ts.js', () => ({ runEmitTs: m.runEmitTs }));
vi.mock('./commands/test.js', () => ({ runTest: m.runTest }));
vi.mock('./commands/viz.js', () => ({ runViz: m.runViz }));
vi.mock('./commands/sync-status.js', () => ({ runSyncStatus: m.runSyncStatus }));
vi.mock('./commands/sync-propose.js', () => ({ runSyncPropose: m.runSyncPropose }));
vi.mock('./commands/sync-accept.js', () => ({ runSyncAccept: m.runSyncAccept }));
vi.mock('./commands/sync-reject.js', () => ({ runSyncReject: m.runSyncReject }));
vi.mock('./commands/schema-status.js', () => ({ runSchemaStatus: m.runSchemaStatus }));
vi.mock('./commands/lint.js', () => ({ runLint: m.runLint }));
vi.mock('./commands/import-from-sift.js', () => ({ runImportFromSift: m.runImportFromSift }));
vi.mock('./commands/status.js', () => ({ runStatus: m.runStatus }));
vi.mock('./commands/reconcile.js', () => ({ runReconcile: m.runReconcile }));
vi.mock('./commands/simulate.js', () => ({ runSimulate: m.runSimulate }));
vi.mock('./commands/auth-login.js', () => ({ runAuthLogin: m.runAuthLogin }));
vi.mock('./commands/auth-status.js', () => ({ runAuthStatus: m.runAuthStatus }));
vi.mock('./commands/auth-logout.js', () => ({ runAuthLogout: m.runAuthLogout }));
vi.mock('./commands/auth-quorum.js', () => ({ runAuthQuorum: m.runAuthQuorum }));
vi.mock('./commands/quorum-watch.js', () => ({ runQuorumWatch: m.runQuorumWatch }));

class ExitCalled extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${String(code)})`);
  }
}

interface CliRun {
  code: number;
  out: string[];
  err: string[];
}

const originalArgv = process.argv;

async function runCli(argv: string[]): Promise<CliRun> {
  vi.resetModules();
  process.argv = ['node', 'moment', ...argv];
  process.exitCode = 0;
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    out.push(a.map(String).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    err.push(a.map(String).join(' '));
  });
  vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    throw new ExitCalled(code === null || code === undefined ? undefined : Number(code));
  });

  let exitCode: number | undefined;
  try {
    await import('./index.js');
  } catch (e) {
    if (!(e instanceof ExitCalled)) throw e;
    exitCode = e.code;
  }
  // Let the dispatcher's .then/.catch chains settle.
  await new Promise((r) => setTimeout(r, 0));
  const code = exitCode ?? Number(process.exitCode ?? 0);
  process.exitCode = 0;
  return { code, out, err };
}

const diag = {
  severity: 'error',
  message: 'Unknown aggregate',
  ruleId: 'V12',
  source: { file: 'shop.moment', line: 4, column: 2 },
};

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.argv = originalArgv;
  process.exitCode = 0;
});

describe('moment CLI dispatcher: global flags', () => {
  it.each(['--version', '-v', 'version'])(
    '%s prints the package version and exits 0',
    async (flag) => {
      const { code, out } = await runCli([flag]);
      expect(code).toBe(0);
      expect(out[0]).toMatch(/^\d+\.\d+\.\d+/);
    },
  );

  it.each(['--help', '-h', 'help'])('%s prints usage and exits 0', async (flag) => {
    const { code, out } = await runCli([flag]);
    expect(code).toBe(0);
    expect(out[0]).toContain('Usage: moment <command>');
  });

  it('no command prints usage and exits 1', async () => {
    const { code, out } = await runCli([]);
    expect(code).toBe(1);
    expect(out[0]).toContain('Usage: moment <command>');
  });

  it('<command> --help prints that command help and never runs the command', async () => {
    const { code, out } = await runCli(['init', '--help']);
    expect(code).toBe(0);
    expect(out[0]).toMatch(/^Usage:\n  init +Initialize a Moment project/);
    expect(m.runInit).not.toHaveBeenCalled();
  });

  it('--help on an unknown command falls through to the unknown-command error', async () => {
    const { code, err } = await runCli(['frobnicate', '--help']);
    expect(code).toBe(1);
    expect(err).toEqual(["Error: Unknown command 'frobnicate'", "Run 'moment --help' for usage."]);
  });
});

describe('moment init', () => {
  it('prints the success message to stdout and exits 0', async () => {
    m.runInit.mockReturnValue({ success: true, message: 'Initialized' });
    const { code, out, err } = await runCli(['init', '--name', 'shop']);
    expect(m.runInit).toHaveBeenCalledWith(['--name', 'shop']);
    expect(code).toBe(0);
    expect(out).toEqual(['Initialized']);
    expect(err).toEqual([]);
  });

  it('prints a failure to stderr and exits 1', async () => {
    m.runInit.mockReturnValue({ success: false, message: 'manifest exists' });
    const { code, out, err } = await runCli(['init']);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(['manifest exists']);
  });
});

describe('moment parse', () => {
  it('prints success to stdout and warnings to stderr without failing', async () => {
    m.runParse.mockResolvedValue({
      success: true,
      message: 'Parsed shop.moment',
      diagnostics: [{ severity: 'warning', message: 'unused event', ruleId: 'V30' }],
    });
    const { code, out, err } = await runCli(['parse', 'shop.moment']);
    expect(code).toBe(0);
    expect(out).toEqual(['Parsed shop.moment']);
    // A diagnostic without a source position is attributed to the file argument.
    expect(err).toEqual(['warning: shop.moment — V30: unused event']);
  });

  it('prints the failure and every diagnostic to stderr and exits 1', async () => {
    m.runParse.mockResolvedValue({ success: false, message: 'Parse failed', diagnostics: [diag] });
    const { code, out, err } = await runCli(['parse', 'shop.moment']);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(['Parse failed', 'error: shop.moment:4:2 — V12: Unknown aggregate']);
  });

  it('reports a thrown error as Error: <message> and exits 1', async () => {
    m.runParse.mockRejectedValue(new Error('EACCES'));
    const { code, err } = await runCli(['parse', 'shop.moment']);
    expect(code).toBe(1);
    expect(err).toEqual(['Error: EACCES']);
  });

  it('reports a non-Error rejection by its string value', async () => {
    m.runParse.mockRejectedValue('boom');
    const { code, err } = await runCli(['parse', 'shop.moment']);
    expect(code).toBe(1);
    expect(err).toEqual(['Error: boom']);
  });
});

describe('moment watch', () => {
  it('prints the message when the watcher did not start', async () => {
    m.runWatch.mockReturnValue({ started: false, message: 'No .moment files found' });
    const { code, out } = await runCli(['watch']);
    expect(code).toBe(0);
    expect(out).toEqual(['No .moment files found']);
  });

  it('prints nothing once the watcher is running', async () => {
    m.runWatch.mockReturnValue({ started: true, message: 'Watching' });
    const { code, out } = await runCli(['watch', 'src']);
    expect(m.runWatch).toHaveBeenCalledWith(['src']);
    expect(code).toBe(0);
    expect(out).toEqual([]);
  });
});

// Commands whose result is { success, message, diagnostics, filePath } and whose diagnostics are
// attributed to result.filePath.
const diagnosticCommands: { argv: string[]; fn: Mock; forwarded: string[] }[] = [
  { argv: ['derive', 'a.moment'], fn: m.runDerive, forwarded: ['a.moment'] },
  { argv: ['generate', 'a.moment'], fn: m.runGenerate, forwarded: ['a.moment'] },
  { argv: ['emit-ts', 'a.moment'], fn: m.runEmitTs, forwarded: ['a.moment'] },
  { argv: ['test', 'a.moment'], fn: m.runTest, forwarded: ['a.moment'] },
  { argv: ['viz', 'a.moment'], fn: m.runViz, forwarded: ['a.moment'] },
  { argv: ['cucumber-json', 'a.moment'], fn: m.runCucumberJson, forwarded: ['a.moment'] },
  { argv: ['sync', 'status', 'a.moment'], fn: m.runSyncStatus, forwarded: ['a.moment'] },
  { argv: ['sync', 'propose', 'a.moment'], fn: m.runSyncPropose, forwarded: ['a.moment'] },
  {
    argv: ['sync', 'accept', 'a.moment', '--all'],
    fn: m.runSyncAccept,
    forwarded: ['a.moment', '--all'],
  },
  {
    argv: ['sync', 'reject', 'a.moment', 'p1'],
    fn: m.runSyncReject,
    forwarded: ['a.moment', 'p1'],
  },
  { argv: ['schema', 'status', 'a.moment'], fn: m.runSchemaStatus, forwarded: ['a.moment'] },
];

describe.each(diagnosticCommands)('moment $argv', ({ argv, fn, forwarded }) => {
  it('forwards its arguments and prints success to stdout with exit 0', async () => {
    fn.mockResolvedValue({ success: true, message: 'done', diagnostics: [], filePath: 'a.moment' });
    const { code, out, err } = await runCli(argv);
    expect(fn).toHaveBeenCalledWith(forwarded);
    expect(code).toBe(0);
    expect(out).toEqual(['done']);
    expect(err).toEqual([]);
  });

  it('prints failure and diagnostics (attributed to the result file) to stderr with exit 1', async () => {
    fn.mockResolvedValue({
      success: false,
      message: 'failed',
      diagnostics: [{ severity: 'error', message: 'V7: bad ref', ruleId: 'V7' }],
      filePath: 'model/a.moment',
    });
    const { code, out, err } = await runCli(argv);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    // The rule id is not repeated when the message already starts with it.
    expect(err).toEqual(['failed', 'error: model/a.moment — V7: bad ref']);
  });

  it('reports a thrown Error by message and exits 1', async () => {
    fn.mockRejectedValue(new Error('disk full'));
    const { code, err } = await runCli(argv);
    expect(code).toBe(1);
    expect(err).toEqual(['Error: disk full']);
  });

  it('reports a non-Error rejection by its string value and exits 1', async () => {
    fn.mockRejectedValue(42);
    const { code, err } = await runCli(argv);
    expect(code).toBe(1);
    expect(err).toEqual(['Error: 42']);
  });
});

describe('moment viz', () => {
  it('prints the JSON envelope instead of the message when one is returned', async () => {
    m.runViz.mockResolvedValue({ success: true, message: 'ok', json: '{"v":1}', diagnostics: [] });
    const { out } = await runCli(['viz', 'a.moment', '--json']);
    expect(out).toEqual(['{"v":1}']);
  });
});

describe('moment sync', () => {
  it('status prints the drift report but exits 1 when drift is found', async () => {
    m.runSyncStatus.mockResolvedValue({
      success: true,
      message: 'drift: 2',
      hasDrift: true,
      diagnostics: [],
    });
    const { code, out } = await runCli(['sync', 'status', 'a.moment']);
    expect(out).toEqual(['drift: 2']);
    expect(code).toBe(1);
  });

  it('rejects an unknown subcommand with the list of valid ones', async () => {
    const { code, err } = await runCli(['sync', 'merge']);
    expect(code).toBe(1);
    expect(err).toEqual([
      "Error: Unknown sync subcommand 'merge'",
      'Subcommands: status, propose, accept, reject',
    ]);
  });

  it('names an empty subcommand when none is given', async () => {
    const { code, err } = await runCli(['sync']);
    expect(code).toBe(1);
    expect(err[0]).toBe("Error: Unknown sync subcommand ''");
  });
});

describe('moment schema', () => {
  it.each([[['schema', 'diff']], [['schema']]])(
    'rejects %j as an unknown subcommand',
    async (argv) => {
      const { code, err } = await runCli(argv);
      expect(code).toBe(1);
      expect(err[0]).toBe(`Error: Unknown schema subcommand '${argv[1] ?? ''}'`);
      expect(err[1]).toBe('Subcommands: status');
    },
  );
});

describe('moment simulate', () => {
  it('prints success to stdout', async () => {
    m.runSimulate.mockResolvedValue({ success: true, message: '3 scenarios' });
    const { code, out } = await runCli(['simulate', 'a.moment', '--all']);
    expect(m.runSimulate).toHaveBeenCalledWith(['a.moment', '--all']);
    expect(code).toBe(0);
    expect(out).toEqual(['3 scenarios']);
  });

  it('prints failure to stderr and exits 1', async () => {
    m.runSimulate.mockResolvedValue({ success: false, message: 'no flows' });
    const { code, err } = await runCli(['simulate', 'a.moment']);
    expect(code).toBe(1);
    expect(err).toEqual(['no flows']);
  });

  it.each([
    [new Error('bad'), 'Error: bad'],
    ['bad', 'Error: bad'],
  ])('reports rejection %s and exits 1', async (reason, expected) => {
    m.runSimulate.mockRejectedValue(reason);
    const { code, err } = await runCli(['simulate', 'a.moment']);
    expect(code).toBe(1);
    expect(err).toEqual([expected]);
  });
});

// Commands whose result carries a `json` flag: JSON output always goes to stdout, even on failure.
const jsonCommands: { name: string; argv: string[]; fn: Mock; forwarded: string[] }[] = [
  { name: 'lint', argv: ['lint', 'a.moment'], fn: m.runLint, forwarded: ['a.moment'] },
  {
    name: 'import --from-sift',
    argv: ['import', '--from-sift', '.domain'],
    fn: m.runImportFromSift,
    forwarded: ['.domain'],
  },
  {
    name: 'reconcile',
    argv: ['reconcile', 'a.moment'],
    fn: m.runReconcile,
    forwarded: ['a.moment'],
  },
];

describe.each(jsonCommands)('moment $name', ({ argv, fn, forwarded }) => {
  it('prints JSON to stdout even when the command fails, and exits 1', async () => {
    fn.mockResolvedValue({ success: false, json: true, message: '{"ok":false}' });
    const { code, out, err } = await runCli([...argv, '--json']);
    expect(code).toBe(1);
    expect(out).toEqual(['{"ok":false}']);
    expect(err).toEqual([]);
  });

  it('prints a successful text result to stdout with exit 0', async () => {
    fn.mockResolvedValue({ success: true, json: false, message: 'clean' });
    const { code, out } = await runCli(argv);
    expect(fn).toHaveBeenCalledWith(forwarded);
    expect(code).toBe(0);
    expect(out).toEqual(['clean']);
  });

  it('prints a failed text result to stderr with exit 1', async () => {
    fn.mockResolvedValue({ success: false, json: false, message: '2 problems' });
    const { code, out, err } = await runCli(argv);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(['2 problems']);
  });

  it.each([
    [new Error('nope'), 'Error: nope'],
    [null, 'Error: null'],
  ])('reports rejection %s and exits 1', async (reason, expected) => {
    fn.mockRejectedValue(reason);
    const { code, err } = await runCli(argv);
    expect(code).toBe(1);
    expect(err).toEqual([expected]);
  });
});

describe('moment import', () => {
  it('without --from-sift prints its usage and exits 1', async () => {
    const { code, err } = await runCli(['import', '.domain']);
    expect(code).toBe(1);
    expect(err).toEqual(['Usage: moment import --from-sift <.domain/ directory>']);
    expect(m.runImportFromSift).not.toHaveBeenCalled();
  });
});

describe('moment status', () => {
  it('prints JSON to stdout', async () => {
    m.runStatus.mockResolvedValue({ success: true, json: true, message: '{}' });
    const { code, out } = await runCli(['status', 'a.moment', '--json']);
    expect(code).toBe(0);
    expect(out).toEqual(['{}']);
  });

  it('prints a clean report to stdout with exit 0', async () => {
    m.runStatus.mockResolvedValue({ success: true, message: 'all clear' });
    const { code, out } = await runCli(['status', 'a.moment']);
    expect(code).toBe(0);
    expect(out).toEqual(['all clear']);
  });

  it('exits 1 on drift even though the report is a success', async () => {
    m.runStatus.mockResolvedValue({ success: true, message: 'drift', hasDrift: true });
    const { code, out } = await runCli(['status', 'a.moment']);
    expect(code).toBe(1);
    expect(out).toEqual(['drift']);
  });

  it('prints a failure to stderr with exit 1', async () => {
    m.runStatus.mockResolvedValue({ success: false, message: 'cannot read' });
    const { code, err } = await runCli(['status', 'a.moment']);
    expect(code).toBe(1);
    expect(err).toEqual(['cannot read']);
  });

  it('prints nothing for an empty message but still exits 1 on failure', async () => {
    m.runStatus.mockResolvedValue({ success: false, message: '' });
    const { code, out, err } = await runCli(['status', 'a.moment']);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  it.each([
    [new Error('x'), 'Error: x'],
    [undefined, 'Error: undefined'],
  ])('reports rejection %s and exits 1', async (reason, expected) => {
    m.runStatus.mockRejectedValue(reason);
    const { code, err } = await runCli(['status', 'a.moment']);
    expect(code).toBe(1);
    expect(err).toEqual([expected]);
  });
});

describe('moment auth', () => {
  it.each([
    ['login', m.runAuthLogin, []],
    ['status', m.runAuthStatus, []],
    ['logout', m.runAuthLogout, []],
    ['quorum', m.runAuthQuorum, [['--token', 't']]],
  ] as const)('%s routes to its handler and prints success', async (sub, fn, expectedArgs) => {
    fn.mockResolvedValue({ success: true, message: `${sub} ok` });
    const { code, out } = await runCli(['auth', sub, '--token', 't']);
    expect(fn).toHaveBeenCalledWith(...expectedArgs);
    expect(code).toBe(0);
    expect(out).toEqual([`${sub} ok`]);
  });

  it('prints a handler failure to stderr with exit 1', async () => {
    m.runAuthStatus.mockResolvedValue({ success: false, message: 'Not logged in' });
    const { code, err } = await runCli(['auth', 'status']);
    expect(code).toBe(1);
    expect(err).toEqual(['Not logged in']);
  });

  it.each([
    [new Error('network down'), 'Error: network down'],
    ['offline', 'Error: offline'],
  ])('reports rejection %s and exits 1', async (reason, expected) => {
    m.runAuthLogin.mockRejectedValue(reason);
    const { code, err } = await runCli(['auth', 'login']);
    expect(code).toBe(1);
    expect(err).toEqual([expected]);
  });

  it('prints usage for an unknown subcommand and runs no handler', async () => {
    const { code, err } = await runCli(['auth', 'whoami']);
    expect(code).toBe(1);
    expect(err).toEqual(['Usage: moment auth <login|status|logout|quorum>']);
    for (const fn of [m.runAuthLogin, m.runAuthStatus, m.runAuthLogout, m.runAuthQuorum]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe('moment serve', () => {
  it('keeps running silently on success', async () => {
    m.runServe.mockResolvedValue({ success: true, message: 'listening' });
    const { code, out, err } = await runCli(['serve', 'a.moment']);
    expect(m.runServe).toHaveBeenCalledWith(['a.moment']);
    expect(code).toBe(0);
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  it('prints a startup failure to stderr with exit 1', async () => {
    m.runServe.mockResolvedValue({ success: false, message: 'port in use' });
    const { code, err } = await runCli(['serve', 'a.moment']);
    expect(code).toBe(1);
    expect(err).toEqual(['port in use']);
  });

  it.each([
    [new Error('EADDRINUSE'), 'Error: EADDRINUSE'],
    ['EADDRINUSE', 'Error: EADDRINUSE'],
  ])('reports rejection %s and exits 1', async (reason, expected) => {
    m.runServe.mockRejectedValue(reason);
    const { code, err } = await runCli(['serve', 'a.moment']);
    expect(code).toBe(1);
    expect(err).toEqual([expected]);
  });
});

describe('moment quorum', () => {
  it('watch forwards the stream arguments and prints success', async () => {
    m.runQuorumWatch.mockResolvedValue({ success: true, message: 'synced 3 events' });
    const { code, out } = await runCli(['quorum', 'watch', 'stream-1', '--once']);
    expect(m.runQuorumWatch).toHaveBeenCalledWith(['stream-1', '--once']);
    expect(code).toBe(0);
    expect(out).toEqual(['synced 3 events']);
  });

  it('watch prints failure to stderr with exit 1', async () => {
    m.runQuorumWatch.mockResolvedValue({ success: false, message: 'stream not found' });
    const { code, err } = await runCli(['quorum', 'watch', 'nope']);
    expect(code).toBe(1);
    expect(err).toEqual(['stream not found']);
  });

  it.each([
    [new Error('401'), 'Error: 401'],
    [401, 'Error: 401'],
  ])('watch reports rejection %s and exits 1', async (reason, expected) => {
    m.runQuorumWatch.mockRejectedValue(reason);
    const { code, err } = await runCli(['quorum', 'watch', 's']);
    expect(code).toBe(1);
    expect(err).toEqual([expected]);
  });

  it('any other subcommand prints usage and exits 1', async () => {
    const { code, err } = await runCli(['quorum', 'list']);
    expect(code).toBe(1);
    expect(err[0]).toMatch(/^Usage: moment quorum watch <streamId>/);
    expect(m.runQuorumWatch).not.toHaveBeenCalled();
  });
});
