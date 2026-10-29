/**
 * CLI usage text and per-command help.
 *
 * Per-command help is cut from {@link USAGE} itself, so the two cannot drift: a command's entry is
 * every usage line that starts with its name, plus the indented continuation lines under them.
 */
export const USAGE = `Usage: moment <command> [options]

Commands:
  init                     Initialize a Moment project with a manifest
  parse <file>             Parse and validate a .moment specification
  watch                    Watch .moment files and re-run the pipeline on change
  derive <file>            Derive test topology from a specification
  generate <file>          Generate Gherkin, TypeScript scaffolds, and docs
  emit-ts <file>           Emit TypeScript types and scaffolds
  test <file>              Run structural validation test suites
  simulate <file>          Generate simulation scenarios (--all, --json)
  viz <file>               Emit the visualization data envelope
  serve <file|facet-dir>   Serve topology/scenarios over WebSocket (Facet bridge)
                           --project <dir> serves a model directory as one project
  cucumber-json <file>     Emit Cucumber JSON for Xray import
  lint <file>              Drift + schema lint
  sync <status|propose> <file|dir>
                           Implementation drift detection; propose records proposals
  sync accept <file|dir> (<proposal-id>... | --all)
  sync reject <file|dir> <proposal-id>... --reason "<why>"
                           Decide pending proposals; commits .domain/ logs locally
  schema <status> <file>   Schema governance report
  import --from-sift <dir> Import a Sift JSONL export
  reconcile <file|dir>     Reconcile upstream drift (--local | --event <path>)
  status <file>            Unified project status
  auth <login|status|logout|quorum>
                           Manage GitHub and quorum credentials
  quorum <watch> <stream>  Subscribe to a quorum stream into .domain/

Flags:
  -v, --version            Print the CLI version
  -h, --help               Show this help`;

const ENTRY = /^ {2}(\S+)/;
const CONTINUATION = /^ {3,}\S/;

/** True when `--help` or `-h` appears before any `--` separator. */
export function wantsHelp(args: readonly string[]): boolean {
  for (const arg of args) {
    if (arg === '--') return false;
    if (arg === '--help' || arg === '-h') return true;
  }
  return false;
}

/** The usage of one command, or undefined when it is not a command. */
export function commandHelp(command: string | undefined): string | undefined {
  if (command === undefined || command.startsWith('-')) return undefined;
  const lines = USAGE.slice(
    USAGE.indexOf('Commands:\n') + 'Commands:\n'.length,
    USAGE.indexOf('\n\nFlags:'),
  ).split('\n');
  const out: string[] = [];
  let inEntry = false;
  for (const line of lines) {
    const entry = ENTRY.exec(line);
    if (entry && !CONTINUATION.test(line)) inEntry = entry[1] === command;
    if (inEntry) out.push(line);
  }
  if (out.length === 0) return undefined;
  return ['Usage:', ...out, '', "Run 'moment --help' for every command."].join('\n');
}
