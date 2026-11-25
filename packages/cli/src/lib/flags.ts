/**
 * Shared CLI flag hygiene for commands that parse with `strict: false`.
 *
 * `parseArgs({ strict: false })` silently swallows unknown flags: a typo like `--outdir` gave a
 * run that quietly ignored what was asked. The dispatcher checks every command line against the
 * command's options table (`command-options.ts`) and fails on a flag the table does not declare.
 */

import { parseArgs } from 'node:util';

export interface OptionToken {
  readonly kind: 'option' | 'positional' | 'option-terminator';
  readonly name?: string;
  readonly rawName?: string;
}

/** Returns the raw names of option tokens not present in `knownOptions`. */
export function collectUnknownFlags(
  tokens: readonly OptionToken[],
  knownOptions: Iterable<string>,
): string[] {
  const known = new Set(knownOptions);
  const unknown: string[] = [];
  for (const token of tokens) {
    if (token.kind !== 'option' || !token.name) continue;
    if (known.has(token.name)) continue;
    const raw = token.rawName ?? `--${token.name}`;
    if (!unknown.includes(raw)) unknown.push(raw);
  }
  return unknown;
}

/**
 * Resolve the first flag in `names` that parsed as a string value. Under
 * `strict: false` a value flag passed bare (`--out-dir` with no value)
 * parses as boolean, so the typeof guard is load-bearing.
 */
export function resolveStringFlag(
  values: Record<string, unknown>,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const value = values[name];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

interface FlagSpec {
  readonly type: 'string' | 'boolean';
  readonly short?: string;
}

/** One flag as `--name`, with its short form when it has one: `--out (-o)`. */
function describeFlag(name: string, option: FlagSpec): string {
  return option.short ? `--${name} (-${option.short})` : `--${name}`;
}

/**
 * The error for a command line that passes a flag its command does not declare, or undefined when
 * every flag is declared. It names each unknown flag and lists the flags the command takes.
 * `--help` and `-h` are always known: the dispatcher answers them before any command runs.
 */
export function unknownFlagError(
  command: string,
  args: readonly string[],
  options: Readonly<Record<string, FlagSpec>>,
): string | undefined {
  const { tokens } = parseArgs({
    args: [...args],
    options: { ...options, help: { type: 'boolean', short: 'h' } },
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
  const unknown = collectUnknownFlags(tokens, [...Object.keys(options), 'help']);
  if (unknown.length === 0) return undefined;
  const flags = Object.entries(options).map(([name, option]) => describeFlag(name, option));
  const label = unknown.length === 1 ? 'Unknown flag' : 'Unknown flags';
  return [
    `Error: ${label} ${unknown.join(', ')} for 'moment ${command}'`,
    flags.length === 0 ? `'moment ${command}' takes no flags.` : `Valid flags: ${flags.join(', ')}`,
  ].join('\n');
}
