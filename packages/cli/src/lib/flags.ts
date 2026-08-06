/**
 * Shared CLI flag hygiene for commands that parse with `strict: false`.
 *
 * `parseArgs({ strict: false })` silently swallows unknown flags — a typo like
 * `--outdir` produces a run that quietly ignores the user's intent. Commands
 * pass their parsed tokens here to surface a warning for every option token
 * whose name is not declared in the command's options table.
 */

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

/**
 * Warn (stderr) about unrecognized flags. Injectable `warn` for tests;
 * defaults to console.warn.
 */
export function warnUnknownFlags(
  tokens: readonly OptionToken[],
  knownOptions: Iterable<string>,
  warn: (message: string) => void = (m) => console.warn(m),
): void {
  for (const flag of collectUnknownFlags(tokens, knownOptions)) {
    warn(`Warning: unrecognized flag ${flag} (ignored)`);
  }
}
