import { describe, expect, it } from 'vitest';
import { USAGE, commandHelp, wantsHelp } from './help.js';

describe('wantsHelp', () => {
  it('finds --help or -h anywhere before a -- separator', () => {
    expect(wantsHelp(['--help'])).toBe(true);
    expect(wantsHelp(['spec.moment', '-h'])).toBe(true);
    expect(wantsHelp(['spec.moment', '--json'])).toBe(false);
    expect(wantsHelp([])).toBe(false);
  });

  it('ignores help flags after --, which belong to whatever follows', () => {
    expect(wantsHelp(['spec.moment', '--', '--help'])).toBe(false);
  });
});

describe('commandHelp', () => {
  it('returns the usage entry of a single-line command', () => {
    expect(commandHelp('init')).toBe(
      [
        'Usage:',
        '  init                     Initialize a Moment project with a manifest',
        '',
        "Run 'moment --help' for every command.",
      ].join('\n'),
    );
  });

  it('includes continuation lines', () => {
    const help = commandHelp('serve') ?? '';
    expect(help).toContain('serve <file|facet-dir>');
    expect(help).toContain('--project <dir> serves a model directory as one project');
  });

  it('returns every entry of a command with subcommands', () => {
    const help = commandHelp('sync') ?? '';
    expect(help).toContain('sync <status|propose> <file|dir>');
    expect(help).toContain('sync accept <file|dir>');
    expect(help).toContain('sync reject <file|dir>');
    expect(help).not.toContain('schema');
  });

  it('does not match a command by prefix', () => {
    expect(commandHelp('emit')).toBeUndefined();
    expect(commandHelp('status')).not.toContain('sync');
  });

  it('is undefined for unknown commands and for flags', () => {
    expect(commandHelp('nope')).toBeUndefined();
    expect(commandHelp('--json')).toBeUndefined();
    expect(commandHelp(undefined)).toBeUndefined();
  });

  it('every dispatched command has an entry', () => {
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
      expect(commandHelp(command), command).toMatch(new RegExp(`^  ${command} `, 'm'));
    }
    expect(USAGE).toContain('-h, --help');
  });
});
