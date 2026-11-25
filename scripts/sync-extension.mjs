#!/usr/bin/env node
/**
 * Keeps the VS Code extension (`packages/vscode`) in step with the toolchain release.
 *
 *   - its version is `@mmmnt/cli`'s version
 *   - its grammar is the one `@mmmnt/core` ships (`packages/core/syntaxes/`)
 *   - its CHANGELOG.md is the toolchain's changelog (`packages/cli/CHANGELOG.md`) under the
 *     extension's own heading, followed by the extension's history from before it was released
 *     with the toolchain (`packages/vscode/CHANGELOG-0.1.md`)
 *
 * Run by the root `changeset:version` script after `changeset version`, so the version PR
 * carries all three. The release workflow then publishes the extension at that version.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = (path) => join(root, path);

const cli = JSON.parse(readFileSync(at('packages/cli/package.json'), 'utf8'));

const manifestPath = at('packages/vscode/package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.version = cli.version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

copyFileSync(
  at('packages/core/syntaxes/moment.tmLanguage.json'),
  at('packages/vscode/syntaxes/moment.tmLanguage.json'),
);

const toolchain = readFileSync(at('packages/cli/CHANGELOG.md'), 'utf8').replace(
  /^# @mmmnt\/cli\n+/,
  '',
);
const before = readFileSync(at('packages/vscode/CHANGELOG-0.1.md'), 'utf8');
const changelog = [
  '# Changelog',
  '',
  'The extension is released with the Moment toolchain, at its version, with the ' +
    'grammar `@mmmnt/core` ships. These are the toolchain’s changes (`@mmmnt/cli`).',
  '',
  toolchain.trimEnd(),
  '',
  '# Before the toolchain',
  '',
  'Until 0.1.1 the extension had its own version.',
  '',
  before.trimEnd(),
  '',
].join('\n');
writeFileSync(at('packages/vscode/CHANGELOG.md'), changelog);

console.log(`sync-extension: packages/vscode at ${cli.version}`);
