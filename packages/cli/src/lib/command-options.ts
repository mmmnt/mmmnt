/**
 * The flags each command accepts, in one table.
 *
 * Every command parses its arguments with `parseArgs({ strict: false })` and the options table it
 * finds here, and the dispatcher checks the same table before it runs the command, so a flag the
 * command does not declare fails the run (see {@link unknownFlagError} in `flags.ts`). A command
 * and the check cannot disagree about which flags exist.
 *
 * Keys are the command as typed: `board`, or `sync accept` for a command with a subcommand.
 */

import type { ParseArgsConfig } from 'node:util';

export type CommandOptions = NonNullable<ParseArgsConfig['options']>;

const NONE = {} as const;
const JSON_ONLY = { json: { type: 'boolean' } } as const;

export const COMMAND_OPTIONS = {
  init: {
    name: { type: 'string', short: 'n' },
    dir: { type: 'string', short: 'd' },
  },
  parse: NONE,
  watch: {
    dir: { type: 'string', short: 'd' },
    'no-watch': { type: 'boolean' },
    'no-generate': { type: 'boolean' },
  },
  derive: JSON_ONLY,
  generate: {
    out: { type: 'string', short: 'o' },
    // Alias for --out, symmetric with `moment simulate --out-dir`.
    'out-dir': { type: 'string' },
  },
  'emit-ts': {
    'dry-run': { type: 'boolean' },
    out: { type: 'string', short: 'o' },
  },
  test: NONE,
  simulate: {
    json: { type: 'boolean' },
    flow: { type: 'string' },
    all: { type: 'boolean' },
    'out-dir': { type: 'string' },
    // Alias for --out-dir, symmetric with `moment generate --out`.
    out: { type: 'string' },
  },
  viz: NONE,
  board: {
    out: { type: 'string' },
    frame: { type: 'string' },
    pointers: { type: 'string' },
  },
  serve: {
    port: { type: 'string', short: 'p' },
    all: { type: 'boolean' },
    project: { type: 'string' },
  },
  'cucumber-json': NONE,
  lint: JSON_ONLY,
  'sync status': JSON_ONLY,
  'sync propose': {
    json: { type: 'boolean' },
    // Declared so it can be refused with a reason rather than as an unknown flag.
    'auto-accept': { type: 'boolean' },
  },
  'sync accept': { all: { type: 'boolean' } },
  'sync reject': { reason: { type: 'string' } },
  'schema status': JSON_ONLY,
  'schema emit': { 'out-dir': { type: 'string' } },
  import: {
    'from-sift': { type: 'boolean' },
    json: { type: 'boolean' },
    'output-dir': { type: 'string' },
  },
  reconcile: {
    local: { type: 'boolean' },
    event: { type: 'string' },
    json: { type: 'boolean' },
  },
  status: {
    verbose: { type: 'boolean' },
    quiet: { type: 'boolean' },
    json: { type: 'boolean' },
  },
  'auth login': NONE,
  'auth status': NONE,
  'auth logout': NONE,
  'auth quorum': {
    token: { type: 'string' },
    server: { type: 'string' },
    logout: { type: 'boolean' },
  },
  'quorum watch': {
    server: { type: 'string' },
    out: { type: 'string' },
    interval: { type: 'string' },
    source: { type: 'string' },
    once: { type: 'boolean' },
  },
} as const satisfies Record<string, CommandOptions>;

export type CommandName = keyof typeof COMMAND_OPTIONS;

/** Commands whose first argument is a subcommand: `sync accept`, `schema emit`, ... */
const WITH_SUBCOMMAND = new Set(['sync', 'schema', 'auth', 'quorum']);

/**
 * The options table for a command line, and the arguments its flags are read from. Undefined for
 * an unknown command or subcommand, which the dispatcher reports on its own.
 */
export function commandOptions(
  command: string | undefined,
  args: readonly string[],
): { name: CommandName; options: CommandOptions; args: readonly string[] } | undefined {
  if (command === undefined) return undefined;
  const name = WITH_SUBCOMMAND.has(command) ? `${command} ${args[0] ?? ''}` : command;
  if (!Object.hasOwn(COMMAND_OPTIONS, name)) return undefined;
  const key = name as CommandName;
  return {
    name: key,
    options: COMMAND_OPTIONS[key],
    args: WITH_SUBCOMMAND.has(command) ? args.slice(1) : args,
  };
}
